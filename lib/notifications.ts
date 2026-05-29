import { supabaseAdmin } from '@/lib/supabase-admin';
import { isDemoUser } from '@/lib/demo-user';
import { buildPushUrlFromMetadata, sendPushToUser } from '@/lib/push';

export type NotificationTipo =
  | 'recordatorio_envio'
  | 'recordatorio_envio_29'
  | 'recordatorio_envio_5'
  | 'recordatorio_envio_8'
  | 'partes_con_errores'
  | 'perfil_fiscal_incompleto'
  | 'wizard_abandonado'
  | 'engagement_tip'
  | '48h_cumplidas'
  | 'factura_emitida'
  | 'error_critico'
  | 'accion_cobros';

export type NotificationRow = {
  id: string;
  clerk_user_id: string;
  tipo: NotificationTipo;
  titulo: string;
  mensaje: string;
  leida: boolean;
  metadata: Record<string, unknown>;
  dedupe_key: string;
  created_at: string;
  read_at: string | null;
};

export type UpsertNotificationInput = {
  clerkUserId: string;
  tipo: NotificationTipo;
  titulo: string;
  mensaje: string;
  dedupeKey: string;
  metadata?: Record<string, unknown>;
  /** Si true, al hacer upsert se marca como no leída (paso de cobros actualizado). */
  resetUnreadOnUpsert?: boolean;
};

const PUSH_ON_INSERT_TIPOS: NotificationTipo[] = [
  'recordatorio_envio_29',
  'recordatorio_envio_5',
  'recordatorio_envio_8',
  'partes_con_errores',
  'perfil_fiscal_incompleto',
  'wizard_abandonado',
  'engagement_tip',
  '48h_cumplidas',
  'factura_emitida',
  'error_critico',
];

export function isNotificationsEnabledForUser(userId: string | null | undefined): boolean {
  return Boolean(userId) && !isDemoUser(userId);
}

async function maybeSendPushForNotification(input: UpsertNotificationInput): Promise<void> {
  if (!PUSH_ON_INSERT_TIPOS.includes(input.tipo)) return;

  await sendPushToUser(input.clerkUserId, {
    title: input.titulo,
    body: input.mensaje,
    url: buildPushUrlFromMetadata(input.metadata),
    tag: input.dedupeKey,
  });
}

export async function upsertNotification(input: UpsertNotificationInput): Promise<void> {
  if (!isNotificationsEnabledForUser(input.clerkUserId)) return;

  const row = {
    clerk_user_id: input.clerkUserId,
    tipo: input.tipo,
    titulo: input.titulo,
    mensaje: input.mensaje,
    dedupe_key: input.dedupeKey,
    metadata: input.metadata ?? {},
    ...(input.resetUnreadOnUpsert
      ? { leida: false, read_at: null }
      : {}),
  };

  const { error } = await supabaseAdmin.from('notifications').upsert(row, {
    onConflict: 'clerk_user_id,dedupe_key',
    ignoreDuplicates: false,
  });

  if (error) {
    console.warn('[TRAZA] notifications:upsert_error', error.message, input.dedupeKey);
  }
}

export async function insertNotificationOnce(
  input: UpsertNotificationInput,
): Promise<{ inserted: boolean; blockedBy?: 'dedupe' | 'disabled' | 'db_error'; errorMessage?: string }> {
  if (!isNotificationsEnabledForUser(input.clerkUserId)) {
    return { inserted: false, blockedBy: 'disabled' };
  }

  const { error } = await supabaseAdmin.from('notifications').insert({
    clerk_user_id: input.clerkUserId,
    tipo: input.tipo,
    titulo: input.titulo,
    mensaje: input.mensaje,
    dedupe_key: input.dedupeKey,
    metadata: input.metadata ?? {},
  });

  if (error) {
    if (error.code === '23505') {
      return { inserted: false, blockedBy: 'dedupe' };
    }
    console.warn('[TRAZA] notifications:insert_error', error.message, input.dedupeKey);
    return { inserted: false, blockedBy: 'db_error', errorMessage: error.message };
  }

  await maybeSendPushForNotification(input);
  return { inserted: true };
}

/** Primer error → insert + push; reintentos → solo actualiza mensaje sin push. */
export async function upsertOrInsertNotificationWithPushOnFirst(
  input: UpsertNotificationInput,
): Promise<void> {
  const { inserted } = await insertNotificationOnce(input);
  if (!inserted) {
    await upsertNotification(input);
  }
}

export async function listNotifications(
  clerkUserId: string,
  opts?: { soloNoLeidas?: boolean; limit?: number },
): Promise<{ notifications: NotificationRow[]; unreadCount: number }> {
  if (!isNotificationsEnabledForUser(clerkUserId)) {
    return { notifications: [], unreadCount: 0 };
  }

  const limit = opts?.limit ?? 100;

  let query = supabaseAdmin
    .from('notifications')
    .select('*')
    .eq('clerk_user_id', clerkUserId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (opts?.soloNoLeidas) {
    query = query.eq('leida', false);
  }

  const { data, error } = await query;
  if (error) {
    console.warn('[TRAZA] notifications:list_error', error.message);
    return { notifications: [], unreadCount: 0 };
  }

  const notifications = (data ?? []) as NotificationRow[];

  const { count, error: countErr } = await supabaseAdmin
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('clerk_user_id', clerkUserId)
    .eq('leida', false);

  if (countErr) {
    console.warn('[TRAZA] notifications:count_error', countErr.message);
  }

  return {
    notifications,
    unreadCount: count ?? notifications.filter((n) => !n.leida).length,
  };
}

export async function markNotificationRead(
  clerkUserId: string,
  notificationId: string,
): Promise<boolean> {
  if (!isNotificationsEnabledForUser(clerkUserId)) return false;

  const { data, error } = await supabaseAdmin
    .from('notifications')
    .update({ leida: true, read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('clerk_user_id', clerkUserId)
    .select('id')
    .maybeSingle();

  if (error) {
    console.warn('[TRAZA] notifications:mark_read_error', error.message);
    return false;
  }
  return Boolean(data);
}

export async function markAllNotificationsRead(clerkUserId: string): Promise<number> {
  if (!isNotificationsEnabledForUser(clerkUserId)) return 0;

  const { data, error } = await supabaseAdmin
    .from('notifications')
    .update({ leida: true, read_at: new Date().toISOString() })
    .eq('clerk_user_id', clerkUserId)
    .eq('leida', false)
    .select('id');

  if (error) {
    console.warn('[TRAZA] notifications:mark_all_read_error', error.message);
    return 0;
  }
  return data?.length ?? 0;
}
