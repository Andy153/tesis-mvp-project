import styles from './landing.module.css';

const PHRASES = [
  '80% de los médicos sufrió rechazos',
  'USD 1.600 perdidos por mes',
  '90 días para cobrar una cirugía',
  'el sistema está diseñado para no pagar',
  '2,17 / 5 de satisfacción con prepagas',
  '0% usa software de cobros',
  '100% sin visibilidad del proceso',
] as const;

export function LandingTicker() {
  const track = [...PHRASES, ...PHRASES];

  return (
    <div className={styles.tickerBand} aria-hidden>
      <div className={styles.tickerTrack}>
        {track.map((phrase, i) => (
          <span key={`${phrase}-${i}`} className={styles.tickerItem}>
            <span className={styles.tickerDot} />
            {phrase}
          </span>
        ))}
      </div>
    </div>
  );
}
