import { LandingStatCharts } from './LandingStatCharts';
import styles from './landing.module.css';

export function LandingProblem() {
  return (
    <section className={styles.insightsBand} aria-labelledby="landing-insights-title">
      <div className={styles.insightsBandInner}>
        <div className={styles.insightsLayout}>
          <div className={styles.insightsHead}>
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
