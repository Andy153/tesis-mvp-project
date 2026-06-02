import { supabaseAdmin } from '@/lib/supabase-admin';
import { isDemoUser } from '@/lib/demo-user';
import { isEngagementTipSendWindowAR } from '@/lib/dates-ar';
import { insertNotificationOnce, isNotificationsEnabledForUser } from '@/lib/notifications';
import { deliverCronPushesForUser } from '@/lib/notifications-push';
import {
  ENGAGEMENT_TIP_COUNT,
  ENGAGEMENT_TIP_INTERVAL_MS,
  ENGAGEMENT_TIPS,
} from '@/lib/engagement-tips';

/** Un tip de engagement cada 3 días (solo cron, no sync-on-read). */
export async function syncEngagementTipForUser(clerkUserId: string): Promise<boolean> {
  if (!isNotificationsEnabledForUser(clerkUserId)) return false;

  const { data: last, error: lastErr } = await supabaseAdmin
    .from('notifications')
    .select('created_at')
    .eq('clerk_user_id', clerkUserId)
    .eq('tipo', 'engagement_tip')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastErr) {
    console.warn('[TRAZA] notifications:engagement_tip_last_error', lastErr.message);
    return false;
  }

  if (last?.created_at) {
    const elapsed = Date.now() - new Date(last.created_at).getTime();
    if (elapsed < ENGAGEMENT_TIP_INTERVAL_MS) return false;
  }

  const { count, error: countErr } = await supabaseAdmin
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('clerk_user_id', clerkUserId)
    .eq('tipo', 'engagement_tip');

  if (countErr) {
    console.warn('[TRAZA] notifications:engagement_tip_count_error', countErr.message);
    return false;
  }

  const total = count ?? 0;
  const tipIndex = total % ENGAGEMENT_TIP_COUNT;
  const sequential = total + 1;
  const tip = ENGAGEMENT_TIPS[tipIndex];

  const { inserted } = await insertNotificationOnce({
    clerkUserId,
    tipo: 'engagement_tip',
    titulo: tip.titulo,
    mensaje: tip.mensaje,
    dedupeKey: `engagement_tip:${sequential}`,
    metadata: {
      navigate_to: tip.navigate_to,
      tip_index: tipIndex + 1,
      tip_sequential: sequential,
    },
  });

  return inserted;
}

/** Cron diario: tips de engagement para todos los usuarios con perfil (excluye demo). */
export async function syncEngagementTipsForAllUsers(opts?: {
  /** El cron de Vercel ya corre en horario fijo; no aplicar ventana 9–20. */
  fromCron?: boolean;
}): Promise<{
  sent: number;
  skipped: number;
  errors: number;
  skippedOutsideWindow: boolean;
}> {
  if (!opts?.fromCron && !isEngagementTipSendWindowAR()) {
    return { sent: 0, skipped: 0, errors: 0, skippedOutsideWindow: true };
  }

  const { data, error } = await supabaseAdmin.from('profiles').select('clerk_user_id');

  if (error) {
    console.warn('[TRAZA] notifications:engagement_profiles_error', error.message);
    return { sent: 0, skipped: 0, errors: 1, skippedOutsideWindow: false };
  }

  let sent = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of data ?? []) {
    const clerkUserId = row.clerk_user_id;
    if (!clerkUserId || isDemoUser(clerkUserId)) continue;

    try {
      const inserted = await syncEngagementTipForUser(clerkUserId);
      if (inserted) {
        sent += 1;
        await deliverCronPushesForUser(clerkUserId);
      } else {
        skipped += 1;
      }
    } catch (e) {
      errors += 1;
      console.warn('[TRAZA] notifications:engagement_tip_user_error', clerkUserId, e);
    }
  }

  return { sent, skipped, errors, skippedOutsideWindow: false };
}
