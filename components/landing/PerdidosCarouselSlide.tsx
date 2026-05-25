'use client';

import {
  formatPerdidosUsd,
  perdidosBarColor,
  perdidosBarGlow,
  usePerdidosRange,
} from './hooks/usePerdidosRange';
import styles from './landing.module.css';

type Props = {
  label: string;
  detail: string;
  isActive: boolean;
  inView: boolean;
};

export function PerdidosCarouselSlide({ label, detail, isActive, inView }: Props) {
  const animating = inView && isActive;
  const { amount, barPercent, heat } = usePerdidosRange(animating);

  return (
    <article className={styles.dataSlide} aria-hidden={!isActive}>
      <div className={styles.dataSlideChart}>
        <div className={styles.chartPerdidosSingle} aria-hidden>
          <div className={styles.chartPerdidosTrack}>
            <div
              className={styles.chartPerdidosFill}
              style={{
                height: animating ? `${barPercent}%` : '0%',
                background: animating ? perdidosBarColor(heat) : undefined,
                boxShadow: animating ? perdidosBarGlow(heat) : undefined,
              }}
            />
          </div>
        </div>
      </div>
      <div className={styles.dataSlideCopy}>
        <span className={styles.dataSlideLabel}>{label}</span>
        <div
          className={[
            styles.dataSlideValuePerdidos,
            isActive ? styles.dataSlideValuePerdidosIn : '',
          ].join(' ')}
        >
          <span className={styles.dataSlideHasta}>hasta</span>
          <div className={styles.dataSlideValuePerdidosMain}>
            <p
              className={[
                styles.dataSlideValue,
                styles.dataSlideValueAmount,
                isActive ? styles.dataSlideValueIn : '',
              ].join(' ')}
            >
              {formatPerdidosUsd(amount)}
            </p>
            <span className={styles.dataSlidePerdidosPeriod}>x mes</span>
          </div>
        </div>
        <p className={styles.dataSlideDetail}>{detail}</p>
      </div>
    </article>
  );
}
