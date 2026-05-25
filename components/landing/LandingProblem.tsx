import { LandingStatCharts } from './LandingStatCharts';
import styles from './landing.module.css';

export function LandingProblem() {
  return (
    <section className={styles.section} aria-labelledby="landing-insights-title">
      <div className={styles.bandDark}>
        <div className={styles.insightsLayout}>
          <div className={styles.insightsHead}>
            <p className={styles.sectionLabel}>Relevamiento propio</p>
            <h2 id="landing-insights-title" className={styles.bandDarkTitle}>
              Los números que escuchamos en consultorio
            </h2>
          </div>
          <LandingStatCharts />
        </div>
      </div>
    </section>
  );
}
