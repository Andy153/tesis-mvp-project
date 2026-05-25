import { LandingStatCharts } from './LandingStatCharts';
import styles from './landing.module.css';

export function LandingProblem() {
  return (
    <section className={styles.section} aria-labelledby="landing-problem-title">
      <p className={styles.sectionLabel}>El problema</p>
      <h2 id="landing-problem-title" className="page-title">
        Vos ya hiciste la cirugía. El resto no debería ser un laberinto.
      </h2>
      <p className={styles.problemText}>
        Partes en papel, códigos de nomenclador, plazos que nadie te recuerda y rechazos que llegan tarde.
        Las secretarias cargan todo a mano — y vos quedás sin saber qué falta ni cuánto vas a cobrar.
      </p>

      <div className={styles.bandDark}>
        <div className={styles.insightsLayout}>
          <div>
            <p className={styles.sectionLabel}>Relevamiento propio</p>
            <h3 className={styles.bandDarkTitle}>Los números que escuchamos en consultorio</h3>
            <p className={styles.bandDarkText}>
              Encuestas y entrevistas con médicos especialistas. Tocá cada tarjeta para ver el detalle;
              rotan solas si no interactuás.
            </p>
            <p className={styles.attribution}>
              Según relevamiento propio (encuestas y entrevistas con médicos).
            </p>
          </div>
          <LandingStatCharts />
        </div>
      </div>
    </section>
  );
}
