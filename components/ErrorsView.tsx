'use client';

import { useMemo, useState } from 'react';
import { Icon } from './Icon';
import { requiresAuthorization } from '@/lib/authz';
import type { AuthState, FileEntry, Severity } from '@/lib/types';

type FilterKey = 'all' | 'error' | 'warn';

interface Props {
  files: FileEntry[];
  authStates?: Record<string, AuthState | undefined>;
  onOpenFile: (id: string) => void;
}

interface Finding {
  severity: Severity;
  title: string;
  body: string;
  action?: string;
}

interface FileGroup {
  fileId: string;
  fileName: string;
  fileDate: string;
  prepaga: string;
  codigo: string | null;
  findings: Finding[];
  hasError: boolean;
  hasWarn: boolean;
}

export function ErrorsView({ files, authStates, onOpenFile }: Props) {
  const [filter, setFilter] = useState<FilterKey>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const groups: FileGroup[] = useMemo(() => {
    const result: FileGroup[] = [];
    for (const f of files) {
      if (!f.analysis) continue;

      const findings: Finding[] = [];

      const auth = requiresAuthorization(f.analysis);
      const status = authStates?.[f.id]?.status;
      const userOverride = status === 'checked' || status === 'skipped';
      if (auth.required && !userOverride) {
        findings.push({
          severity: 'warn',
          title: 'Falta autorización previa',
          body: 'Cargá el bono para evitar rechazos. Si no aplica, marcá “En este caso no hace falta” en la revisión.',
          action: 'Abrir en revisión y definir el estado de la autorización.',
        });
      }

      for (const finding of f.analysis.findings) {
        if (finding.severity === 'ok') continue;
        findings.push({
          severity: finding.severity,
          title: finding.title,
          body: finding.body,
          action: finding.action,
        });
      }

      if (findings.length > 0) {
        result.push({
          fileId: f.id,
          fileName: f.name,
          fileDate: f.addedAt,
          prepaga: f.analysis.detected.prepagas[0] || '—',
          codigo: f.analysis.detected.codes[0] || null,
          findings,
          hasError: findings.some((fi) => fi.severity === 'error'),
          hasWarn: findings.some((fi) => fi.severity === 'warn'),
        });
      }
    }
    return result;
  }, [files, authStates]);

  const allFindingsCount = groups.reduce((s, g) => s + g.findings.length, 0);
  const errorCount = groups.reduce((s, g) => s + g.findings.filter((f) => f.severity === 'error').length, 0);
  const warnCount = groups.reduce((s, g) => s + g.findings.filter((f) => f.severity === 'warn').length, 0);

  const filteredGroups = useMemo(() => {
    if (filter === 'all') return groups;
    if (filter === 'error') return groups.filter((g) => g.hasError);
    return groups.filter((g) => g.hasWarn);
  }, [groups, filter]);

  const filesAnalyzed = files.filter((f) => f.analysis).length;
  const filesWithIssues = groups.length;
  const statsAllZero = filesAnalyzed === 0 && filesWithIssues === 0;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Qué conviene revisar</h1>
          <p className="page-subtitle">
            Documentos con observaciones, agrupados para revisión rápida.
          </p>
        </div>
      </div>

      {statsAllZero ? (
        <div className="stats-empty">
          Todavía no analizaste documentos. Cuando lo hagas, vas a ver un resumen acá.
        </div>
      ) : (
        <div className="stats">
          <div className="stat">
            <div className="stat-label">Documentos analizados</div>
            <div className="stat-value">{filesAnalyzed}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Con observaciones</div>
            <div className="stat-value error">{filesWithIssues}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Errores</div>
            <div className="stat-value error">{errorCount}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Advertencias</div>
            <div className="stat-value warn">{warnCount}</div>
          </div>
        </div>
      )}

      <div className="errors-toolbar">
        <div
          className={`filter-chip ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          Todos <span className="count">{filteredGroups.length}</span>
        </div>
        <div
          className={`filter-chip ${filter === 'error' ? 'active' : ''}`}
          onClick={() => setFilter('error')}
        >
          Con errores <span className="count">{groups.filter((g) => g.hasError).length}</span>
        </div>
        <div
          className={`filter-chip ${filter === 'warn' ? 'active' : ''}`}
          onClick={() => setFilter('warn')}
        >
          Con advertencias <span className="count">{groups.filter((g) => g.hasWarn).length}</span>
        </div>
      </div>

      {filteredGroups.length === 0 ? (
        <div className="panel empty">
          <div className="empty-icon">
            <Icon name="empty" size={48} />
          </div>
          <div className="empty-title">
            {allFindingsCount === 0
              ? 'Todavía no hay hallazgos para mostrar'
              : 'No hay documentos con el filtro elegido'}
          </div>
          <div>
            {allFindingsCount === 0
              ? 'Cuando agregues un documento en «Agregar documentos», los puntos a revisar van a aparecer acá.'
              : 'Podés probar con otro filtro o volver a «Todos».'}
          </div>
        </div>
      ) : (
        <div className="errors-card-list">
          {filteredGroups.map((g) => {
            const isOpen = expandedId === g.fileId;
            const errors = g.findings.filter((f) => f.severity === 'error');
            const warns = g.findings.filter((f) => f.severity === 'warn');

            return (
              <div key={g.fileId} className="errors-card-item">
                <button
                  type="button"
                  className="errors-card-row"
                  onClick={() => setExpandedId(isOpen ? null : g.fileId)}
                >
                  <span
                    className={`errors-card-row__dot ${g.hasError ? 'errors-card-row__dot--error' : 'errors-card-row__dot--warn'}`}
                    aria-hidden
                  />
                  <span className="errors-card-row__main">
                    <span className="errors-card-row__file">{g.fileName}</span>
                    <span className="errors-card-row__meta">
                      {g.prepaga}
                      {g.codigo ? ` · ${g.codigo}` : ''}
                      {' · '}
                      {new Date(g.fileDate).toLocaleDateString('es-AR')}
                    </span>
                  </span>
                  <span className="errors-card-row__badges">
                    {errors.length > 0 && (
                      <span className="badge badge-error" style={{ fontSize: 11 }}>
                        <span className="badge-dot" />
                        {errors.length} error{errors.length > 1 ? 'es' : ''}
                      </span>
                    )}
                    {warns.length > 0 && (
                      <span className="badge badge-warn" style={{ fontSize: 11 }}>
                        <span className="badge-dot" />
                        {warns.length} advertencia{warns.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </span>
                  <span
                    className={`errors-card-row__chevron${isOpen ? ' errors-card-row__chevron--open' : ''}`}
                    aria-hidden
                  >
                    ▼
                  </span>
                </button>

                {isOpen && (
                  <div className="errors-card-detail">
                    {errors.length > 0 && (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--error)', marginBottom: 4 }}>Errores</div>
                        {errors.map((e, i) => (
                          <div key={i} style={{ padding: '6px 0', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                            <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--error)' }}>{e.title}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{e.action || e.body}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    {warns.length > 0 && (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--warn)', marginBottom: 4 }}>Advertencias</div>
                        {warns.map((w, i) => (
                          <div key={i} style={{ padding: '6px 0', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                            <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--warn)' }}>{w.title}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{w.action || w.body}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => onOpenFile(g.fileId)}
                    >
                      Abrir en revisión
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
