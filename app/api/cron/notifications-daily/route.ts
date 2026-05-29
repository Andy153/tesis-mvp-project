import { NextResponse } from 'next/server';
import { syncAllNotificationsForAllUsers } from '@/lib/notifications-generate';
import { syncEngagementTipsForAllUsers } from '@/lib/notifications-engagement';
import { nowInArgentina } from '@/lib/dates-ar';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function handleCron(req: Request) {
  const authHeader = req.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[TRAZA] cron:notifications-daily:no_secret_configured');
    return NextResponse.json({ error: 'CRON_SECRET no configurado' }, { status: 500 });
  }
  if (authHeader !== `Bearer ${secret}`) {
    console.warn('[TRAZA] cron:notifications-daily:unauthorized', { has_header: !!authHeader });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[TRAZA] cron:notifications-daily:start', {
    now_ar: nowInArgentina().toISOString(),
  });

  const result = await syncAllNotificationsForAllUsers();
  const engagement = await syncEngagementTipsForAllUsers();

  console.log('[TRAZA] cron:notifications-daily:done', { ...result, engagement });

  return NextResponse.json({ ok: true, ...result, engagement });}

export async function GET(req: Request) {
  return handleCron(req);
}

export async function POST(req: Request) {
  return handleCron(req);
}
