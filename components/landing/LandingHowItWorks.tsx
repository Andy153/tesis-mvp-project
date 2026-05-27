'use client';

import { useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock,
  FileText,
  Lock,
  ShieldCheck,
  Sparkles,
  UploadCloud,
} from 'lucide-react';
import styles from './landing.module.css';

const STEPS = [
  {
    n: 1,
    title: 'Subís el documento',
    previewPhrase: 'Todo centralizado desde el inicio.',
    previewChips: ['Parte médico', 'Autorización'],
    bullets: [
      'Parte médico y autorización en un solo lugar',
      'Carga simple, sin mails ni archivos sueltos',
      'Documentación centralizada por paciente',
    ],
    icon: UploadCloud,
  },
  {
    n: 2,
    title: 'La IA extrae y valida',
    previewPhrase: 'Menos carga manual, menos errores.',
    previewChips: ['Datos', 'Códigos', 'Validación'],
    bullets: [
      'Extracción automática de datos del documento',
      'Validación de códigos según reglas Swiss u OSDE',
      'Detección temprana de errores o faltantes',
    ],
    icon: Sparkles,
  },
  {
    n: 3,
    title: 'Se inicia la facturación',
    previewPhrase: 'Listo para presentar correctamente.',
    previewChips: ['Prepaga', 'ARCA', 'Expediente'],
    bullets: [
      'Presentación ordenada ante prepaga y ARCA',
      'Menos errores administrativos desde el inicio',
      'Estado del trámite visible en todo momento',
    ],
    icon: FileText,
  },
  {
    n: 4,
    title: 'Tenés visibilidad',
    previewPhrase: 'Seguimiento claro hasta el cobro.',
    previewChips: ['Estado', 'Rechazos', 'Cobro'],
    bullets: [
      'Seguimiento del estado de cada presentación',
      'Rechazos con causa y qué corregir',
      'Próximas acciones sugeridas para cobrar antes',
    ],
    icon: BarChart3,
  },
] as const;

const BENEFITS = [
  { icon: ShieldCheck, text: 'Más control, menos papeleo' },
  { icon: Clock, text: 'Procesos más rápidos' },
  { icon: CheckCircle2, text: 'Menos rechazos' },
  { icon: Lock, text: 'Datos seguros y confidenciales' },
] as const;

const DEFAULT_ACTIVE = 1;

export function LandingHowItWorks() {
  const [activeStep, setActiveStep] = useState(DEFAULT_ACTIVE);

  return (
    <section className={styles.section} aria-labelledby="landing-how-title">
      <div className={styles.howSection}>
        <p className={styles.sectionLabel}>Cómo funciona</p>
        <h2 id="landing-how-title" className={styles.howSectionTitle}>
          De el parte al cobro, en cuatro pasos
        </h2>
        <p className={styles.howSectionSubtitle}>
          Automatizamos cada etapa para que cobres más rápido, con menos esfuerzo y total trazabilidad.
        </p>

        <div className={styles.howTimeline}>
          <div className={styles.howTimelineTrack}>
            <div
              className={styles.howTimelineFill}
              style={{ width: `${(activeStep / (STEPS.length - 1)) * 100}%` }}
            />
          </div>
          {STEPS.map((step, index) => (
            <button
              key={step.n}
              type="button"
              className={[
                styles.howTimelineNode,
                index <= activeStep ? styles.howTimelineNodeDone : '',
                index === activeStep ? styles.howTimelineNodeActive : '',
              ].join(' ')}
              onClick={() => setActiveStep(index)}
              aria-label={`Ir al paso ${step.n}: ${step.title}`}
            >
              {step.n}
            </button>
          ))}
        </div>

        <div className={styles.howCards} role="tablist" aria-label="Pasos del proceso">
          {STEPS.map((step, index) => {
            const isActive = index === activeStep;
            const Icon = step.icon;

            return (
              <article
                key={step.n}
                role="tab"
                aria-selected={isActive}
                className={[styles.howCard, isActive ? styles.howCardActive : ''].join(' ')}
                onMouseEnter={() => setActiveStep(index)}
                onFocus={() => setActiveStep(index)}
                onClick={() => setActiveStep(index)}
                tabIndex={0}
              >
                {isActive && <span className={styles.howCardBadge}>Paso actual</span>}

                <div className={styles.howCardHead}>
                  <div className={styles.howCardIconWrap}>
                    <Icon size={22} strokeWidth={1.75} aria-hidden />
                  </div>
                  <h3 className={styles.howCardTitle}>{step.title}</h3>
                </div>

                <div className={styles.howCardPreview} aria-hidden={isActive}>
                  <p className={styles.howCardPreviewPhrase}>{step.previewPhrase}</p>
                  <div className={styles.howCardChips}>
                    {step.previewChips.map((chip) => (
                      <span key={chip} className={styles.howCardChip}>
                        {chip}
                      </span>
                    ))}
                  </div>
                </div>

                <div className={styles.howCardExpanded}>
                  <div className={styles.howCardDivider} aria-hidden />
                  <ul className={styles.howCardBullets}>
                    {step.bullets.map((bullet) => (
                      <li key={bullet}>
                        <CheckCircle2 size={15} strokeWidth={2} aria-hidden />
                        {bullet}
                      </li>
                    ))}
                  </ul>
                </div>

                {!isActive && (
                  <span className={styles.howCardArrow} aria-hidden>
                    <ArrowRight size={16} />
                  </span>
                )}
              </article>
            );
          })}
        </div>

        <div className={styles.howBenefits}>
          {BENEFITS.map(({ icon: BenefitIcon, text }) => (
            <div key={text} className={styles.howBenefitItem}>
              <BenefitIcon size={18} strokeWidth={1.75} aria-hidden />
              <span>{text}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
