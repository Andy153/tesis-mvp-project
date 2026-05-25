'use client';

import { useEffect, useState } from 'react';
import { Check, FileUp, Send, Sparkles } from 'lucide-react';
import styles from './landing.module.css';

const STEPS = [
  {
    n: 1,
    title: 'Subís el documento',
    body: 'Parte y autorización en un solo lugar.',
    tag: 'Paso 1',
    panelTitle: 'Carga en segundos',
    panelDesc: 'Arrastrás el PDF o la foto del parte. Trazá lo asocia a la liquidación del mes.',
    items: ['Parte quirúrgico', 'Autorización de la prepaga', 'Historial por paciente'],
    icon: FileUp,
  },
  {
    n: 2,
    title: 'La IA extrae y valida',
    body: 'Datos y códigos según Swiss u OSDE.',
    tag: 'Paso 2',
    panelTitle: 'Validación automática',
    panelDesc: 'Cruzamos nomenclador, vigencia de autorización y plazos antes de que presentes.',
    items: ['Código Swiss / FASGO', 'Autorización vigente', 'Alertas de vencimiento'],
    icon: Sparkles,
  },
  {
    n: 3,
    title: 'Se inicia la facturación',
    body: 'Presentación ante la prepaga y ARCA.',
    tag: 'Paso 3',
    panelTitle: 'Presentación ordenada',
    panelDesc: 'Armamos el envío según las reglas de cada prepaga — sin reescribir planillas.',
    items: ['Planilla Swiss Medical', 'Envío OSDE', 'Factura ARCA integrada'],
    icon: Send,
  },
  {
    n: 4,
    title: 'Tenés visibilidad',
    body: 'Cobro, rechazos y qué corregir.',
    tag: 'Paso 4',
    panelTitle: 'Dashboard de cobros',
    panelDesc: 'Proyección del mes, rechazos y próximos vencimientos en un solo panel.',
    items: ['Proyección de cobro', 'Rechazos con causa', 'Qué corregir en cada caso'],
    icon: Check,
  },
] as const;

const AUTO_MS = 5000;

export function LandingHowItWorks() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const step = STEPS[active];
  const Icon = step.icon;

  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => {
      setActive((i) => (i + 1) % STEPS.length);
    }, AUTO_MS);
    return () => window.clearInterval(id);
  }, [paused]);

  return (
    <section className={styles.section} aria-labelledby="landing-how-title">
      <p className={styles.sectionLabel}>Cómo funciona</p>
      <h2 id="landing-how-title" className={styles.landingSectionTitle}>
        De el parte al cobro, en cuatro pasos
      </h2>
      <p className="page-subtitle">
        Tocá cada paso o dejá que avance solo. Así se ve el flujo real en la plataforma.
      </p>

      <div
        className={styles.howLayout}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <div className={styles.stepList} role="tablist" aria-label="Pasos del flujo">
          {STEPS.map((s, i) => (
            <button
              key={s.n}
              type="button"
              role="tab"
              aria-selected={i === active}
              className={[styles.stepBtn, i === active ? styles.stepBtnActive : ''].join(' ')}
              onClick={() => setActive(i)}
            >
              <span className={styles.stepBtnNum}>{s.n}</span>
              <span className={styles.stepBtnCopy}>
                <span className={styles.stepBtnTitle}>{s.title}</span>
                <span className={styles.stepBtnBody}>{s.body}</span>
              </span>
            </button>
          ))}
        </div>

        <div className={styles.howPanel} role="tabpanel">
          <div className={styles.howPanelVisual} key={active}>
            <span className={styles.howPanelTag}>{step.tag}</span>
            <h3 className={styles.howPanelTitle}>{step.panelTitle}</h3>
            <p className={styles.howPanelDesc}>{step.panelDesc}</p>
            <ul className={styles.howPanelItems}>
              {step.items.map((item) => (
                <li key={item}>
                  <Icon size={14} aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className={styles.howProgress} aria-hidden>
            {STEPS.map((_, i) => (
              <div key={i} className={styles.howProgressDot}>
                <div
                  className={styles.howProgressDotFill}
                  style={{ width: i <= active ? '100%' : '0%' }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
