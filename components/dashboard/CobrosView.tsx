'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { loadHistoryWithFallback } from '@/lib/history';
import { getCobrosDelMes, PREPAGAS, type CobroItem } from '@/lib/dashboard-data';
import { formatCurrency } from '@/lib/utils';
import { Proyeccion } from '@/components/dashboard/Proyeccion';
import { Calendario } from '@/components/dashboard/Calendario';
import type { FileEntry } from '@/lib/types';
import { markAsPaid } from '@/lib/tracking';

type PrepagaFiltro = 'OSDE' | 'Swiss Medical' | 'Desconocida';
type EstadoFiltro = 'Pendiente' | 'Cobrado' | 'A confirmar' | 'Rechazado';

function parseMoneyLoose(raw: string): number {
  const s0 = String(raw || '').trim();
  if (!s0) return NaN;
  const s = s0.replace(/\s/g, '').replace(/[^\d.,-]/g, '');
  const hasDot = s.includes('.');
  const hasComma = s.includes(',');
  let normalized = s;

  if (hasDot && hasComma) {
    // El separador decimal suele ser el último que aparece.
    const lastDot = s.lastIndexOf('.');
    const lastComma = s.lastIndexOf(',');
    const decimalSep = lastComma > lastDot ? ',' : '.';
    const thousandSep = decimalSep === ',' ? '.' : ',';
    normalized = s.split(thousandSep).join('').replace(decimalSep, '.');
  } else if (hasComma) {
    // "524.965,78" ya fue limpiado de otros chars; acá asumimos coma decimal.
    normalized = s.split('.').join('').replace(',', '.');
  } else if (hasDot) {
    // Si solo hay punto, lo tratamos como decimal (ej "524965.78").
    normalized = s.replace(',', '');
  }

  return Number(normalized);
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthFromKey(key: string): Date {
  const m = String(key || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return new Date();
  return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, 1, 12, 0, 0, 0);
}

function formatDDMMYYYY(d: Date | null | undefined): string {
  if (!d) return '—';
  return format(d, 'dd/MM/yyyy', { locale: es });
}

function estadoLabel(it: CobroItem): EstadoFiltro {
  if (it.monto === null) return 'A confirmar';
  if (it.estado === 'cobrado') return 'Cobrado';
  if (it.estado === 'rechazado') return 'Rechazado';
  return 'Pendiente';
}

function sortValue(it: CobroItem, key: SortKey): number | string {
  const f = (d: Date | null | undefined) => (d ? d.getTime() : -1);
  if (key === 'paciente') return it.paciente;
  if (key === 'practica') return it.practica;
  if (key === 'prepaga') return it.prepaga;
  if (key === 'monto') return it.monto ?? -1;
  if (key === 'fechaPractica') return f(it.fechaPractica);
  if (key === 'fechaCobro') return f(it.fechaCobroReal ?? it.fechaCobroEstimada);
  if (key === 'estado') return estadoLabel(it);
  return f(it.fechaCobroReal ?? it.fechaCobroEstimada);
}

type SortKey =
  | 'paciente'
  | 'practica'
  | 'prepaga'
  | 'monto'
  | 'fechaPractica'
  | 'fechaCobro'
  | 'estado';

export function CobrosView({
  files: filesProp,
  onUpdateTracking,
}: {
  files?: FileEntry[];
  onUpdateTracking?: (id: string, updater: (item: FileEntry) => FileEntry) => void;
}) {
  const { files: fallbackFiles } = loadHistoryWithFallback();
  const files = (filesProp ?? fallbackFiles) as any;

  const [mesKey, setMesKey] = React.useState<string>(() => monthKey(new Date()));
  const mes = React.useMemo(() => monthFromKey(mesKey), [mesKey]);

  const [prepagaSel, setPrepagaSel] = React.useState<Set<PrepagaFiltro>>(
    () => new Set<PrepagaFiltro>(['OSDE', 'Swiss Medical', 'Desconocida']),
  );
  const [estadoSel, setEstadoSel] = React.useState<Set<EstadoFiltro>>(
    () => new Set<EstadoFiltro>(['Pendiente', 'Cobrado', 'A confirmar', 'Rechazado']),
  );
  const [q, setQ] = React.useState<string>('');

  const [sort, setSort] = React.useState<{ key: SortKey; dir: 'asc' | 'desc' }>(() => ({
    key: 'fechaCobro',
    dir: 'asc',
  }));

  const [openPaid, setOpenPaid] = React.useState<null | { id: string; fecha: string; monto: string }>(null);
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set());
  const [openDetailId, setOpenDetailId] = React.useState<string | null>(null);
  const [openSection, setOpenSection] = React.useState<{ cobrados: boolean; rechazados: boolean }>(() => ({
    cobrados: false,
    rechazados: false,
  }));

  const all = React.useMemo(() => getCobrosDelMes(files as any, mes), [files, mes]);

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((it) => {
      const obra: PrepagaFiltro =
        it.prepaga === 'OSDE' ? 'OSDE' : it.prepaga === 'Swiss Medical' ? 'Swiss Medical' : 'Desconocida';
      if (!prepagaSel.has(obra)) return false;

      const estado = estadoLabel(it);
      if (!estadoSel.has(estado)) return false;

      if (needle) {
        const hay = `${it.paciente} ${it.practica}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [all, q, prepagaSel, estadoSel]);

  const sorted = React.useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1;
    const key = sort.key;
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = sortValue(a, key);
      const bv = sortValue(b, key);
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv), 'es', { sensitivity: 'base' }) * dir;
    });
    return copy;
  }, [filtered, sort]);

  const pendientes = React.useMemo(
    () => sorted.filter((it) => it.estado === 'presentado' || it.estado === 'listo_para_presentar'),
    [sorted],
  );
  const cobrados = React.useMemo(() => sorted.filter((it) => it.estado === 'cobrado'), [sorted]);
  const rechazados = React.useMemo(() => sorted.filter((it) => it.estado === 'rechazado'), [sorted]);

  const pendientesSorted = React.useMemo(() => {
    const copy = [...pendientes];
    copy.sort((a, b) => (a.fechaCobroEstimada?.getTime() ?? 0) - (b.fechaCobroEstimada?.getTime() ?? 0));
    return copy;
  }, [pendientes]);
  const cobradosSorted = React.useMemo(() => {
    const copy = [...cobrados];
    copy.sort((a, b) => (b.fechaCobroReal?.getTime() ?? 0) - (a.fechaCobroReal?.getTime() ?? 0));
    return copy;
  }, [cobrados]);
  const rechazadosSorted = React.useMemo(() => {
    const copy = [...rechazados];
    copy.sort((a, b) => (b.fechaCobroEstimada?.getTime() ?? 0) - (a.fechaCobroEstimada?.getTime() ?? 0));
    return copy;
  }, [rechazados]);

  const totalPendientes = React.useMemo(
    () => pendientesSorted.reduce((acc, it) => acc + (it.monto ?? 0), 0),
    [pendientesSorted],
  );
  const aConfirmarPendientes = React.useMemo(
    () => pendientesSorted.filter((it) => it.monto === null).length,
    [pendientesSorted],
  );
  const totalCobrados = React.useMemo(
    () => cobradosSorted.reduce((acc, it) => acc + (it.monto ?? 0), 0),
    [cobradosSorted],
  );

  const mesesOpciones = React.useMemo(() => {
    const base = new Date();
    base.setDate(1);
    base.setHours(12, 0, 0, 0);
    const out: Array<{ key: string; label: string }> = [];
    for (let delta = -12; delta <= 3; delta++) {
      const d = new Date(base.getFullYear(), base.getMonth() + delta, 1, 12, 0, 0, 0);
      out.push({ key: monthKey(d), label: format(d, 'MMMM yyyy', { locale: es }) });
    }
    return out;
  }, []);

  const prepagaBadge = (obra: CobroItem['prepaga']) => {
    const info =
      obra === 'OSDE'
        ? PREPAGAS.find((p) => p.id === 'osde')
        : obra === 'Swiss Medical'
          ? PREPAGAS.find((p) => p.id === 'swiss')
          : PREPAGAS.find((p) => p.id === 'unknown');
    const nombre = obra === 'Desconocida' ? 'Desconocida' : obra;
    const color = info?.colorHex ?? '#64748B';
    return (
      <span
        className="badge"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          paddingInline: 10,
          paddingBlock: 4,
          borderRadius: 999,
          border: '1px solid var(--border)',
          background: 'var(--bg-sunken)',
          color: 'var(--text)',
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: color, opacity: 0.9 }} />
        {nombre}
      </span>
    );
  };

  const estadoBadge = (it: CobroItem) => {
    const st = estadoLabel(it);
    const tone =
      st === 'Cobrado'
        ? { bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.35)', text: 'rgb(22,101,52)' }
        : st === 'Rechazado'
          ? { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.35)', text: 'rgb(153,27,27)' }
          : st === 'A confirmar'
            ? { bg: 'rgba(148,163,184,0.12)', border: 'rgba(148,163,184,0.35)', text: 'rgb(71,85,105)' }
            : { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.35)', text: 'rgb(146,64,14)' };
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          paddingInline: 10,
          paddingBlock: 4,
          borderRadius: 999,
          border: `1px solid ${tone.border}`,
          background: tone.bg,
          color: tone.text,
          fontSize: 12,
          fontWeight: 800,
          whiteSpace: 'nowrap',
        }}
        title={it.motivo || undefined}
      >
        {st}
      </span>
    );
  };

  const toggleSet = <T,>(set: Set<T>, v: T) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    return next;
  };

  const chipStyle = (active: boolean): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    paddingInline: 10,
    paddingBlock: 6,
    borderRadius: 999,
    border: `1px solid ${active ? 'rgba(42,107,82,0.35)' : 'var(--border)'}`,
    background: active ? 'rgba(42,107,82,0.10)' : 'var(--bg-panel)',
    color: active ? 'var(--text)' : 'var(--text-soft)',
    fontSize: 12,
    fontWeight: 800,
    cursor: 'pointer',
    userSelect: 'none',
  });

  const sectionLabelStyle: React.CSSProperties = {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--text-soft)',
    fontWeight: 800,
  };

  const sortHeader = (label: string, key: SortKey) => {
    const active = sort.key === key;
    const arrow = !active ? '' : sort.dir === 'asc' ? ' ↑' : ' ↓';
    return (
      <button
        type="button"
        onClick={() =>
          setSort((s) =>
            s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' },
          )
        }
        style={{
          all: 'unset',
          cursor: 'pointer',
          fontWeight: 800,
          fontSize: 12,
          color: active ? 'var(--text)' : 'var(--text-soft)',
        }}
        title="Ordenar"
      >
        {label}
        {arrow}
      </button>
    );
  };

  const mesLabel = React.useMemo(() => {
    const s = format(mes, 'MMMM yyyy', { locale: es });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }, [mes]);

  const emptyMessage =
    all.length === 0
      ? `No hay cobros registrados en ${mesLabel}.`
      : 'No hay cobros que coincidan con los filtros seleccionados.';

  const sectionHeaderStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '12px 16px',
    borderBottom: '1px solid var(--border)',
    cursor: 'pointer',
    userSelect: 'none',
  };

  const sectionTitleStyle: React.CSSProperties = { fontWeight: 900, fontSize: 13, color: 'var(--text)' };
  const sectionMetaStyle: React.CSSProperties = { fontSize: 12, color: 'var(--text-muted)' };

  const renderTable = (rows: CobroItem[], opts: { mode: 'pendientes' | 'cobrados' | 'rechazados' }) => {
    if (rows.length === 0) {
      return (
        <div className="empty" style={{ border: 'none', padding: 18 }}>
          <div className="empty-title">{emptyMessage}</div>
        </div>
      );
    }
    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
          <thead>
            <tr style={{ background: 'var(--bg-sunken)' }}>
              <th style={{ textAlign: 'left', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                {sortHeader('Paciente', 'paciente')}
              </th>
              <th style={{ textAlign: 'left', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                {sortHeader('Práctica', 'practica')}
              </th>
              <th style={{ textAlign: 'left', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                {sortHeader('Prepaga', 'prepaga')}
              </th>
              <th style={{ textAlign: 'right', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                {sortHeader('Monto total', 'monto')}
              </th>
              <th style={{ textAlign: 'right', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                {sortHeader('Fecha práctica', 'fechaPractica')}
              </th>
              <th style={{ textAlign: 'right', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                {opts.mode === 'cobrados' ? 'Fecha cobro real' : 'Fecha cobro estimada'}
              </th>
              <th style={{ textAlign: 'left', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                {sortHeader('Estado', 'estado')}
              </th>
              {opts.mode === 'pendientes' ? (
                <th style={{ textAlign: 'right', padding: '12px 16px', borderBottom: '1px solid var(--border)' }} />
              ) : null}
              {opts.mode === 'rechazados' ? (
                <th style={{ textAlign: 'left', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                  Motivo
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((it) => {
              const isConfirmar = it.monto === null;
              const fechaCobro = opts.mode === 'cobrados' ? it.fechaCobroReal : it.fechaCobroEstimada;
              const canBreakdown = Boolean(it.desglose?.desglose && it.desglose.desglose.total !== null);
              const isExpanded = expanded.has(it.id);
              const breakdown = it.desglose?.desglose ?? null;
              const items: Array<{ label: string; value: number; extra?: string }> = [];
              if (breakdown) {
                const add = (label: string, v: number | null | undefined, extra?: string) => {
                  if (v == null) return;
                  if (typeof v === 'number' && v === 0) return;
                  items.push({ label, value: v, extra });
                };
                add('Honorarios especialista', breakdown.honorarios_especialista);
                if (breakdown.cnt_ayudantes && breakdown.cnt_ayudantes > 0) {
                  add(
                    'Honorarios ayudantes',
                    breakdown.honorarios_ayudantes,
                    typeof breakdown.honorarios_ayudantes === 'number'
                      ? `(${formatCurrency(breakdown.honorarios_ayudantes)} × ${breakdown.cnt_ayudantes} ayudante${breakdown.cnt_ayudantes > 1 ? 's' : ''})`
                      : `(${breakdown.cnt_ayudantes} ayudante${breakdown.cnt_ayudantes > 1 ? 's' : ''})`,
                  );
                } else {
                  add('Honorarios ayudantes', breakdown.honorarios_ayudantes);
                }
                add('Honorarios anestesista', breakdown.honorarios_anestesista);
                add('Honorarios institucionales', breakdown.honorarios_inst);
                add('Gastos', breakdown.gastos);
              }
              return (
                <React.Fragment key={it.id}>
                  <tr
                    style={{ background: isConfirmar ? 'rgba(148,163,184,0.08)' : 'transparent' }}
                    aria-expanded={canBreakdown ? isExpanded : undefined}
                  >
                    <td style={{ padding: '12px 16px', borderBottom: '1px solid rgba(148,163,184,0.25)', fontWeight: 800 }}>
                      {it.paciente}
                    </td>
                    <td style={{ padding: '12px 16px', borderBottom: '1px solid rgba(148,163,184,0.25)' }}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            style={{
                              display: 'inline-block',
                              maxWidth: 360,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              verticalAlign: 'bottom',
                            }}
                          >
                            {it.practica}
                          </span>
                        </TooltipTrigger>
                      <TooltipContent sideOffset={6}>
                        {it.codigo ? (
                          <span>
                            Código:{' '}
                            <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 800 }}>
                              {it.codigo}
                            </code>
                          </span>
                        ) : (
                          'Sin código'
                        )}
                      </TooltipContent>
                      </Tooltip>
                    </td>
                    <td style={{ padding: '12px 16px', borderBottom: '1px solid rgba(148,163,184,0.25)' }}>
                      {prepagaBadge(it.prepaga)}
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        borderBottom: '1px solid rgba(148,163,184,0.25)',
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
                        color: isConfirmar ? 'var(--text-soft)' : 'var(--accent-ink)',
                        fontWeight: 900,
                        whiteSpace: 'nowrap',
                        cursor: canBreakdown && opts.mode !== 'rechazados' ? 'pointer' : undefined,
                      }}
                      className="tabular"
                      onClick={() => {
                        if (!canBreakdown || opts.mode === 'rechazados') return;
                        setExpanded((s) => {
                          const next = new Set(s);
                          if (next.has(it.id)) next.delete(it.id);
                          else next.add(it.id);
                          return next;
                        });
                      }}
                      title={canBreakdown ? (isExpanded ? 'Ocultar desglose' : 'Ver desglose') : undefined}
                    >
                      {it.monto === null ? 'A confirmar' : formatCurrency(it.monto)}
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        borderBottom: '1px solid rgba(148,163,184,0.25)',
                        textAlign: 'right',
                        color: 'var(--text-muted)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {formatDDMMYYYY(it.fechaPractica)}
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        borderBottom: '1px solid rgba(148,163,184,0.25)',
                        textAlign: 'right',
                        color: 'var(--text-muted)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {opts.mode === 'cobrados' && it.fechaCobroReal ? (
                        <span title="Cobro real">✓ {formatDDMMYYYY(fechaCobro)}</span>
                      ) : (
                        formatDDMMYYYY(fechaCobro)
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', borderBottom: '1px solid rgba(148,163,184,0.25)' }}>
                      {estadoBadge(it)}
                    </td>
                    {opts.mode === 'pendientes' ? (
                      <td
                        style={{
                          padding: '12px 16px',
                          borderBottom: '1px solid rgba(148,163,184,0.25)',
                          textAlign: 'right',
                          whiteSpace: 'nowrap',
                          display: 'flex',
                          justifyContent: 'flex-end',
                          gap: 8,
                          alignItems: 'center',
                        }}
                      >
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          onClick={() => setOpenDetailId(it.id)}
                          title="Ver detalle"
                        >
                          Ver detalle
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          onClick={() => {
                            const today = new Date();
                            const yyyy = today.getFullYear();
                            const mm = String(today.getMonth() + 1).padStart(2, '0');
                            const dd = String(today.getDate()).padStart(2, '0');
                            setOpenPaid({
                              id: it.id,
                              fecha: `${yyyy}-${mm}-${dd}`,
                              monto: String(it.monto ?? ''),
                            });
                          }}
                        >
                          Marcar cobrado
                        </button>
                      </td>
                    ) : null}
                    {opts.mode === 'cobrados' ? (
                      <td
                        style={{
                          padding: '12px 16px',
                          borderBottom: '1px solid rgba(148,163,184,0.25)',
                          textAlign: 'right',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpenDetailId(it.id)}>
                          Ver detalle
                        </button>
                      </td>
                    ) : null}
                    {opts.mode === 'rechazados' ? (
                      <td
                        style={{
                          padding: '12px 16px',
                          borderBottom: '1px solid rgba(148,163,184,0.25)',
                          color: 'var(--error)',
                          fontWeight: 700,
                        }}
                      >
                        {it.motivoRechazo ? (
                          it.motivoRechazo
                        ) : (
                          <span style={{ color: 'var(--text-soft)', fontWeight: 600 }}>—</span>
                        )}
                      </td>
                    ) : null}
                  </tr>

                  {canBreakdown && isExpanded && opts.mode !== 'rechazados' ? (
                    <tr>
                      <td colSpan={opts.mode === 'pendientes' ? 8 : 8} style={{ padding: 0, borderBottom: '1px solid rgba(148,163,184,0.25)' }}>
                        <div
                          style={{
                            padding: '10px 16px 14px',
                            background: 'var(--bg-sunken)',
                            display: 'grid',
                            gap: 6,
                          }}
                        >
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 800 }}>
                            Desglose informativo (nomenclador OSDE)
                          </div>
                          <div style={{ display: 'grid', gap: 6 }}>
                            {items.length === 0 ? (
                              <div style={{ color: 'var(--text-soft)', fontSize: 12 }}>Sin partidas disponibles.</div>
                            ) : (
                              items.map((x) => (
                                <div
                                  key={x.label}
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    gap: 12,
                                    fontSize: 12.5,
                                    color: 'var(--text)',
                                  }}
                                >
                                  <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>
                                    {x.label}
                                    {x.extra ? <span style={{ fontWeight: 600, color: 'var(--text-soft)' }}> {x.extra}</span> : null}
                                  </span>
                                  <span className="tabular" style={{ fontFamily: 'var(--font-mono)', fontWeight: 900 }}>
                                    {formatCurrency(x.value)}
                                  </span>
                                </div>
                              ))
                            )}
                            {breakdown?.total != null ? (
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  gap: 12,
                                  paddingTop: 8,
                                  marginTop: 6,
                                  borderTop: '1px solid rgba(148,163,184,0.25)',
                                }}
                              >
                                <span style={{ fontWeight: 900 }}>Total</span>
                                <span className="tabular" style={{ fontFamily: 'var(--font-mono)', fontWeight: 900 }}>
                                  {formatCurrency(breakdown.total)}
                                </span>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <TooltipProvider>
      <div className="px-6 md:px-10 pt-6 pb-10 max-w-[1600px] mx-auto">
        <div className="page-head mb-10">
          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ fontWeight: 900, fontSize: 26, lineHeight: 1.15, color: 'var(--text)' }}>
              Centro de cobros
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.45 }}>
              Detalle de todos los cobros estimados y registrados
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 18 }}>
          <div style={{ display: 'grid', gap: 18 }}>
            <Proyeccion showMoreLink={false} />
            <Calendario />
          </div>

          {/* Controles */}
          <section className="panel" style={{ padding: 18, background: 'var(--bg-panel)' }}>
            <div style={{ display: 'grid', gap: 14 }}>
              {/* fila superior */}
              <div
                style={{
                  display: 'flex',
                  gap: 12,
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                }}
              >
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={sectionLabelStyle}>Mes</span>
                  <select
                    value={mesKey}
                    onChange={(e) => setMesKey(e.target.value)}
                    className="input"
                    style={{ minWidth: 190, maxWidth: '100%' }}
                  >
                    {mesesOpciones.map((m) => (
                      <option key={m.key} value={m.key}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div style={{ flex: '1 1 280px', minWidth: 0, maxWidth: 520 }}>
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Buscar paciente o práctica…"
                    className="input"
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              {/* fila inferior: filtros */}
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                  <span style={sectionLabelStyle}>Prepaga</span>
                  {(['OSDE', 'Swiss Medical', 'Desconocida'] as PrepagaFiltro[]).map((p) => {
                    const active = prepagaSel.has(p);
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPrepagaSel((s) => toggleSet(s, p))}
                        style={chipStyle(active)}
                        aria-pressed={active}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                  <span style={sectionLabelStyle}>Estado</span>
                  {(['Pendiente', 'Cobrado', 'A confirmar', 'Rechazado'] as EstadoFiltro[]).map((st) => {
                    const active = estadoSel.has(st);
                    return (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setEstadoSel((s) => toggleSet(s, st))}
                        style={chipStyle(active)}
                        aria-pressed={active}
                      >
                        {st}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          {/* Resumen (solo pendientes) */}
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Pendientes: <b className="tabular">{pendientesSorted.length}</b> ·{' '}
            <b className="tabular" style={{ color: 'var(--text)', fontWeight: 800 }}>
              {formatCurrency(totalPendientes)}
            </b>{' '}
            estimados (<b className="tabular">{aConfirmarPendientes}</b> a confirmar)
          </div>

          {/* Secciones */}
          <section className="panel" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ ...sectionHeaderStyle, cursor: 'default' }}>
              <div>
                <div style={sectionTitleStyle}>
                  Pendientes ({pendientesSorted.length}) · {formatCurrency(totalPendientes)}
                </div>
                <div style={sectionMetaStyle}>Presentados y listos para presentar</div>
              </div>
            </div>
            {renderTable(pendientesSorted, { mode: 'pendientes' })}
          </section>

          <section className="panel" style={{ padding: 0, overflow: 'hidden', opacity: openSection.cobrados ? 1 : 0.92 }}>
            <div
              style={sectionHeaderStyle}
              onClick={() => setOpenSection((s) => ({ ...s, cobrados: !s.cobrados }))}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setOpenSection((s) => ({ ...s, cobrados: !s.cobrados }));
              }}
            >
              <div>
                <div style={sectionTitleStyle}>
                  Cobrados ({cobradosSorted.length}) · {formatCurrency(totalCobrados)}
                </div>
                <div style={sectionMetaStyle}>Cobros registrados con fecha y monto real</div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-soft)', fontWeight: 800 }}>
                {openSection.cobrados ? 'Ocultar' : 'Ver'}
              </div>
            </div>
            {openSection.cobrados ? renderTable(cobradosSorted, { mode: 'cobrados' }) : null}
          </section>

          <section className="panel" style={{ padding: 0, overflow: 'hidden', opacity: openSection.rechazados ? 1 : 0.92 }}>
            <div
              style={sectionHeaderStyle}
              onClick={() => setOpenSection((s) => ({ ...s, rechazados: !s.rechazados }))}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setOpenSection((s) => ({ ...s, rechazados: !s.rechazados }));
              }}
            >
              <div>
                <div style={sectionTitleStyle}>Rechazados ({rechazadosSorted.length})</div>
                <div style={sectionMetaStyle}>Revisá motivo y corregí antes de re-presentar</div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-soft)', fontWeight: 800 }}>
                {openSection.rechazados ? 'Ocultar' : 'Ver'}
              </div>
            </div>
            {openSection.rechazados ? renderTable(rechazadosSorted, { mode: 'rechazados' }) : null}
          </section>
        </div>

        {openPaid ? (
          <div
            className="modal-overlay"
            role="dialog"
            aria-modal="true"
            onClick={(e) => {
              if (e.target === e.currentTarget) setOpenPaid(null);
            }}
          >
            <div className="modal-card" style={{ maxWidth: 520 }}>
              <div className="modal-head">
                <div style={{ fontWeight: 900 }}>Marcar cobrado</div>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpenPaid(null)}>
                  Cerrar
                </button>
              </div>
              <div className="modal-body">
                <div className="field">
                  <div className="field-label">Fecha de cobro real</div>
                  <input
                    type="date"
                    value={openPaid.fecha}
                    onChange={(e) => setOpenPaid((s) => (s ? { ...s, fecha: e.target.value } : s))}
                  />
                </div>
                <div className="field" style={{ marginTop: 12 }}>
                  <div className="field-label">Monto cobrado</div>
                  <input
                    inputMode="decimal"
                    type="text"
                    value={openPaid.monto}
                    onChange={(e) => setOpenPaid((s) => (s ? { ...s, monto: e.target.value } : s))}
                    placeholder="Ej: 524965.78"
                  />
                </div>
                <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button type="button" className="btn" onClick={() => setOpenPaid(null)}>
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      const fecha = new Date(`${openPaid.fecha}T12:00:00`);
                      const monto = parseMoneyLoose(openPaid.monto || '');
                      if (!onUpdateTracking || !Number.isFinite(monto)) return;
                      onUpdateTracking(openPaid.id, (it) => markAsPaid(it, fecha, monto));
                      setOpenPaid(null);
                    }}
                  >
                    Confirmar
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {openDetailId ? (() => {
          const it = all.find((x) => x.id === openDetailId) ?? null;
          if (!it) return null;
          const desg = it.desglose?.desglose ?? null;
          const fechaCobro = it.estado === 'cobrado' ? it.fechaCobroReal : it.fechaCobroEstimada;
          const headerTitle = `${it.practica}${it.codigo ? ` · ${it.codigo}` : ''}`;
          const rows: Array<{ label: string; value: string }> = [];
          if (desg) {
            rows.push({ label: 'Honorarios especialista', value: desg.honorarios_especialista == null ? '—' : formatCurrency(desg.honorarios_especialista) });
            rows.push({
              label: 'Honorarios ayudantes',
              value:
                desg.honorarios_ayudantes == null
                  ? '—'
                  : `${formatCurrency(desg.honorarios_ayudantes)}${desg.cnt_ayudantes ? ` (× ${desg.cnt_ayudantes})` : ''}`,
            });
            rows.push({ label: 'Honorarios anestesista', value: desg.honorarios_anestesista == null ? '—' : formatCurrency(desg.honorarios_anestesista) });
            rows.push({ label: 'Honorarios institucionales', value: desg.honorarios_inst == null ? '—' : formatCurrency(desg.honorarios_inst) });
            rows.push({ label: 'Gastos', value: desg.gastos == null ? '—' : formatCurrency(desg.gastos) });
          }
          const total = desg?.total ?? null;
          return (
            <div
              className="modal-overlay"
              role="dialog"
              aria-modal="true"
              onClick={(e) => {
                if (e.target === e.currentTarget) setOpenDetailId(null);
              }}
            >
              <div className="modal-card" style={{ maxWidth: 720 }}>
                <div className="modal-head">
                  <div style={{ display: 'grid', gap: 2 }}>
                    <div style={{ fontWeight: 950 }}>{headerTitle}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {it.paciente} · {it.prepaga} · {it.plan ?? '—'} · {it.tipo} · Práctica: {formatDDMMYYYY(it.fechaPractica)} · Cobro:{' '}
                      {formatDDMMYYYY(fechaCobro)}
                    </div>
                  </div>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpenDetailId(null)}>
                    Cerrar
                  </button>
                </div>
                <div className="modal-body">
                  <div style={{ display: 'grid', gap: 10 }}>
                    <div style={{ fontWeight: 900 }}>Desglose de honorarios</div>
                    {rows.length === 0 ? (
                      <div style={{ color: 'var(--text-soft)', fontSize: 13 }}>
                        No hay desglose disponible para esta práctica (solo OSDE con código/plan/tipo válidos).
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gap: 8 }}>
                        {rows.map((r) => (
                          <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                            <div style={{ color: 'var(--text-muted)', fontWeight: 700 }}>{r.label}</div>
                            <div className="tabular" style={{ fontFamily: 'var(--font-mono)', fontWeight: 900 }}>
                              {r.value}
                            </div>
                          </div>
                        ))}
                        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
                          <div style={{ fontWeight: 950 }}>Total</div>
                          <div className="tabular" style={{ fontFamily: 'var(--font-mono)', fontWeight: 950 }}>
                            {total == null ? '—' : formatCurrency(total)}
                          </div>
                        </div>
                      </div>
                    )}

                    <div
                      style={{
                        marginTop: 8,
                        padding: 12,
                        borderRadius: 12,
                        border: '1px solid var(--border)',
                        background: 'var(--bg-sunken)',
                        color: 'var(--text-muted)',
                        fontSize: 12.5,
                        lineHeight: 1.4,
                        fontWeight: 650,
                      }}
                    >
                      Estos valores corresponden al desglose del nomenclador OSDE. La distribución real de cada partida depende del convenio específico del prestador con la obra social. Consultá tu liquidación para el detalle exacto.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })() : null}
      </div>
    </TooltipProvider>
  );
}

