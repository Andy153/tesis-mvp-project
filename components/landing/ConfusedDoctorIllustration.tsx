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
      <Image
        src="/images/doctora.jpg"
        alt="Médica"
        width={260}
        height={220}
        className={styles.chartDoctorSvg}
      />
      <span className={styles.chartDoctorZero}>0%</span>
    </div>
  );
}
