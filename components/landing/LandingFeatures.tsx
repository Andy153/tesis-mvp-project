'use client';

import { useEffect, useState } from 'react';
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

type Capability = {
  id: string;
  title: string;
  body: string;
  outcome: string;
  icon: LucideIcon;
};

type Pillar = {
  id: string;
  title: string;
  lead: string;
  context: string;
  capabilities: Capability[];
};

const PILLARS: Pillar[] = [
  {
    id: 'envio',
    title: 'Del parte al envío',
    lead: 'Menos carga manual, menos errores antes de presentar.',
    context:
      'Hoy el parte se reescribe, el código se duda y la prepaga recibe algo incompleto. Acá el documento entra una vez y sale validado para Swiss Medical u OSDE.',
    capabilities: [
      {
        id: 'lectura',
        title: 'Lectura automática del parte',
        body: 'Paciente, procedimiento y códigos extraídos del PDF o la foto — sin tipear de nuevo.',
        outcome: 'El parte deja de ser una transcripción manual.',
        icon: Upload,
      },
      {
        id: 'facturacion',
        title: 'Inicio de facturación',
        body: 'Arrancamos el proceso ante la prepaga con los datos ya ordenados.',
        outcome: 'Un solo clic para abrir la liquidación del mes.',
        icon: FileCheck,
      },
      {
        id: 'prepagas',
        title: 'Swiss Medical y OSDE',
        body: 'Nomenclador, reglas y requisitos distintos según la obra social.',
        outcome: 'Validación con el código que corresponde a cada prepaga.',
        icon: Building2,
      },
      {
        id: 'trazabilidad',
        title: 'Trazabilidad de punta a punta',
        body: 'Sabés qué se subió, cuándo y en qué estado quedó cada envío.',
        outcome: 'Historial claro desde el documento hasta la presentación.',
        icon: FileText,
      },
    ],
  },
  {
    id: 'cobro',
    title: 'Control del cobro',
    lead: 'Sabrás qué entra, qué se rechazó y qué hacer antes de que venza el plazo.',
    context:
      'Después del envío el médico queda a ciegas: mails genéricos, plazos que vencen y honorarios que no llegan. Trazá concentra cobro, rechazos y facturación en un solo lugar.',
    capabilities: [
      {
        id: 'avisos',
        title: 'Avisos a tiempo',
        body: 'Alertas cuando hay rechazo o vencimiento — no cuando ya es tarde.',
        outcome: 'Tiempo real para reclamar o corregir.',
        icon: AlertTriangle,
      },
      {
        id: 'correccion',
        title: 'Qué corregir, en cada caso',
        body: 'Indicaciones concretas por parte, no un mail genérico de la prepaga.',
        outcome: 'Menos idas y vueltas con administración.',
        icon: Sparkles,
      },
      {
        id: 'proyeccion',
        title: 'Cuánto y cuándo cobrás',
        body: 'Proyección del mes y partes pendientes por prepaga.',
        outcome: 'Visibilidad de caja sin armar planillas aparte.',
        icon: Wallet,
      },
      {
        id: 'arca',
        title: 'ARCA integrado',
        body: 'Facturación oficial desde la misma plataforma cuando corresponde.',
        outcome: 'Del cobro a la factura sin cambiar de sistema.',
        icon: Receipt,
      },
    ],
  },
];

const AUTO_MS = 5500;

export function LandingFeatures() {
  const [pillarIndex, setPillarIndex] = useState(0);
  const [capIndex, setCapIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const pillar = PILLARS[pillarIndex];
  const capability = pillar.capabilities[capIndex];
  const CapIcon = capability.icon;

  useEffect(() => {
    setCapIndex(0);
  }, [pillarIndex]);

  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => {
      setCapIndex((i) => (i + 1) % pillar.capabilities.length);
    }, AUTO_MS);
    return () => window.clearInterval(id);
  }, [paused, pillar.capabilities.length, pillarIndex]);

  return (
    <section className={styles.section} aria-labelledby="landing-features-title">
      <p className={styles.sectionLabel}>Qué resuelve</p>
      <h2 id="landing-features-title" className={styles.landingSectionTitle}>
        Lo que hoy resolvemos en la práctica
      </h2>
      <p className="page-subtitle">
        No es una lista de funciones sueltas: son los dos dolores que más escuchamos en consultorio,
        y cómo Trazá los ataca hoy con Swiss Medical y OSDE.
      </p>

      <div
        className={styles.solveLayout}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <div className={styles.solveAside}>
          <div className={styles.solvePillars} role="tablist" aria-label="Frentes de la plataforma">
            {PILLARS.map((p, i) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={i === pillarIndex}
                className={[
                  styles.solvePillarBtn,
                  i === pillarIndex ? styles.solvePillarBtnActive : '',
                ].join(' ')}
                onClick={() => setPillarIndex(i)}
              >
                <span className={styles.solvePillarNum}>{i + 1}</span>
                <span className={styles.solvePillarCopy}>
                  <span className={styles.solvePillarTitle}>{p.title}</span>
                  <span className={styles.solvePillarLead}>{p.lead}</span>
                </span>
              </button>
            ))}
          </div>

          <ul className={styles.solveCapList} aria-label={`Capacidades: ${pillar.title}`}>
            {pillar.capabilities.map((cap, i) => {
              const RowIcon = cap.icon;
              return (
                <li key={cap.id}>
                  <button
                    type="button"
                    className={[
                      styles.solveCapBtn,
                      i === capIndex ? styles.solveCapBtnActive : '',
                    ].join(' ')}
                    onClick={() => setCapIndex(i)}
                    aria-current={i === capIndex ? 'true' : undefined}
                  >
                    <RowIcon size={16} aria-hidden />
                    <span>{cap.title}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className={styles.solvePanel} role="tabpanel">
          <div className={styles.solvePanelVisual} key={`${pillar.id}-${capability.id}`}>
            <span className={styles.solvePanelTag}>{pillar.title}</span>
            <h3 className={styles.solvePanelTitle}>{capability.title}</h3>
            <p className={styles.solvePanelContext}>{pillar.context}</p>
            <p className={styles.solvePanelDesc}>{capability.body}</p>
            <p className={styles.solvePanelOutcome}>
              <strong>En la práctica:</strong> {capability.outcome}
            </p>
            <div className={styles.solvePanelIconWrap} aria-hidden>
              <CapIcon size={40} strokeWidth={1.25} />
            </div>
          </div>

          <div className={styles.solveProgress} aria-hidden>
            {pillar.capabilities.map((_, i) => (
              <div key={i} className={styles.solveProgressDot}>
                <div
                  className={styles.solveProgressDotFill}
                  style={{ width: i <= capIndex ? '100%' : '0%' }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
