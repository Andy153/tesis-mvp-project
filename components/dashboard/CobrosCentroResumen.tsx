'use client';

import * as React from 'react';
import Image from 'next/image';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

import { CobrosEvolucionChart } from '@/components/dashboard/CobrosEvolucionChart';
import { buildCobrosCentroKpi } from '@/lib/cobros-centro-kpi';
import {
  normalizeEvolucionPoints,
  type CobrosEvolucionPoint,
} from '@/lib/cobros-centro-evolucion-shared';
import { PREPAGAS, type CobroItem } from '@/lib/dashboard-data';
import { formatCurrency } from '@/lib/utils';

function formatDDMMYYYY(d: Date | null | undefined): string {
  if (!d) return '—';
  return format(d, 'dd/MM/yyyy', { locale: es });
}

function prepagaMeta(obra: CobroItem['prepaga']) {
  if (obra === 'OSDE') return PREPAGAS.find((p) => p.id === 'osde')!;
  if (obra === 'Swiss Medical') return PREPAGAS.find((p) => p.id === 'swiss')!;
  return PREPAGAS.find((p) => p.id === 'unknown')!;
}

function prepagaLogo(obra: CobroItem['prepaga']): string | null {
  if (obra === 'Swiss Medical') return '/logos/swiss-medical.png';
  if (obra === 'OSDE') return '/logos/osde.png';
  return null;
}

function CobroResumenRow({
  it,
  variant,
}: {
  it: CobroItem;
  variant: 'realizado' | 'proximo';
}) {
  const meta = prepagaMeta(it.prepaga);
  const logo = prepagaLogo(it.prepaga);
  const fecha =
    variant === 'realizado'
      ? it.fechaCobroReal ?? it.fechaCobroEstimada
      : it.fechaCobroEstimada;

  return (
    <div className="cobros-resumen-row">
      <div className="cobros-resumen-row__main">
        <div className="cobros-resumen-row__logo" aria-hidden>
          {logo ? (
            <Image src={logo} alt="" width={24} height={24} style={{ objectFit: 'contain' }} />
          ) : (
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: meta.colorHex,
                display: 'block',
              }}
            />
          )}
        </div>
        <div className="cobros-resumen-row__text" style={{ minWidth: 0 }}>
          <div className="cobros-resumen-row__title">{it.paciente}</div>
          <div className="cobros-resumen-row__meta">{it.practica}</div>
        </div>
      </div>
      <div className="cobros-resumen-row__right">
        <div className="cobros-resumen-row__monto tabular">
          {it.monto == null ? 'A confirmar' : formatCurrency(it.monto)}
          {it.fuenteDatos === 'wizard' && it.monto != null ? (
            <span className="cobros-resumen-row__real">real</span>
          ) : null}
        </div>
        <div className="cobros-resumen-row__fecha">{formatDDMMYYYY(fecha)}</div>
        <span className={`cobros-resumen-row__chip cobros-resumen-row__chip--${variant}`}>
          {variant === 'realizado' ? 'Cobrado' : 'Próximo'}
        </span>
      </div>
    </div>
  );
}

export function CobrosCentroResumen({
  items,
  mes,
  highlightMes,
}: {
  items: CobroItem[];
  mes: Date;
  highlightMes: string;
}) {
  const kpi = buildCobrosCentroKpi(items);
  const mesLabel = format(mes, 'MMMM yyyy', { locale: es });
  const mesCapitalizado = mesLabel.charAt(0).toUpperCase() + mesLabel.slice(1);

  const [evolucion, setEvolucion] = React.useState<CobrosEvolucionPoint[]>([]);
  const [evolucionLoading, setEvolucionLoading] = React.useState(true);

  const loadEvolucion = React.useCallback(() => {
    setEvolucionLoading(true);
    return fetch('/api/cobros/centro/evolucion')
      .then((r) => r.json())
      .then((j: { points?: unknown }) => {
        setEvolucion(normalizeEvolucionPoints(j.points));
      })
      .catch(() => setEvolucion([]))
      .finally(() => setEvolucionLoading(false));
  }, []);

  React.useEffect(() => {
    void loadEvolucion();
  }, [loadEvolucion]);

  React.useEffect(() => {
    const onReload = () => void loadEvolucion();
    window.addEventListener('traza:swiss-cobros-reload', onReload);
    return () => window.removeEventListener('traza:swiss-cobros-reload', onReload);
  }, [loadEvolucion]);

  const kpiDigitSize = (n: unknown) => {
    const num = Number(n);
    const safe = Number.isFinite(num) ? Math.abs(num) : 0;
    const len = String(Math.trunc(safe)).length || 1;
    if (len <= 1) return '4rem';
    if (len <= 3) return '3rem';
    if (len <= 5) return '2.35rem';
    return '1.65rem';
  };

  return (
    <div style={{ display: 'grid', gap: 18, minWidth: 0, maxWidth: '100%' }}>
      <section className="panel" style={{ padding: 24, minWidth: 0, maxWidth: '100%' }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 15, lineHeight: 1.25, color: 'var(--text)' }}>
            Resumen del mes
          </div>
          <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.45 }}>
            {mesCapitalizado}
          </div>
        </div>

        <div className="cobros-kpi-chart-grid">
          <div className="panel cobros-kpi-single">
            <div className="cobros-kpi-single__label">Cobrados (cobros en trámite)</div>
            <div
              className="cobros-kpi-single__hero tabular"
              style={{ fontSize: kpiDigitSize(kpi.cobrados.count) }}
              aria-label={`${kpi.cobrados.count} cobrados, ${kpi.enProceso.count} en trámite`}
            >
              <span className="cobros-kpi-single__primary">
                {Number(kpi.cobrados.count).toLocaleString('es-AR')}
              </span>
              <span className="cobros-kpi-single__tramite" aria-hidden>
                <span className="cobros-kpi-single__paren">(</span>
                <span className="cobros-kpi-single__secondary">
                  {Number(kpi.enProceso.count).toLocaleString('es-AR')}
                </span>
                <span className="cobros-kpi-single__paren">)</span>
              </span>
            </div>
            <div className="cobros-kpi-single__foot">
              <span className="tabular">{formatCurrency(kpi.cobrados.monto)}</span> cobrado
              {kpi.enProceso.count > 0 ? (
                <>
                  {' '}
                  · <span className="tabular">{formatCurrency(kpi.enProceso.monto)}</span> en trámite
                </>
              ) : null}
            </div>
          </div>
          <CobrosEvolucionChart
            points={evolucion}
            loading={evolucionLoading}
            highlightMes={highlightMes}
          />
        </div>

        {kpi.porPrepaga.length > 0 ? (
          <>
            <Separator className="my-6" />
            <div
              style={{
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--text-soft)',
                fontWeight: 700,
                marginBottom: 10,
              }}
            >
              Por prepaga
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {kpi.porPrepaga.map((row) => (
                <div
                  key={row.prepaga}
                  className="panel"
                  style={{
                    padding: 14,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    {prepagaLogo(row.prepaga) ? (
                      <Image
                        src={prepagaLogo(row.prepaga)!}
                        alt=""
                        width={24}
                        height={24}
                        style={{ objectFit: 'contain', flexShrink: 0 }}
                      />
                    ) : null}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 13 }}>{row.prepaga}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {row.count} {row.count === 1 ? 'cobro' : 'cobros'}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-soft)' }}>Pipeline</div>
                    <div className="tabular" style={{ fontWeight: 900, color: 'var(--accent-ink)' }}>
                      {formatCurrency(row.montoPipeline)}
                    </div>
                    {row.montoCobrado > 0 ? (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        Cobrado: <span className="tabular">{formatCurrency(row.montoCobrado)}</span>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </section>

      <section className="panel" style={{ padding: 24, minWidth: 0, maxWidth: '100%' }}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)' }}>Estado de cobros</div>
          <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.45 }}>
            Realizados y próximos (facturado / en trámite, aún sin aprobación de la prepaga).
          </div>
        </div>

        <div style={{ display: 'grid', gap: 20 }}>
          <div>
            <div className="cobros-resumen-group-title">
              Realizados ({kpi.realizados.length})
            </div>
            {kpi.realizados.length === 0 ? (
              <div className="cobros-resumen-empty">Todavía no hay cobros marcados como cobrados.</div>
            ) : (
              <div className="cobros-resumen-list">
                {kpi.realizados.map((it) => (
                  <CobroResumenRow key={it.id} it={it} variant="realizado" />
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="cobros-resumen-group-title">Próximos ({kpi.proximos.length})</div>
            {kpi.proximos.length === 0 ? (
              <div className="cobros-resumen-empty">No hay cobros en trámite para este mes.</div>
            ) : (
              <div className="cobros-resumen-list">
                {kpi.proximos.map((it) => (
                  <CobroResumenRow key={it.id} it={it} variant="proximo" />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
