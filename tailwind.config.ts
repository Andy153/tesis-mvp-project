import type { Config } from 'tailwindcss';
import tailwindcssAnimate from 'tailwindcss-animate';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        // Tokens shadcn mapeados a variables Trazá existentes
        background: 'var(--bg)',
        foreground: 'var(--text)',
        card: {
          DEFAULT: 'var(--bg-panel)',
          foreground: 'var(--text)',
        },
        popover: {
          DEFAULT: 'var(--bg-panel)',
          foreground: 'var(--text)',
        },
        primary: {
          DEFAULT: 'var(--accent)',
          foreground: '#FFFFFF',
        },
        secondary: {
          DEFAULT: 'var(--bg-sunken)',
          foreground: 'var(--text)',
        },
        muted: {
          DEFAULT: 'var(--bg-sunken)',
          foreground: 'var(--text-muted)',
        },
        accent: {
          DEFAULT: 'var(--accent-soft)',
          foreground: 'var(--accent-ink)',
        },
        destructive: {
          DEFAULT: 'var(--error)',
          foreground: '#FFFFFF',
        },
        warning: {
          DEFAULT: 'var(--warn)',
          foreground: '#FFFFFF',
        },
        border: 'var(--border)',
        input: 'var(--border)',
        ring: 'var(--accent)',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['var(--font-unbounded)', 'system-ui', 'sans-serif'],
        display: ['var(--font-dela-gothic-one)', 'serif'],
        mono: ['var(--font-jetbrains-mono)', 'monospace'],
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;

