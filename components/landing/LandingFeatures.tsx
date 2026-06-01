'use client';

import { useState } from 'react';
import { CheckCircle2, CircleDollarSign, FileText, Send, Sparkles } from 'lucide-react';
import { useInView } from './hooks/useInView';
import styles from './landing.module.css';

const TIMELINE_STEPS = [
  {
    title: 'Parte quirúrgico',
    description: 'El médico sube el parte desde el celular o desktop.',
    extra:
      'Subí una foto o PDF del parte desde el celular. Sin escaners, sin formularios manuales.',
    icon: FileText,
  },
  {
    title: 'Extracción con IA',
    description:
      'Trazá lee el documento y extrae paciente, práctica y códigos automáticamente.',
    extra:
      'Detectamos automáticamente el código de prestación, datos del paciente, fecha e institución. Sin tipeo.',
    icon: Sparkles,
  },
  {
    title: 'Validación instantánea',
    description:
      'Se verifican códigos y requisitos según Swiss Medical u OSDE antes de enviar.',
    extra:
      'Antes de enviar, Trazá verifica que el código sea válido para Swiss Medical u OSDE y te avisa si hay algo para corregir.',
    icon: CheckCircle2,
  },
  {
    title: 'Envío a la prepaga',
    description:
      'La liquidación se presenta en tiempo y forma, sin archivos sueltos ni mails.',
    extra: 'Generamos y presentamos la liquidación en tiempo y forma.',
    icon: Send,
  },
  {
    title: 'Cobro trazado',
    description:
      'Sabés qué entró, qué fue rechazado y qué falta corregir. Todo en un lugar.',
    extra:
      'Sabés exactamente qué se acreditó, qué fue rechazado y qué necesita corrección. Todo en un lugar.',
    icon: CircleDollarSign,
  },
] as const;

function TimelineLine() {
  const { ref, inView } = useInView<HTMLDivElement>(0.15);

  return (
    <div
      ref={ref}
      className={[styles.solveTimelineLine, inView ? styles.solveTimelineLineVisible : ''].join(
        ' ',
      )}
      aria-hidden
    />
  );
}

function TimelineItem({
  step,
  index,
}: {
  step: (typeof TIMELINE_STEPS)[number];
  index: number;
}) {
  const { ref, inView } = useInView<HTMLDivElement>(0.2);
  const [activated, setActivated] = useState(false);
  const Icon = step.icon;
  const isLeft = index % 2 === 0;

  const activate = () => setActivated(true);

  const stepCard = (
    <div
      className={[
        styles.solveTimelineStep,
        activated ? styles.solveTimelineStepActive : '',
      ].join(' ')}
      tabIndex={0}
      onMouseEnter={activate}
      onFocus={activate}
      onClick={activate}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          activate();
        }
      }}
    >
      <h3 className={styles.solveTimelineStepTitle}>{step.title}</h3>
      <p className={styles.solveTimelineStepDesc}>{step.description}</p>
    </div>
  );

  const extraPanel = (
    <aside
      className={[
        styles.solveTimelineExtra,
        activated ? styles.solveTimelineExtraVisible : '',
      ].join(' ')}
      aria-hidden={!activated}
    >
      <p>{step.extra}</p>
    </aside>
  );

  const node = (
    <div className={styles.solveTimelineNode} aria-hidden>
      <Icon size={22} strokeWidth={1.75} />
    </div>
  );

  return (
    <div
      ref={ref}
      role="listitem"
      className={[
        styles.solveTimelineItem,
        isLeft ? styles.solveTimelineItemLeft : styles.solveTimelineItemRight,
        inView ? styles.solveTimelineItemVisible : '',
        activated ? styles.solveTimelineItemActivated : '',
      ].join(' ')}
      style={{ transitionDelay: inView ? `${index * 0.12}s` : '0s' }}
    >
      {isLeft ? (
        <>
          {stepCard}
          {node}
          {extraPanel}
        </>
      ) : (
        <>
          {extraPanel}
          {node}
          {stepCard}
        </>
      )}
    </div>
  );
}

export function LandingFeatures() {
  return (
    <section className={styles.section} aria-labelledby="landing-features-title">
      <div className={styles.solveSection}>
        <header className={styles.solveHeader}>
          <p className={styles.sectionLabel}>Qué resuelve</p>
          <div className={styles.solveHeaderRow}>
            <h2 id="landing-features-title" className={styles.solveHeadline}>
              El control que te faltaba sobre tus cobros
            </h2>
            <p className={styles.solveHeaderDesc}>
              Trazá resuelve los dos dolores que más impactan en el consultorio: la carga
              administrativa y la falta de visibilidad sobre el cobro.
            </p>
          </div>
        </header>

        <div className={styles.solveTimeline} role="list" aria-label="Flujo de Trazá">
          <TimelineLine />
          {TIMELINE_STEPS.map((step, index) => (
            <TimelineItem key={step.title} step={step} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}
