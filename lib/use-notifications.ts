'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth, useUser } from '@clerk/nextjs';
import { isDemoUser } from '@/lib/demo-user';
import type { NotificationRow } from '@/lib/notifications';
import { apiFetch, fetchApiJson } from '@/lib/safe-api-json';

export const NOTIFICATIONS_UPDATED_EVENT = 'traza:notifications-updated';

export function dispatchNotificationsUpdated() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(NOTIFICATIONS_UPDATED_EVENT));
}

export function useNotificationsUnreadCount(): number {
  const { user } = useUser();
  const { isLoaded, isSignedIn } = useAuth();
  const demoUser = isDemoUser(user?.id);
  const [count, setCount] = useState(0);

  const load = useCallback(async () => {
    if (!isLoaded || !isSignedIn || demoUser || !user?.id) {
      setCount(0);
      return;
    }
    try {
      const res = await fetchApiJson<{ unread_count?: number }>(
        '/api/notifications/unread-count',
      );
      if (res.ok === false) return;
      setCount(typeof res.data.unread_count === 'number' ? res.data.unread_count : 0);
    } catch {
      /* ignore */
    }
  }, [isLoaded, isSignedIn, demoUser, user?.id]);

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

async function syncCobrosInBackground(): Promise<boolean> {
  try {
    const r = await apiFetch('/api/notifications/sync-cobros', { method: 'POST' });
    return r.ok;
  } catch {
    return false;
  }
}

export function useNotificationsList() {
  const { user } = useUser();
  const { isLoaded, isSignedIn } = useAuth();
  const demoUser = isDemoUser(user?.id);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    const res = await fetchApiJson<{
      notifications?: NotificationRow[];
      unread_count?: number;
    }>('/api/notifications');
    if (res.ok === false) throw new Error(res.message);
    return {
      notifications: res.data.notifications ?? [],
      unreadCount:
        typeof res.data.unread_count === 'number' ? res.data.unread_count : 0,
    };
  }, []);

  const applyList = useCallback((data: { notifications: NotificationRow[]; unreadCount: number }) => {
    setNotifications(data.notifications);
    setUnreadCount(data.unreadCount);
  }, []);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!isLoaded) return;

      if (!isSignedIn || demoUser || !user?.id) {
        setNotifications([]);
        setUnreadCount(0);
        setLoading(false);
        setError(null);
        return;
      }

      if (!opts?.silent) {
        setLoading(true);
        setError(null);
      }

      try {
        const data = await fetchList();
        applyList(data);
      } catch (e: unknown) {
        if (!opts?.silent) {
          setError(e instanceof Error ? e.message : 'Error al cargar avisos');
        }
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [isLoaded, isSignedIn, demoUser, user?.id, fetchList, applyList],
  );

  useEffect(() => {
    void (async () => {
      await load();
      const synced = await syncCobrosInBackground();
      if (synced) {
        await load({ silent: true });
        dispatchNotificationsUpdated();
      }
    })();
  }, [load]);

  const markRead = useCallback(
    async (id: string) => {
      if (demoUser) return;
      const r = await fetch(`/api/notifications/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        credentials: 'same-origin',
      });
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
    const r = await fetch('/api/notifications/mark-all-read', {
      method: 'PATCH',
      credentials: 'same-origin',
    });
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
