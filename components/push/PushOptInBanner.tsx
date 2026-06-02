'use client';

import { useCallback, useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { isDemoUser } from '@/lib/demo-user';
import { usePushSubscription } from '@/lib/use-push-subscription';
import {
  getNotificationPermission,
  getPushDiagnostics,
  getPushPromptStatus,
  iosNeedsPwaForPush,
  isPushApiSupported,
  setPushPromptStatus,
  syncPushPromptWithBrowserPermission,
} from '@/lib/push-client';

type PushOptInBannerProps = {
  onNavigateSettings?: () => void;
};

function isPushDebugEnabled(): boolean {
  if (process.env.NODE_ENV === 'development') return true;
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('push_debug') === '1';
}

export function PushOptInBanner({ onNavigateSettings }: PushOptInBannerProps) {
  const { user } = useUser();
  const demoUser = isDemoUser(user?.id);
  const { subscribed, loading, busy, subscribe, unsubscribe, refresh } = usePushSubscription();
  const [dismissed, setDismissed] = useState(false);
  const [debugLog, setDebugLog] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [permission, setPermission] = useState(getNotificationPermission());

  useEffect(() => {
    syncPushPromptWithBrowserPermission();
    setDismissed(getPushPromptStatus() === 'dismissed');
    setPermission(getNotificationPermission());
    setShowDebug(isPushDebugEnabled());
  }, []);

  useEffect(() => {
    if (demoUser || !showDebug) return;
    void getPushDiagnostics().then((d) => {
      console.log('[TRAZA push] diagnóstico al cargar:', d);
    });
  }, [demoUser, showDebug]);

  const handleActivate = useCallback(async () => {
    setPushPromptStatus(null);
    setDismissed(false);
    setDebugLog('Iniciando activación…');

    try {
      const result = await subscribe();
      setPermission(getNotificationPermission());
      if (!result.ok) {
        setDebugLog(`Paso: ${result.step}\n\n${result.message}`);
      } else {
        const endpointPreview = result.endpoint
          ? `${result.endpoint.slice(0, 60)}…`
          : '(sin endpoint)';
        setDebugLog(`OK — Push activado.\n\nEndpoint (inicio):\n${endpointPreview}`);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setDebugLog(`Excepción inesperada:\n${message}`);
    }
  }, [subscribe]);

  const handleDeactivate = useCallback(async () => {
    setDebugLog('Desactivando…');
    const result = await unsubscribe();
    await refresh();
    setPermission(getNotificationPermission());
    if (result.ok) {
      setDebugLog('Notificaciones push desactivadas en este dispositivo.');
    } else {
      setDebugLog(result.message ?? 'No se pudo desactivar. Probá de nuevo.');
    }
  }, [unsubscribe, refresh]);

  const handleResetPush = useCallback(async () => {
    setPushPromptStatus(null);
    setDismissed(false);
    setDebugLog('Restableciendo…');
    await unsubscribe();
    await refresh();
    setPermission(getNotificationPermission());
    setDebugLog('Listo. Tocá Activar para volver a registrar este dispositivo.');
  }, [unsubscribe, refresh]);

  const debugPanel =
    showDebug && debugLog ? (
      <pre className="push-opt-in__debug" aria-live="polite">
        {debugLog}
      </pre>
    ) : null;

  if (demoUser) return null;

  if (!isPushApiSupported()) {
    return (
      <div className="panel push-opt-in push-opt-in--info">
        <p className="push-opt-in__text">
          Tu navegador no admite notificaciones push. Podés seguir viendo los avisos dentro de la app.
        </p>
        {debugPanel}
      </div>
    );
  }

  if (iosNeedsPwaForPush()) {
    return (
      <div className="panel push-opt-in push-opt-in--info">
        <p className="push-opt-in__title">Notificaciones en iPhone</p>
        <p className="push-opt-in__text">
          En iOS las notificaciones push solo funcionan si agregás Trazá a la pantalla de inicio (Safari →
          Compartir → Agregar al inicio). Después volvé acá para activarlas.
        </p>
        {onNavigateSettings ? (
          <button type="button" className="btn btn-primary push-opt-in__btn" onClick={onNavigateSettings}>
            Ver cómo instalar
          </button>
        ) : null}
        {debugPanel}
      </div>
    );
  }

  if (subscribed) {
    return (
      <div className="panel push-opt-in push-opt-in--ok">
        <p className="push-opt-in__title">Notificaciones activadas ✓</p>
        <p className="push-opt-in__text">
          Te avisaremos por push cuando haya cobros, facturación o recordatorios importantes.
        </p>
        <button
          type="button"
          className="btn push-opt-in__btn"
          disabled={loading || busy}
          onClick={() => void handleDeactivate()}
        >
          {busy ? 'Desactivando…' : 'Desactivar notificaciones'}
        </button>
        {debugPanel}
      </div>
    );
  }

  const browserSaysDenied = permission === 'denied';

  return (
    <div className="panel push-opt-in">
      <p className="push-opt-in__title">Notificaciones push</p>
      <p className="push-opt-in__text">
        {browserSaysDenied
          ? 'Si en Ajustes ya tenés Trazá en Permitir, tocá Restablecer y después Activar. Si no, activá el permiso en Ajustes → Notificaciones → Trazá.'
          : dismissed
            ? 'Podés activarlas cuando quieras para recibir avisos fuera de la app.'
            : 'Activá las notificaciones para recibir avisos aunque no estés en la app.'}
      </p>
      <div className="push-opt-in__actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={loading || busy}
          onClick={() => void handleActivate()}
        >
          {busy ? 'Activando…' : 'Activar'}
        </button>
        <button
          type="button"
          className="btn"
          disabled={loading || busy}
          onClick={() => void handleResetPush()}
        >
          Restablecer
        </button>
        {!dismissed && !browserSaysDenied ? (
          <button
            type="button"
            className="btn"
            disabled={loading || busy}
            onClick={() => {
              setPushPromptStatus('dismissed');
              setDismissed(true);
            }}
          >
            Ahora no
          </button>
        ) : null}
      </div>
      {debugPanel}
    </div>
  );
}
