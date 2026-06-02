import { NextResponse } from 'next/server';
import { syncAllNotificationsForAllUsers } from '@/lib/notifications-generate';
import { syncEngagementTipsForAllUsers } from '@/lib/notifications-engagement';
import { dayOfMonthAR, hourOfDayAR, nowInArgentina } from '@/lib/dates-ar';
import { isVapidConfigured } from '@/lib/push';
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

  const vapidOk = isVapidConfigured();
  const cronMeta = {
    now_ar: nowInArgentina().toISOString(),
    day_ar: dayOfMonthAR(),
    hour_ar: hourOfDayAR(),
    vapid_configured: vapidOk,
    has_cron_secret: Boolean(secret),
  };

  console.log('[TRAZA] cron:notifications-daily:start', cronMeta);

  if (!vapidOk) {
    console.error(
      '[TRAZA] cron:notifications-daily:vapid_missing — push no se enviará. Configurá VAPID_PRIVATE_KEY y NEXT_PUBLIC_VAPID_PUBLIC_KEY en Vercel.',
    );
  }

  const result = await syncAllNotificationsForAllUsers();
  const engagement = await syncEngagementTipsForAllUsers({ fromCron: true });

  const payload = {
    ok: true,
    ...cronMeta,
    ...result,
    engagement,
  };

  console.log('[TRAZA] cron:notifications-daily:done', payload);

  return NextResponse.json(payload);
}

export async function GET(req: Request) {
  return handleCron(req);
}

export async function POST(req: Request) {
  return handleCron(req);
}
