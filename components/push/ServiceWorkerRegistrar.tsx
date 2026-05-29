'use client';

import { useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import { isDemoUser } from '@/lib/demo-user';

export function ServiceWorkerRegistrar() {
  const { user, isLoaded } = useUser();

  useEffect(() => {
    if (!isLoaded) return;
    if (isDemoUser(user?.id)) return;
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    void navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        console.log('[TRAZA push] SW registrado OK, scope:', reg.scope);
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[TRAZA push] SW registro falló:', msg);
      });
  }, [isLoaded, user?.id]);

  useEffect(() => {
    if (!isLoaded || isDemoUser(user?.id)) return;
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; view?: string } | null;
      if (data?.type === 'TRAZA_NAVIGATE' && data.view) {
        window.dispatchEvent(
          new CustomEvent('traza:navigate', { detail: { view: data.view } }),
        );
      }
    };

    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [isLoaded, user?.id]);

  return null;
}
