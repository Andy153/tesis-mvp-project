import { supabaseAdmin } from '@/lib/supabase-admin';
import { nowInArgentina } from '@/lib/dates-ar';
import type { NotificationRow, NotificationTipo } from '@/lib/notifications';
import { buildPushUrlFromMetadata, sendPushToUser, type PushSendSummary } from '@/lib/push';

/** Tipos que el cron debe poder entregar por push sin abrir la app. */
export const CRON_DELIVERABLE_PUSH_TIPOS: NotificationTipo[] = [
  'recordatorio_envio_29',
  'recordatorio_envio_5',
  'recordatorio_envio_8',
  'engagement_tip',
  'partes_con_errores',
  'perfil_fiscal_incompleto',
  'wizard_abandonado',
  '48h_cumplidas',
];

function startOfTodayIsoAR(): string {
  const now = nowInArgentina();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  return new Date(Date.UTC(y, m, d)).toISOString();
}

function wasPushedToday(metadata: Record<string, unknown> | null | undefined): boolean {
  const last = metadata?.last_push_at;
  if (typeof last !== 'string') return false;
  const pushed = new Date(last);
  if (Number.isNaN(pushed.getTime())) return false;
  const start = new Date(startOfTodayIsoAR()).getTime();
  return pushed.getTime() >= start;
}

/** Envía push para una fila de notificación y marca last_push_at si hubo entrega. */
export async function deliverPushForNotification(
  row: Pick<NotificationRow, 'id' | 'clerk_user_id' | 'titulo' | 'mensaje' | 'metadata' | 'dedupe_key' | 'tipo'>,
): Promise<PushSendSummary> {
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  if (wasPushedToday(meta)) {
    return { attempted: 0, sent: 0, failed: 0, noSubscriptions: false, skipped: true };
  }

  const summary = await sendPushToUser(row.clerk_user_id, {
    title: row.titulo,
    body: row.mensaje,
    url: buildPushUrlFromMetadata(meta),
    tag: row.dedupe_key,
  });

  if (summary.sent > 0) {
    const { error } = await supabaseAdmin
      .from('notifications')
      .update({
        metadata: { ...meta, last_push_at: new Date().toISOString() },
      })
      .eq('id', row.id);

    if (error) {
      console.warn('[TRAZA] notifications:push_mark_error', row.id, error.message);
    }
  }

  return summary;
}

/**
 * Tras el sync del cron: reintenta push del día para avisos cron elegibles
 * (insert falló en push, dedupe previo sin push, etc.).
 */
export async function deliverCronPushesForUser(clerkUserId: string): Promise<PushSendSummary> {
  const totals: PushSendSummary = {
    attempted: 0,
    sent: 0,
    failed: 0,
    noSubscriptions: false,
    skipped: false,
  };

  const { data, error } = await supabaseAdmin
    .from('notifications')
    .select('id, clerk_user_id, titulo, mensaje, metadata, dedupe_key, tipo, leida, created_at')
    .eq('clerk_user_id', clerkUserId)
    .eq('leida', false)
    .in('tipo', CRON_DELIVERABLE_PUSH_TIPOS)
    .gte('created_at', startOfTodayIsoAR());

  if (error) {
    console.warn('[TRAZA] notifications:cron_push_list_error', clerkUserId, error.message);
    return totals;
  }

  for (const row of data ?? []) {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    if (wasPushedToday(meta)) continue;

    totals.attempted += 1;
    const summary = await deliverPushForNotification(row as NotificationRow);
    totals.sent += summary.sent;
    totals.failed += summary.failed;
    if (summary.noSubscriptions) totals.noSubscriptions = true;
  }

  return totals;
}
