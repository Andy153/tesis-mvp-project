import React from 'react';

export type LogoProps = {
  /** Controla tamaño (ej: "h-8", "h-12"). */
  className?: string;
  /** Texto accesible para lectores de pantalla. */
  'aria-label'?: string;
};

export default function Logo({ className = 'h-8', 'aria-label': ariaLabel = 'Trazá' }: LogoProps) {
  return (
    <span
      className={`inline-flex items-center text-[#2D5F4E] dark:text-[#E8EFEB] ${className}`}
      aria-label={ariaLabel}
      role="img"
    >
      <svg
        viewBox="0 0 200 80"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-auto"
      >
        <text
          x="10"
          y="45"
          fill="currentColor"
          style={{
            fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
            fontWeight: 700,
            fontSize: 38,
            letterSpacing: '-0.02em',
          }}
        >
          Trazá
        </text>

        {/* Trazo sutil debajo del texto */}
        <path
          d="M15 55C40 62 140 62 170 52"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />

        {/* Punta de lápiz mínima al final del trazo */}
        <g transform="translate(170, 48) rotate(15)">
          <path d="M0 0L12 4L4 12L0 0Z" fill="currentColor" />
          <rect
            x="5"
            y="5"
            width="18"
            height="6"
            rx="1"
            transform="rotate(-45)"
            fill="currentColor"
            opacity="0.8"
          />
        </g>
      </svg>
    </span>
  );
}

