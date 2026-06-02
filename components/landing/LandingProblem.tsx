'use client';

import { LandingStatCharts } from './LandingStatCharts';
import { useReveal } from './hooks/useReveal';
import styles from './landing.module.css';

export function LandingProblem() {
  const { ref, visible } = useReveal<HTMLDivElement>({ threshold: 0.12 });

  return (
    <section className={styles.insightsBand} aria-labelledby="landing-insights-title">
      <div className={styles.insightsBandInner}>
        <div className={styles.insightsLayout}>
          <div
            ref={ref}
            className={[styles.insightsHead, visible ? styles.insightsHeadVisible : ''].join(' ')}
          >
            <p className={styles.insightsLabel}>Relevamiento propio</p>
            <h2 id="landing-insights-title" className={styles.insightsTitle}>
              Los números que escuchamos en consultorio
            </h2>
          </div>
          <LandingStatCharts />
        </div>
      </div>
    </section>
  );
}
