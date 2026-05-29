'use client';

import { useCallback, useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { isDemoUser } from '@/lib/demo-user';
import {
  fetchPushSubscriptionStatus,
  isPushApiSupported,
  subscribeToPushOnServer,
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

  const subscribe = useCallback(async () => {
    if (demoUser) return false;
    setBusy(true);
    try {
      const ok = await subscribeToPushOnServer();
      if (ok) setSubscribed(true);
      return ok;
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
