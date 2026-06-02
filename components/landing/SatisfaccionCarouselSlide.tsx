'use client';

import {
  formatSatisfaccionScore,
  useCountUpDecimal,
} from './hooks/useCountUpDecimal';
import styles from './landing.module.css';

const TARGET_SCORE = 2.17;

type Props = {
  label: string;
  detail: string;
  isActive: boolean;
  inView: boolean;
};

function StarsVisual({ score, active }: { score: number; active: boolean }) {
  return (
    <div
      className={[
        styles.chartStarsRating,
        styles.chartStarsRatingInset,
        active ? styles.chartStarsRatingActive : '',
      ].join(' ')}
      aria-hidden
    >
      <div className={styles.chartStarsRow}>
        {[1, 2, 3, 4, 5].map((n) => {
          const fill = Math.min(1, Math.max(0, score - (n - 1)));
          const lit = fill > 0.02;

          return (
            <div
              key={n}
              className={[styles.chartStarWrap, lit ? styles.chartStarWrapLit : ''].join(' ')}
            >
              <span className={styles.chartStarEmpty}>★</span>
              <span className={styles.chartStarFilled} style={{ width: `${fill * 100}%` }}>
                ★
              </span>
            </div>
          );
        })}
      </div>
      <p className={styles.chartStarsScore}>
        {formatSatisfaccionScore(score)} / 5
      </p>
    </div>
  );
}

export function SatisfaccionCarouselSlide({ label, detail, isActive, inView }: Props) {
  const animating = inView && isActive;
  const score = useCountUpDecimal(TARGET_SCORE, animating);

  return (
    <article className={styles.dataSlide} aria-hidden={!isActive}>
      <div className={styles.dataSlideChart}>
        <StarsVisual score={score} active={animating} />
      </div>
      <div className={styles.dataSlideCopy}>
        <span className={styles.dataSlideLabel}>{label}</span>
        <p
          className={[
            styles.dataSlideValue,
            isActive ? styles.dataSlideValueIn : '',
          ].join(' ')}
        >
          {formatSatisfaccionScore(score)} / 5
        </p>
        <p className={styles.dataSlideDetail}>{detail}</p>
      </div>
    </article>
  );
}
