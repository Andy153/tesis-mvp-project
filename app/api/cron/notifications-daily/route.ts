import { NextResponse } from 'next/server';
import { syncAllNotificationsForAllUsers } from '@/lib/notifications-generate';
import {
  forceEngagementTipForUser,
  syncEngagementTipsForAllUsers,
} from '@/lib/notifications-engagement';
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

  const url = new URL(req.url);
  const forceEngagement = url.searchParams.get('force_engagement') === '1';
  const forceUserId = url.searchParams.get('clerk_user_id')?.trim();

  if (forceEngagement) {
    if (!forceUserId) {
      return NextResponse.json(
        { error: 'Falta query param clerk_user_id (id de Clerk del médico)' },
        { status: 400 },
      );
    }

    console.log('[TRAZA] cron:notifications-daily:force_engagement', {
      clerk_user_id: forceUserId.slice(0, 12),
      ...cronMeta,
    });

    const forced = await forceEngagementTipForUser(forceUserId);

    return NextResponse.json({
      ok: true,
      mode: 'force_engagement',
      clerk_user_id: forceUserId,
      ...cronMeta,
      ...forced,
    });
  }

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
