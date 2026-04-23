'use client';

const MARK_SRC = '/traza-heart-mark.png';

export type BrandLogoVariant = 'sidebar' | 'header' | 'compact';

type BrandLogoProps = {
  variant?: BrandLogoVariant;
  className?: string;
};

/**
 * Marca Trazá: ícono (corazón + trazo ECG) + palabra. Pensado para sidebar y barra móvil.
 */
export function BrandLogo({ variant = 'sidebar', className = '' }: BrandLogoProps) {
  const size = variant === 'sidebar' ? 48 : variant === 'header' ? 40 : 34;
  return (
    <span
      className={`brand-logo brand-logo--${variant}${className ? ` ${className}` : ''}`}
      role="img"
      aria-label="Trazá"
    >
      <span className="brand-logo__mark-wrap">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={MARK_SRC}
          alt=""
          width={size}
          height={size}
          className="brand-logo__mark"
          decoding="async"
        />
      </span>
      <span className="brand-logo__wordmark" aria-hidden="true">
        Trazá
      </span>
    </span>
  );
}
