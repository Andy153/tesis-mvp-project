// components/CobrosBadge.tsx
//
// Hook y componentes para mostrar el badge de cobros pendientes en el sidebar
// y el banner en el dashboard. Solo aparece cuando hay submissions Swiss activos.

'use client';

import { useEffect, useState } from 'react';
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
  const [submissions, setSubmissions] = useState<ActiveSubmission[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
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
  }, []);

  return { submissions, loading, reload: load };
}

// Badge para el sidebar — un punto rojo con contador
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

// Banner para el dashboard/documentos — aparece cuando hay pasos pendientes
export function CobrosBanner() {
  const { submissions, reload } = useCobrosPendientes();
  const [expanded, setExpanded] = useState<string | null>(null);

  if (submissions.length === 0) return null;

  return (
    <div style={{ marginBottom: 16 }}>
      {submissions.map((sub) => (
        <div
          key={sub.id}
          style={{
            border: '1.5px solid #7bc398',
            borderRadius: 10,
            overflow: 'hidden',
            marginBottom: 8,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              background: '#e8f5ee',
              cursor: 'pointer',
              userSelect: 'none',
            }}
            onClick={() => setExpanded(expanded === sub.id ? null : sub.id)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <img
                src="/swiss-medical-logo.png"
                alt="Swiss Medical"
                style={{ width: 28, height: 28, objectFit: 'contain' }}
              />
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#1f5d3a' }}>
                  Cobro Swiss Medical — {periodoLabel(sub.periodo)}
                </div>
                <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>
                  Paso {sub.wizard_paso ?? 1}/6 · {pasoLabel(sub.wizard_estado)}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  padding: '3px 10px',
                  borderRadius: 20,
                  background: '#1f5d3a',
                  color: 'white',
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                Acción requerida
              </span>
              <span style={{ color: '#1f5d3a', fontSize: 16 }}>{expanded === sub.id ? '▲' : '▼'}</span>
            </div>
          </div>

          {expanded === sub.id && (
            <div style={{ padding: '16px 20px', background: 'white' }}>
              <CobrosWizard
                submissionId={sub.id}
                onUpdate={reload}
                onCollapse={() => setExpanded(null)}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
