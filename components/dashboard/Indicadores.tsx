'use client';

import { useMemo } from 'react';
import { AlertCircle, AlertTriangle, CircleCheck, CreditCard, FileText } from 'lucide-react';

import { loadHistory } from '@/lib/history';
import { getEstadoEfectivo } from '@/lib/history';
import { useMounted } from '@/lib/use-mounted';
import { Progress } from '@/components/ui/progress';

export function Indicadores({
  onNavigate,
}: {
  onNavigate?: (view: string) => void;
}) {
  const mounted = useMounted();
  const { files } = loadHistory();

  const ready = useMemo(() => (files || []).filter((f) => f.status !== 'analyzing'), [files]);
  const analyzed = useMemo(() => ready.filter((f) => Boolean(f.analysis)), [ready]);

  const conErrores = useMemo(() => analyzed.filter((f) => f.analysis?.overall === 'error').length, [analyzed]);
  const conWarn = useMemo(() => analyzed.filter((f) => f.analysis?.overall === 'warn').length, [analyzed]);

  const cobroCounts = useMemo(() => {
    const base = { borrador: 0, listo_para_presentar: 0, presentado: 0, cobrado: 0, rechazado: 0, con_errores: 0 } as const;
    const acc: Record<keyof typeof base, number> = { ...base };
    for (const f of ready) {
      const e = getEstadoEfectivo(f as any).estado as keyof typeof base;
      if (acc[e] === undefined) continue;
      acc[e] += 1;
    }
    return acc;
  }, [ready]);

  const pctErrores = analyzed.length > 0 ? Math.round((conErrores / analyzed.length) * 100) : 0;
  const pctWarn = analyzed.length > 0 ? Math.round((conWarn / analyzed.length) * 100) : 0;

  const empty = ready.length === 0;

  return (
    <section className="panel" style={{ padding: 24, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, lineHeight: 1.25, color: 'var(--text)' }}>Indicadores</div>
          <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.45 }}>
            {mounted ? (
              empty ? (
                'Todavía no cargaste documentos.'
              ) : (
                'Un vistazo rápido a tu estado actual.'
              )
            ) : (
              'Cargando información…'
            )}
          </div>
        </div>

        <div className="ind-actions">
          <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--accent)' }} onClick={() => onNavigate?.('documents')}>
            <FileText size={16} /> Documentos
          </button>
          <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--accent)' }} onClick={() => onNavigate?.('errors')}>
            <AlertCircle size={16} /> Revisar
          </button>
          <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--accent)' }} onClick={() => onNavigate?.('cobros')}>
            <CreditCard size={16} /> Cobros
          </button>
        </div>
      </div>

      {!mounted ? (
        <div className="empty" style={{ border: 'none', paddingBlock: 34 }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.45 }}>Cargando información…</div>
        </div>
      ) : empty ? (
        <div className="empty" style={{ border: 'none', paddingBlock: 34 }}>
          <div className="empty-icon">
            <CircleCheck size={44} />
          </div>
          <div className="empty-title">Empezá con tu primera carga</div>
          <div>Cuando cargues intervenciones, vas a ver acá errores, advertencias y estado de cobro.</div>
        </div>
      ) : (
        <>
          <div
            style={{
              marginTop: 14,
              marginBottom: 14,
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 12,
              alignItems: 'stretch',
            }}
          >
            <div className="stat">
              <div className="stat-label">
                <span className="ind-full">Documentos cargados</span>
                <span className="ind-short">Cargados</span>
              </div>
              <div className="stat-value">{ready.length}</div>
            </div>
            <div className="stat">
              <div className="stat-label">
                <span className="ind-full">Con observaciones graves</span>
                <span className="ind-short">Obs. Graves</span>
              </div>
              <div className="stat-value error">{conErrores}</div>
            </div>
            <div className="stat">
              <div className="stat-label">
                <span className="ind-full">Con advertencias</span>
                <span className="ind-short">Advertencia</span>
              </div>
              <div className="stat-value warn">{conWarn}</div>
            </div>
            <div className="stat">
              <div className="stat-label">
                <span className="ind-full">Listos / presentados</span>
                <span className="ind-short">Listos</span>
              </div>
              <div className="stat-value ok">{cobroCounts.listo_para_presentar + cobroCounts.presentado}</div>
            </div>
          </div>

          <div className="panel" style={{ padding: 16, background: 'var(--bg-sunken)' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: 12,
                alignItems: 'center',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  <span className="ind-full">Riesgo de rechazo (errores)</span>
                  <span className="ind-short">Errores</span>
                  <span className="tabular" style={{ marginLeft: 'auto', color: 'var(--text-soft)', fontWeight: 700 }}>
                    {pctErrores}%
                  </span>
                </div>
                <Progress value={pctErrores} className="mt-2" />
              </div>

              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <span className="ind-full">Advertencias</span>
                  <span className="ind-short">Warn</span>
                  <span className="tabular" style={{ marginLeft: 'auto', color: 'var(--text-soft)', fontWeight: 700 }}>
                    {pctWarn}%
                  </span>
                </div>
                <Progress value={pctWarn} className="mt-2" />
              </div>
            </div>

            <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <span className="badge badge-neutral">
                <span className="badge-dot" />
                <span className="ind-full">Borrador</span>
                <span className="ind-short">Borr.</span>
                <span className="tabular" style={{ marginLeft: 6 }}>{cobroCounts.borrador}</span>
              </span>
              <span className="badge badge-warn">
                <span className="badge-dot" />
                <span className="ind-full">Listo</span>
                <span className="ind-short">Listo</span>
                <span className="tabular" style={{ marginLeft: 6 }}>{cobroCounts.listo_para_presentar}</span>
              </span>
              <span className="badge badge-neutral">
                <span className="badge-dot" />
                <span className="ind-full">Presentado</span>
                <span className="ind-short">Pres.</span>
                <span className="tabular" style={{ marginLeft: 6 }}>{cobroCounts.presentado}</span>
              </span>
              <span className="badge badge-ok">
                <span className="badge-dot" />
                <span className="ind-full">Cobrado</span>
                <span className="ind-short">Cobr.</span>
                <span className="tabular" style={{ marginLeft: 6 }}>{cobroCounts.cobrado}</span>
              </span>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

