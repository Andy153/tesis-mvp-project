'use client';

import * as React from 'react';
import { parseISO } from 'date-fns';

import { loadHistoryWithFallback } from '@/lib/history';
import { getCobrosDelMesPorDia, PREPAGAS } from '@/lib/dashboard-data';
import { formatCurrency } from '@/lib/utils';

export function Calendario() {
  const { files } = loadHistoryWithFallback();
  const cobrosPorDia = getCobrosDelMesPorDia(files);

  const cantidadCobros = cobrosPorDia.reduce((acc, dia) => acc + dia.items.length, 0);
  const totalEstimado = cobrosPorDia.reduce(
    (acc, dia) => acc + dia.items.reduce((sum, item) => sum + item.monto, 0),
    0,
  );

  const diasConCobros = cobrosPorDia
    .map((dia) => ({ fecha: dia.fecha, date: parseISO(dia.fecha), items: dia.items }))
    .filter((d) => d.items.length > 0)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const getColorPrepaga = (prepagaId: string) => {
    return PREPAGAS.find((p) => p.id === prepagaId)?.colorHex ?? '#2A6B52';
  };

  const hoy = new Date();
  const proximosDias = diasConCobros.filter((d) => d.date.getTime() >= new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime());
  const topDias = (proximosDias.length > 0 ? proximosDias : diasConCobros).slice(0, 7);
  const [selectedKey, setSelectedKey] = React.useState<string>(() => topDias[0]?.fecha ?? '');

  const selected = topDias.find((d) => d.fecha === selectedKey) ?? topDias[0] ?? null;
  const totalDelDia = selected
    ? selected.items.reduce((acc, item) => acc + item.monto, 0)
    : 0;

  const leftRef = React.useRef<HTMLDivElement | null>(null);
  const [rightMinHeight, setRightMinHeight] = React.useState<number | undefined>(undefined);

  React.useLayoutEffect(() => {
    const el = leftRef.current;
    if (!el) return;

    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.height > 0) setRightMinHeight(Math.ceil(rect.height));
    };

    update();

    const ro = new ResizeObserver(() => update());
    ro.observe(el);

    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [topDias.length, selectedKey]);

  return (
    <section>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 800, fontSize: 15, lineHeight: 1.25, color: 'var(--text)' }}>Próximos cobros</div>
        <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.45 }}>
          Resumen de cobros estimados según plazos de cada prepaga
        </div>
      </div>

      <div className="stats-empty" style={{ marginBottom: 14 }}>
        Este mes tenés <b className="tabular">{cantidadCobros}</b> cobro(s) estimados por un total de{' '}
        <b className="tabular">{formatCurrency(totalEstimado)}</b>.
      </div>

      <div className="cal-shell">
        <div ref={leftRef} className="panel cal-panel" style={{ width: '100%' }}>
          <div className="cal-week">
            {topDias.length === 0 ? (
              <div className="empty" style={{ border: 'none' }}>
                <div className="empty-title">Todavía no hay cobros estimados</div>
                <div>Cuando cargues intervenciones, vas a ver aquí las fechas probables de cobro.</div>
              </div>
            ) : (
              topDias.map((d) => {
                const total = d.items.reduce((acc, item) => acc + item.monto, 0);
                const isSel = d.fecha === (selected?.fecha ?? '');
                return (
                  <div
                    key={d.fecha}
                    className={`cal-weekday-row ${isSel ? 'selected' : ''}`}
                    onClick={() => setSelectedKey(d.fecha)}
                    role="button"
                    tabIndex={0}
                    style={{
                      background: 'var(--bg-panel)',
                      borderColor: 'var(--border)',
                    }}
                  >
                    <div className="cal-weekday-left">
                      <div className="cal-weekday-name">{d.date.toLocaleDateString('es-AR', { weekday: 'short' })}</div>
                      <div className="cal-weekday-date">
                        {d.date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
                      </div>
                    </div>
                    <div className="cal-weekday-right">
                      <span className="cal-count tabular">{d.items.length}</span>
                      <span className="cal-dot" />
                    </div>
                    <div
                      style={{
                        marginLeft: 'auto',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 12,
                        color: 'var(--text-muted)',
                      }}
                      className="tabular"
                    >
                      {formatCurrency(total)}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="panel cal-list" style={{ width: '100%', minHeight: rightMinHeight }}>
          {selected ? (
            <div className="cal-items">
              <div className="cal-day-block">
                <div className="cal-day-label">
                  {selected.date.toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: 'short' })}
                  <span className="cal-day-meta">
                    <span className="tabular">{selected.items.length}</span> cobro(s) ·{' '}
                    <span className="tabular">{formatCurrency(totalDelDia)}</span>
                  </span>
                </div>

                <div className="cal-card" style={{ padding: 14 }}>
                  {selected.items
                    .slice()
                    .sort((a, b) => b.monto - a.monto)
                    .slice(0, 6)
                    .map((item) => (
                      <div
                        key={item.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 12,
                          padding: '10px 0',
                          borderTop: '1px dashed var(--border)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                          <span
                            aria-hidden
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: 999,
                              background: getColorPrepaga(item.prepagaId),
                              flexShrink: 0,
                            }}
                          />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', lineHeight: 1.25 }}>
                              {item.pacienteIniciales}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.35 }}>
                              {item.tipo}
                            </div>
                          </div>
                        </div>

                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-soft)' }}>
                            {PREPAGAS.find((p) => p.id === item.prepagaId)?.nombre ?? 'Prepaga'}
                          </div>
                          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--accent-ink)' }} className="tabular">
                            {formatCurrency(item.monto)}
                          </div>
                        </div>
                      </div>
                    ))}

                  {selected.items.length > 6 ? (
                    <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
                      <span style={{ fontSize: 12, color: 'var(--text-soft)' }}>
                        +{selected.items.length - 6} más en esta fecha
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : (
            <div className="empty" style={{ border: 'none' }}>
              <div className="empty-title">Elegí una fecha</div>
              <div>Seleccioná un día para ver el detalle de cobros estimados.</div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

