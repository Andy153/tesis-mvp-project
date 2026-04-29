'use client';

import { useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CircleCheck,
  Clock,
  ShieldAlert,
} from 'lucide-react';

import { loadHistory } from '@/lib/history';
import {
  getDocumentosQueRequierenAtencionPorDocumento,
  type AtencionGrupo,
  type AtencionItem,
} from '@/lib/dashboard-data';

const ICONOS: Record<AtencionItem['tipo'], { Icon: typeof AlertCircle; className: string }> = {
  error: { Icon: AlertCircle, className: 'text-destructive' },
  warning: { Icon: AlertTriangle, className: 'text-amber-600' },
  autorizacion: { Icon: ShieldAlert, className: 'text-amber-600' },
  plazo: { Icon: Clock, className: 'text-amber-600' },
};

function itemTone(tipo: AtencionItem['tipo']): { badgeClass: string; surfaceBg: string; surfaceBorder: string } {
  if (tipo === 'error') {
    return { badgeClass: 'badge-error', surfaceBg: 'var(--error-soft)', surfaceBorder: 'rgba(155, 46, 46, 0.35)' };
  }
  if (tipo === 'warning' || tipo === 'autorizacion' || tipo === 'plazo') {
    return { badgeClass: 'badge-warn', surfaceBg: 'var(--warn-soft)', surfaceBorder: 'rgba(154, 106, 22, 0.30)' };
  }
  return { badgeClass: 'badge-neutral', surfaceBg: 'var(--bg-sunken)', surfaceBorder: 'var(--border)' };
}

function groupIcon(g: AtencionGrupo): { Icon: typeof AlertCircle; className: string } {
  const tipos = new Set(g.observaciones.map((o) => o.tipo));
  if (tipos.has('error')) return ICONOS.error;
  if (tipos.has('plazo')) return ICONOS.plazo;
  if (tipos.has('autorizacion')) return ICONOS.autorizacion;
  return ICONOS.warning;
}

function groupTone(g: AtencionGrupo): { badgeClass: string; surfaceBg: string; surfaceBorder: string } {
  const tipos = new Set(g.observaciones.map((o) => o.tipo));
  if (tipos.has('error')) {
    return { badgeClass: 'badge-error', surfaceBg: 'var(--error-soft)', surfaceBorder: 'rgba(155, 46, 46, 0.35)' };
  }
  // plazo/autorización/warning → tono advertencia
  return { badgeClass: 'badge-warn', surfaceBg: 'var(--warn-soft)', surfaceBorder: 'rgba(154, 106, 22, 0.30)' };
}

function resumenGrupo(g: AtencionGrupo): { primary: string; secondary?: string } {
  const first = g.observaciones[0];
  const extra = Math.max(0, g.observaciones.length - 1);
  const secondary = extra > 0 ? `${first.titulo} +${extra} más` : first.titulo;
  return { primary: g.fileName, secondary };
}

export function Atencion({
  onNavigate,
  onOpenFile,
}: {
  onNavigate?: (view: string) => void;
  onOpenFile?: (id: string) => void;
}) {
  // IMPORTANTE: acá no usamos fallback con mock, porque genera pendientes "ficticios".
  // En dashboard queremos reflejar sólo lo que el usuario cargó realmente.
  const { files } = loadHistory();

  const grupos = useMemo(() => getDocumentosQueRequierenAtencionPorDocumento(files), [files]);
  const gruposTop = useMemo(() => grupos.slice(0, 6), [grupos]);
  const totalDocs = grupos.length;
  const totalObs = useMemo(() => grupos.reduce((acc, g) => acc + g.observaciones.length, 0), [grupos]);
  const hayMas = totalDocs > 6;

  const [openDocId, setOpenDocId] = useState<string | null>(null);
  const openGrupo = useMemo(() => grupos.find((g) => g.itemId === openDocId) ?? null, [grupos, openDocId]);

  return (
    <section className="panel" style={{ padding: 24 }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 800, fontSize: 15, lineHeight: 1.25, color: 'var(--text)' }}>
          Documentos que requieren atención
        </div>
        <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.45 }}>
          {totalObs === 0 ? 'Resolvé estos pendientes para evitar demoras en tus cobros' : `${totalObs} observaciones en ${totalDocs} documentos`}
        </div>
      </div>
      <div>
        {gruposTop.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <CircleCheck className="h-12 w-12 text-primary mb-3" />
            <p className="text-sm font-medium">Todo en orden</p>
            <p className="text-xs text-muted-foreground mt-1">No hay pendientes para resolver.</p>
          </div>
        ) : (
          <div
            className="panel"
            style={{
              padding: 12,
              background: 'var(--bg-sunken)',
              maxHeight: 320,
              overflow: 'auto',
              overflowX: 'hidden',
            }}
          >
            <div style={{ display: 'grid', gap: 8 }}>
              {gruposTop.map((g) => {
                const { Icon, className } = groupIcon(g);
                const { primary, secondary } = resumenGrupo(g);
                const tone = groupTone(g);
                const cant = g.observaciones.length;
                return (
                  <div
                    key={g.itemId}
                    className="panel"
                    data-att-row
                    style={{
                      padding: 12,
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                      borderColor: tone.surfaceBorder,
                      background: 'var(--bg-panel)',
                    }}
                  >
                    <div
                      aria-hidden
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        border: `1px solid ${tone.surfaceBorder}`,
                        background: tone.surfaceBg,
                        display: 'grid',
                        placeItems: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Icon className={`h-4 w-4 ${className}`} />
                    </div>

                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--text)', lineHeight: 1.25 }} className="line-clamp-1">
                        {primary}
                      </div>
                      <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.35 }} className="line-clamp-2">
                        {secondary}
                      </div>
                      <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span className={`badge ${tone.badgeClass}`}>
                          <span className="badge-dot" />
                          {cant} {cant === 1 ? 'observación' : 'observaciones'}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-soft)' }}>{g.fechaRelativa}</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }} data-att-actions>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ justifyContent: 'flex-start', paddingInline: 10, color: 'var(--accent)' }}
                        onClick={() => setOpenDocId(g.itemId)}
                      >
                        Ver detalle <span aria-hidden>→</span>
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm"
                        style={{ justifyContent: 'center', paddingInline: 10 }}
                        onClick={() => {
                          onNavigate?.('documents');
                          onOpenFile?.(g.itemId);
                        }}
                      >
                        Abrir
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      {hayMas && (
        <div style={{ marginTop: 12, display: 'flex' }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ marginLeft: 'auto', color: 'var(--accent)' }}
            onClick={() => onNavigate?.('documents')}
          >
            Ver documentos ({totalDocs}) <span aria-hidden>→</span>
          </button>
        </div>
      )}

      {openGrupo ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpenDocId(null);
          }}
        >
          <div className="modal-card" style={{ maxWidth: 620 }}>
            <div className="modal-head">
              <div>
                <div style={{ fontWeight: 800, fontSize: 15 }}>Observaciones a revisar</div>
                <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{openGrupo.fileName}</span> ·{' '}
                  <b className="tabular">{openGrupo.observaciones.length}</b>{' '}
                  {openGrupo.observaciones.length === 1 ? 'observación' : 'observaciones'}
                </div>
              </div>

              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpenDocId(null)}>
                Cerrar
              </button>
            </div>

            <div className="modal-body" style={{ background: 'var(--bg-sunken)' }}>
              <div style={{ maxHeight: 380, overflow: 'auto', padding: 4, display: 'grid', gap: 10 }}>
                {openGrupo.observaciones.map((o) => {
                  const { Icon, className } = ICONOS[o.tipo];
                  const tone = itemTone(o.tipo);
                  return (
                    <div
                      key={o.id}
                      className="panel"
                      style={{
                        padding: 12,
                        background: 'var(--bg-panel)',
                        borderColor: tone.surfaceBorder,
                      }}
                    >
                      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <div
                          aria-hidden
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 8,
                            border: `1px solid ${tone.surfaceBorder}`,
                            background: tone.surfaceBg,
                            display: 'grid',
                            placeItems: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <Icon className={`h-4 w-4 ${className}`} />
                        </div>

                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                            <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--text)', lineHeight: 1.25 }}>
                              {o.titulo}
                            </div>
                            <span className={`badge ${tone.badgeClass}`} style={{ flexShrink: 0 }}>
                              <span className="badge-dot" />
                              {o.tipo === 'error'
                                ? 'Error'
                                : o.tipo === 'warning'
                                  ? 'Advertencia'
                                  : o.tipo === 'autorizacion'
                                    ? 'Autorización'
                                    : 'Plazo'}
                            </span>
                          </div>
                          <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45 }}>
                            {o.descripcion}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    const id = openGrupo.itemId;
                    setOpenDocId(null);
                    onNavigate?.('documents');
                    onOpenFile?.(id);
                  }}
                >
                  Abrir revisión
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

