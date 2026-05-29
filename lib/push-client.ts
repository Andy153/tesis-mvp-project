'use client';

const PROMPT_STORAGE_KEY = 'traza.push.prompt_status';

export type PushPromptStatus = 'dismissed' | 'denied' | null;

export function getPushPromptStatus(): PushPromptStatus {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.localStorage.getItem(PROMPT_STORAGE_KEY);
    if (v === 'dismissed' || v === 'denied') return v;
  } catch {
    /* ignore */
  }
  return null;
}

export function setPushPromptStatus(status: PushPromptStatus): void {
  if (typeof window === 'undefined' || !status) return;
  try {
    window.localStorage.setItem(PROMPT_STORAGE_KEY, status);
  } catch {
    /* ignore */
  }
}

export function isPushApiSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function iosNeedsPwaForPush(): boolean {
  return isIosDevice() && !isStandalonePwa();
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function getVapidPublicKey(): string | null {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  return key || null;
}

export async function subscribeToPushOnServer(): Promise<boolean> {
  if (!isPushApiSupported()) return false;

  const vapidKey = getVapidPublicKey();
  if (!vapidKey) return false;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    if (permission === 'denied') setPushPromptStatus('denied');
    return false;
  }

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
    });
  }

  const r = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  });

  return r.ok;
}

export async function unsubscribeFromPushOnServer(): Promise<boolean> {
  if (!isPushApiSupported()) return false;

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return true;

  const endpoint = subscription.endpoint;
  await fetch('/api/push/unsubscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  });

  await subscription.unsubscribe();
  return true;
}

export async function fetchPushSubscriptionStatus(): Promise<boolean> {
  try {
    const r = await fetch('/api/push/status');
    if (!r.ok) return false;
    const j = await r.json();
    return Boolean(j.subscribed);
  } catch {
    return false;
  }
}
