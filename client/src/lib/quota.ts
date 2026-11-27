import { getLimitsPolicy, type QuotaEndpoint, type UserTier } from '@/config/limits';
import { incrementPgQuotaBuckets, isPostgresConfigured, readPgQuotaBuckets } from '@/lib/postgres';

interface MemoryBucket {
  count: number;
  expiresAtMs: number;
}

const memoryBuckets = new Map<string, MemoryBucket>();

export function resetQuotaMemoryForTests(): void {
  memoryBuckets.clear();
}

function isUpstashConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() &&
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
  );
}

export function getQuotaStorageBackend(): 'upstash' | 'postgres' | 'memory' {
  if (isUpstashConfigured()) return 'upstash';
  if (isPostgresConfigured()) return 'postgres';
  return 'memory';
}

interface BucketSpec {
  scopeKey: string;
  bucketKey: string;
  ttlSeconds: number;
  expiresAtMs: number;
}

function buildBucketSpecs(
  endpoint: QuotaEndpoint,
  actorKey: string,
  windowMinutes: number,
  includeGlobal: boolean,
  nowMs: number
) {
  const date = new Date(nowMs);
  const winMs = Math.max(1, windowMinutes) * 60_000;
  const winIndex = Math.floor(nowMs / winMs);
  const winExpires = (winIndex + 1) * winMs;

  const iso = date.toISOString();
  const hourKey = iso.slice(0, 13); // YYYY-MM-DDTHH
  const dayKey = iso.slice(0, 10);  // YYYY-MM-DD
  const monthKey = iso.slice(0, 7); // YYYY-MM

  const hourExpires = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours() + 1, 0, 0);
  const dayExpires = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1, 0, 0, 0);
  const monthExpires = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0, 0, 0);

  const specs: BucketSpec[] = [
    {
      scopeKey: `${endpoint}:${actorKey}`,
      bucketKey: `win:${windowMinutes}:${winIndex}`,
      ttlSeconds: Math.max(1, Math.ceil((winExpires - nowMs) / 1000)),
      expiresAtMs: winExpires,
    },
    {
      scopeKey: `${endpoint}:${actorKey}`,
      bucketKey: `hr:${hourKey}`,
      ttlSeconds: Math.max(1, Math.ceil((hourExpires - nowMs) / 1000)),
      expiresAtMs: hourExpires,
    },
    {
      scopeKey: `${endpoint}:${actorKey}`,
      bucketKey: `day:${dayKey}`,
      ttlSeconds: Math.max(1, Math.ceil((dayExpires - nowMs) / 1000)),
      expiresAtMs: dayExpires,
    },
    {
      scopeKey: `${endpoint}:${actorKey}`,
      bucketKey: `mo:${monthKey}`,
      ttlSeconds: Math.max(1, Math.ceil((monthExpires - nowMs) / 1000)),
      expiresAtMs: monthExpires,
    },
  ];

  if (includeGlobal) {
    specs.push(
      {
        scopeKey: `${endpoint}:__global__`,
        bucketKey: `day:${dayKey}`,
        ttlSeconds: Math.max(1, Math.ceil((dayExpires - nowMs) / 1000)),
        expiresAtMs: dayExpires,
      },
      {
        scopeKey: `${endpoint}:__global__`,
        bucketKey: `mo:${monthKey}`,
        ttlSeconds: Math.max(1, Math.ceil((monthExpires - nowMs) / 1000)),
        expiresAtMs: monthExpires,
      }
    );
  }

  return specs;
}

async function upstashPipeline(commands: Array<Array<string | number>>): Promise<number[]> {
  const baseUrl = process.env.UPSTASH_REDIS_REST_URL!.trim().replace(/\/$/, '');
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!.trim();
  const res = await fetch(`${baseUrl}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`Upstash pipeline HTTP ${res.status}`);
  const data = (await res.json()) as Array<{ result?: unknown }>;
  return data.map(entry => Number(entry?.result || 0));
}

function incrementMemoryBuckets(specs: BucketSpec[], nowMs: number): number[] {
  if (memoryBuckets.size > 10_000) {
    for (const [k, v] of memoryBuckets.entries()) {
      if (v.expiresAtMs < nowMs) memoryBuckets.delete(k);
    }
  }
  return specs.map(spec => {
    const mapKey = `${spec.scopeKey}|${spec.bucketKey}`;
    const existing = memoryBuckets.get(mapKey);
    if (!existing || existing.expiresAtMs < nowMs) {
      memoryBuckets.set(mapKey, { count: 1, expiresAtMs: spec.expiresAtMs });
      return 1;
    }
    existing.count += 1;
    return existing.count;
  });
}

function readMemoryBuckets(specs: BucketSpec[], nowMs: number): number[] {
  return specs.map(spec => {
    const mapKey = `${spec.scopeKey}|${spec.bucketKey}`;
    const existing = memoryBuckets.get(mapKey);
    if (!existing || existing.expiresAtMs < nowMs) return 0;
    return existing.count;
  });
}

export interface QuotaCheckResult {
  allowed: boolean;
  tier: UserTier;
  backend: 'upstash' | 'postgres' | 'memory';
  exceededPeriod?: 'window' | 'hour' | 'day' | 'month' | 'global_day' | 'global_month' | 'schedule';
  retryAfterSeconds: number;
  usage: {
    window: { used: number; limit: number; windowMinutes: number };
    hour: { used: number; limit: number };
    day: { used: number; limit: number };
    month: { used: number; limit: number };
  };
}

export async function consumeEndpointQuota(
  endpoint: QuotaEndpoint,
  tier: UserTier,
  actorKey: string,
  nowMs = Date.now()
): Promise<QuotaCheckResult> {
  const policy = getLimitsPolicy();
  const tierPolicy = policy.tiers[tier];
  const cfg = tierPolicy[endpoint];
  const globalCfg = policy.global[endpoint];
  const checkGlobal = !tierPolicy.bypassGlobalCap;

  // Optional UTC schedule check
  if (policy.publicScheduleUtc.enabled) {
    const hourUtc = new Date(nowMs).getUTCHours();
    const { startHour, endHour } = policy.publicScheduleUtc;
    const isInside =
      startHour <= endHour
        ? hourUtc >= startHour && hourUtc <= endHour
        : hourUtc >= startHour || hourUtc <= endHour;

    if (!isInside) {
      return {
        allowed: false,
        tier,
        backend: getQuotaStorageBackend(),
        exceededPeriod: 'schedule',
        retryAfterSeconds: 3600,
        usage: {
          window: { used: 0, limit: cfg.perWindow, windowMinutes: cfg.windowMinutes },
          hour: { used: 0, limit: cfg.perHour },
          day: { used: 0, limit: cfg.perDay },
          month: { used: 0, limit: cfg.perMonth },
        },
      };
    }
  }

  const specs = buildBucketSpecs(endpoint, actorKey, cfg.windowMinutes, checkGlobal, nowMs);
  let counts: number[];
  let backend: 'upstash' | 'postgres' | 'memory' = 'memory';

  if (isUpstashConfigured()) {
    try {
      const cmds: Array<Array<string | number>> = [];
      for (const s of specs) {
        const redisKey = `vp:q:${s.scopeKey}:${s.bucketKey}`;
        cmds.push(['INCR', redisKey], ['EXPIRE', redisKey, s.ttlSeconds, 'NX']);
      }
      const rawResults = await upstashPipeline(cmds);
      counts = specs.map((_, i) => rawResults[i * 2] ?? 1);
      backend = 'upstash';
    } catch (err) {
      console.warn('[Quota] Upstash fallback to Postgres/Memory:', err instanceof Error ? err.message : 'err');
      counts = isPostgresConfigured()
        ? await incrementPgQuotaBuckets(specs).catch(() => incrementMemoryBuckets(specs, nowMs))
        : incrementMemoryBuckets(specs, nowMs);
    }
  } else if (isPostgresConfigured()) {
    try {
      counts = await incrementPgQuotaBuckets(specs);
      backend = 'postgres';
    } catch (err) {
      console.warn('[Quota] Postgres fallback to Memory:', err instanceof Error ? err.message : 'err');
      counts = incrementMemoryBuckets(specs, nowMs);
      backend = 'memory';
    }
  } else {
    counts = incrementMemoryBuckets(specs, nowMs);
    backend = 'memory';
  }

  const [winUsed, hrUsed, dayUsed, moUsed, globalDayUsed = 0, globalMoUsed = 0] = counts;

  let exceededPeriod: QuotaCheckResult['exceededPeriod'];
  let retryAfterSeconds = 0;

  if (winUsed > cfg.perWindow) {
    exceededPeriod = 'window';
    retryAfterSeconds = specs[0].ttlSeconds;
  } else if (hrUsed > cfg.perHour) {
    exceededPeriod = 'hour';
    retryAfterSeconds = specs[1].ttlSeconds;
  } else if (dayUsed > cfg.perDay) {
    exceededPeriod = 'day';
    retryAfterSeconds = specs[2].ttlSeconds;
  } else if (moUsed > cfg.perMonth) {
    exceededPeriod = 'month';
    retryAfterSeconds = specs[3].ttlSeconds;
  } else if (checkGlobal && globalDayUsed > globalCfg.perDay) {
    exceededPeriod = 'global_day';
    retryAfterSeconds = specs[2].ttlSeconds;
  } else if (checkGlobal && globalMoUsed > globalCfg.perMonth) {
    exceededPeriod = 'global_month';
    retryAfterSeconds = specs[3].ttlSeconds;
  }

  return {
    allowed: !exceededPeriod,
    tier,
    backend,
    exceededPeriod,
    retryAfterSeconds,
    usage: {
      window: { used: winUsed, limit: cfg.perWindow, windowMinutes: cfg.windowMinutes },
      hour: { used: hrUsed, limit: cfg.perHour },
      day: { used: dayUsed, limit: cfg.perDay },
      month: { used: moUsed, limit: cfg.perMonth },
    },
  };
}

export async function getQuotaSnapshot(
  endpoint: QuotaEndpoint,
  tier: UserTier,
  actorKey: string,
  nowMs = Date.now()
): Promise<QuotaCheckResult> {
  const policy = getLimitsPolicy();
  const tierPolicy = policy.tiers[tier];
  const cfg = tierPolicy[endpoint];
  const specs = buildBucketSpecs(endpoint, actorKey, cfg.windowMinutes, false, nowMs);

  let counts: number[];
  let backend: 'upstash' | 'postgres' | 'memory' = 'memory';

  if (isUpstashConfigured()) {
    try {
      const cmds = specs.map(s => ['GET', `vp:q:${s.scopeKey}:${s.bucketKey}`]);
      counts = await upstashPipeline(cmds);
      backend = 'upstash';
    } catch {
      counts = readMemoryBuckets(specs, nowMs);
    }
  } else if (isPostgresConfigured()) {
    try {
      counts = await readPgQuotaBuckets(specs);
      backend = 'postgres';
    } catch {
      counts = readMemoryBuckets(specs, nowMs);
    }
  } else {
    counts = readMemoryBuckets(specs, nowMs);
  }

  const [winUsed, hrUsed, dayUsed, moUsed] = counts;
  return {
    allowed: winUsed < cfg.perWindow && hrUsed < cfg.perHour && dayUsed < cfg.perDay && moUsed < cfg.perMonth,
    tier,
    backend,
    retryAfterSeconds: 0,
    usage: {
      window: { used: winUsed, limit: cfg.perWindow, windowMinutes: cfg.windowMinutes },
      hour: { used: hrUsed, limit: cfg.perHour },
      day: { used: dayUsed, limit: cfg.perDay },
      month: { used: moUsed, limit: cfg.perMonth },
    },
  };
}
