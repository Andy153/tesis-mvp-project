import webpush from 'web-push';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isDemoUser } from '@/lib/demo-user';

function pushEnabledForUser(userId: string | null | undefined): boolean {
  return Boolean(userId) && !isDemoUser(userId);
}

export type PushSubscriptionJson = {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
};

export type PushPayload = {
  title: string;
  body: string;
  icon?: string;
  url?: string;
  tag?: string;
};

let vapidConfigured = false;

function configureVapid(): boolean {
  if (vapidConfigured) return true;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject =
    process.env.VAPID_SUBJECT?.trim() || 'mailto:soporte@traza.app';

  if (!publicKey || !privateKey) {
    console.warn('[TRAZA] push:vapid_missing');
    return false;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

export function buildPushUrlFromMetadata(metadata?: Record<string, unknown>): string {
  const nav = metadata?.navigate_to;
  const view = nav === 'documents' ? 'documents' : 'alerts';
  return `/?view=${view}`;
}

export async function sendPushToSubscription(
  subscription: PushSubscriptionJson,
  payload: PushPayload,
): Promise<{ ok: boolean; statusCode?: number }> {
  if (!configureVapid()) return { ok: false };

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon ?? '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
    tag: payload.tag,
    data: {
      url: payload.url ?? '/?view=alerts',
    },
  });

  try {
    await webpush.sendNotification(subscription, body);
    return { ok: true };
  } catch (e: unknown) {
    const err = e as { statusCode?: number; message?: string };
    const statusCode = err.statusCode;
    console.warn('[TRAZA] push:send_error', statusCode, err.message);
    return { ok: false, statusCode };
  }
}

export async function sendPushToUser(
  clerkUserId: string,
  payload: PushPayload,
): Promise<void> {
  if (!pushEnabledForUser(clerkUserId)) return;
  if (!configureVapid()) return;

  const { data: rows, error } = await supabaseAdmin
    .from('push_subscriptions')
    .select('id, endpoint, subscription')
    .eq('clerk_user_id', clerkUserId);

  if (error || !rows?.length) return;

  await Promise.all(
    rows.map(async (row) => {
      const sub = row.subscription as PushSubscriptionJson;
      if (!sub?.endpoint) return;

      const result = await sendPushToSubscription(sub, payload);
      if (result.statusCode === 410 || result.statusCode === 404) {
        await supabaseAdmin
          .from('push_subscriptions')
          .delete()
          .eq('id', row.id);
      }
    }),
  );
}

export async function savePushSubscription(
  clerkUserId: string,
  subscription: PushSubscriptionJson,
  userAgent?: string | null,
): Promise<void> {
  if (!pushEnabledForUser(clerkUserId)) return;

  const now = new Date().toISOString();
  const { error } = await supabaseAdmin.from('push_subscriptions').upsert(
    {
      clerk_user_id: clerkUserId,
      endpoint: subscription.endpoint,
      subscription,
      user_agent: userAgent ?? null,
      updated_at: now,
    },
    { onConflict: 'endpoint' },
  );

  if (error) {
    console.warn('[TRAZA] push:subscribe_save_error', error.message);
  }
}

export async function removePushSubscription(
  clerkUserId: string,
  endpoint: string,
): Promise<void> {
  if (!pushEnabledForUser(clerkUserId)) return;

  await supabaseAdmin
    .from('push_subscriptions')
    .delete()
    .eq('clerk_user_id', clerkUserId)
    .eq('endpoint', endpoint);
}

export async function userHasPushSubscription(clerkUserId: string): Promise<boolean> {
  if (!pushEnabledForUser(clerkUserId)) return false;

  const { count, error } = await supabaseAdmin
    .from('push_subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('clerk_user_id', clerkUserId);

  if (error) return false;
  return (count ?? 0) > 0;
}
