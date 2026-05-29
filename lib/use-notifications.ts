'use client';

import { useCallback, useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { isDemoUser } from '@/lib/demo-user';
import type { NotificationRow } from '@/lib/notifications';

export const NOTIFICATIONS_UPDATED_EVENT = 'traza:notifications-updated';

export function dispatchNotificationsUpdated() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(NOTIFICATIONS_UPDATED_EVENT));
}

export function useNotificationsUnreadCount(): number {
  const { user } = useUser();
  const demoUser = isDemoUser(user?.id);
  const [count, setCount] = useState(0);

  const load = useCallback(async () => {
    if (demoUser || !user?.id) {
      setCount(0);
      return;
    }
    try {
      const r = await fetch('/api/notifications?leidas=false');
      const j = await r.json();
      if (!r.ok) return;
      setCount(typeof j.unread_count === 'number' ? j.unread_count : 0);
    } catch {
      /* ignore */
    }
  }, [demoUser, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onUpdate = () => void load();
    window.addEventListener(NOTIFICATIONS_UPDATED_EVENT, onUpdate);
    return () => window.removeEventListener(NOTIFICATIONS_UPDATED_EVENT, onUpdate);
  }, [load]);

  return count;
}

export function useNotificationsList() {
  const { user } = useUser();
  const demoUser = isDemoUser(user?.id);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (demoUser || !user?.id) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/notifications');
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Error al cargar avisos');
      setNotifications(j.notifications ?? []);
      setUnreadCount(typeof j.unread_count === 'number' ? j.unread_count : 0);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [demoUser, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const markRead = useCallback(
    async (id: string) => {
      if (demoUser) return;
      const r = await fetch(`/api/notifications/${encodeURIComponent(id)}`, { method: 'PATCH' });
      if (!r.ok) return;
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, leida: true, read_at: new Date().toISOString() } : n)),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
      dispatchNotificationsUpdated();
    },
    [demoUser],
  );

  const markAllRead = useCallback(async () => {
    if (demoUser) return;
    const r = await fetch('/api/notifications/mark-all-read', { method: 'PATCH' });
    if (!r.ok) return;
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, leida: true, read_at: n.read_at ?? new Date().toISOString() })),
    );
    setUnreadCount(0);
    dispatchNotificationsUpdated();
  }, [demoUser]);

  return {
    notifications,
    unreadCount,
    loading,
    error,
    reload: load,
    markRead,
    markAllRead,
  };
}
