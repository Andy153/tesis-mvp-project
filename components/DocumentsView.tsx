'use client';

import { useEffect, useMemo, useState } from 'react';
import { Icon } from './Icon';
import type { FileEntry } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { getEstadoEfectivo, loadHistory, type HistoryItem } from '@/lib/history';

type FilterKey = 'all' | 'error' | 'warn' | 'ok';

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
}: {
  files: FileEntry[];
  onOpenFile: (id: string) => void;
}) {
  const [filter, setFilter] = useState<FilterKey>('all');
  const [q, setQ] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [localFiles, setLocalFiles] = useState<FileEntry[]>(files);

  useEffect(() => {
    // Keep in sync with parent-provided list (upload view mutates this).
    setLocalFiles(files);
  }, [files]);

  useEffect(() => {
    const data = loadHistory();
    setLocalFiles(data.files as unknown as FileEntry[]);
  }, [refreshKey]);

  const ready = useMemo(() => localFiles.filter((f) => f.status !== 'analyzing'), [localFiles]);

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
                const prepaga = a?.detected?.prepagas?.[0] || '—';
                const codigo = a?.detected?.codes?.[0] || null;
                const itemAsHistory = f as unknown as HistoryItem;
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
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button className="btn btn-sm btn-ghost" onClick={() => onOpenFile(f.id)}>
                          Abrir revisión
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

