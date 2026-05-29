'use client';

import { useCallback, useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { isDemoUser } from '@/lib/demo-user';
import {
  fetchPushSubscriptionStatus,
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
    const ok = await fetchPushSubscriptionStatus();
    setSubscribed(ok);
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
      if (result.ok) setSubscribed(true);
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error('[TRAZA push] subscribe excepción:', message);
      return { ok: false, step: 'exception', message };
    } finally {
      setBusy(false);
    }
  }, [demoUser]);

  const unsubscribe = useCallback(async () => {
    if (demoUser) return false;
    setBusy(true);
    try {
      const ok = await unsubscribeFromPushOnServer();
      if (ok) setSubscribed(false);
      return ok;
    } finally {
      setBusy(false);
    }
  }, [demoUser]);

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
