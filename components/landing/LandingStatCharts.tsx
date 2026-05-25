'use client';

import { useCallback, useEffect, useState } from 'react';
import { useInView } from './hooks/useInView';
import styles from './landing.module.css';

type StatId = 'software' | 'satisfaccion' | 'perdidos' | 'visibilidad';

type StatConfig = {
  id: StatId;
  label: string;
  value: string;
  detail: string;
  bookend?: boolean;
  fadeIn?: boolean;
  countUpTo?: number;
  countUpSuffix?: string;
};

const STATS: StatConfig[] = [
  {
    id: 'software',
    label: 'Software de cobros',
    value: '0%',
    detail: 'usa software específico para gestión de cobros',
    bookend: true,
    fadeIn: true,
  },
  {
    id: 'satisfaccion',
    label: 'Satisfacción',
    value: '2,17/5',
    detail: 'satisfacción promedio con el proceso de cobro actual',
  },
  {
    id: 'perdidos',
    label: 'Honorarios perdidos',
    value: 'USD 500–1.600',
    detail: 'perdidos por mes en honorarios demorados o rechazados',
  },
  {
    id: 'visibilidad',
    label: 'Visibilidad',
    value: '100%',
    detail: 'acusan que no existe visibilidad del proceso actual',
    bookend: true,
    countUpTo: 100,
    countUpSuffix: '%',
  },
];

const AUTO_MS = 4000;
const COUNT_UP_MS = 1100;

function useCountUp(to: number, active: boolean, duration = COUNT_UP_MS) {
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
      const progress = Math.min((ts - start) / duration, 1);
      const eased = 1 - (1 - progress) ** 3;
      setValue(Math.round(eased * to));
      if (progress < 1) raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [active, to, duration]);

  return value;
}

function StatVisual({ stat, show }: { stat: StatConfig; show: boolean }) {
  const count = useCountUp(stat.countUpTo ?? 0, show && stat.countUpTo != null);

  const display =
    stat.countUpTo != null ? `${count}${stat.countUpSuffix ?? ''}` : stat.value;

  return (
    <div className={styles.statHeroPanel}>
      <p
        className={[
          styles.statHeroValue,
          stat.bookend ? styles.statHeroValueBookend : '',
          stat.fadeIn ? styles.statHeroValueFadeIn : '',
          show ? styles.statHeroValueVisible : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {display}
      </p>
    </div>
  );
}

export function LandingStatCharts() {
  const { ref, inView } = useInView<HTMLDivElement>(0.12);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const current = STATS[selectedIndex];
  const selected = current.id;

  const goToIndex = useCallback((index: number) => {
    const len = STATS.length;
    setSelectedIndex(((index % len) + len) % len);
  }, []);

  useEffect(() => {
    if (!inView || paused) return;
    const id = window.setInterval(() => {
      setSelectedIndex((i) => (i + 1) % STATS.length);
    }, AUTO_MS);
    return () => window.clearInterval(id);
  }, [inView, paused]);

  const visibilidadCount = useCountUp(100, inView && selected === 'visibilidad');

  const headlineDisplay =
    current.countUpTo != null ? `${visibilidadCount}%` : current.value;

  return (
    <div
      ref={ref}
      className={[styles.chartsWrap, inView ? styles.chartsVisible : ''].join(' ')}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className={styles.chartsCarouselViewport}>
        <div
          className={styles.chartsCarouselTrack}
          style={{ transform: `translateX(-${selectedIndex * 100}%)` }}
        >
          {STATS.map((s, i) => {
            const isActive = selectedIndex === i;
            return (
              <div key={s.id} className={styles.chartsCarouselSlide}>
                <button
                  type="button"
                  className={[styles.chartCard, isActive ? styles.chartCardActive : ''].join(' ')}
                  onClick={() => goToIndex(i)}
                  aria-pressed={isActive}
                  aria-label={`Ver ${s.label}`}
                >
                  <span className={styles.chartCardLabel}>{s.label}</span>
                  <div className={styles.chartCardVisual}>
                    <StatVisual stat={s} show={inView && isActive} />
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className={styles.chartsCarouselNav}>
        <div className={styles.chartsProgress} aria-hidden>
          <div
            className={styles.chartsProgressFill}
            style={{ width: `${((selectedIndex + 1) / STATS.length) * 100}%` }}
          />
        </div>
        <div className={styles.chartsCarouselDots} role="tablist" aria-label="Estadísticas">
          {STATS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={i === selectedIndex}
              aria-label={s.label}
              className={[styles.chartsDot, i === selectedIndex ? styles.chartsDotActive : ''].join(
                ' ',
              )}
              onClick={() => goToIndex(i)}
            />
          ))}
        </div>
      </div>

      <div className={styles.chartDetail} key={selected}>
        <p
          className={[
            styles.chartDetailHeadline,
            current.bookend ? styles.chartDetailHeadlineBookend : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {headlineDisplay}
        </p>
        <p className={styles.chartDetailText}>{current.detail}</p>
      </div>
    </div>
  );
}
