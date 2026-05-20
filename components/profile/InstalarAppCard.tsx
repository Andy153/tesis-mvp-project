'use client';

import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Check, ChevronDown, Globe, MoreHorizontal, MoreVertical, PlusSquare, Share } from 'lucide-react';
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
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<PlatformTab>('iphone');

  if (!mounted) return null;

  return (
    <div className="panel profile-fiscal-card instalar-app-card" style={{ padding: 0, marginTop: 14, overflow: 'hidden' }}>
      <button
        type="button"
        className="instalar-app-header"
        aria-expanded={open}
        aria-controls="instalar-app-panel"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="instalar-app-header__title">Agregá Trazá a tu pantalla de inicio</span>
        <ChevronDown
          size={22}
          strokeWidth={2}
          className={`instalar-app-header__chevron${open ? ' instalar-app-header__chevron--open' : ''}`}
          aria-hidden
        />
      </button>

      <div
        id="instalar-app-panel"
        className={`instalar-app-collapse${open ? ' instalar-app-collapse--open' : ''}`}
        aria-hidden={!open}
      >
        <div className="instalar-app-collapse__inner">
          <div className="instalar-app-body">
            <p className="field-hint instalar-app-subtitle">
              Accedé más rápido desde la pantalla de inicio de tu celular.
            </p>

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
        </div>
      </div>
    </div>
  );
}
