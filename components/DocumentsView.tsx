'use client';

import { useEffect, useMemo, useState } from 'react';
import { Icon } from './Icon';
import type { FileEntry } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { getEstadoEfectivo, type HistoryItem } from '@/lib/history';
import { markAsPresented } from '@/lib/tracking';
import { CobrosBanner } from './CobrosBadge';
import { SwissMedicalCloseButton } from './SwissMedicalCloseButton';
import { ReviewModal } from './ReviewModal';

type FilterKey = 'all' | 'error' | 'warn' | 'ok';

// ---------------------------------------------------------------------------
// Panel de documentos pendientes de revisión
// ---------------------------------------------------------------------------

function PendingReviewPanel({
  items,
  onReview,
  onDelete,
}: {
  items: any[];
  onReview: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div style={{ marginBottom: 16, border: '1px solid var(--border)', borderRadius: 'var(--radius, 8px)', overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', background: 'var(--bg-sunken)', borderBottom: '1px solid var(--border)' }}>
        <strong style={{ fontSize: 14, fontFamily: 'var(--font-display)' }}>Pendientes de revisión ({items.length})</strong>
      </div>
      {items.map((p) => {
        const isBlocked = p.estado_revision === 'bloqueado';
        const motivos: { severity: string; message: string }[] = Array.isArray(p.motivos_revision) ? p.motivos_revision : [];
        const blockers = motivos.filter((m) => m.severity === 'blocker');
        const warnings = motivos.filter((m) => m.severity === 'warning');
        const isOpen = expandedId === p.id;
        const paciente = p.ai_extractions?.paciente ?? '—';
        const prepaga = p.ai_extractions?.prepaga ?? p.prepaga ?? '';

        return (
          <div key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
            <button
              type="button"
              onClick={() => setExpandedId(isOpen ? null : p.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                padding: '10px 14px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: 14,
                fontFamily: 'inherit',
                color: 'var(--text)',
              }}
            >
              <span style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                flexShrink: 0,
                background: isBlocked ? 'var(--error)' : 'var(--ok)',
              }} />
              <span style={{ flex: 1, fontWeight: 500 }}>
                {paciente}
                {prepaga ? <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6 }}>· {prepaga}</span> : null}
              </span>
              <span style={{
                fontSize: 12,
                padding: '2px 8px',
                borderRadius: 4,
                background: isBlocked ? 'var(--error-soft)' : 'var(--ok-soft)',
                color: isBlocked ? 'var(--error)' : 'var(--ok)',
                fontWeight: 500,
              }}>
                {isBlocked ? 'Faltan datos' : 'Listo para confirmar'}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-soft)', transition: 'transform 0.15s', transform: isOpen ? 'rotate(180deg)' : 'none' }}>▼</span>
            </button>

            {isOpen && (
              <div style={{ padding: '0 14px 12px', background: 'var(--bg-panel)', animation: 'slideDown 0.2s ease-out' }}>
                {blockers.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--error)', marginBottom: 4 }}>Errores</div>
                    <ul style={{ margin: 0, padding: '0 0 0 16px', fontSize: 13, color: 'var(--error)' }}>
                      {blockers.map((b, i) => <li key={i}>{b.message}</li>)}
                    </ul>
                  </div>
                )}
                {warnings.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--warn)', marginBottom: 4 }}>Advertencias</div>
                    <ul style={{ margin: 0, padding: '0 0 0 16px', fontSize: 13, color: 'var(--warn)' }}>
                      {warnings.map((w, i) => <li key={i}>{w.message}</li>)}
                    </ul>
                  </div>
                )}
                {blockers.length === 0 && warnings.length === 0 && (
                  <p style={{ margin: 0, marginBottom: 8, fontSize: 13, color: 'var(--text-muted)' }}>
                    Todos los datos fueron detectados correctamente. Revisá y confirmá.
                  </p>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => onReview(p.id)}
                  >
                    {isBlocked ? 'Completar datos' : 'Revisar y confirmar'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => onDelete(p.id)}
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CobroStatusBadge({ item }: { item: HistoryItem }) {
  const { estado, label } = getEstadoEfectivo(item);

  const className =
    (
      {
        borrador: 'bg-transparent text-muted-foreground border-transparent',
        con_errores: 'bg-transparent text-destructive border-transparent',
        listo_para_presentar: 'bg-transparent text-primary border-transparent',
        presentado: 'bg-transparent text-blue-400 border-transparent',
        cobrado: 'bg-transparent text-primary-foreground border-transparent',
        rechazado: 'bg-transparent text-destructive border-transparent',
      } as const
    )[estado] ?? 'bg-transparent text-muted-foreground border-transparent';

  return (
    <Badge variant="outline" className={className}>
      {label}
    </Badge>
  );
}

export function DocumentsView({
  files,
  onOpenFile,
  onUpdateTracking,
  onRemoveFile,
}: {
  files: FileEntry[];
  onOpenFile: (id: string) => void;
  onUpdateTracking: (id: string, updater: (item: FileEntry) => FileEntry) => void;
  onRemoveFile: (id: string) => void;
}) {
  const normalizePrepaga = (raw: string | null | undefined) => {
    const s = String(raw || '').trim();
    if (!s) return null;
    const n = s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    if (n.includes('osde')) return 'OSDE';
    if (n.includes('swiss') || n.includes('smm') || n.includes('smg') || n.includes('medical')) return 'SWISS MEDICAL';
    if (n.includes('medife') || n.includes('medife')) return 'MEDIFE';
    if (n.includes('galeno')) return 'GALENO';
    if (n.includes('medicus')) return 'MEDICUS';
    return s.toUpperCase();
  };

  const [filter, setFilter] = useState<FilterKey>('all');
  const [q, setQ] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [confirmPresentId, setConfirmPresentId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [pending, setPending] = useState<any[]>([]);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  useEffect(() => {
    fetch('/api/liquidaciones?estado_revision=bloqueado,en_revision')
      .then((r) => r.json())
      .then((d) => setPending(d.liquidaciones ?? []))
      .catch(() => {});
  }, [refreshKey]);

  /** Una liquidación por documento (evita duplicados legacy: dos pasadas OpenAI en PDF). */
  const pendingDeduped = useMemo(() => {
    const list = pending;
    const byDoc = new Map<string, any>();
    for (const p of list) {
      const key = p.document_id ? String(p.document_id) : String(p.id);
      const prev = byDoc.get(key);
      const pAt = p.created_at ? new Date(p.created_at).getTime() : 0;
      const prevAt = prev?.created_at ? new Date(prev.created_at).getTime() : 0;
      if (!prev || pAt >= prevAt) byDoc.set(key, p);
    }
    return Array.from(byDoc.values()).sort((a, b) =>
      String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')),
    );
  }, [pending]);

  /** Misma lista que Carga / Cobros: solo el estado del padre (evita que loadHistory() pise un borrado reciente). */
  const ready = useMemo(() => files.filter((f) => f.status !== 'analyzing'), [files]);

  const counts = useMemo(() => {
    return {
      all: ready.length,
      error: ready.filter((f) => f.analysis?.overall === 'error').length,
      warn: ready.filter((f) => f.analysis?.overall === 'warn').length,
      ok: ready.filter((f) => f.analysis?.overall === 'ok').length,
    };
  }, [ready]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let base = ready;
    if (filter !== 'all') {
      base = base.filter((f) => f.analysis?.overall === filter);
    }
    if (needle) {
      base = base.filter((f) => {
        const hay = `${f.name} ${(f.analysis?.detected?.prepagas || []).join(' ')} ${(f.analysis?.detected?.codes || []).join(' ')}`.toLowerCase();
        return hay.includes(needle);
      });
    }
    return [...base].sort((a, b) => (a.addedAt < b.addedAt ? 1 : -1));
  }, [ready, filter, q]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Mis documentos</h1>
          <p className="page-subtitle">Todo lo que cargaste, con el resultado del análisis.</p>
        </div>
      </div>

      {pendingDeduped.length > 0 && (
        <PendingReviewPanel
          items={pendingDeduped}
          onReview={(id) => setReviewingId(id)}
          onDelete={(id) => {
            if (!window.confirm('¿Eliminar este registro de liquidación en la nube? No se puede deshacer.')) return;
            void (async () => {
              try {
                const r = await fetch(`/api/liquidaciones/${id}`, { method: 'DELETE' });
                if (r.ok) setRefreshKey((k) => k + 1);
              } catch { /* ignore */ }
            })();
          }}
        />
      )}
      {reviewingId && (
        <ReviewModal
          liquidacionId={reviewingId}
          onClose={() => setReviewingId(null)}
          onSaved={() => { setReviewingId(null); setRefreshKey((k) => k + 1); }}
        />
      )}

      {confirmRemoveId && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmRemoveId(null);
          }}
        >
          <div className="modal-card" style={{ maxWidth: 480 }}>
            <div className="modal-head">
              <div style={{ fontWeight: 800 }}>¿Sacar este documento de Trazá?</div>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirmRemoveId(null)}>
                <Icon name="x" size={14} /> Cerrar
              </button>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
                Se quita del historial y, si corresponde, se elimina el registro en la nube (liquidación, parte y archivo).
              </p>
              <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="btn" onClick={() => setConfirmRemoveId(null)}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => {
                    onRemoveFile(confirmRemoveId);
                    setConfirmRemoveId(null);
                    setRefreshKey((k) => k + 1);
                  }}
                >
                  Sí, sacarlo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <CobrosBanner />
      <div style={{ marginBottom: 16 }}>
        <SwissMedicalCloseButton onSent={() => setRefreshKey((k) => k + 1)} />
      </div>

      <div className="docs-toolbar">
        <div className="errors-toolbar" style={{ marginBottom: 0 }}>
          <div className={`filter-chip ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
            Todos <span className="count">{counts.all}</span>
          </div>
          <div className={`filter-chip ${filter === 'error' ? 'active' : ''}`} onClick={() => setFilter('error')}>
            Errores <span className="count">{counts.error}</span>
          </div>
          <div className={`filter-chip ${filter === 'warn' ? 'active' : ''}`} onClick={() => setFilter('warn')}>
            Advertencias <span className="count">{counts.warn}</span>
          </div>
          <div className={`filter-chip ${filter === 'ok' ? 'active' : ''}`} onClick={() => setFilter('ok')}>
            OK <span className="count">{counts.ok}</span>
          </div>
        </div>

        <input
          className="docs-search"
          placeholder="Buscá por nombre de archivo, prepaga o código…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="panel empty">
          <div className="empty-icon">
            <Icon name="empty" size={48} />
          </div>
          <div className="empty-title">No encontramos documentos con esos criterios</div>
          <div>Podés ajustar el filtro o escribir otra palabra en la búsqueda.</div>
        </div>
      ) : (
        <div className="errors-table">
          <table>
            <thead>
              <tr>
                <th style={{ width: 120 }}>Análisis</th>
                <th style={{ width: 160 }}>Cobro</th>
                <th>Documento</th>
                <th style={{ width: 150 }}>Fecha</th>
                <th style={{ width: 140 }}>Prepaga</th>
                <th style={{ width: 110 }}>Código</th>
                <th style={{ width: 120 }} />
              </tr>
            </thead>
            <tbody>
              {filtered.map((f) => {
                const a = f.analysis;
                const prepaga =
                  normalizePrepaga(f.aiParteExtract?.cobertura?.prepaga) ||
                  normalizePrepaga(a?.detected?.prepagas?.[0]) ||
                  normalizePrepaga(f.raw_text_light) ||
                  normalizePrepaga(f.raw_text) ||
                  normalizePrepaga(f.text) ||
                  '—';
                const codigo = a?.detected?.codes?.[0] || null;
                const itemAsHistory = f as unknown as HistoryItem;
                const cobroEstado = getEstadoEfectivo(itemAsHistory).estado;
                return (
                  <tr key={f.id}>
                    <td>
                      {a?.overall === 'error' && (
                        <span className="badge badge-error">
                          <span className="badge-dot" />
                          Error
                        </span>
                      )}
                      {a?.overall === 'warn' && (
                        <span className="badge badge-warn">
                          <span className="badge-dot" />
                          Advertencia
                        </span>
                      )}
                      {a?.overall === 'ok' && (
                        <span className="badge badge-ok">
                          <span className="badge-dot" />
                          OK
                        </span>
                      )}
                      {!a && (
                        <span className="badge badge-neutral">
                          <span className="badge-dot" />
                          Falló
                        </span>
                      )}
                    </td>
                    <td>
                      <CobroStatusBadge item={itemAsHistory} />
                    </td>
                    <td>
                      <div className="err-msg">{f.name}</div>
                      <div className="err-hint">
                        {a ? (
                          <>
                            {a.summary.error} error{a.summary.error === 1 ? '' : 'es'} · {a.summary.warn} advertencia
                            {a.summary.warn === 1 ? '' : 's'}
                          </>
                        ) : (
                          f.errorMessage || 'No se pudo analizar'
                        )}
                      </div>
                    </td>
                    <td>{new Date(f.addedAt).toLocaleDateString('es-AR')}</td>
                    <td>{prepaga}</td>
                    <td>
                      {codigo ? (
                        <code style={{ fontFamily: 'var(--font-mono)', fontSize: 14 }}>{codigo}</code>
                      ) : (
                        <span style={{ color: 'var(--text-soft)' }}>—</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        <button className="btn btn-sm btn-ghost" onClick={() => onOpenFile(f.id)}>
                          Abrir revisión
                        </button>

                        {cobroEstado === 'listo_para_presentar' ? (
                          confirmPresentId === f.id ? (
                            <>
                              <span style={{ fontSize: 12, color: 'var(--text-soft)', alignSelf: 'center' }}>
                                ¿Confirmar?
                              </span>
                              <button
                                className="btn btn-sm btn-primary"
                                onClick={() => {
                                  onUpdateTracking(f.id, (it) => markAsPresented(it));
                                  setConfirmPresentId(null);
                                }}
                              >
                                Sí
                              </button>
                              <button className="btn btn-sm" onClick={() => setConfirmPresentId(null)}>
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <button className="btn btn-sm btn-primary" onClick={() => setConfirmPresentId(f.id)}>
                              Marcar como presentado
                            </button>
                          )
                        ) : null}
                        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirmRemoveId(f.id)}>
                          Sacar de Trazá
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

