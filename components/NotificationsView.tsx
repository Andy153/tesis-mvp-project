'use client';

import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { useNotificationsList } from '@/lib/use-notifications';
import type { NotificationRow } from '@/lib/notifications';
import { PushOptInBanner } from '@/components/push/PushOptInBanner';

type NotificationsViewProps = {
  onNavigate?: (view: string) => void;
};

function navigateTarget(n: NotificationRow): string {
  const nav = n.metadata?.navigate_to;
  return typeof nav === 'string' ? nav : 'documents';
}

export function NotificationsView({ onNavigate }: NotificationsViewProps) {
  const { notifications, unreadCount, loading, error, markRead, markAllRead } = useNotificationsList();

  const handleOpen = (n: NotificationRow) => {
    if (!n.leida) void markRead(n.id);
    onNavigate?.(navigateTarget(n));
  };

  return (
    <div className="notifications-view px-6 md:px-10 pt-6 pb-10 max-w-[900px] mx-auto">
      <div className="page-head notifications-view__head">
        <div>
          <h1 className="page-title">Avisos</h1>
          <p className="page-subtitle">
            {unreadCount > 0
              ? `${unreadCount} sin leer`
              : 'Estás al día con tus avisos'}
          </p>
        </div>
        {unreadCount > 0 ? (
          <button type="button" className="btn" onClick={() => void markAllRead()}>
            Marcar todas como leídas
          </button>
        ) : null}
      </div>

      <PushOptInBanner onNavigateSettings={() => onNavigate?.('settings')} />

      {loading ? (
        <p className="notifications-view__muted">Cargando avisos…</p>
      ) : error ? (
        <p className="notifications-view__error">{error}</p>
      ) : notifications.length === 0 ? (
        <div className="panel notifications-view__empty">
          <p className="notifications-view__empty-title">No tenés avisos</p>
          <p className="notifications-view__muted">
            Cuando haya algo que requiera tu atención — cierre de mes, cobros Swiss o facturación — lo verás acá.
          </p>
        </div>
      ) : (
        <ul className="notifications-list">
          {notifications.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                className={`notifications-item${n.leida ? '' : ' notifications-item--unread'}`}
                onClick={() => handleOpen(n)}
              >
                <div className="notifications-item__top">
                  <span className="notifications-item__title">{n.titulo}</span>
                  <time className="notifications-item__time" dateTime={n.created_at}>
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: es })}
                  </time>
                </div>
                <p className="notifications-item__message">{n.mensaje}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
