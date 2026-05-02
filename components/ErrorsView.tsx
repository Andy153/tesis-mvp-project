'use client';

import { useState } from 'react';
import { Icon } from './Icon';
import { requiresAuthorization } from '@/lib/authz';
import type { AuthState, FileEntry, Severity } from '@/lib/types';

type FilterKey = 'all' | 'error' | 'warn';

interface Props {
  files: FileEntry[];
  authStates?: Record<string, AuthState | undefined>;
  onOpenFile: (id: string) => void;
}

interface FlatError {
  severity: Severity;
  title: string;
  body: string;
  action?: string;
  fileId: string;
  fileName: string;
  fileDate: string;
  prepaga: string;
  codigo: string | null;
}

export function ErrorsView({ files, authStates, onOpenFile }: Props) {
  const [filter, setFilter] = useState<FilterKey>('all');

  const allErrors: FlatError[] = [];
  for (const f of files) {
    if (!f.analysis) continue;

    // Synthetic warning: authorization missing but required.
    const auth = requiresAuthorization(f.analysis);
    const status = authStates?.[f.id]?.status;
    const userOverride = status === 'checked' || status === 'skipped';
    if (auth.required && !userOverride) {
      allErrors.push({
        severity: 'warn',
        title: 'Falta autorización previa',
        body: 'Cargá el bono para evitar rechazos. Si no aplica, marcá “En este caso no hace falta” en la revisión.',
        action: 'Abrir en revisión y definir el estado de la autorización.',
        fileId: f.id,
        fileName: f.name,
        fileDate: f.addedAt,
        prepaga: f.analysis.detected.prepagas[0] || '—',
        codigo: f.analysis.detected.codes[0] || null,
      });
    }

    for (const finding of f.analysis.findings) {
      if (finding.severity === 'ok') continue;
      allErrors.push({
        severity: finding.severity,
        title: finding.title,
        body: finding.body,
        action: finding.action,
        fileId: f.id,
        fileName: f.name,
        fileDate: f.addedAt,
        prepaga: f.analysis.detected.prepagas[0] || '—',
        codigo: f.analysis.detected.codes[0] || null,
      });
    }
  }

  const counts = {
    all: allErrors.length,
    error: allErrors.filter((e) => e.severity === 'error').length,
    warn: allErrors.filter((e) => e.severity === 'warn').length,
  };

  const filtered = filter === 'all' ? allErrors : allErrors.filter((e) => e.severity === filter);

  const filesAnalyzed = files.filter((f) => f.analysis).length;
  const filesWithErrors = files.filter((f) => f.analysis?.overall === 'error').length;
  const statsAllZero =
    filesAnalyzed === 0 && filesWithErrors === 0 && counts.error === 0 && counts.warn === 0;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Qué conviene revisar</h1>
          <p className="page-subtitle">
            Los hallazgos de todos los documentos, reunidos en un solo lugar.
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
            <div className="stat-label">Documentos ya analizados</div>
            <div className="stat-value">{filesAnalyzed}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Con observaciones graves</div>
            <div className="stat-value error">{filesWithErrors}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Observaciones graves (total)</div>
            <div className="stat-value error">{counts.error}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Advertencias (total)</div>
            <div className="stat-value warn">{counts.warn}</div>
          </div>
        </div>
      )}

      <div className="errors-toolbar">
        <div
          className={`filter-chip ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          Todos <span className="count">{counts.all}</span>
        </div>
        <div
          className={`filter-chip ${filter === 'error' ? 'active' : ''}`}
          onClick={() => setFilter('error')}
        >
          Errores <span className="count">{counts.error}</span>
        </div>
        <div
          className={`filter-chip ${filter === 'warn' ? 'active' : ''}`}
          onClick={() => setFilter('warn')}
        >
          Advertencias <span className="count">{counts.warn}</span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="panel empty">
          <div className="empty-icon">
            <Icon name="empty" size={48} />
          </div>
          <div className="empty-title">
            {allErrors.length === 0
              ? 'Todavía no hay hallazgos para mostrar'
              : 'No hay hallazgos con el filtro elegido'}
          </div>
          <div>
            {allErrors.length === 0
              ? 'Cuando agregues un documento en «Agregar documentos», los puntos a revisar van a aparecer acá.'
              : 'Podés probar con otro filtro o volver a «Todos».'}
          </div>
        </div>
      ) : (
        <div className="errors-table">
          <table>
            <thead>
              <tr>
                <th style={{ width: 80 }}>Sev.</th>
                <th>Problema</th>
                <th style={{ width: 200 }}>Archivo</th>
                <th style={{ width: 130 }}>Prepaga</th>
                <th style={{ width: 100 }}>Código</th>
                <th style={{ width: 100 }} />
              </tr>
            </thead>
            <tbody>
              {filtered.map((e, i) => (
                <tr key={i}>
                  <td>
                    {e.severity === 'error' && (
                      <span className="badge badge-error">
                        <span className="badge-dot" />
                        Error
                      </span>
                    )}
                    {e.severity === 'warn' && (
                      <span className="badge badge-warn">
                        <span className="badge-dot" />
                        Advertencia
                      </span>
                    )}
                    {e.severity === 'info' && (
                      <span className="badge badge-neutral">
                        <span className="badge-dot" />
                        Manual
                      </span>
                    )}
                  </td>
                  <td>
                    <div className="err-msg">{e.title}</div>
                    <div className="err-hint">{e.action || e.body}</div>
                  </td>
                  <td>
                    <div className="err-file">{e.fileName}</div>
                    <div className="err-hint">{new Date(e.fileDate).toLocaleDateString('es-AR')}</div>
                  </td>
                  <td>{e.prepaga}</td>
                  <td>
                    {e.codigo ? (
                      <code style={{ fontFamily: 'var(--font-mono)', fontSize: 14 }}>{e.codigo}</code>
                    ) : (
                      <span style={{ color: 'var(--text-soft)' }}>—</span>
                    )}
                  </td>
                  <td>
                    {e.prepaga === 'Swiss Medical' ? (
                      <button className="btn btn-sm btn-ghost" onClick={() => onOpenFile(e.fileId)}>
                        Abrir en revisión
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
