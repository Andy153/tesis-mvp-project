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
      <div style={{ position: 'relative', width: 260, height: 220 }}>
        <Image
          src="/images/doctora.jpg"
          alt="Médica"
          fill
          className={styles.chartDoctorSvg}
          style={{ objectFit: 'contain' }}
        />
      </div>
      <span className={styles.chartDoctorZero}>0%</span>
    </div>
  );
}
