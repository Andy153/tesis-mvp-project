'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { isDemoUser } from '@/lib/demo-user';
import { usePushSubscription } from '@/lib/use-push-subscription';
import {
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

  useEffect(() => {
    setDismissed(getPushPromptStatus() === 'dismissed');
  }, []);

  if (demoUser) return null;

  if (!isPushApiSupported()) {
    return (
      <div className="panel push-opt-in push-opt-in--info">
        <p className="push-opt-in__text">
          Tu navegador no admite notificaciones push. Podés seguir viendo los avisos dentro de la app.
        </p>
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
      </div>
    );
  }

  if (dismissed || getPushPromptStatus() === 'denied') {
    if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
      return (
        <div className="panel push-opt-in push-opt-in--info">
          <p className="push-opt-in__text">
            Bloqueaste las notificaciones en el navegador. Podés habilitarlas desde la configuración del sitio
            (ícono del candado en la barra de direcciones).
          </p>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="panel push-opt-in">
      <p className="push-opt-in__title">Notificaciones push</p>
      <p className="push-opt-in__text">
        Activá las notificaciones para recibir avisos aunque no estés en la app.
      </p>
      <div className="push-opt-in__actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={loading || busy}
          onClick={() => void subscribe()}
        >
          Activar
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
    </div>
  );
}
