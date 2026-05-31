'use client';

import { useState, type CSSProperties } from 'react';
import { CheckCircle2, CircleDollarSign, FileText, Send, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { useInView } from './hooks/useInView';
import styles from './landing.module.css';

const ORBIT_RADIUS_PX = 248;
const SVG_SIZE = 560;
const SVG_CENTER = SVG_SIZE / 2;
const SVG_LINE_RADIUS = 214;

type CardPlacement = 'top' | 'left' | 'right';

type SolveStep = {
  title: string;
  extra: string;
  icon: LucideIcon;
  angle: number;
  cardPlacement: CardPlacement;
};

const CARD_PLACEMENT_CLASS: Record<CardPlacement, string> = {
  top: styles.solveBulletCardTop,
  left: styles.solveBulletCardLeft,
  right: styles.solveBulletCardRight,
};

const SOLVE_STEPS: SolveStep[] = [
  {
    title: 'Parte quirúrgico',
    extra: 'Subí foto/PDF desde el celular. Sin escáneres ni formularios manuales.',
    icon: FileText,
    angle: 270,
    cardPlacement: 'top',
  },
  {
    title: 'Extracción con IA',
    extra: 'Código, paciente, fecha e institución detectados automáticamente. Sin tipeo.',
    icon: Sparkles,
    angle: 342,
    cardPlacement: 'right',
  },
  {
    title: 'Validación instantánea',
    extra: 'Trazá avisa si hay algo para corregir antes de enviar a Swiss Medical u OSDE.',
    icon: CheckCircle2,
    angle: 54,
    cardPlacement: 'right',
  },
  {
    title: 'Envío a la prepaga',
    extra: 'Genera y presenta la liquidación en tiempo y forma.',
    icon: Send,
    angle: 126,
    cardPlacement: 'left',
  },
  {
    title: 'Cobro trazado',
    extra: 'Sabés qué se acreditó, qué fue rechazado y qué falta corregir. Todo en un lugar.',
    icon: CircleDollarSign,
    angle: 198,
    cardPlacement: 'left',
  },
];

function polarToSvg(angleDeg: number, radius: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: SVG_CENTER + radius * Math.cos(rad),
    y: SVG_CENTER + radius * Math.sin(rad),
  };
}

function getBulletAnchorPosition(angleDeg: number): CSSProperties {
  const rad = (angleDeg * Math.PI) / 180;
  const x = ORBIT_RADIUS_PX * Math.cos(rad);
  const y = ORBIT_RADIUS_PX * Math.sin(rad);
  return {
    left: `calc(50% + ${x}px)`,
    top: `calc(50% + ${y}px)`,
  };
}

function ConnectorLines({
  inView,
  activeIndex,
}: {
  inView: boolean;
  activeIndex: number | null;
}) {
  return (
    <svg
      className={styles.solveConnectors}
      viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
      aria-hidden
    >
      {SOLVE_STEPS.map((step, index) => {
        const end = polarToSvg(step.angle, SVG_LINE_RADIUS);
        return (
          <line
            key={step.title}
            x1={SVG_CENTER}
            y1={SVG_CENTER}
            x2={end.x}
            y2={end.y}
            className={[
              styles.solveConnectorLine,
              inView ? styles.solveConnectorLineVisible : '',
              activeIndex === index ? styles.solveConnectorLineActive : '',
            ].join(' ')}
            style={{ transitionDelay: inView ? `${index * 0.1}s` : undefined }}
          />
        );
      })}
    </svg>
  );
}

function SolveBullet({
  step,
  index,
  inView,
  isActive,
  onActivate,
}: {
  step: SolveStep;
  index: number;
  inView: boolean;
  isActive: boolean;
  onActivate: () => void;
}) {
  const Icon = step.icon;

  return (
    <div
      className={[
        styles.solveBulletSlot,
        inView ? styles.solveBulletSlotVisible : '',
        isActive ? styles.solveBulletSlotActive : '',
      ].join(' ')}
      style={
        {
          '--solve-angle': `${step.angle}deg`,
          '--solve-radius': `${ORBIT_RADIUS_PX}px`,
          '--solve-delay': `${index * 0.1}s`,
        } as CSSProperties
      }
    >
      <button
        type="button"
        className={styles.solveBullet}
        onMouseEnter={onActivate}
        onFocus={onActivate}
        aria-expanded={isActive}
        aria-describedby={isActive ? `solve-card-${index}` : undefined}
      >
        <span className={styles.solveBulletIcon} aria-hidden>
          <Icon size={22} strokeWidth={1.75} />
        </span>
        <span className={styles.solveBulletTitle}>{step.title}</span>
      </button>
    </div>
  );
}

function SolveHoverCards({ activeIndex }: { activeIndex: number | null }) {
  return (
    <div className={styles.solveOrbitCards} aria-hidden={activeIndex === null}>
      {SOLVE_STEPS.map((step, index) => (
        <div
          key={step.title}
          id={`solve-card-${index}`}
          className={[
            styles.solveBulletCard,
            CARD_PLACEMENT_CLASS[step.cardPlacement],
            activeIndex === index ? styles.solveBulletCardVisible : '',
          ].join(' ')}
          style={getBulletAnchorPosition(step.angle)}
          role="tooltip"
        >
          <p className={styles.solveBulletCardTitle}>{step.title}</p>
          <p className={styles.solveBulletCardText}>{step.extra}</p>
        </div>
      ))}
    </div>
  );
}

function SolveMobileItem({
  step,
  index,
  inView,
  isExpanded,
  onToggle,
}: {
  step: SolveStep;
  index: number;
  inView: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const Icon = step.icon;

  return (
    <div
      className={[styles.solveMobileItem, inView ? styles.solveMobileItemVisible : ''].join(' ')}
      style={{ transitionDelay: inView ? `${index * 0.1}s` : '0s' }}
    >
      <button
        type="button"
        className={[styles.solveMobileBullet, isExpanded ? styles.solveMobileBulletActive : ''].join(
          ' ',
        )}
        onClick={onToggle}
        aria-expanded={isExpanded}
      >
        <span className={styles.solveBulletIcon} aria-hidden>
          <Icon size={22} strokeWidth={1.75} />
        </span>
        <span className={styles.solveBulletTitle}>{step.title}</span>
      </button>
      <div
        className={[styles.solveMobileCard, isExpanded ? styles.solveMobileCardVisible : ''].join(
          ' ',
        )}
      >
        <p className={styles.solveBulletCardTitle}>{step.title}</p>
        <p className={styles.solveBulletCardText}>{step.extra}</p>
      </div>
    </div>
  );
}

export function LandingFeatures() {
  const { ref: orbitRef, inView } = useInView<HTMLDivElement>(0.12);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [mobileExpanded, setMobileExpanded] = useState<number | null>(null);

  const hubPulsing = activeIndex !== null;

  return (
    <section className={styles.section} aria-labelledby="landing-features-title">
      <div className={styles.solveSection}>
        <div className={styles.solveSectionInner}>
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

        <div
          ref={orbitRef}
          className={styles.solveMockupWrap}
          role="group"
          aria-label="Flujo de Trazá"
        >
          <div
            className={styles.solveOrbit}
            onMouseLeave={() => setActiveIndex(null)}
          >
            <ConnectorLines inView={inView} activeIndex={activeIndex} />

            <div
              className={[
                styles.solveHub,
                inView ? styles.solveHubVisible : '',
                hubPulsing ? styles.solveHubPulsing : '',
              ].join(' ')}
            >
              <Logo size={56} variant="light" />
            </div>

            {SOLVE_STEPS.map((step, index) => (
              <SolveBullet
                key={step.title}
                step={step}
                index={index}
                inView={inView}
                isActive={activeIndex === index}
                onActivate={() => setActiveIndex(index)}
              />
            ))}

            <SolveHoverCards activeIndex={activeIndex} />
          </div>

          <div className={styles.solveMobileList}>
            <div
              className={[
                styles.solveHub,
                styles.solveHubMobile,
                inView ? styles.solveHubVisible : '',
              ].join(' ')}
            >
              <Logo size={56} variant="light" />
            </div>
            {SOLVE_STEPS.map((step, index) => (
              <SolveMobileItem
                key={step.title}
                step={step}
                index={index}
                inView={inView}
                isExpanded={mobileExpanded === index}
                onToggle={() =>
                  setMobileExpanded((prev) => (prev === index ? null : index))
                }
              />
            ))}
          </div>
        </div>
        </div>
      </div>
    </section>
  );
}
