// components/CobrosBadge.tsx
//
// Hook y componentes para mostrar el badge de cobros pendientes en el sidebar
// y el banner en el dashboard. Solo aparece cuando hay submissions Swiss activos.

'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { isDemoUser } from '@/lib/demo-user';
import { CobrosWizard } from './CobrosWizard';

type ActiveSubmission = {
  id: string;
  periodo: string;
  obra_social: string;
  wizard_estado: string | null;
  wizard_paso: number | null;
  enviado_en: string;
  cantidad_partes: number | null;
};

function periodoLabel(p: string): string {
  const [y, m] = p.split('-').map((n) => parseInt(n, 10));
  const meses = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ];
  if (!y || !m) return p;
  return `${meses[m - 1]} ${y}`;
}

function pasoLabel(estado: string | null): string {
  switch (estado) {
    case 'esperando_comprobante':
      return 'Esperando 48hs';
    case 'comprobante_disponible':
      return 'Revisar portal SMG';
    case 'comprobante_subido':
      return 'Crear factura en ARCA';
    case 'factura_instrucciones':
      return 'Adjuntar factura en SMG';
    case 'factura_adjuntada':
      return 'Verificar aprobación';
    default:
      return 'En proceso';
  }
}

export function useCobrosPendientes() {
  const { user } = useUser();
  const demoUser = isDemoUser(user?.id);
  const [submissions, setSubmissions] = useState<ActiveSubmission[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (demoUser) {
      try {
        const id = window.sessionStorage.getItem('traza.demo.session.swiss_sent');
        if (!id) {
          setSubmissions([]);
          setLoading(false);
          return;
        }
        const r = await fetch(`/api/submissions/${encodeURIComponent(id)}/wizard`);
        const j = await r.json();
        if (!r.ok || !j.submission) {
          setSubmissions([]);
          setLoading(false);
          return;
        }
        const s = j.submission;
        setSubmissions([
          {
            id: s.id,
            periodo: s.periodo,
            obra_social: s.obra_social,
            wizard_estado: s.wizard_estado,
            wizard_paso: s.wizard_paso,
            enviado_en: s.enviado_en,
            cantidad_partes: s.cantidad_partes,
          },
        ]);
        setLoading(false);
        return;
      } catch {
        setSubmissions([]);
        setLoading(false);
        return;
      }
    }
    try {
      const r = await fetch('/api/submissions/active');
      const j = await r.json();
      setSubmissions(j.submissions ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [demoUser]);

  return { submissions, loading, reload: load };
}

export function CobrosSidebarBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 18,
        height: 18,
        borderRadius: '50%',
        background: '#e53e3e',
        color: 'white',
        fontSize: 10,
        fontWeight: 700,
        marginLeft: 6,
      }}
    >
      {count}
    </span>
  );
}

export function CobrosBanner() {
  const { submissions, reload } = useCobrosPendientes();
  const [expanded, setExpanded] = useState<string | null>(null);

  if (submissions.length === 0) return null;

  return (
    <div style={{ marginBottom: 16 }}>
      {submissions.map((sub) => (
        <div key={sub.id} className="cobros-banner">
          <div
            className="cobros-banner__head"
            onClick={() => setExpanded(expanded === sub.id ? null : sub.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setExpanded(expanded === sub.id ? null : sub.id);
              }
            }}
            role="button"
            tabIndex={0}
          >
            <div className="cobros-banner__head-inner">
              <img
                src="/swiss-medical-logo.png"
                alt="Swiss Medical"
                className="cobros-banner__logo"
              />
              <div>
                <div className="cobros-banner__title">
                  Cobro Swiss Medical — {periodoLabel(sub.periodo)}
                </div>
                <div className="cobros-banner__meta">
                  Paso {sub.wizard_paso ?? 1}/6 · {pasoLabel(sub.wizard_estado)}
                </div>
              </div>
            </div>
            <div className="cobros-banner__actions">
              <span className="cobros-banner__badge">Acción requerida</span>
              <span className="cobros-banner__chevron" aria-hidden>
                {expanded === sub.id ? '▲' : '▼'}
              </span>
            </div>
          </div>

          {expanded === sub.id ? (
            <div className="cobros-banner__body">
              <CobrosWizard
                submissionId={sub.id}
                onUpdate={reload}
                onCollapse={() => setExpanded(null)}
              />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
