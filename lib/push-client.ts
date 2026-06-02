'use client';

const PROMPT_STORAGE_KEY = 'traza.push.prompt_status';

export type PushPromptStatus = 'dismissed' | 'denied' | null;

/** Resultado unificado (evita problemas de narrowing en build de Next/Vercel). */
export type PushSubscribeResult = {
  ok: boolean;
  step: string;
  message: string;
  endpoint?: string;
};

export type PushDiagnostics = {
  pushApiSupported: boolean;
  hasNotification: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  isIos: boolean;
  isStandalone: boolean;
  iosNeedsPwa: boolean;
  notificationPermission: string;
  vapidPublicKeySet: boolean;
  serviceWorkerController: boolean;
  serviceWorkerRegistrations: number;
};

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

export async function getPushDiagnostics(): Promise<PushDiagnostics> {
  let registrations = 0;
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      registrations = regs.length;
    } catch {
      registrations = -1;
    }
  }

  return {
    pushApiSupported: isPushApiSupported(),
    hasNotification: typeof window !== 'undefined' && 'Notification' in window,
    hasServiceWorker: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
    hasPushManager: typeof window !== 'undefined' && 'PushManager' in window,
    isIos: isIosDevice(),
    isStandalone: isStandalonePwa(),
    iosNeedsPwa: iosNeedsPwaForPush(),
    notificationPermission:
      typeof Notification !== 'undefined' ? Notification.permission : 'unavailable',
    vapidPublicKeySet: Boolean(getVapidPublicKey()),
    serviceWorkerController: Boolean(navigator.serviceWorker?.controller),
    serviceWorkerRegistrations: registrations,
  };
}

export function formatPushDiagnostics(d: PushDiagnostics): string {
  return [
    `API push: ${d.pushApiSupported ? 'sí' : 'no'}`,
    `iOS: ${d.isIos ? 'sí' : 'no'} · PWA instalada: ${d.isStandalone ? 'sí' : 'no'}`,
    `Permiso notif: ${d.notificationPermission}`,
    `VAPID pública: ${d.vapidPublicKeySet ? 'configurada' : 'FALTA en .env'}`,
    `SW activo: ${d.serviceWorkerController ? 'sí' : 'no'} · registros: ${d.serviceWorkerRegistrations}`,
  ].join('\n');
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

/** Clave pública VAPID URL-safe (salida de `npx web-push generate-vapid-keys`). */
const VAPID_PUBLIC_KEY_RE = /^[A-Za-z0-9_-]{80,88}$/;

export function getVapidPublicKey(): string | null {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  if (!key) return null;
  if (!VAPID_PUBLIC_KEY_RE.test(key)) return null;
  return key;
}

async function readJsonResponse<T>(r: Response): Promise<T | null> {
  const ct = r.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) return null;
  try {
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

function pushFetch(input: string, init?: RequestInit): Promise<Response> {
  return fetch(input, { credentials: 'same-origin', ...init });
}

function fail(step: string, message: string): PushSubscribeResult {
  console.error('[TRAZA push]', step, message);
  return { ok: false, step, message };
}

function waitForServiceWorkerReady(timeoutMs = 20000): Promise<ServiceWorkerRegistration> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(
        new Error(
          `Service worker no listo tras ${timeoutMs / 1000}s. Cerrá la PWA, volvé a abrirla desde el ícono y probá de nuevo.`,
        ),
      );
    }, timeoutMs);

    navigator.serviceWorker.ready
      .then((reg) => {
        window.clearTimeout(timer);
        resolve(reg);
      })
      .catch((err) => {
        window.clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      });
  });
}

export async function subscribeToPushOnServer(): Promise<PushSubscribeResult> {
  console.log('[TRAZA push] subscribe: inicio');

  if (!isPushApiSupported()) {
    return fail('check_api', 'Este navegador no expone Notification + ServiceWorker + PushManager.');
  }

  const vapidKey = getVapidPublicKey();
  if (!vapidKey) {
    const raw = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
    if (raw) {
      return fail(
        'vapid',
        'NEXT_PUBLIC_VAPID_PUBLIC_KEY inválida (usá la clave pública URL-safe de web-push, sin PEM ni comillas). Revisá Vercel → Environment Variables y redeploy.',
      );
    }
    return fail(
      'vapid',
      'Falta NEXT_PUBLIC_VAPID_PUBLIC_KEY. Agregala en Vercel (build) o .env.local y redeploy.',
    );
  }

  if (iosNeedsPwaForPush()) {
    return fail(
      'ios_pwa',
      'En iPhone hay que abrir Trazá desde el ícono de inicio (PWA), no desde Safari.',
    );
  }

  let permission: NotificationPermission;
  try {
    console.log('[TRAZA push] solicitando permiso…');
    permission = await Notification.requestPermission();
    console.log('[TRAZA push] permiso:', permission);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return fail('permission', `Error al pedir permiso: ${msg}`);
  }

  if (permission !== 'granted') {
    if (permission === 'denied') setPushPromptStatus('denied');
    return fail(
      'permission',
      `Permiso de notificaciones: ${permission}. En iPhone: Ajustes → Notificaciones → Trazá.`,
    );
  }

  let registration: ServiceWorkerRegistration;
  try {
    console.log('[TRAZA push] esperando serviceWorker.ready…');
    registration = await waitForServiceWorkerReady();
    console.log('[TRAZA push] SW listo, scope:', registration.scope);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return fail('service_worker', msg);
  }

  let subscription: PushSubscription | null;
  try {
    subscription = await registration.pushManager.getSubscription();
    console.log('[TRAZA push] suscripción existente:', subscription ? 'sí' : 'no');

    if (!subscription) {
      console.log('[TRAZA push] pushManager.subscribe…');
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      });
      console.log('[TRAZA push] subscribe OK, endpoint:', subscription.endpoint?.slice(0, 48));
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return fail('push_subscribe', `No se pudo suscribir al push: ${msg}`);
  }

  if (!subscription?.endpoint) {
    return fail('push_subscribe', 'Suscripción sin endpoint.');
  }

  try {
    console.log('[TRAZA push] POST /api/push/subscribe…');
    const r = await pushFetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    });
    const text = await r.text();
    console.log('[TRAZA push] subscribe API', r.status, text.slice(0, 200));

    if (!r.ok) {
      return fail('api_subscribe', `Servidor respondió ${r.status}: ${text.slice(0, 300)}`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return fail('api_subscribe', `Red al guardar suscripción: ${msg}`);
  }

  console.log('[TRAZA push] subscribe: éxito completo');
  return {
    ok: true,
    step: 'complete',
    message: 'Push activado correctamente.',
    endpoint: subscription.endpoint,
  };
}

export async function unsubscribeFromPushOnServer(): Promise<boolean> {
  if (!isPushApiSupported()) return false;

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return true;

  const endpoint = subscription.endpoint;
  await pushFetch('/api/push/unsubscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  });

  await subscription.unsubscribe();
  return true;
}

export async function fetchPushSubscriptionStatus(): Promise<boolean> {
  try {
    const r = await pushFetch('/api/push/status');
    if (r.redirected || !r.ok) return false;
    const j = await readJsonResponse<{ subscribed?: boolean }>(r);
    return Boolean(j?.subscribed);
  } catch {
    return false;
  }
}
