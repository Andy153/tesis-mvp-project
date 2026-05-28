'use client';

import { useState } from 'react';
import Image from 'next/image';
import {  Activity,
  AlertCircle,
  BarChart3,
  Brain,
  CheckCircle2,
  ChevronRight,
  Eye,
  FileText,
  FolderOpen,
  Lock,
  Route,
  ScanSearch,
  ShieldCheck,
  UploadCloud,
  Zap,
} from 'lucide-react';import styles from './landing.module.css';

const PROBLEMS = [
  {
    n: 1,
    title: 'Menos carga manual',
    lead: 'Eliminamos la transcripción manual del parte.',
    icon: UploadCloud,
    problem: 'Hoy el parte se transcribe a mano y la información puede quedar incompleta.',
    solutions: [
      {
        title: 'Lectura automática del parte',
        text: 'Extraemos paciente, práctica, códigos y datos relevantes.',
        icon: Brain,
      },
      {
        title: 'Validación instantánea',
        text: 'Verificamos códigos y requisitos según Swiss Medical u OSDE.',
        icon: ScanSearch,
      },
      {
        title: 'Documentación centralizada',
        text: 'Todo queda ordenado, sin mails ni archivos sueltos.',
        icon: FolderOpen,
      },
    ],
    result: 'Menos tipeo, menos errores, más tiempo para tus pacientes.',
  },
  {
    n: 2,
    title: 'Menos rechazos',
    lead: 'Detectamos errores antes de enviar a la prepaga.',
    icon: ShieldCheck,
    problem: 'Los errores suelen aparecer tarde, cuando la presentación ya fue enviada.',
    solutions: [
      {
        title: 'Validación previa',
        text: 'Revisamos códigos, prestaciones y documentación antes de presentar.',
        icon: ShieldCheck,
      },
      {
        title: 'Detección de inconsistencias',
        text: 'Marcamos datos faltantes o requisitos que pueden generar rechazo.',
        icon: AlertCircle,
      },
      {
        title: 'Correcciones sugeridas',
        text: 'Mostramos qué ajustar antes de avanzar.',
        icon: CheckCircle2,
      },
    ],
    result: 'Más presentaciones correctas desde el inicio.',
  },
  {
    n: 3,
    title: 'Más control del cobro',
    lead: 'Sabés qué entró, qué fue rechazado o qué falta corregir.',
    icon: Eye,
    problem: 'Muchas veces no está claro qué entró, qué fue rechazado o qué falta corregir.',
    solutions: [
      {
        title: 'Estado de cada presentación',
        text: 'Ves el avance de cada trámite en un solo lugar.',
        icon: Activity,
      },
      {
        title: 'Alertas de rechazo',
        text: 'Identificamos qué fue observado y por qué.',
        icon: AlertCircle,
      },
      {
        title: 'Acciones pendientes',
        text: 'Mostramos qué corregir para destrabar el cobro.',
        icon: CheckCircle2,
      },
    ],
    result: 'Más visibilidad y menos seguimiento manual.',
  },
  {
    n: 4,
    title: 'Trazabilidad completa',
    lead: 'Cada presentación, desde el parte hasta el cobro.',
    icon: Route,
    problem: 'La documentación queda dispersa entre mails, PDFs, planillas y mensajes.',
    solutions: [
      {
        title: 'Historial centralizado',
        text: 'Cada paso queda asociado a la presentación correspondiente.',
        icon: FolderOpen,
      },
      {
        title: 'Documentación ordenada',
        text: 'Parte, autorización, validaciones y estados quedan en un mismo flujo.',
        icon: FileText,
      },
      {
        title: 'Recorrido auditable',
        text: 'Podés reconstruir qué pasó desde el parte hasta el cobro.',
        icon: Route,
      },
    ],
    result: 'Todo ordenado, trazable y auditable.',
  },
] as const;

const BENEFITS = [
  { text: 'Más control, menos papeleo', icon: ShieldCheck },
  { text: 'Procesos más rápidos', icon: Zap },
  { text: 'Menos rechazos', icon: BarChart3 },
  { text: 'Datos seguros y confidenciales', icon: Lock },
] as const;

function SolveDiagram() {
  return (
    <div className={styles.solveDiagram} aria-hidden>
      <div className={styles.solveDiagramOrb} />
      <div className={styles.solveDiagramLineTop} />
      <div className={styles.solveDiagramLineBottom} />

      <div className={[styles.solveDiagramNode, styles.solveDiagramNodeDoc].join(' ')}>
        <FileText size={18} strokeWidth={1.75} />
        <span>Parte</span>
      </div>

      <div className={[styles.solveDiagramNode, styles.solveDiagramNodeCore].join(' ')}>
        <Activity size={22} strokeWidth={1.75} />
        <span>Trazá</span>
      </div>

      <div className={[styles.solveDiagramNode, styles.solveDiagramNodeSwiss, styles.solveDiagramPartnerCard].join(' ')}>
        <Image
          src="/logos/swiss-medical.png"
          alt="Swiss Medical"
          width={110}
          height={36}
          className={styles.solveDiagramLogo}
        />
      </div>

      <div className={[styles.solveDiagramNode, styles.solveDiagramNodeOsde, styles.solveDiagramPartnerCard].join(' ')}>
        <Image
          src="/logos/osde.png"
          alt="OSDE"
          width={90}
          height={32}
          className={styles.solveDiagramLogo}
        />
      </div>    </div>
  );
}

export function LandingFeatures() {
  const [activeProblem, setActiveProblem] = useState(0);
  const active = PROBLEMS[activeProblem];

  return (
    <section className={styles.section} aria-labelledby="landing-features-title">
      <div className={styles.solveSection}>
        <header className={styles.solveHeader}>
          <div className={styles.solveHeaderCopy}>
            <p className={styles.sectionLabel}>Qué resuelve</p>
            <h2 id="landing-features-title" className={styles.solveHeadline}>
              Del parte al cobro,
              <br className={styles.solveHeadlineBreak} aria-hidden />
              sin perder el control
            </h2>
          </div>
          <p className={styles.solveHeaderDesc}>
            Trazá resuelve los dos dolores que más impactan en el consultorio: la carga
            administrativa y la falta de visibilidad sobre el cobro.
          </p>
        </header>

        <div className={styles.solveBody}>
          <nav className={styles.solveNav} aria-label="Problemas que resuelve Trazá">
            {PROBLEMS.map((item, index) => {
              const Icon = item.icon;
              const isActive = index === activeProblem;

              return (
                <button
                  key={item.n}
                  type="button"
                  className={[styles.solveNavItem, isActive ? styles.solveNavItemActive : ''].join(
                    ' ',
                  )}
                  onClick={() => setActiveProblem(index)}
                  aria-pressed={isActive}
                >
                  <span className={styles.solveNavNum}>{item.n}</span>
                  <span className={styles.solveNavIcon}>
                    <Icon size={18} strokeWidth={1.75} aria-hidden />
                  </span>
                  <span className={styles.solveNavCopy}>
                    <span className={styles.solveNavTitle}>{item.title}</span>
                    <span className={styles.solveNavLead}>{item.lead}</span>
                  </span>
                  <ChevronRight size={18} className={styles.solveNavChevron} aria-hidden />
                </button>
              );
            })}
          </nav>

          <article className={styles.solvePanel} aria-live="polite">
            <div className={styles.solvePanelInner} key={activeProblem}>
              <div className={styles.solvePanelContent}>
                <div className={styles.solvePanelCopy}>
                  <span className={styles.solveProblemBadge}>
                    <AlertCircle size={14} aria-hidden />
                    Problema que resolvemos
                  </span>
                  <h3 className={styles.solveProblemTitle}>{active.problem}</h3>
                  <div className={styles.solvePanelDivider} aria-hidden />

                  <p className={styles.solveSolutionLabel}>
                    <CheckCircle2 size={16} aria-hidden />
                    Cómo lo resuelve Trazá
                  </p>

                  <ul className={styles.solveSolutionList}>
                    {active.solutions.map((solution) => {
                      const SolutionIcon = solution.icon;
                      return (
                        <li key={solution.title}>
                          <span className={styles.solveSolutionIcon}>
                            <SolutionIcon size={17} strokeWidth={1.75} aria-hidden />
                          </span>
                          <span className={styles.solveSolutionCopy}>
                            <strong>{solution.title}</strong>
                            <span>{solution.text}</span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>

                  <div className={styles.solveOutcome}>
                    <span className={styles.solveOutcomeBadge}>
                      <CheckCircle2 size={14} aria-hidden />
                      Resultado
                    </span>
                    <p className={styles.solveOutcomeText}>{active.result}</p>
                  </div>
                </div>

                <SolveDiagram />
              </div>
            </div>
          </article>
        </div>

        <div className={styles.solveBenefits}>
          {BENEFITS.map((item, index) => {
            const BenefitIcon = item.icon;
            return (
              <div
                key={item.text}
                className={[
                  styles.solveBenefitItem,
                  index > 0 ? styles.solveBenefitItemDivider : '',
                ].join(' ')}
              >
                <span className={styles.solveBenefitIcon}>
                  <BenefitIcon size={18} strokeWidth={1.75} aria-hidden />
                </span>
                <span>{item.text}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
