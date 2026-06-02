import Link from 'next/link';
import styles from './landing.module.css';

type Props = {
  title?: string;
  subtitle?: string;
};

export function LandingCta({
  title = 'Menos incertidumbre entre la cirugía y el cobro.',
  subtitle = 'Entrá, subí un parte y mirá cómo Trazá ordena el resto.',
}: Props) {
  return (
    <section className={styles.section} aria-label="Empezar con Trazá">
      <div className={styles.ctaBand}>
        <h2 className={styles.ctaTitle}>{title}</h2>
        <p className={styles.ctaSubtitle}>{subtitle}</p>
        <div className={styles.ctaActions}>
          <Link href="/sign-in" className="btn btn-primary">
            Probar plataforma
          </Link>
        </div>
      </div>
    </section>
  );
}
