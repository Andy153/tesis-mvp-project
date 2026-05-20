'use client';

import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Check, Globe, MoreHorizontal, MoreVertical, PlusSquare, Share } from 'lucide-react';
import { useMounted } from '@/lib/use-mounted';

type PlatformTab = 'iphone' | 'android';

type InstallStep = {
  text: string;
  icon: LucideIcon;
};

const IPHONE_STEPS: InstallStep[] = [
  { text: 'Abrí Trazá en Safari', icon: Globe },
  { text: 'Presioná los tres puntos (•••) de abajo a la derecha', icon: MoreHorizontal },
  { text: 'Tocá "Compartir" (el cuadrado con la flecha hacia arriba)', icon: Share },
  { text: 'Seleccioná "Agregar al inicio" (cuadrado con signo + en el medio)', icon: PlusSquare },
  { text: 'Tocá "Agregar" para confirmar', icon: Check },
];

const ANDROID_STEPS: InstallStep[] = [
  { text: 'Abrí Trazá en Chrome', icon: Globe },
  { text: 'Tocá los tres puntos del menú (arriba a la derecha)', icon: MoreVertical },
  { text: 'Tocá "Agregar a pantalla de inicio"', icon: PlusSquare },
  { text: 'Confirmá tocando "Agregar"', icon: Check },
];

function InstallSteps({ steps, footnote }: { steps: InstallStep[]; footnote: string }) {
  return (
    <>
      <ol className="instalar-app-steps">
        {steps.map((step, index) => {
          const Icon = step.icon;
          return (
            <li key={index} className="instalar-app-step">
              <span className="instalar-app-step__badge" aria-hidden>
                {index + 1}
              </span>
              <span className="instalar-app-step__icon" aria-hidden>
                <Icon size={20} strokeWidth={2} />
              </span>
              <span className="instalar-app-step__text">{step.text}</span>
            </li>
          );
        })}
      </ol>
      <p className="instalar-app-footnote">{footnote}</p>
    </>
  );
}

export function InstalarAppCard() {
  const mounted = useMounted();
  const [platform, setPlatform] = useState<PlatformTab>('iphone');

  if (!mounted) return null;

  return (
    <div className="panel profile-fiscal-card instalar-app-card" style={{ padding: 16, marginTop: 14 }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--text)' }}>
          Agregá Trazá a tu pantalla de inicio
        </div>
        <p className="field-hint" style={{ marginTop: 4, marginBottom: 0 }}>
          Accedé más rápido desde la pantalla de inicio de tu celular.
        </p>
      </div>

      <div
        className="segmented-control instalar-app-tabs"
        role="tablist"
        aria-label="Plataforma de instalación"
      >
        <button
          type="button"
          role="tab"
          aria-selected={platform === 'iphone'}
          className={`segmented-option${platform === 'iphone' ? ' active' : ''}`}
          onClick={() => setPlatform('iphone')}
        >
          iPhone
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={platform === 'android'}
          className={`segmented-option${platform === 'android' ? ' active' : ''}`}
          onClick={() => setPlatform('android')}
        >
          Android
        </button>
      </div>

      {platform === 'iphone' ? (
        <InstallSteps
          steps={IPHONE_STEPS}
          footnote="Solo funciona desde Safari. En Chrome u otros navegadores esta opción no aparece."
        />
      ) : (
        <InstallSteps
          steps={ANDROID_STEPS}
          footnote="Solo funciona desde Chrome. En otros navegadores esta opción puede no estar disponible."
        />
      )}
    </div>
  );
}
