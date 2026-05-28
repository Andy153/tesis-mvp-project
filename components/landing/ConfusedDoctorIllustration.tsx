import Image from 'next/image';
import styles from './landing.module.css';

type Props = {
  active?: boolean;
};

export function ConfusedDoctorIllustration({ active = false }: Props) {
  return (
    <div
      className={[styles.chartDoctor, active ? styles.chartDoctorActive : ''].join(' ')}
      aria-hidden
    >
      <div className={styles.chartDoctorFrame}>
        <Image
          src="/images/docmarta2-removebg-preview.png"
          alt="Médica"
          fill
          className={styles.chartDoctorSvg}
          style={{ objectFit: 'contain' }}
        />
        <span className={[styles.doctorQuestion, styles.doctorQuestion1].join(' ')} aria-hidden>
          ?
        </span>
        <span className={[styles.doctorQuestion, styles.doctorQuestion2].join(' ')} aria-hidden>
          ?
        </span>
        <span className={[styles.doctorQuestion, styles.doctorQuestion3].join(' ')} aria-hidden>
          ?
        </span>
      </div>
      <span className={styles.chartDoctorZero}>0%</span>
    </div>
  );
}
