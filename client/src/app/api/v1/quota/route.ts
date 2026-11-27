import { NextRequest, NextResponse } from 'next/server';
import { getClientIp } from '@/lib/security';
import { getQuotaSnapshot, getQuotaStorageBackend } from '@/lib/quota';
import { isPostgresConfigured } from '@/lib/postgres';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const actorKey = `ip:${getClientIp(request)}`;
  const scanQuota = await getQuotaSnapshot('scan', 'guest', actorKey);
  const askQuota = await getQuotaSnapshot('ask', 'guest', actorKey);

  return NextResponse.json({
    dbConfigured: isPostgresConfigured(),
    quotaBackend: getQuotaStorageBackend(),
    quotas: {
      scan: scanQuota.usage,
      ask: askQuota.usage,
    },
  });
}
