'use client';

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
  const Icon = step.icon;
  const isLeft = index % 2 === 0;

  return (
    <div
      ref={ref}
      role="listitem"
      className={[
        styles.solveTimelineItem,
        isLeft ? styles.solveTimelineItemLeft : styles.solveTimelineItemRight,
        inView ? styles.solveTimelineItemVisible : '',
      ].join(' ')}
      style={{ transitionDelay: inView ? `${index * 0.12}s` : '0s' }}
    >
      <div className={styles.solveTimelineNode} aria-hidden>
        <Icon size={22} strokeWidth={1.75} />
      </div>
      <div className={styles.solveTimelineStep} tabIndex={0}>
        <h3 className={styles.solveTimelineStepTitle}>{step.title}</h3>
        <p className={styles.solveTimelineStepDesc}>{step.description}</p>
        <p className={styles.solveTimelineStepExtra}>{step.extra}</p>
      </div>
    </div>
  );
}

export function LandingFeatures() {
  return (
    <section className={styles.section} aria-labelledby="landing-features-title">
      <div className={styles.solveSection}>
        <header className={styles.solveHeader}>
          <div className={styles.solveHeaderCopy}>
            <p className={styles.sectionLabel}>Qué resuelve</p>
            <h2 id="landing-features-title" className={styles.solveHeadline}>
              Del parte al cobro,
              <br className={styles.solveHeadlineBreak} aria-hidden />
              sin perder el control
            </h2>
          </div>
          <p className={styles.solveHeaderDesc}>
            Trazá resuelve los dos dolores que más impactan en el consultorio: la carga
            administrativa y la falta de visibilidad sobre el cobro.
          </p>
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
