import { neon } from '@neondatabase/serverless';

let schemaInitialized = false;
let schemaPromise: Promise<void> | null = null;

export function isPostgresConfigured(): boolean {
  const url = (process.env.DATABASE_URL || '').trim();
  return Boolean(url && (url.startsWith('postgres://') || url.startsWith('postgresql://')));
}

function getSql() {
  const url = (process.env.DATABASE_URL || '').trim();
  if (!url) throw new Error('DATABASE_URL is not configured');
  return neon(url);
}

export async function ensurePgSchema(): Promise<void> {
  if (schemaInitialized) return;
  if (schemaPromise) return schemaPromise;

  schemaPromise = (async () => {
    const sql = getSql();
    await sql`
      CREATE TABLE IF NOT EXISTS vp_quota_counters (
        scope_key TEXT NOT NULL,
        bucket_key TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        expires_at BIGINT NOT NULL,
        PRIMARY KEY (scope_key, bucket_key)
      )
    `;
    schemaInitialized = true;
  })().finally(() => {
    schemaPromise = null;
  });

  return schemaPromise;
}

export interface QuotaBucketInput {
  scopeKey: string;
  bucketKey: string;
  expiresAtMs: number;
}

export async function incrementPgQuotaBuckets(buckets: QuotaBucketInput[]): Promise<number[]> {
  await ensurePgSchema();
  const sql = getSql();
  const now = Date.now();

  const results: number[] = [];
  for (const b of buckets) {
    const rows = await sql`
      INSERT INTO vp_quota_counters (scope_key, bucket_key, count, expires_at)
      VALUES (${b.scopeKey}, ${b.bucketKey}, 1, ${b.expiresAtMs})
      ON CONFLICT (scope_key, bucket_key) DO UPDATE
      SET
        count = CASE WHEN vp_quota_counters.expires_at < ${now} THEN 1 ELSE vp_quota_counters.count + 1 END,
        expires_at = CASE WHEN vp_quota_counters.expires_at < ${now} THEN ${b.expiresAtMs} ELSE vp_quota_counters.expires_at END
      RETURNING count
    `;
    results.push(Number((rows[0] as Record<string, unknown>)?.count || 1));
  }
  return results;
}

export async function readPgQuotaBuckets(buckets: Array<{ scopeKey: string; bucketKey: string }>): Promise<number[]> {
  await ensurePgSchema();
  const sql = getSql();
  const now = Date.now();

  const results: number[] = [];
  for (const b of buckets) {
    const rows = await sql`
      SELECT count, expires_at
      FROM vp_quota_counters
      WHERE scope_key = ${b.scopeKey} AND bucket_key = ${b.bucketKey}
      LIMIT 1
    `;
    if (!rows || rows.length === 0) {
      results.push(0);
    } else {
      const r = rows[0] as Record<string, unknown>;
      const exp = Number(r.expires_at || 0);
      results.push(exp < now ? 0 : Number(r.count || 0));
    }
  }
  return results;
}
