'use client';

import { useCallback, useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { isDemoUser } from '@/lib/demo-user';
import {
  hasLocalPushSubscription,
  isPushApiSupported,
  subscribeToPushOnServer,
  type PushSubscribeResult,
  unsubscribeFromPushOnServer,
} from '@/lib/push-client';

export function usePushSubscription() {
  const { user } = useUser();
  const demoUser = isDemoUser(user?.id);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (demoUser || !user?.id) {
      setSubscribed(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    const local = await hasLocalPushSubscription();
    setSubscribed(local);
    setLoading(false);
  }, [demoUser, user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const subscribe = useCallback(async (): Promise<PushSubscribeResult> => {
    if (demoUser) {
      return { ok: false, step: 'demo', message: 'Push deshabilitado en modo demo.' };
    }
    setBusy(true);
    try {
      const result = await subscribeToPushOnServer();
      if (result.ok) await refresh();
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error('[TRAZA push] subscribe excepción:', message);
      return { ok: false, step: 'exception', message };
    } finally {
      setBusy(false);
    }
  }, [demoUser, refresh]);

  const unsubscribe = useCallback(async () => {
    if (demoUser) return { ok: false as const, message: 'Modo demo.' };
    setBusy(true);
    try {
      const result = await unsubscribeFromPushOnServer();
      await refresh();
      return result;
    } finally {
      setBusy(false);
    }
  }, [demoUser, refresh]);

  return {
    supported: !demoUser && isPushApiSupported(),
    subscribed,
    loading: loading || busy,
    busy,
    subscribe,
    unsubscribe,
    refresh,
  };
}
