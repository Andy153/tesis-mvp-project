'use client';

import { useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';
import { extractText, analyzeDocument } from '@/lib/analyzer';
import { crossCheck, extractStructured, requiresAuthorization } from '@/lib/authz';
import { TRAZA_NOMENCLADOR_FULL } from '@/lib/nomenclador.js';
import type { AuthState, FileEntry, Finding, Span, Thumbnail } from '@/lib/types';

const NOMEN_FOR_EXTRACT = TRAZA_NOMENCLADOR_FULL as Record<string, { entries?: Array<{ desc: string }> }>;

interface Props {
  files: FileEntry[];
  onAddFile: (entry: FileEntry) => void;
  onRemoveFile: (id: string) => void;
  onSelectFile: (id: string | null) => void;
  selectedFileId: string | null;
  authStates: Record<string, AuthState | undefined>;
  onAuthDecision: (fileId: string, state: AuthState) => void;
  onAuthUpload: (fileId: string, state: AuthState) => void;
  onAuthReset: (fileId: string) => void;
}

const ACCEPT = 'application/pdf,image/png,image/jpeg,image/jpg,image/webp';

export function UploadView({
  files,
  onAddFile,
  onRemoveFile,
  onSelectFile,
  selectedFileId,
  authStates,
  onAuthDecision,
  onAuthUpload,
  onAuthReset,
}: Props) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function handleFiles(fileList: File[]) {
    for (const file of fileList) {
      const id = 'f_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
      const entry: FileEntry = {
        id,
        name: file.name,
        size: file.size,
        type: file.type,
        addedAt: new Date().toISOString(),
        status: 'analyzing',
        progress: 0,
        progressMessage: 'Iniciando...',
      };
      onAddFile(entry);

      try {
        const { text, thumbnails, method, ocrWords } = await extractText(file, (p) => {
          onAddFile({ ...entry, progress: p.progress, progressMessage: p.message });
        });

        const analysis = analyzeDocument(text, file.name, ocrWords);

        onAddFile({
          ...entry,
          status: 'analyzed',
          progress: 1,
          text,
          thumbnails,
          method,
          ocrWords,
          analysis,
        });
      } catch (err: unknown) {
        console.error(err);
        onAddFile({
          ...entry,
          status: 'error',
          errorMessage: err instanceof Error ? err.message : 'Error procesando archivo',
        });
      }
    }
  }

  const selected = files.find((f) => f.id === selectedFileId);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Cargar documentos</h1>
          <p className="page-subtitle">
            Subí parte quirúrgico, autorizaciones u otra documentación. Trazá detecta automáticamente errores
            comunes antes de que presentes.
          </p>
        </div>
        {files.length > 0 && (
          <button type="button" className="btn" onClick={() => inputRef.current?.click()}>
            <Icon name="upload" size={14} /> Subir más
          </button>
        )}
      </div>

      {files.length === 0 && (
        <div
          className={`upload-zone ${drag ? 'drag' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            handleFiles(Array.from(e.dataTransfer.files));
          }}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
          }}
          role="button"
          tabIndex={0}
        >
          <div className="upload-icon">
            <Icon name="upload" size={48} />
          </div>
          <div className="upload-title">Arrastrá archivos acá o hacé click para subir</div>
          <div className="upload-hint">
            Trazá analiza cada documento y detecta errores antes de que presentes
          </div>
          <div className="upload-formats">
            <span className="fmt">PDF</span>
            <span className="fmt">PNG</span>
            <span className="fmt">JPG</span>
            <span className="fmt">JPEG</span>
            <span className="fmt">WEBP</span>
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        style={{ display: 'none' }}
        onChange={(e) => e.target.files && handleFiles(Array.from(e.target.files))}
      />

      {files.length > 0 && (
        <div className="file-list">
          {files.map((f) => (
            <FileRow
              key={f.id}
              file={f}
              onClick={() => onSelectFile(f.id)}
              onRemove={() => onRemoveFile(f.id)}
              isSelected={f.id === selectedFileId}
            />
          ))}
        </div>
      )}

      {selected && selected.status === 'analyzed' && selected.analysis && (
        <>
          <AuthorizationCard
            parteFile={selected}
            authState={authStates[selected.id]}
            onDecision={(st) => onAuthDecision(selected.id, st)}
            onUploadBono={(st) => onAuthUpload(selected.id, st)}
            onReset={() => onAuthReset(selected.id)}
          />
          <AnalysisDetail file={selected} />
        </>
      )}
    </div>
  );
}

function FileRow({
  file,
  onClick,
  onRemove,
  isSelected,
}: {
  file: FileEntry;
  onClick: () => void;
  onRemove: () => void;
  isSelected: boolean;
}) {
  const ext = file.name.split('.').pop()?.toUpperCase() || '';
  const size = (file.size / 1024).toFixed(0) + ' KB';
  return (
    <div className={`file-row ${isSelected ? 'open' : ''}`} onClick={onClick}>
      <div className="file-thumb">
        {file.thumbnails?.[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={file.thumbnails[0].dataUrl} alt="" />
        ) : (
          ext
        )}
      </div>
      <div className="file-main">
        <div className="file-name">{file.name}</div>
        <div className="file-meta">
          {size} ·{' '}
          {new Date(file.addedAt).toLocaleString('es-AR', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })}
          {file.method && <> · {file.method === 'ocr' ? 'OCR aplicado' : 'texto PDF'}</>}
        </div>
        {file.status === 'analyzing' && (
          <div
            style={{
              marginTop: 6,
              fontSize: 11.5,
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span className="spinner" />
            {file.progressMessage}
            <div className="progress-bar" style={{ flex: 1, maxWidth: 180 }}>
              <div className="progress-fill" style={{ width: `${(file.progress || 0) * 100}%` }} />
            </div>
          </div>
        )}
      </div>
      <div className="file-status">
        {file.status === 'analyzing' && (
          <span className="badge badge-neutral">
            <span className="badge-dot" />
            Analizando
          </span>
        )}
        {file.status === 'analyzed' && file.analysis?.overall === 'ok' && (
          <span className="badge badge-ok">
            <span className="badge-dot" />
            Sin errores
          </span>
        )}
        {file.status === 'analyzed' && file.analysis?.overall === 'warn' && (
          <span className="badge badge-warn">
            <span className="badge-dot" />
            {file.analysis.summary.warn} advertencia{file.analysis.summary.warn > 1 ? 's' : ''}
          </span>
        )}
        {file.status === 'analyzed' && file.analysis?.overall === 'error' && (
          <span className="badge badge-error">
            <span className="badge-dot" />
            {file.analysis.summary.error} error{file.analysis.summary.error > 1 ? 'es' : ''}
          </span>
        )}
        {file.status === 'error' && (
          <span className="badge badge-error">
            <span className="badge-dot" />
            Falló
          </span>
        )}
      </div>
      <button
        type="button"
        className="btn btn-sm btn-ghost"
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
      >
        <Icon name="eye" size={12} /> Ver
      </button>
      <button
        type="button"
        className="btn btn-sm btn-danger"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        aria-label="Eliminar archivo"
      >
        <Icon name="trash" size={12} />
      </button>
    </div>
  );
}

function AuthorizationCard({
  parteFile,
  authState,
  onDecision,
  onUploadBono,
  onReset,
}: {
  parteFile: FileEntry;
  authState: AuthState | undefined;
  onDecision: (state: AuthState) => void;
  onUploadBono: (state: AuthState) => void;
  onReset: () => void;
}) {
  const [drag, setDrag] = useState(false);
  const authInputRef = useRef<HTMLInputElement | null>(null);

  const authRule = useMemo(
    () => requiresAuthorization(parteFile.analysis),
    [parteFile.analysis],
  );

  if (!authRule.required && !authState) return null;

  if (!authState) {
    const confidenceLabel =
      authRule.confidence === 'high' ? 'muy probable' : authRule.confidence === 'medium' ? 'probable' : 'posible';
    return (
      <div className="auth-card">
        <div className="auth-card-head">
          <div className="auth-card-icon">
            <Icon name="alert" size={18} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="auth-card-title">
              ¿Este procedimiento tiene autorización previa?
              <span className="auth-card-confidence">{confidenceLabel}</span>
            </div>
            <div className="auth-card-reason">{authRule.reason}</div>
          </div>
        </div>
        <div className="auth-actions">
          <button type="button" className="auth-btn primary" onClick={() => onDecision({ status: 'uploading' })}>
            <Icon name="upload" size={13} /> Sí, subir el bono
          </button>
          <button type="button" className="auth-btn" onClick={() => onDecision({ status: 'missing' })}>
            No la tengo todavía
          </button>
          <button type="button" className="auth-btn" onClick={() => onDecision({ status: 'skipped' })}>
            No la requiere
          </button>
        </div>
      </div>
    );
  }

  if (authState.status === 'uploading') {
    async function handleAuthFile(file: File | undefined) {
      if (!file) return;
      onDecision({ status: 'processing', fileName: file.name });
      try {
        const { text } = await extractText(file, () => {});
        const bonoData = extractStructured(text, NOMEN_FOR_EXTRACT);
        const parteData = extractStructured(parteFile.text || '', NOMEN_FOR_EXTRACT);
        const cross = crossCheck(parteData, bonoData);
        onUploadBono({
          status: 'checked',
          fileName: file.name,
          bonoText: text,
          bonoData,
          parteData,
          crossCheck: cross,
        });
      } catch (err: unknown) {
        console.error(err);
        onUploadBono({
          status: 'error',
          fileName: file.name,
          errorMessage: err instanceof Error ? err.message : 'No se pudo leer el archivo.',
        });
      }
    }
    return (
      <div className="auth-card">
        <button type="button" className="auth-reset" onClick={onReset}>
          ← Cambiar
        </button>
        <div className="auth-card-head">
          <div className="auth-card-icon">
            <Icon name="upload" size={18} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="auth-card-title">Subí el bono de autorización</div>
            <div className="auth-card-reason">
              Trazá va a cruzar los datos con el parte quirúrgico: DNI, afiliado, código, fechas.
            </div>
          </div>
        </div>
        <div
          className={`auth-upload ${drag ? 'drag' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            if (e.dataTransfer.files[0]) void handleAuthFile(e.dataTransfer.files[0]);
          }}
          onClick={() => authInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') authInputRef.current?.click();
          }}
        >
          <div className="auth-upload-title">Arrastrá el bono acá o hacé click</div>
          <div className="auth-upload-hint">PDF, PNG, JPG · Trazá lo lee y lo contrasta con el parte</div>
        </div>
        <input
          ref={authInputRef}
          type="file"
          accept={ACCEPT}
          style={{ display: 'none' }}
          onChange={(e) => void handleAuthFile(e.target.files?.[0])}
        />
      </div>
    );
  }

  if (authState.status === 'processing') {
    return (
      <div className="auth-card">
        <div className="auth-card-head">
          <div className="auth-card-icon">
            <Icon name="upload" size={18} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="auth-card-title">Analizando bono de autorización…</div>
            <div className="auth-card-reason">{authState.fileName}</div>
          </div>
        </div>
        <div className="auth-upload-processing">
          <span className="spinner" />
          Leyendo y cruzando datos con el parte quirúrgico
        </div>
      </div>
    );
  }

  if (authState.status === 'missing') {
    return (
      <div className="auth-card">
        <button type="button" className="auth-reset" onClick={onReset}>
          ← Cambiar
        </button>
        <div className="auth-card-head">
          <div className="auth-card-icon" style={{ background: 'var(--error)' }}>
            <Icon name="x" size={18} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="auth-card-title">Falta el bono de autorización</div>
            <div className="auth-card-reason">
              Sin autorización, la prepaga va a rechazar la facturación. Tramitala antes de presentar la liquidación.
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (authState.status === 'skipped') {
    return (
      <div className="auth-card resolved-skip">
        <button type="button" className="auth-reset" onClick={onReset}>
          ← Cambiar
        </button>
        <div className="auth-card-head">
          <div className="auth-card-icon">
            <Icon name="info" size={18} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="auth-card-title">Autorización no aplica</div>
            <div className="auth-card-reason">Marcaste que este procedimiento no requiere autorización previa.</div>
          </div>
        </div>
      </div>
    );
  }

  if (authState.status === 'error') {
    return (
      <div className="auth-card">
        <button type="button" className="auth-reset" onClick={onReset}>
          ← Reintentar
        </button>
        <div className="auth-card-head">
          <div className="auth-card-icon" style={{ background: 'var(--error)' }}>
            <Icon name="x" size={18} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="auth-card-title">Error al procesar el bono</div>
            <div className="auth-card-reason">{authState.errorMessage || 'No se pudo leer el archivo.'}</div>
          </div>
        </div>
      </div>
    );
  }

  if (authState.status === 'checked') {
    const xc = authState.crossCheck || [];
    const summary = {
      ok: xc.filter((f) => f.severity === 'ok').length,
      warn: xc.filter((f) => f.severity === 'warn').length,
      error: xc.filter((f) => f.severity === 'error').length,
    };
    const overall = summary.error > 0 ? 'error' : summary.warn > 0 ? 'warn' : 'ok';
    const cardClass = overall === 'ok' ? 'resolved' : '';
    const iconBg = overall === 'ok' ? 'var(--ok)' : overall === 'error' ? 'var(--error)' : 'var(--warn)';
    const iconName = overall === 'ok' ? 'check' : overall === 'error' ? 'x' : 'alert';
    const titleText =
      overall === 'ok'
        ? 'Bono validado: todos los datos coinciden'
        : overall === 'error'
          ? 'Problemas graves en el bono de autorización'
          : 'Bono cargado con observaciones';

    return (
      <div className={`auth-card ${cardClass}`}>
        <button type="button" className="auth-reset" onClick={onReset}>
          ← Cambiar
        </button>
        <div className="auth-card-head">
          <div className="auth-card-icon" style={{ background: iconBg }}>
            <Icon name={iconName} size={18} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="auth-card-title">{titleText}</div>
            <div className="auth-card-reason">
              Bono: <b>{authState.fileName}</b>
            </div>
          </div>
        </div>
        <div className="auth-summary">
          <div className="auth-summary-cell ok">
            <div className="n">{summary.ok}</div>
            <div className="l">OK</div>
          </div>
          <div className="auth-summary-cell warn">
            <div className="n">{summary.warn}</div>
            <div className="l">Obs.</div>
          </div>
          <div className="auth-summary-cell err">
            <div className="n">{summary.error}</div>
            <div className="l">Errores</div>
          </div>
        </div>
        <div className="auth-crosscheck">
          <div className="auth-crosscheck-head">
            <Icon name="target" size={11} /> Cruce de datos
          </div>
          {xc.map((f, i) => (
            <div key={i} className="auth-xc-item">
              <div className={`auth-xc-icon sev-${f.severity}`}>
                <Icon name={f.severity === 'ok' ? 'check' : 'x'} size={11} />
              </div>
              <div className="auth-xc-content">
                <div className="auth-xc-title">{f.title}</div>
                <div className="auth-xc-body">{f.body}</div>
                {f.action && <div className="auth-xc-action">→ {f.action}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}

function AmbiguitySelector({
  finding,
  selected,
  onSelect,
}: {
  finding: Finding;
  selected: { idx: number; code: string; desc: string } | undefined;
  onSelect: (choice: { idx: number; code: string; desc: string }) => void;
}) {
  const options = finding.ambiguous?.options || [];
  return (
    <div className="ambig-box">
      <div className="ambig-header">
        <Icon name="info" size={12} />
        Elegí cuál práctica corresponde
      </div>
      {options.map((opt, i) => {
        const isSelected = selected?.idx === i;
        const scorePct = Math.round(opt.score * 100);
        return (
          <div
            key={i}
            className={`ambig-option ${isSelected ? 'selected' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              onSelect({ idx: i, code: opt.code, desc: opt.desc });
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                onSelect({ idx: i, code: opt.code, desc: opt.desc });
              }
            }}
            role="button"
            tabIndex={0}
          >
            <div className="ambig-radio" />
            <div className="ambig-content">
              <div className="ambig-code">
                {opt.code} · {opt.specialty}
              </div>
              <div className="ambig-desc">{opt.desc}</div>
              {scorePct > 0 && (
                <div className={`ambig-score ${scorePct >= 60 ? 'high' : ''}`}>
                  Coincidencia con texto: {scorePct}%
                </div>
              )}
            </div>
          </div>
        );
      })}
      {selected && (
        <div className="ambig-confirmed">
          <Icon name="check" size={14} />
          <div>
            <b>Confirmado:</b> {selected.code} — {selected.desc}
          </div>
        </div>
      )}
    </div>
  );
}

function AnalysisDetail({ file }: { file: FileEntry }) {
  const [activeFindingIdx, setActiveFindingIdx] = useState<number | null>(null);
  const [selections, setSelections] = useState<Record<string, { idx: number; code: string; desc: string }>>({});
  const analysis = file.analysis!;
  const thumbnails = file.thumbnails || [];

  const sorted = [...analysis.findings].sort((a, b) => {
    const order: Record<string, number> = { error: 0, warn: 1, ok: 2, info: 3 };
    return order[a.severity] - order[b.severity];
  });

  const activeFinding = activeFindingIdx !== null ? sorted[activeFindingIdx] : null;
  const activeSpans = activeFinding?.spans || [];

  const spansByPage: Record<number, Array<Span & { severity: string }>> = {};
  for (const f of sorted) {
    if (!f.spans) continue;
    if (f.severity === 'ok') continue;
    for (const s of f.spans) {
      (spansByPage[s.page] = spansByPage[s.page] || []).push({ ...s, severity: f.severity });
    }
  }

  return (
    <div className="analysis-detail">
      <div className="panel doc-preview">
        <div className="doc-preview-head">
          <div style={{ fontWeight: 600, fontSize: 13 }}>{file.name}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-soft)', fontFamily: 'var(--font-mono)' }}>
            {file.method === 'ocr' ? 'OCR · español' : 'PDF · texto embebido'}
          </div>
        </div>
        <div className="doc-preview-body">
          {thumbnails.map((thumb, i) => (
            <DocPage
              key={i}
              thumb={thumb}
              pageIdx={i}
              spans={spansByPage[i] || []}
              activeSpanBboxes={activeSpans.filter((s) => s.page === i).map((s) => s.bbox)}
              showPageNum={thumbnails.length > 1}
            />
          ))}
          {!thumbnails.length && (
            <div style={{ padding: 20, color: 'var(--text-soft)', fontSize: 12 }}>Sin preview disponible</div>
          )}
        </div>
        <div className="doc-preview-legend">
          <span className="legend-swatch err" /> Error
          <span className="legend-swatch warn" /> Advertencia
          <span style={{ color: 'var(--text-soft)', marginLeft: 'auto' }}>Click un hallazgo para resaltar</span>
        </div>
      </div>

      <div className="panel analysis-result">
        <div className="analysis-head">
          <h3>Resultado del análisis</h3>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            {analysis.detected.prepagas.length > 0 && (
              <>
                Prepaga: <b>{analysis.detected.prepagas.join(', ')}</b> ·{' '}
              </>
            )}
            {analysis.detected.codes.length > 0 ? (
              <>
                Código detectado:{' '}
                <code style={{ fontFamily: 'var(--font-mono)' }}>{analysis.detected.codes.join(', ')}</code>
              </>
            ) : (
              <span style={{ color: 'var(--text-soft)' }}>Sin código detectado</span>
            )}
          </div>
        </div>
        <div className="analysis-body">
          <div className="analysis-summary">
            <div className="summary-cell err">
              <div className="n">{analysis.summary.error}</div>
              <div className="l">Errores</div>
            </div>
            <div className="summary-cell warn">
              <div className="n">{analysis.summary.warn}</div>
              <div className="l">Advertencias</div>
            </div>
            <div className="summary-cell ok">
              <div className="n">{analysis.summary.ok}</div>
              <div className="l">OK</div>
            </div>
          </div>

          {sorted.map((f, i) => (
            <div
              key={i}
              className={`finding sev-${f.severity} ${activeFindingIdx === i ? 'active' : ''} ${
                f.spans?.length ? 'clickable' : ''
              }`}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('.ambig-box')) return;
                if (f.spans?.length) setActiveFindingIdx(activeFindingIdx === i ? null : i);
              }}
            >
              <div className="finding-head">
                <span className="finding-title">{f.title}</span>
                {f.spans && f.spans.length > 0 && (
                  <span className="finding-loc">
                    <Icon name="target" size={11} /> en documento
                  </span>
                )}
              </div>
              <div className="finding-body">{f.body}</div>
              {f.suggestion && !f.ambiguous && (
                <div className="suggestion">
                  <div className="suggestion-label">
                    <Icon name="sparkles" size={12} /> Sugerencia de Trazá
                  </div>
                  <div className="suggestion-card">
                    <div className="suggestion-code">{f.suggestion.code}</div>
                    <div className="suggestion-desc">{f.suggestion.desc}</div>
                  </div>
                  <div className="suggestion-note">
                    Detectamos el procedimiento en el texto. Este es el código de nomenclador que corresponde.
                  </div>
                </div>
              )}
              {f.ambiguous && (
                <AmbiguitySelector
                  finding={f}
                  selected={selections[f.code]}
                  onSelect={(choice) => setSelections((prev) => ({ ...prev, [f.code]: choice }))}
                />
              )}
              {f.action && !f.suggestion && !f.ambiguous && <div className="finding-action">→ {f.action}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DocPage({
  thumb,
  pageIdx,
  spans,
  activeSpanBboxes,
  showPageNum,
}: {
  thumb: Thumbnail;
  pageIdx: number;
  spans: Array<{ bbox: { x0: number; y0: number; x1: number; y1: number }; severity: string }>;
  activeSpanBboxes: Array<{ x0: number; y0: number; x1: number; y1: number }>;
  showPageNum: boolean;
}) {
  const hasActive = activeSpanBboxes.length > 0;
  return (
    <div className="doc-page-wrap">
      <div className="doc-page" style={{ aspectRatio: `${thumb.width} / ${thumb.height}` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={thumb.dataUrl} alt={`página ${pageIdx + 1}`} />
        <svg
          className="doc-overlay"
          viewBox={`0 0 ${thumb.width} ${thumb.height}`}
          preserveAspectRatio="none"
        >
          {spans.map((s, i) => {
            const { x0, y0, x1, y1 } = s.bbox;
            const isActive = activeSpanBboxes.some((b) => b.x0 === x0 && b.y0 === y0);
            const dim = hasActive && !isActive;
            return (
              <rect
                key={i}
                x={x0 - 4}
                y={y0 - 4}
                width={x1 - x0 + 8}
                height={y1 - y0 + 8}
                className={`highlight-rect sev-${s.severity} ${isActive ? 'active' : ''} ${dim ? 'dim' : ''}`}
                rx={3}
              />
            );
          })}
        </svg>
      </div>
      {showPageNum && <div className="doc-page-num">Pág {pageIdx + 1}</div>}
    </div>
  );
}
