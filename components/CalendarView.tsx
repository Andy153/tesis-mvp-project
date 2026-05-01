'use client';

import { useMemo, useState } from 'react';
import { Icon } from './Icon';
import type { AuthState, FileEntry, Severity } from '@/lib/types';
import { loadHistory } from '@/lib/history';

type ViewMode = 'month' | 'week' | 'day';

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseIso(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? new Date() : d;
}

function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 Sun ... 6 Sat
  const diff = (day === 0 ? -6 : 1) - day; // Monday as start
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function severityCountsFromFindings(findings: Array<{ severity: Severity }>) {
  return findings.reduce(
    (acc, f) => {
      if (f.severity === 'error') acc.error++;
      if (f.severity === 'warn') acc.warn++;
      if (f.severity === 'ok') acc.ok++;
      if (f.severity === 'info') acc.info++;
      return acc;
    },
    { error: 0, warn: 0, ok: 0, info: 0 },
  );
}

function badgeForCounts(counts: { error: number; warn: number }) {
  if (counts.error > 0) {
    return (
      <span className="badge badge-error">
        <span className="badge-dot" />
        {counts.error} error{counts.error > 1 ? 'es' : ''}
      </span>
    );
  }
  if (counts.warn > 0) {
    return (
      <span className="badge badge-warn">
        <span className="badge-dot" />
        {counts.warn} advertencia{counts.warn > 1 ? 's' : ''}
      </span>
    );
  }
  return (
    <span className="badge badge-ok">
      <span className="badge-dot" />
      OK
    </span>
  );
}

type DocGroup = {
  id: string;
  dateKey: string;
  at: string;
  parte: FileEntry;
  permiso:
    | null
    | {
        fileName: string;
        summary: { ok: number; warn: number; error: number };
        items: Array<{ severity: 'ok' | 'warn' | 'error'; title: string; body: string; action?: string }>;
      };
};

function groupDocs(files: FileEntry[], authStates: Record<string, AuthState | undefined>): DocGroup[] {
  const groups: DocGroup[] = [];
  for (const f of files) {
    if (!f.addedAt) continue;
    const dateKey = ymd(parseIso(f.addedAt));
    const auth = authStates[f.id];
    let permiso: DocGroup['permiso'] = null;
    if (auth?.status === 'checked') {
      const xc = auth.crossCheck || [];
      const summary = {
        ok: xc.filter((x) => x.severity === 'ok').length,
        warn: xc.filter((x) => x.severity === 'warn').length,
        error: xc.filter((x) => x.severity === 'error').length,
      };
      permiso = { fileName: auth.fileName, summary, items: xc };
    }
    groups.push({
      id: f.id,
      dateKey,
      at: f.addedAt,
      parte: f,
      permiso,
    });
  }
  return groups.sort((a, b) => (a.at < b.at ? 1 : -1));
}

export function CalendarView({
  files: filesProp,
  authStates: authStatesProp,
  onOpenParte,
  embedded = false,
}: {
  files?: FileEntry[];
  authStates?: Record<string, AuthState | undefined>;
  onOpenParte?: (id: string) => void;
  embedded?: boolean;
}) {
  const loaded = loadHistory();
  const files = filesProp ?? (loaded.files as FileEntry[]);
  const authStates = authStatesProp ?? (loaded.authStates as Record<string, AuthState | undefined>);
  const [mode, setMode] = useState<ViewMode>('month');
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [selectedDay, setSelectedDay] = useState<string>(ymd(new Date()));

  const analyzedFiles = useMemo(() => files.filter((f) => f.status === 'analyzed' || f.status === 'error'), [files]);
  const groups = useMemo(() => groupDocs(analyzedFiles, authStates), [analyzedFiles, authStates]);

  const byDay = useMemo(() => {
    const map: Record<string, DocGroup[]> = {};
    for (const g of groups) (map[g.dateKey] = map[g.dateKey] || []).push(g);
    return map;
  }, [groups]);

  const monthGrid = useMemo(() => {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const start = startOfWeek(first);
    const days: Array<{ date: Date; key: string; inMonth: boolean }> = [];
    for (let i = 0; i < 42; i++) {
      const d = addDays(start, i);
      days.push({
        date: d,
        key: ymd(d),
        inMonth: d.getMonth() === anchor.getMonth(),
      });
    }
    return days;
  }, [anchor]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(start, i);
      return { date: d, key: ymd(d) };
    });
  }, [anchor]);

  const visibleKeys = useMemo(() => {
    if (mode === 'day') return [selectedDay];
    if (mode === 'week') return weekDays.map((d) => d.key);
    // month
    return monthGrid.filter((d) => d.inMonth).map((d) => d.key);
  }, [mode, selectedDay, weekDays, monthGrid]);

  const visibleGroups = useMemo(() => {
    const out: Array<{ key: string; groups: DocGroup[] }> = [];
    for (const key of visibleKeys) {
      const gs = byDay[key] || [];
      if (mode !== 'month' || gs.length > 0) out.push({ key, groups: gs });
    }
    return out.sort((a, b) => (a.key < b.key ? 1 : -1));
  }, [visibleKeys, byDay, mode]);

  const monthLabel = anchor.toLocaleString('es-AR', { month: 'long', year: 'numeric' });

  return (
    <div>
      {!embedded ? (
        <div className="page-head">
          <div>
            <h1 className="page-title">Vista por fechas</h1>
            <p className="page-subtitle">Los documentos agrupados por fecha de carga.</p>
          </div>
        </div>
      ) : null}

      <div className="cal-toolbar">
        <div className="cal-modes">
          <div className={`filter-chip ${mode === 'month' ? 'active' : ''}`} onClick={() => setMode('month')}>
            Mes
          </div>
          <div className={`filter-chip ${mode === 'week' ? 'active' : ''}`} onClick={() => setMode('week')}>
            Semana
          </div>
          <div className={`filter-chip ${mode === 'day' ? 'active' : ''}`} onClick={() => setMode('day')}>
            Día
          </div>
        </div>

        <div className="cal-nav">
          <button
            className="btn btn-sm btn-ghost"
            type="button"
            onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1))}
            aria-label="Mes anterior"
          >
            ←
          </button>
          <div className="cal-title">{monthLabel}</div>
          <button
            className="btn btn-sm btn-ghost"
            type="button"
            onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1))}
            aria-label="Mes siguiente"
          >
            →
          </button>
        </div>
      </div>

      <div className="cal-layout">
        <div className="panel cal-panel">
          {mode === 'month' && (
            <div className="cal-grid">
              {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((w) => (
                <div key={w} className="cal-weekday">
                  {w}
                </div>
              ))}
              {monthGrid.map((d) => {
                const gs = byDay[d.key] || [];
                const totalDocs = gs.length + gs.filter((g) => g.permiso).length;
                const totalErrors = gs.reduce((acc, g) => acc + (g.parte.analysis?.summary.error || 0), 0);
                const isSel = selectedDay === d.key;
                return (
                  <div
                    key={d.key}
                    className={`cal-cell ${d.inMonth ? '' : 'muted'} ${isSel ? 'selected' : ''}`}
                    onClick={() => setSelectedDay(d.key)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="cal-daynum">{d.date.getDate()}</div>
                    {totalDocs > 0 && (
                      <div className="cal-pill">
                        <span className="n">{totalDocs}</span>
                        <span className={`dot ${totalErrors > 0 ? 'err' : ''}`} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {mode === 'week' && (
            <div className="cal-week">
              {weekDays.map((d) => {
                const gs = byDay[d.key] || [];
                const totalErrors = gs.reduce((acc, g) => acc + (g.parte.analysis?.summary.error || 0), 0);
                return (
                  <div
                    key={d.key}
                    className={`cal-weekday-row ${selectedDay === d.key ? 'selected' : ''}`}
                    onClick={() => setSelectedDay(d.key)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="cal-weekday-left">
                      <div className="cal-weekday-name">
                        {d.date.toLocaleDateString('es-AR', { weekday: 'short' })}
                      </div>
                      <div className="cal-weekday-date">{d.date.toLocaleDateString('es-AR')}</div>
                    </div>
                    <div className="cal-weekday-right">
                      <span className="cal-count">{gs.length}</span>
                      <span className={`cal-dot ${totalErrors > 0 ? 'err' : ''}`} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {mode === 'day' && (
            <div style={{ padding: 14 }}>
              <div className="cal-day-head">
                <Icon name="empty" size={18} />
                {parseIso(selectedDay).toLocaleDateString('es-AR', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: '2-digit',
                })}
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                {byDay[selectedDay]?.length || 0} documento(s) con análisis / error
              </div>
            </div>
          )}
        </div>

        <div className="panel cal-list">
          {visibleGroups.length === 0 ? (
            <div className="empty" style={{ border: 'none' }}>
              <div className="empty-icon">
                <Icon name="empty" size={48} />
              </div>
              <div className="empty-title">Todavía no hay documentos en el historial</div>
              <div>Subí un parte quirúrgico o un bono para que aparezcan en el calendario.</div>
            </div>
          ) : (
            <div className="cal-items">
              {visibleGroups.map(({ key, groups }) => (
                <div key={key} className="cal-day-block">
                  <div className="cal-day-label">
                    {parseIso(key).toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: 'short' })}
                    <span className="cal-day-meta">{groups.length} parte(s)</span>
                  </div>

                  {groups.length === 0 ? (
                    <div className="cal-empty-day">Sin documentos</div>
                  ) : (
                    groups.map((g) => {
                      const a = g.parte.analysis;
                      const counts = a ? a.summary : { error: 0, warn: 0, ok: 0 };
                      const prepaga = a?.detected.prepagas?.[0] || '—';
                      const codigo = a?.detected.codes?.[0] || null;
                      return (
                        <div key={g.id} className="cal-card">
                          <div className="cal-card-head">
                            <div className="cal-card-title">
                              <Icon name="file" size={14} /> {g.parte.name}
                            </div>
                            <div className="cal-card-badges">{badgeForCounts({ error: counts.error, warn: counts.warn })}</div>
                          </div>

                          <div className="cal-card-meta">
                            <span>
                              {parseIso(g.at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <span>·</span>
                            <span>Prepaga: <b>{prepaga}</b></span>
                            <span>·</span>
                            <span>
                              Código:{' '}
                              {codigo ? (
                                <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>{codigo}</code>
                              ) : (
                                <span style={{ color: 'var(--text-soft)' }}>—</span>
                              )}
                            </span>
                          </div>

                          {a?.findings?.filter((f) => f.severity !== 'ok').slice(0, 3).map((f, i) => (
                            <div key={i} className={`cal-mini sev-${f.severity}`}>
                              <div className="t">{f.title}</div>
                              <div className="b">{f.action || f.body}</div>
                            </div>
                          ))}

                          {g.permiso && (
                            <div className="cal-linked">
                              <div className="cal-linked-head">
                                <Icon name="target" size={12} /> Permiso / Bono asociado
                              </div>
                              <div className="cal-linked-row">
                                <div className="cal-linked-name">{g.permiso.fileName}</div>
                                {badgeForCounts({ error: g.permiso.summary.error, warn: g.permiso.summary.warn })}
                              </div>
                              {g.permiso.items
                                .filter((x) => x.severity !== 'ok')
                                .slice(0, 2)
                                .map((x, i) => (
                                  <div key={i} className={`cal-mini sev-${x.severity === 'error' ? 'error' : 'warn'}`}>
                                    <div className="t">{x.title}</div>
                                    <div className="b">{x.action || x.body}</div>
                                  </div>
                                ))}
                            </div>
                          )}

                          <div className="cal-card-actions">
                            <button
                              className="btn btn-sm btn-ghost"
                              onClick={() => onOpenParte?.(g.parte.id)}
                              disabled={!onOpenParte}
                              title={!onOpenParte ? 'No disponible desde esta vista' : undefined}
                            >
                              Ver detalle
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

