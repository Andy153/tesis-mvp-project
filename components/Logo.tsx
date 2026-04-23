type LogoProps = {
  size?: number;
  variant?: 'dark' | 'light';
  className?: string;
};

const PALETTE = {
  dark: {
    bg: '#0F3D2E',
    fold: '#D9EDE3',
    pulse: '#2FA678',
  },
  light: {
    bg: '#D9EDE3',
    fold: '#B5D9C7',
    pulse: '#0F3D2E',
  },
} as const;

/**
 * Marca gráfica: documento con esquina plegada y trazo de pulso (SVG inline).
 */
export function Logo({ size = 40, variant = 'dark', className }: LogoProps) {
  const c = PALETTE[variant];
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-hidden="true"
    >
      <rect width="64" height="64" rx="14" ry="14" fill={c.bg} />
      <path fill="#FFFFFF" d="M 16 14 L 40 14 L 50 24 L 50 52 L 16 52 Z" />
      <path fill={c.fold} d="M 40 14 L 40 24 L 50 24 Z" />
      <polyline
        fill="none"
        stroke={c.pulse}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        points="16,38 24,38 28,30 32,46 36,32 42,42 50,40"
      />
    </svg>
  );
}
