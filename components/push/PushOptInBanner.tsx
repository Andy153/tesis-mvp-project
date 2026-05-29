'use client';

import { useCallback, useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { isDemoUser } from '@/lib/demo-user';
import { usePushSubscription } from '@/lib/use-push-subscription';
import {
  formatPushDiagnostics,
  getPushDiagnostics,
  getPushPromptStatus,
  iosNeedsPwaForPush,
  isPushApiSupported,
  setPushPromptStatus,
} from '@/lib/push-client';

type PushOptInBannerProps = {
  onNavigateSettings?: () => void;
};

export function PushOptInBanner({ onNavigateSettings }: PushOptInBannerProps) {
  const { user } = useUser();
  const demoUser = isDemoUser(user?.id);
  const { subscribed, loading, busy, subscribe, unsubscribe } = usePushSubscription();
  const [dismissed, setDismissed] = useState(false);
  const [debugLog, setDebugLog] = useState<string | null>(null);
  const [diagSummary, setDiagSummary] = useState<string>('');

  useEffect(() => {
    setDismissed(getPushPromptStatus() === 'dismissed');
  }, []);

  useEffect(() => {
    if (demoUser) return;
    void (async () => {
      const d = await getPushDiagnostics();
      const summary = formatPushDiagnostics(d);
      setDiagSummary(summary);
      console.log('[TRAZA push] diagnóstico al cargar:\n' + summary);
    })();
  }, [demoUser]);

  const handleActivate = useCallback(async () => {
    setDebugLog('Iniciando activación…');
    console.log('[TRAZA push] botón Activar — tap');

    try {
      const result = await subscribe();
      console.log('[TRAZA push] resultado subscribe:', result);

      if (result.ok) {
        const msg = `OK — Push activado.\n\nEndpoint (inicio):\n${result.endpoint.slice(0, 60)}…`;
        setDebugLog(msg);
        window.alert('OK: notificaciones push activadas.');
      } else {
        const msg = `Paso: ${result.step}\n\n${result.message}`;
        setDebugLog(msg);
        window.alert(`Error push (${result.step}):\n\n${result.message}`);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error('[TRAZA push] handleActivate catch:', e);
      const msg = `Excepción inesperada:\n${message}`;
      setDebugLog(msg);
      window.alert(`Error push:\n\n${message}`);
    }
  }, [subscribe]);

  const debugPanel =
    debugLog || diagSummary ? (
      <pre className="push-opt-in__debug" aria-live="polite">
        {debugLog ?? diagSummary}
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
          onClick={() => void unsubscribe()}
        >
          Desactivar notificaciones
        </button>
        {debugPanel}
      </div>
    );
  }

  if (dismissed || getPushPromptStatus() === 'denied') {
    if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
      return (
        <div className="panel push-opt-in push-opt-in--info">
          <p className="push-opt-in__text">
            Bloqueaste las notificaciones. En iPhone: Ajustes → Notificaciones → Trazá → Permitir.
          </p>
          {debugPanel}
        </div>
      );
    }
    return debugPanel ? (
      <div className="panel push-opt-in push-opt-in--info">{debugPanel}</div>
    ) : null;
  }

  return (
    <div className="panel push-opt-in">
      <p className="push-opt-in__title">Notificaciones push</p>
      <p className="push-opt-in__text">
        Activá las notificaciones para recibir avisos aunque no estés en la app.
      </p>
      {diagSummary ? (
        <pre className="push-opt-in__debug push-opt-in__debug--muted">{diagSummary}</pre>
      ) : null}
      <div className="push-opt-in__actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={loading || busy}
          onClick={() => {
            console.log('[TRAZA push] click Activar, loading=', loading, 'busy=', busy);
            void handleActivate();
          }}
        >
          {busy ? 'Activando…' : 'Activar'}
        </button>
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
      </div>
      {debugLog ? <pre className="push-opt-in__debug">{debugLog}</pre> : null}
    </div>
  );
}
