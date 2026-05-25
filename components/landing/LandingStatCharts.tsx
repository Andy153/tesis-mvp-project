'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ConfusedDoctorIllustration } from './ConfusedDoctorIllustration';
import { useInView } from './hooks/useInView';
import { PerdidosCarouselSlide } from './PerdidosCarouselSlide';
import { SatisfaccionCarouselSlide } from './SatisfaccionCarouselSlide';
import styles from './landing.module.css';

type StatId = 'software' | 'satisfaccion' | 'perdidos' | 'visibilidad';

type StatConfig = {
  id: StatId;
  label: string;
  value: string;
  detail: string;
  countUpTo?: number;
  countUpSuffix?: string;
};

const STATS: StatConfig[] = [
  {
    id: 'software',
    label: 'Software de cobros',
    value: '0%',
    detail: 'de los médicos usa software específico para gestión de cobros',
  },
  {
    id: 'satisfaccion',
    label: 'Satisfacción',
    value: '2,17 / 5',
    detail: 'promedio de satisfacción con el proceso de cobro actual',
  },
  {
    id: 'perdidos',
    label: 'Honorarios perdidos',
    value: '',
    detail: 'en honorarios demorados o rechazados',
  },
  {
    id: 'visibilidad',
    label: 'Sin visibilidad',
    value: '100%',
    detail: 'acusan que no existe visibilidad del proceso actual',
    countUpTo: 100,
    countUpSuffix: '%',
  },
];

const AUTO_MS = 5000;

function useCountUp(to: number, active: boolean, duration = 1200) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!active) {
      setValue(0);
      return;
    }
    let start: number | null = null;
    let raf = 0;
    const step = (ts: number) => {
      if (start === null) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      const eased = 1 - (1 - p) ** 3;
      setValue(Math.round(eased * to));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [active, to, duration]);

  return value;
}

function ChartSoftware({ active }: { active: boolean }) {
  return <ConfusedDoctorIllustration active={active} />;
}

function ChartVisibilidad({ active }: { active: boolean }) {
  const count = useCountUp(100, active);
  const r = 54;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - (active ? count / 100 : 0));

  return (
    <svg viewBox="0 0 140 140" className={styles.dataChartSvg} aria-hidden>
      <circle cx="70" cy="70" r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="10" />
      <circle
        cx="70"
        cy="70"
        r={r}
        fill="none"
        stroke="#7dcea8"
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform="rotate(-90 70 70)"
        className={styles.dataChartRing}
      />
      <text x="70" y="76" textAnchor="middle" className={styles.dataChartSvgNum}>
        {count}%
      </text>
    </svg>
  );
}

const CHARTS: Record<Exclude<StatId, 'perdidos' | 'satisfaccion'>, (p: { active: boolean }) => JSX.Element> = {
  software: ChartSoftware,
  visibilidad: ChartVisibilidad,
};

export function LandingStatCharts() {
  const { ref, inView } = useInView<HTMLDivElement>(0.15);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [progressKey, setProgressKey] = useState(0);

  const current = STATS[index];
  const countDisplay = useCountUp(current.countUpTo ?? 0, inView && !!current.countUpTo);

  const goTo = useCallback((i: number) => {
    const len = STATS.length;
    setIndex(((i % len) + len) % len);
    setProgressKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (!inView || paused) return;
    const id = window.setInterval(() => goTo(index + 1), AUTO_MS);
    return () => window.clearInterval(id);
  }, [inView, paused, index, goTo]);

  return (
    <div
      ref={ref}
      className={[styles.dataCarousel, inView ? styles.dataCarouselVisible : ''].join(' ')}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label="Estadísticas del relevamiento"
    >
      <button
        type="button"
        className={styles.dataCarouselArrow}
        onClick={() => goTo(index - 1)}
        aria-label="Dato anterior"
      >
        <ChevronLeft size={22} aria-hidden />
      </button>

      <div className={styles.dataCarouselStage}>
        <div
          className={styles.dataCarouselTrack}
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {STATS.map((stat, i) => {
            const isActive = index === i;

            if (stat.id === 'perdidos') {
              return (
                <PerdidosCarouselSlide
                  key={stat.id}
                  label={stat.label}
                  detail={stat.detail}
                  isActive={isActive}
                  inView={inView}
                />
              );
            }

            if (stat.id === 'satisfaccion') {
              return (
                <SatisfaccionCarouselSlide
                  key={stat.id}
                  label={stat.label}
                  detail={stat.detail}
                  isActive={isActive}
                  inView={inView}
                />
              );
            }

            const SlideChart = CHARTS[stat.id];
            const slideValue =
              isActive && stat.countUpTo != null
                ? `${countDisplay}${stat.countUpSuffix ?? ''}`
                : stat.value;

            return (
              <article key={stat.id} className={styles.dataSlide} aria-hidden={!isActive}>
                <div className={styles.dataSlideChart}>
                  <SlideChart active={inView && isActive} />
                </div>
                <div className={styles.dataSlideCopy}>
                  <span className={styles.dataSlideLabel}>{stat.label}</span>
                  <p
                    className={[
                      styles.dataSlideValue,
                      isActive ? styles.dataSlideValueIn : '',
                    ].join(' ')}
                  >
                    {slideValue}
                  </p>
                  <p className={styles.dataSlideDetail}>{stat.detail}</p>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        className={styles.dataCarouselArrow}
        onClick={() => goTo(index + 1)}
        aria-label="Siguiente dato"
      >
        <ChevronRight size={22} aria-hidden />
      </button>

      <div className={styles.dataCarouselFooter}>
        <div className={styles.dataProgressTrack} aria-hidden>
          <div
            key={`${progressKey}-${paused}`}
            className={[styles.dataProgressFill, paused ? styles.dataProgressPaused : ''].join(' ')}
          />
        </div>
        <div className={styles.dataCarouselDots} role="tablist">
          {STATS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={s.label}
              className={[styles.dataDot, i === index ? styles.dataDotActive : ''].join(' ')}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
