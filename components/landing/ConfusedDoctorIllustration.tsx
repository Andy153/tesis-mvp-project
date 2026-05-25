import styles from './landing.module.css';

type Props = {
  active?: boolean;
};

/**
 * Médica en estilo de la referencia de marca (chibi, bata blanca, pelo naranja).
 * Pose: confundida, rascándose la cabeza.
 */
export function ConfusedDoctorIllustration({ active = false }: Props) {
  return (
    <div
      className={[styles.chartDoctor, active ? styles.chartDoctorActive : ''].join(' ')}
      aria-hidden
    >
      <svg viewBox="0 0 260 220" className={styles.chartDoctorSvg} role="img">
        <title>Médica confundida</title>

        {/* Sombra */}
        <ellipse cx="118" cy="208" rx="58" ry="7" fill="rgba(0,0,0,0.18)" />

        {/* Monitor / carpeta (eco del dibujo de referencia, tema cobros) */}
        <g className={styles.doctorMonitor}>
          <rect x="168" y="52" width="78" height="58" rx="6" fill="#143d2e" stroke="#7dcea8" strokeWidth="2" />
          <rect x="176" y="60" width="62" height="42" rx="4" fill="#1f4d3b" />
          <path
            d="M188 78 H218 V98 H198 V88 H188 Z"
            fill="none"
            stroke="#e8f5ee"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <circle cx="208" cy="72" r="6" fill="none" stroke="#7dcea8" strokeWidth="2" />
          <path d="M205 72 H211 M208 69 V75" stroke="#7dcea8" strokeWidth="1.5" />
          <rect x="178" y="112" width="74" height="36" rx="5" fill="#fff" stroke="#d4e3da" strokeWidth="1.5" />
          <rect x="186" y="120" width="22" height="8" rx="2" fill="#eaf3ed" />
          <rect x="212" y="120" width="30" height="8" rx="2" fill="#eaf3ed" />
          <circle cx="222" cy="136" r="7" fill="#eaf3ed" stroke="#b5cfc0" />
        </g>

        {/* Falda + cuello */}
        <path d="M88 148 L148 148 L154 198 L82 198 Z" fill="#2a6b52" />
        <path d="M94 118 L142 118 L148 148 L88 148 Z" fill="#4a5c52" />

        {/* Bata */}
        <path
          d="M72 118 Q118 108 164 118 L172 198 L68 198 Z"
          fill="#fff"
          stroke="#2a6b52"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path d="M104 118 L118 138 L132 118" fill="none" stroke="#d4e3da" strokeWidth="2" />

        {/* Estetoscopio */}
        <path
          d="M108 128 Q88 140 92 158 Q96 172 108 168"
          fill="none"
          stroke="#2d2d2d"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx="108" cy="170" r="7" fill="#3d3d3d" stroke="#2d2d2d" strokeWidth="2" />
        <path
          d="M128 128 Q148 132 152 148"
          fill="none"
          stroke="#2d2d2d"
          strokeWidth="3"
          strokeLinecap="round"
        />

        {/* Brazo izquierdo — encogimiento de hombros */}
        <path
          d="M72 130 Q48 138 44 158 Q42 168 52 164"
          fill="none"
          stroke="#f5d0b8"
          strokeWidth="12"
          strokeLinecap="round"
        />
        <ellipse cx="50" cy="166" rx="10" ry="8" fill="#f5d0b8" stroke="#d4a574" strokeWidth="1.5" />

        {/* Cabeza + pelo */}
        <g className={styles.doctorHead}>
          <circle cx="118" cy="78" r="36" fill="#f5d0b8" stroke="#d4a574" strokeWidth="2" />
          {/* Pelo naranja */}
          <path
            d="M82 72 Q82 38 118 34 Q154 38 154 72 Q150 58 118 52 Q86 58 82 72 Z"
            fill="#e85d4a"
          />
          <path
            d="M90 48 Q118 40 146 48"
            fill="none"
            stroke="#ff8a6a"
            strokeWidth="4"
            strokeLinecap="round"
            opacity="0.65"
          />
          <path d="M82 68 Q118 62 154 68 L154 78 Q118 72 82 78 Z" fill="#e85d4a" />
          {/* Mejillas */}
          <ellipse cx="98" cy="88" rx="7" ry="4" fill="#f0a8a0" opacity="0.55" />
          <ellipse cx="138" cy="88" rx="7" ry="4" fill="#f0a8a0" opacity="0.55" />
          {/* Cejas preocupadas */}
          <path
            d="M96 72 Q100 66 106 72"
            fill="none"
            stroke="#3d3028"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <path
            d="M130 72 Q136 66 142 72"
            fill="none"
            stroke="#3d3028"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          {/* Ojos grandes verdes */}
          <ellipse cx="102" cy="82" rx="9" ry="11" fill="#fff" />
          <ellipse cx="134" cy="82" rx="9" ry="11" fill="#fff" />
          <ellipse cx="104" cy="84" rx="5" ry="7" fill="#2a6b52" />
          <ellipse cx="136" cy="84" rx="5" ry="7" fill="#2a6b52" />
          <circle cx="106" cy="80" r="2" fill="#fff" />
          <circle cx="138" cy="80" r="2" fill="#fff" />
          {/* Boca confundida */}
          <path
            d="M108 96 Q118 100 128 96"
            fill="none"
            stroke="#3d3028"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </g>

        {/* Brazo derecho — rascando la cabeza */}
        <g className={styles.doctorScratchArm}>
          <path
            d="M158 128 Q178 118 182 88 Q184 58 152 48"
            fill="none"
            stroke="#f5d0b8"
            strokeWidth="13"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <ellipse cx="150" cy="44" rx="16" ry="12" fill="#f5d0b8" stroke="#d4a574" strokeWidth="1.5" />
          <path
            d="M142 38 L150 30 L158 38 L154 46 L146 46 Z"
            fill="#e85d4a"
            stroke="#c94a38"
            strokeWidth="1"
            strokeLinejoin="round"
          />
        </g>

        <text x="198" y="38" className={styles.doctorQuestion}>
          ?
        </text>
        <text x="48" y="52" className={styles.doctorQuestion2}>
          ?
        </text>
      </svg>
      <span className={styles.chartDoctorZero}>0%</span>
    </div>
  );
}
