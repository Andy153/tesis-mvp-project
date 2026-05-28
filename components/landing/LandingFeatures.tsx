'use client';

import { useCallback, useState } from 'react';
import { CheckCircle, Cpu, FileText, Send, TrendingUp } from 'lucide-react';
import { useInView } from './hooks/useInView';
import styles from './landing.module.css';

const FEATURES = [
  {
    title: 'Parte quirúrgico',
    extra:
      'Subí una foto o PDF del parte desde el celular. Sin escaners, sin formularios manuales.',
    icon: FileText,
  },
  {
    title: 'Extracción con IA',
    extra:
      'Detectamos automáticamente el código de prestación, datos del paciente, fecha e institución. Sin tipeo.',
    icon: Cpu,
  },
  {
    title: 'Validación instantánea',
    extra:
      'Antes de enviar, Trazá verifica que el código sea válido para Swiss Medical u OSDE y te avisa si hay algo para corregir.',
    icon: CheckCircle,
  },
  {
    title: 'Envío a la prepaga',
    extra: 'Generamos y presentamos la liquidación en tiempo y forma.',
    icon: Send,
  },
  {
    title: 'Cobro trazado',
    extra:
      'Sabés exactamente qué se acreditó, qué fue rechazado y qué necesita corrección. Todo en un lugar.',
    icon: TrendingUp,
  },
] as const;

function SpotlightFeature({
  step,
  index,
}: {
  step: (typeof FEATURES)[number];
  index: number;
}) {
  const { ref, inView } = useInView<HTMLDivElement>(0.15);
  const [active, setActive] = useState(false);
  const [spotlight, setSpotlight] = useState({ x: 0, y: 0, visible: false });

  const handleMouseMove = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setSpotlight({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      visible: true,
    });
  }, [ref]);

  const handleMouseLeave = useCallback(() => {
    setSpotlight((prev) => ({ ...prev, visible: false }));
  }, []);

  const handleTap = useCallback(() => {
    if (window.matchMedia('(hover: none)').matches) {
      setActive((prev) => !prev);
    }
  }, []);

  const Icon = step.icon;

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      className={[
        styles.solveFeature,
        inView ? styles.solveFeatureVisible : '',
        active ? styles.solveFeatureActive : '',
      ].join(' ')}
      style={{ transitionDelay: inView ? `${index * 0.1}s` : '0s' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={handleTap}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleTap();
        }
      }}
    >
      <div
        className={styles.solveFeatureSpotlight}
        style={{
          opacity: spotlight.visible ? 1 : 0,
          background: `radial-gradient(300px circle at ${spotlight.x}px ${spotlight.y}px, rgba(42, 107, 82, 0.25), transparent 70%)`,
        }}
        aria-hidden
      />
      <div className={styles.solveFeatureBody}>
        <Icon className={styles.solveFeatureIcon} size={28} strokeWidth={1.75} aria-hidden />
        <h3 className={styles.solveFeatureTitle}>{step.title}</h3>
        <div className={styles.solveFeatureDivider} aria-hidden />
        <p className={styles.solveFeatureExtra}>{step.extra}</p>
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

        <div className={styles.solveGrid} role="list" aria-label="Qué resuelve Trazá">
          {FEATURES.map((step, index) => (
            <SpotlightFeature key={step.title} step={step} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}
