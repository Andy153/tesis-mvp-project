import {
  AlertTriangle,
  Building2,
  FileCheck,
  FileText,
  Receipt,
  Sparkles,
  Upload,
  Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import styles from './landing.module.css';

type Feature = {
  icon: LucideIcon;
  title: string;
  body: string;
  preview?: { k: string; v: string }[];
};

const SUBSECTIONS: {
  id: string;
  title: string;
  subtitle: string;
  features: Feature[];
}[] = [
  {
    id: 'envio',
    title: 'Del parte al envío',
    subtitle: 'Automatizamos la carga, validación y presentación ante la prepaga.',
    features: [
      {
        icon: Upload,
        title: 'Lectura automática del parte',
        body: 'Extraemos paciente, procedimiento y códigos sin reescribir a mano.',
        preview: [
          { k: 'Paciente', v: 'OK' },
          { k: 'Código 11010202', v: 'Swiss' },
          { k: 'Autorización', v: 'Vigente' },
        ],
      },
      {
        icon: FileCheck,
        title: 'Inicio de facturación',
        body: 'Arrancamos el proceso ante Swiss Medical u OSDE según corresponda.',
      },
      {
        icon: Building2,
        title: 'Swiss Medical y OSDE',
        body: 'Reglas, nomenclador y requisitos específicos de cada prepaga.',
      },
      {
        icon: FileText,
        title: 'Trazabilidad de punta a punta',
        body: 'Historial claro desde el documento hasta el envío.',
      },
    ],
  },
  {
    id: 'cobro',
    title: 'Control del cobro',
    subtitle: 'Visibilidad de plazos, rechazos y proyección para no perder un peso.',
    features: [
      {
        icon: AlertTriangle,
        title: 'Avisos a tiempo',
        body: 'Te enterás del rechazo antes de que venza el plazo para reclamar.',
      },
      {
        icon: Sparkles,
        title: 'Qué corregir, en cada caso',
        body: 'Indicaciones concretas — no un mail genérico de la prepaga.',
      },
      {
        icon: Wallet,
        title: 'Cuánto y cuándo cobrás',
        body: 'Proyección del mes y partes pendientes por prepaga.',
      },
      {
        icon: Receipt,
        title: 'ARCA integrado',
        body: 'Facturación oficial desde la misma plataforma.',
      },
    ],
  },
];

function FeatureCard({
  feature,
  featured,
}: {
  feature: Feature;
  featured?: boolean;
}) {
  const Icon = feature.icon;
  return (
    <article
      className={[
        styles.featureCard,
        featured ? styles.featureCardFeatured : '',
      ].join(' ')}
    >
      <div className={styles.featureCardTop}>
        <div className={styles.featureIcon}>
          <Icon size={20} aria-hidden />
        </div>
        <div>
          <h4 className={styles.featureTitle}>{feature.title}</h4>
          <p className={styles.featureBody}>{feature.body}</p>
        </div>
      </div>
      {feature.preview && (
        <div className={styles.featureMiniPreview} aria-hidden>
          {feature.preview.map((r) => (
            <div key={r.k} className={styles.featureMiniRow}>
              <span>{r.k}</span>
              <strong>{r.v}</strong>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

export function LandingFeatures() {
  return (
    <section className={styles.section} aria-labelledby="landing-features-title">
      <p className={styles.sectionLabel}>Qué resuelve</p>
      <h2 id="landing-features-title" className="page-title">
        Lo que hoy resolvemos en la práctica
      </h2>
      <p className="page-subtitle">
        Dos frentes claros: lo que pasa con el parte y lo que pasa con tu cobro.
      </p>

      <div className={styles.featureSections}>
        {SUBSECTIONS.map((sub, subIndex) => (
          <div
            key={sub.id}
            id={`features-${sub.id}`}
            className={styles.featureSubsection}
          >
            <div className={styles.featureSubsectionHead}>
              <span className={styles.featureSubsectionNum}>{subIndex + 1}</span>
              <div>
                <h3 className={styles.featureSubsectionTitle}>{sub.title}</h3>
                <p className={styles.featureSubsectionSubtitle}>{sub.subtitle}</p>
              </div>
            </div>
            <div className={styles.featureGrid}>
              {sub.features.map((f, i) => (
                <FeatureCard key={f.title} feature={f} featured={i === 0} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
