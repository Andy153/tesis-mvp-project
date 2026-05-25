'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useInView } from './hooks/useInView';
import styles from './landing.module.css';

type StatId = 'rechazos' | 'satisfaccion' | 'cobros' | 'cuotas';

const STATS: {
  id: StatId;
  label: string;
  headline: string;
  detail: string;
}[] = [
  {
    id: 'rechazos',
    label: 'Rechazos',
    headline: '8 de cada 10 médicos',
    detail: 'Reportaron rechazos con cierta regularidad al presentar partes o autorizaciones.',
  },
  {
    id: 'satisfaccion',
    label: 'Satisfacción del proceso sin trazabilidad',
    headline: '2,17 sobre 5',
    detail: 'Promedio de satisfacción con el sistema de prepagas y sus procesos administrativos.',
  },
  {
    id: 'cobros',
    label: 'Cobros tardíos',
    headline: 'USD 500 – 1.600',
    detail: 'Rango mensual en honorarios que no llegaron a tiempo por demoras o rechazos.',
  },
  {
    id: 'cuotas',
    label: 'Brecha 2024',
    headline: '+240% vs +18%',
    detail: 'Suba de cuotas de prepagas frente al aumento de honorarios médicos en el mismo período.',
  },
];

const AUTO_MS = 4000;

function ChartRechazos({ active }: { active: boolean }) {
  const r = 34;
  const stroke = 9;
  const c = 2 * Math.PI * r;
  const pct = 0.8;
  const offset = c * (1 - pct);

  return (
    <svg viewBox="0 0 100 100" className={styles.chartSvgDonut} aria-hidden>
      <circle cx="50" cy="50" r={r} fill="none" stroke="#E2EDE6" strokeWidth={stroke} />
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke="#2A6B52"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={active ? offset : c}
        transform="rotate(-90 50 50)"
        className={styles.chartAnimStroke}
      />
      <text
        x="50"
        y="47"
        textAnchor="middle"
        dominantBaseline="middle"
        className={styles.chartSvgValue}
        fontSize="14"
        fontWeight="700"
      >
        80%
      </text>
      <text
        x="50"
        y="57"
        textAnchor="middle"
        dominantBaseline="middle"
        className={styles.chartSvgSub}
        fontSize="5.5"
        fontWeight="600"
      >
        con rechazos
      </text>
    </svg>
  );
}

function ChartSatisfaccion({ active }: { active: boolean }) {
  const score = 2.17;
  return (
    <div className={styles.chartStarsWrap}>
      <div className={styles.chartStarsRow} aria-hidden>
        {[1, 2, 3, 4, 5].map((n) => {
          const fill = Math.min(1, Math.max(0, score - (n - 1)));
          const filled = active && fill >= 0.99;
          const partial = active && fill > 0 && fill < 0.99;
          return (
            <span
              key={n}
              className={[
                styles.chartStarGlyph,
                filled ? styles.chartStarFull : '',
                partial ? styles.chartStarPartial : '',
              ].join(' ')}
              style={partial ? { opacity: 0.45 + fill * 0.55 } : undefined}
            >
              ★
            </span>
          );
        })}
      </div>
      <p className={styles.chartStarsValue}>2,17 / 5</p>
      <div className={styles.chartScoreBar}>
        <div
          className={styles.chartScoreBarFill}
          style={{ width: active ? `${(score / 5) * 100}%` : '0%' }}
        />
      </div>
    </div>
  );
}

function ChartCobros({ active }: { active: boolean }) {
  return (
    <div className={styles.chartMoney}>
      <div className={styles.chartMoneyBars}>
        <div className={styles.chartMoneyBar}>
          <div
            className={styles.chartMoneyBarFill}
            style={{ height: active ? '35%' : '0%' }}
          />
          <span>500</span>
        </div>
        <div className={styles.chartMoneyBar}>
          <div
            className={[styles.chartMoneyBarFill, styles.chartMoneyBarFillHigh].join(' ')}
            style={{ height: active ? '100%' : '0%' }}
          />
          <span>1.600</span>
        </div>
      </div>
      <p className={styles.chartMoneyUnit}>USD / mes perdidos</p>
    </div>
  );
}

function ChartCuotas({ active }: { active: boolean }) {
  return (
    <div className={styles.chartHCompare}>
      <div className={styles.chartHRow}>
        <span>Honorarios</span>
        <div className={styles.chartHTrack}>
          <div
            className={[styles.chartHFill, styles.chartHFillHonor].join(' ')}
            style={{ width: active ? '18%' : '0%' }}
          />
        </div>
        <strong>+18%</strong>
      </div>
      <div className={styles.chartHRow}>
        <span>Cuotas prepaga</span>
        <div className={styles.chartHTrack}>
          <div
            className={[styles.chartHFill, styles.chartHFillCuotas].join(' ')}
            style={{ width: active ? '100%' : '0%' }}
          />
        </div>
        <strong className={styles.chartHAccent}>+240%</strong>
      </div>
    </div>
  );
}

const CHARTS: Record<StatId, (props: { active: boolean }) => JSX.Element> = {
  rechazos: ChartRechazos,
  satisfaccion: ChartSatisfaccion,
  cobros: ChartCobros,
  cuotas: ChartCuotas,
};

export function LandingStatCharts() {
  const { ref, inView } = useInView<HTMLDivElement>(0.12);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const selected = STATS[selectedIndex].id;
  const current = STATS[selectedIndex];

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

  return (
    <div
      ref={ref}
      className={[styles.chartsWrap, inView ? styles.chartsVisible : ''].join(' ')}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className={styles.chartsCarousel}>
        <button
          type="button"
          className={styles.chartsCarouselBtn}
          onClick={() => goToIndex(selectedIndex - 1)}
          aria-label="Estadística anterior"
        >
          <ChevronLeft size={20} aria-hidden />
        </button>

        <div className={styles.chartsCarouselViewport}>
          <div
            className={styles.chartsCarouselTrack}
            style={{ transform: `translateX(-${selectedIndex * 100}%)` }}
          >
            {STATS.map((s) => {
              const isActive = selected === s.id;
              const ChartInner = CHARTS[s.id];
              return (
                <div key={s.id} className={styles.chartsCarouselSlide}>
                  <button
                    type="button"
                    className={[styles.chartCard, isActive ? styles.chartCardActive : ''].join(' ')}
                    onClick={() => goToIndex(STATS.findIndex((x) => x.id === s.id))}
                    aria-pressed={isActive}
                    aria-label={`Ver ${s.label}`}
                  >
                    <span className={styles.chartCardLabel}>{s.label}</span>
                    <div className={styles.chartCardVisual}>
                      <ChartInner active={inView && isActive} />
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          className={styles.chartsCarouselBtn}
          onClick={() => goToIndex(selectedIndex + 1)}
          aria-label="Estadística siguiente"
        >
          <ChevronRight size={20} aria-hidden />
        </button>
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

      <div className={styles.chartDetail} key={selected}>
        <p className={styles.chartDetailHeadline}>{current.headline}</p>
        <p className={styles.chartDetailText}>{current.detail}</p>
      </div>
    </div>
  );
}
