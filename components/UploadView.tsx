'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';
import { extractText, analyzeDocument, findSpans } from '@/lib/analyzer';
import { crossCheck, extractStructured, requiresAuthorization } from '@/lib/authz';
import { TRAZA_NOMENCLADOR_FULL } from '@/lib/nomenclador.js';
import { applyPlanillaValidationFindings } from '@/lib/swissCxExport';
import type { AuthState, FileEntry, Finding, Span, Thumbnail } from '@/lib/types';

const NOMEN_FOR_EXTRACT = TRAZA_NOMENCLADOR_FULL as Record<string, { entries?: Array<{ desc: string }> }>;
const PIPE = '[TRAZA_PIPELINE]';

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
  showVirgin?: boolean;
  onFinalizeUpload?: (args: { parteFileId: string | null; batchId: string | null }) => void;
  onCloseVisualization?: () => void;
  onEditUpload?: (parteFileId: string) => void;
}

const ACCEPT = 'application/pdf,image/png,image/jpeg,image/jpg,image/webp';

/** Si el usuario confirmó la intervención, no superponer avisos automáticos de código/procedimiento en el PDF. */
function hideProcedureAutoSpansWhenUserConfirmed(f: { code: string }): boolean {
  const c = f.code;
  return c === 'NO_CODE_SUGGEST' || c === 'CODE_MISMATCH' || c.startsWith('CODE_UNVERIFIED_') || c.startsWith('CODE_AMBIGUOUS_');
}

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
  showVirgin,
  onFinalizeUpload,
  onCloseVisualization,
  onEditUpload,
}: Props) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<null | { id: string; name: string }>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [pendingFinalize, setPendingFinalize] = useState<null | { parteFileId: string | null; batchId: string | null }>(
    null,
  );
  const [finalizeBlocked, setFinalizeBlocked] = useState<string | null>(null);
  const [finalizeStep, setFinalizeStep] = useState<'idle' | 'needsConfirm' | 'saving' | 'saved'>('idle');
  const [reanalyzeBusy, setReanalyzeBusy] = useState(false);
  const autoManualPrompted = useRef(new Set<string>());

  async function handleReanalyze(file: FileEntry) {
    if (!file.file || reanalyzeBusy) return;
    setReanalyzeBusy(true);
    const tAll0 = Date.now();
    console.log(`${PIPE} ui:reanalyze:start fileId=${file.id} name=${file.name} size=${file.size} type=${file.type}`);
    const base: FileEntry = {
      ...file,
      status: 'analyzing',
      progress: 0,
      progressMessage: 'Re-analizando...',
    };
    onAddFile(base);
    try {
      const tExtract0 = Date.now();
      const {
        text,
        thumbnails,
        method,
        ocrWords,
        pageTexts,
        aiParteExtract,
        institution_from_text,
        raw_text,
        raw_text_light,
        raw_pageTexts,
      } = await extractText(
        file.file,
        (p) => {
        onAddFile({ ...base, progress: p.progress, progressMessage: p.message });
        },
      );
      console.log(
        `${PIPE} ui:reanalyze:extract done ms=${Date.now() - tExtract0} text_len=${text.length} thumbs=${thumbnails.length} method=${method} pages=${pageTexts?.length ?? 0}`,
      );
      const tAnalyze0 = Date.now();
      const analysis = analyzeDocument(text, file.name, ocrWords, pageTexts);
      console.log(`${PIPE} ui:reanalyze:analyze done ms=${Date.now() - tAnalyze0} overall=${analysis.overall}`);
      autoManualPrompted.current.delete(file.id);
      onAddFile({
        ...file,
        status: 'analyzed',
        progress: 1,
        text,
        thumbnails,
        method,
        ocrWords,
        pageTexts,
        raw_text,
        raw_text_light,
        raw_pageTexts,
        institution_from_text,
        aiParteExtract,
        manualChecks: undefined,
        analysis,
        errorMessage: undefined,
        file: file.file,
      });
      console.log(`${PIPE} ui:reanalyze:done total_ms=${Date.now() - tAll0}`);
    } catch (err: unknown) {
      console.error(err);
      onAddFile({
        ...file,
        status: 'error',
        errorMessage: err instanceof Error ? err.message : 'Error al re-analizar',
        file: file.file,
      });
    } finally {
      setReanalyzeBusy(false);
    }
  }

  async function handleFiles(fileList: File[]) {
    const batchId = 'b_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    setActiveBatchId(batchId);
    for (const file of fileList) {
      const tAll0 = Date.now();
      const id = 'f_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
      const entry: FileEntry = {
        id,
        name: file.name,
        size: file.size,
        type: file.type,
        addedAt: new Date().toISOString(),
        batchId,
        status: 'analyzing',
        progress: 0,
        progressMessage: 'Iniciando...',
        file,
      };
      onAddFile(entry);
      console.log(`${PIPE} ui:upload:start batchId=${batchId} fileId=${id} name=${file.name} size=${file.size} type=${file.type}`);

      try {
        const tExtract0 = Date.now();
        const {
          text,
          thumbnails,
          method,
          ocrWords,
          pageTexts,
          aiParteExtract,
          institution_from_text,
          raw_text,
          raw_text_light,
          raw_pageTexts,
        } = await extractText(
          file,
          (p) => {
          onAddFile({ ...entry, progress: p.progress, progressMessage: p.message });
          },
        );
        console.log(
          `${PIPE} ui:upload:extract done ms=${Date.now() - tExtract0} text_len=${text.length} thumbs=${thumbnails.length} method=${method} pages=${pageTexts?.length ?? 0}`,
        );

        const tAnalyze0 = Date.now();
        const analysis = analyzeDocument(text, file.name, ocrWords, pageTexts);
        console.log(`${PIPE} ui:upload:analyze done ms=${Date.now() - tAnalyze0} overall=${analysis.overall}`);

        onAddFile({
          ...entry,
          status: 'analyzed',
          progress: 1,
          text,
          thumbnails,
          method,
          ocrWords,
          pageTexts,
          raw_text,
          raw_text_light,
          raw_pageTexts,
          institution_from_text,
          aiParteExtract,
          analysis,
        });
        console.log(`${PIPE} ui:upload:done total_ms=${Date.now() - tAll0}`);
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

  const isVirgin = Boolean(showVirgin);
  const selected = isVirgin ? undefined : files.find((f) => f.id === selectedFileId);
  const effectiveBatchId = isVirgin ? null : activeBatchId || selected?.batchId || files[0]?.batchId || null;
  const currentBatchFiles = effectiveBatchId ? files.filter((f) => f.batchId === effectiveBatchId) : [];
  const showEmpty = files.length === 0 || isVirgin;
  const serverFiles = selected?.exports?.swissCx?.files;
  const hasServerFiles = Boolean(serverFiles && typeof serverFiles === 'object' && (serverFiles as any).interventionId);
  const isFinalized = hasServerFiles;

  useEffect(() => {
    setFinalizeStep('idle');
    setFinalizeBlocked(null);
    setPendingFinalize(null);
  }, [selectedFileId, effectiveBatchId, isFinalized, showEmpty]);

  useEffect(() => {
    if (showVirgin || isFinalized) return;
    const sel = files.find((f) => f.id === selectedFileId);
    if (!sel || sel.status !== 'analyzed' || !sel.analysis || !sel.text) return;
    const structured = extractStructured(sel.text, NOMEN_FOR_EXTRACT);
    const required: Array<'patient' | 'procedure'> = [];
    if (structured?.paciente) required.push('patient');
    const proc =
      sel.analysis.detected.procedureGuess?.desc ||
      sel.analysis.detected.procedureGuess?.keyword ||
      (sel.analysis.detected.codes[0] ? `Código ${sel.analysis.detected.codes[0]}` : null);
    if (proc) required.push('procedure');
    if (required.length === 0) return;
    const checks = sel.manualChecks || {};
    const pending = required.some((id) => checks[id] === undefined);
    if (!pending) return;
    if (autoManualPrompted.current.has(sel.id)) return;
    autoManualPrompted.current.add(sel.id);
    setManualOpen(true);
  }, [files, selectedFileId, showVirgin, isFinalized]);

  const needsManualReview = useMemo(() => {
    if (!selected?.analysis) return false;
    if (!selected?.text) return false;
    const analysis = selected.analysis;
    const structured = extractStructured(selected.text, NOMEN_FOR_EXTRACT);
    const required: Array<'patient' | 'procedure'> = [];
    if (structured?.paciente) required.push('patient');
    const proc =
      analysis.detected.procedureGuess?.desc ||
      analysis.detected.procedureGuess?.keyword ||
      (analysis.detected.codes[0] ? `Código ${analysis.detected.codes[0]}` : null);
    if (proc) required.push('procedure');
    if (required.length === 0) return false;
    const checks = selected.manualChecks || {};
    return required.some((id) => checks[id] === undefined);
  }, [selected?.analysis, selected?.text, selected?.manualChecks]);

  const finalizeBlockReason = useMemo(() => {
    if (!selected?.analysis || !selected?.text) return null;
    const structured = extractStructured(selected.text, NOMEN_FOR_EXTRACT);
    const required: Array<'patient' | 'procedure'> = [];
    if (structured?.paciente) required.push('patient');
    const proc =
      selected.analysis.detected.procedureGuess?.desc ||
      selected.analysis.detected.procedureGuess?.keyword ||
      (selected.analysis.detected.codes[0] ? `Código ${selected.analysis.detected.codes[0]}` : null);
    if (proc) required.push('procedure');
    if (required.length === 0) return null;
    const checks = selected.manualChecks || {};
    if (required.some((id) => checks[id] === false)) {
      const which = required
        .filter((id) => checks[id] === false)
        .map((id) => (id === 'patient' ? 'paciente no reconocido' : 'intervención no reconocida'))
        .join(' y ');
      return `No se pudo generar la planilla porque no se reconoció: ${which}.`;
    }
    // Also block if required planilla fields are missing (after edits)
    if (!selected.exports?.swissCx?.row) return null;
    const row = selected.exports.swissCx.row;
    const miss: string[] = [];
    if (!row.fecha?.trim()) miss.push('fecha');
    if (!row.socio?.trim()) miss.push('socio');
    if (!row.socioDesc?.trim()) miss.push('paciente');
    if (!row.codigo?.trim()) miss.push('código');
    if (miss.length) return `No se pudo generar la planilla porque falta: ${miss.join(', ')}.`;
    return null;
  }, [selected?.analysis, selected?.text, selected?.manualChecks]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Agregar documentos</h1>
          <p className="page-subtitle">
            Subí el parte quirúrgico o la autorización. Revisamos antes de que lo presentes.
          </p>
        </div>
        {!showEmpty && files.length > 0 && (
          <button
            type="button"
            className="btn"
            onClick={() => {
              setActiveBatchId(null);
              inputRef.current?.click();
            }}
          >
            <Icon name="upload" size={18} /> Agregar otros archivos
          </button>
        )}
      </div>

      {showEmpty && (
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
          <div className="upload-title">Arrastrá los archivos a esta zona, o tocá acá para elegirlos</div>
          <div className="upload-hint">
            Cuando terminen de cargarse, vas a ver el documento y un resumen debajo, con los puntos que conviene
            revisar antes de presentar.
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

      {!showEmpty && currentBatchFiles.length > 0 && (
        <div className="file-list">
          {currentBatchFiles.map((f) => (
            <FileRow
              key={f.id}
              file={f}
              onClick={() => onSelectFile(f.id)}
              onRemove={() => setConfirmDelete({ id: f.id, name: f.name })}
              isSelected={f.id === selectedFileId}
            />
          ))}
        </div>
      )}

      {!showEmpty && selected && selected.status === 'analyzed' && selected.analysis && (
        <>
          {isFinalized && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14, marginBottom: 16 }}>
              <button type="button" className="btn" onClick={() => onCloseVisualization?.()}>
                Volver al listado de documentos
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  if (selected?.id) onEditUpload?.(selected.id);
                }}
              >
                Quiero volver a editar esta carga
              </button>
            </div>
          )}
          {!isFinalized && (
            <AuthorizationCard
              parteFile={selected}
              authState={authStates[selected.id]}
              onDecision={(st) => onAuthDecision(selected.id, st)}
              onUploadBono={(st) => onAuthUpload(selected.id, st)}
              onReset={() => {
                const auth = authStates[selected.id];
                const correlated =
                  auth?.status === 'checked' ? !(auth.crossCheck || []).some((x) => x.severity === 'error') : false;
                if (correlated) {
                  setFinalizeBlocked(
                    'No se puede eliminar la autorización porque coincide con el parte. Si la eliminás, no vas a poder facturar.',
                  );
                  return;
                }
                onAuthReset(selected.id);
              }}
            />
          )}
          {selected.exports?.swissCx?.row && (
            <StoredFilesPanel
              row={selected.exports.swissCx.row}
              files={serverFiles}
              blockMessage={selected.exports?.swissCx?.planillaError || finalizeBlockReason}
              onUpdateRow={(nextRow, nextFiles) => {
                const next: FileEntry = {
                  ...selected,
                  exports: {
                    ...(selected.exports || {}),
                    swissCx: {
                      ...(selected.exports?.swissCx as any),
                      row: nextRow,
                      files: nextFiles || selected.exports?.swissCx?.files,
                    },
                  },
                };
                onAddFile(applyPlanillaValidationFindings({ file: next, row: nextRow }));
              }}
            />
          )}
          <AnalysisDetail
            file={selected}
            onUpsert={onAddFile}
            onReanalyze={selected.file ? () => handleReanalyze(selected) : undefined}
            reanalyzeBusy={reanalyzeBusy}
            manualOpenExternal={manualOpen}
            onManualOpenChange={(v) => {
              setManualOpen(v);
              if (!v && pendingFinalize) {
                // Continue finalize flow only if required checks were answered.
                if (!selected.text || !selected.analysis) return;
                const structured = extractStructured(selected.text, NOMEN_FOR_EXTRACT);
                const required: Array<'patient' | 'procedure'> = [];
                if (structured?.paciente) required.push('patient');
                const proc =
                  selected.analysis.detected.procedureGuess?.desc ||
                  selected.analysis.detected.procedureGuess?.keyword ||
                  (selected.analysis.detected.codes[0] ? `Código ${selected.analysis.detected.codes[0]}` : null);
                if (proc) required.push('procedure');
                const checks = selected.manualChecks || {};
                const okAnswered = required.every((id) => checks[id] !== undefined);
                const okRecognized = required.every((id) => checks[id] !== false);
                if (okAnswered && !okRecognized) {
                  setFinalizeBlocked(
                    `No se pudo generar la planilla porque no se reconoció: ${required
                      .filter((id) => checks[id] === false)
                      .map((id) => (id === 'patient' ? 'paciente' : 'intervención'))
                      .join(' y ')}.`,
                  );
                  setPendingFinalize(null);
                  return;
                }
                if (okAnswered && okRecognized) {
                  // En vez de finalizar automáticamente, armamos un segundo paso explícito.
                  setFinalizeStep('needsConfirm');
                }
              }
            }}
            pendingFinalize={Boolean(pendingFinalize)}
            allowManualReview={!isFinalized}
          />
        </>
      )}

      {!showEmpty && !isFinalized && currentBatchFiles.length > 0 && (
        <div className="upload-finalize">
          <button
            type="button"
            className="btn btn-primary"
            disabled={finalizeStep === 'saving'}
            onClick={async () => {
              setFinalizeBlocked(null);
              const args = { parteFileId: selected?.id || null, batchId: effectiveBatchId };
              if (selected && finalizeBlockReason) {
                setFinalizeBlocked(finalizeBlockReason);
                return;
              }
              if (selected && needsManualReview) {
                setPendingFinalize(args);
                setManualOpen(true);
                setFinalizeStep('needsConfirm');
                return;
              }
              setFinalizeStep('saving');
              try {
                await Promise.resolve(onFinalizeUpload?.(args));
                setFinalizeStep('saved');
              } finally {
                setActiveBatchId(null);
                onSelectFile(null);
              }
            }}
          >
            {finalizeStep === 'saving'
              ? 'Guardando…'
              : finalizeStep === 'needsConfirm'
                ? 'Confirmar y guardar'
                : finalizeStep === 'saved'
                  ? 'Guardado'
                  : 'Listo: confirmar y guardar'}
          </button>
          {finalizeBlocked && (
            <div style={{ marginTop: 10, color: 'var(--error)', fontSize: 12 }}>
              {finalizeBlocked}
            </div>
          )}
        </div>
      )}

      {confirmDelete && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmDelete(null);
          }}
        >
          <div className="modal-card" style={{ maxWidth: 520 }}>
            <div className="modal-head">
              <div style={{ fontWeight: 800, fontSize: '1.05rem' }}>¿Querés sacar este documento de Trazá?</div>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirmDelete(null)}>
                <Icon name="x" size={14} /> Cerrar
              </button>
            </div>
            <div className="modal-body">
              <div style={{ color: 'var(--text-muted)', fontSize: 15, lineHeight: 1.5 }}>
                Si confirmás, <b>{confirmDelete.name}</b> deja de aparecer en el historial, en &quot;Mis
                documentos&quot; y en la vista por fechas.
              </div>
              <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button type="button" className="btn" onClick={() => setConfirmDelete(null)}>
                  Mejor no, volver
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => {
                    onRemoveFile(confirmDelete.id);
                    setConfirmDelete(null);
                  }}
                >
                  Sí, sacarlo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StoredFilesPanel({
  row,
  files,
  blockMessage,
  onUpdateRow,
}: {
  row: {
    fecha: string;
    socio: string;
    socioDesc: string;
    codigo: string;
    cant: string;
    detalle: string;
    institucion: string;
    cir: 'X' | '';
    ayud: 'X' | '';
    inst: 'X' | '';
    urgencia: 'X' | '';
    gastos: '';
    nroAutorizacion: string;
  };
  files?: {
    interventionId: string;
    base?: string;
    xlsxFileName?: string;
    csvFileName?: string;
    xlsxBase64?: string;
    csvText?: string;
    parteUrl?: string;
    permisoUrl?: string;
    xlsxUrl?: string;
    csvUrl?: string;
  };
  blockMessage?: string | null;
  onUpdateRow: (row: any, files?: any) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState(row);

  // Sync draft when the persisted row changes (avoid setState during render).
  useEffect(() => {
    setDraft(row);
  }, [row]);

  function safeNamePart(s: string) {
    return (s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60);
  }

  async function downloadPlanilla() {
    if (!files) return;

    let buf: ArrayBuffer | null = null;
    if (files.xlsxBase64) {
      const bin = atob(files.xlsxBase64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      buf = bytes.buffer;
    } else if (files.xlsxUrl) {
      const res = await fetch(files.xlsxUrl, { cache: 'no-store' });
      if (!res.ok) return;
      buf = await res.arrayBuffer();
    } else {
      return;
    }

    const blob = new Blob([buf], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const fecha = safeNamePart(draft.fecha || 'sin_fecha');
    const pac = safeNamePart(draft.socioDesc || 'sin_paciente');
    a.download = files.xlsxFileName || `planilla_cx_swiss_${fecha}_${pac}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  async function saveEdits() {
    if (!files?.interventionId) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/interventions/${files.interventionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ row: draft, base: files.base }),
      });
      if (!res.ok) throw new Error('No se pudo guardar la planilla.');
      const json = (await res.json()) as {
        files: {
          interventionId: string;
          base?: string;
          xlsxFileName?: string;
          csvFileName?: string;
          xlsxBase64?: string;
          csvText?: string;
          xlsxUrl?: string;
          csvUrl?: string;
        };
      };
      const nextFiles = { ...files, ...json.files };
      onUpdateRow(draft, nextFiles);
      setEditing(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo guardar la planilla.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="panel" style={{ padding: 16, marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <div style={{ fontWeight: 800, fontSize: '1.05rem' }}>Planilla generada — detalle de la carga</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {(files?.xlsxUrl || files?.xlsxBase64) && (
            <button type="button" className="btn btn-sm" onClick={() => void downloadPlanilla()}>
              Descargar la planilla
            </button>
          )}
          {files?.interventionId && (files?.xlsxUrl || files?.xlsxBase64) && (
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEditing((v) => !v)}>
              {editing ? 'Cancelar edición' : 'Editar planilla'}
            </button>
          )}
          {editing && (
            <button type="button" className="btn btn-sm btn-primary" disabled={saving} onClick={() => void saveEdits()}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          )}
        </div>
      </div>
      {blockMessage && (
        <div
          style={{
            marginBottom: 12,
            padding: '10px 12px',
            borderRadius: 8,
            background: 'var(--error-soft)',
            border: '1px solid rgba(166, 51, 51, 0.25)',
            color: 'var(--error)',
            fontSize: 12.5,
            fontWeight: 600,
          }}
        >
          {blockMessage}
        </div>
      )}
      {err && <div style={{ color: 'var(--error)', marginBottom: 10, fontSize: 12 }}>{err}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 10, fontSize: 13 }}>
        <div style={{ color: 'var(--text-soft)', fontWeight: 700 }}>Fecha</div>
        <div>
          {editing ? (
            <input className="docs-search" value={draft.fecha} onChange={(e) => setDraft({ ...draft, fecha: e.target.value })} />
          ) : (
            row.fecha || '—'
          )}
        </div>

        <div style={{ color: 'var(--text-soft)', fontWeight: 700 }}>Socio</div>
        <div>
          {editing ? (
            <input className="docs-search" value={draft.socio} onChange={(e) => setDraft({ ...draft, socio: e.target.value })} />
          ) : (
            row.socio || '—'
          )}
        </div>

        <div style={{ color: 'var(--text-soft)', fontWeight: 700 }}>Descripción socio</div>
        <div>
          {editing ? (
            <input className="docs-search" value={draft.socioDesc} onChange={(e) => setDraft({ ...draft, socioDesc: e.target.value })} />
          ) : (
            row.socioDesc || '—'
          )}
        </div>

        <div style={{ color: 'var(--text-soft)', fontWeight: 700 }}>Código</div>
        <div>
          {editing ? (
            <input className="docs-search" value={draft.codigo} onChange={(e) => setDraft({ ...draft, codigo: e.target.value })} />
          ) : (
            row.codigo || '—'
          )}
        </div>

        <div style={{ color: 'var(--text-soft)', fontWeight: 700 }}>Cant</div>
        <div>{row.cant || '—'}</div>

        <div style={{ color: 'var(--text-soft)', fontWeight: 700 }}>Detalle</div>
        <div>
          {editing ? (
            <input className="docs-search" value={draft.detalle} onChange={(e) => setDraft({ ...draft, detalle: e.target.value })} />
          ) : (
            row.detalle || '—'
          )}
        </div>

        <div style={{ color: 'var(--text-soft)', fontWeight: 700 }}>Institución</div>
        <div>
          {editing ? (
            <input className="docs-search" value={draft.institucion} onChange={(e) => setDraft({ ...draft, institucion: e.target.value })} />
          ) : (
            row.institucion || '—'
          )}
        </div>

        <div style={{ color: 'var(--text-soft)', fontWeight: 700 }}>Cir.</div>
        <div>{row.cir || '—'}</div>

        <div style={{ color: 'var(--text-soft)', fontWeight: 700 }}>Ayud.</div>
        <div>{row.ayud || '—'}</div>

        <div style={{ color: 'var(--text-soft)', fontWeight: 700 }}>Inst.</div>
        <div>{row.inst || '—'}</div>

        <div style={{ color: 'var(--text-soft)', fontWeight: 700 }}>Urgencia</div>
        <div>{row.urgencia || '—'}</div>

        <div style={{ color: 'var(--text-soft)', fontWeight: 700 }}>Gastos</div>
        <div>{row.gastos || '—'}</div>

        <div style={{ color: 'var(--text-soft)', fontWeight: 700 }}>Nro Autorización</div>
        <div>
          {editing ? (
            <input className="docs-search" value={draft.nroAutorizacion} onChange={(e) => setDraft({ ...draft, nroAutorizacion: e.target.value })} />
          ) : (
            row.nroAutorizacion || '—'
          )}
        </div>
      </div>
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
        <Icon name="eye" size={16} /> Ver detalle
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
              Autorización previa
              <span className="auth-card-confidence">{confidenceLabel}</span>
            </div>
            <div className="auth-card-reason">
              {authRule.reason} Si corresponde, podés indicarlo abajo para que podamos cruzar el bono con el parte.
            </div>
          </div>
        </div>
        <div className="auth-actions">
          <button type="button" className="auth-btn primary" onClick={() => onDecision({ status: 'uploading' })}>
            <Icon name="upload" size={16} /> Sí, tengo el bono para subir
          </button>
          <button type="button" className="auth-btn" onClick={() => onDecision({ status: 'missing' })}>
            Todavía no la tengo
          </button>
          <button type="button" className="auth-btn" onClick={() => onDecision({ status: 'skipped' })}>
            En este caso no hace falta
          </button>
        </div>
      </div>
    );
  }

  if (authState.status === 'uploading') {
    async function handleAuthFile(file: File | undefined) {
      if (!file) return;
      onDecision({ status: 'processing', fileName: file.name, file });
      try {
        const { text } = await extractText(file, () => {});
        const bonoData = extractStructured(text, NOMEN_FOR_EXTRACT);
        const parteData = extractStructured(parteFile.text || '', NOMEN_FOR_EXTRACT);
        const cross = crossCheck(parteData, bonoData);
        onUploadBono({
          status: 'checked',
          fileName: file.name,
          file,
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
          ← Volver atrás
        </button>
        <div className="auth-card-head">
          <div className="auth-card-icon">
            <Icon name="upload" size={18} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="auth-card-title">Subir el bono de autorización</div>
            <div className="auth-card-reason">
              Elegí el archivo del bono: vamos a leerlo y contrastarlo con el parte (DNI, afiliado, código, fechas) para
              avisarte si algo no coincide.
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
          <div className="auth-upload-title">Arrastrá el bono a esta zona, o tocá para elegirlo</div>
          <div className="auth-upload-hint">Formatos admitidos: PDF, PNG o JPG.</div>
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
          ← Volver atrás
        </button>
        <div className="auth-card-head">
          <div className="auth-card-icon" style={{ background: 'var(--error)' }}>
            <Icon name="x" size={18} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="auth-card-title">Sin bono de autorización por ahora</div>
            <div className="auth-card-reason">
              Muchas prepagas piden la autorización previa: conviene tramitarla antes de presentar la liquidación, para
              reducir el riesgo de rechazo.
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
          ← Volver atrás
        </button>
        <div className="auth-card-head">
          <div className="auth-card-icon">
            <Icon name="info" size={18} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="auth-card-title">Autorización no aplica en este caso</div>
            <div className="auth-card-reason">
              Quedó registrado que este procedimiento no requiere autorización previa según tu criterio clínico /
              administrativo.
            </div>
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

function AnalysisDetail({
  file,
  onUpsert,
  onReanalyze,
  reanalyzeBusy,
  manualOpenExternal,
  onManualOpenChange,
  pendingFinalize,
  allowManualReview,
}: {
  file: FileEntry;
  onUpsert: (entry: FileEntry) => void;
  onReanalyze?: () => void;
  reanalyzeBusy?: boolean;
  manualOpenExternal?: boolean;
  onManualOpenChange?: (v: boolean) => void;
  pendingFinalize?: boolean;
  allowManualReview?: boolean;
}) {
  const [activeFindingIdx, setActiveFindingIdx] = useState<number | null>(null);
  const [selections, setSelections] = useState<Record<string, { idx: number; code: string; desc: string }>>({});
  const [manualOpenInternal, setManualOpenInternal] = useState(false);
  const [manualIncompleteWarned, setManualIncompleteWarned] = useState(false);
  const manualOpen = manualOpenExternal !== undefined ? manualOpenExternal : manualOpenInternal;
  const setManualOpen = (v: boolean) => {
    if (manualOpenExternal !== undefined) onManualOpenChange?.(v);
    else setManualOpenInternal(v);
  };
  const analysis = file.analysis!;
  const thumbnails = file.thumbnails || [];

  /** Hallazgos automáticos antes de respuestas manuales; evita perder CODE_* al togglear MANUAL_*. */
  const autoFindingsSnapshot = useRef<Finding[] | null>(null);
  useEffect(() => {
    if (!file.analysis) return;
    const cleaned = file.analysis.findings.filter(
      (f) => f.code !== 'MANUAL_PATIENT_MISMATCH' && f.code !== 'MANUAL_PROCEDURE_MISMATCH',
    );
    const answered =
      file.manualChecks &&
      (file.manualChecks.patient !== undefined || file.manualChecks.procedure !== undefined);
    if (!answered) autoFindingsSnapshot.current = cleaned;
  }, [file.id, file.analysis, file.manualChecks]);

  const sorted = [...analysis.findings].sort((a, b) => {
    const order: Record<string, number> = { error: 0, warn: 1, ok: 2, info: 3 };
    return order[a.severity] - order[b.severity];
  });

  const activeFinding = activeFindingIdx !== null ? sorted[activeFindingIdx] : null;
  const activeSpans = activeFinding?.spans || [];

  const spansByPage: Record<number, Array<Span & { severity: string }>> = {};
  const userConfirmedProcedure = file.manualChecks?.procedure === true;
  for (const f of sorted) {
    if (!f.spans) continue;
    if (f.severity === 'ok') continue;
    if (userConfirmedProcedure && hideProcedureAutoSpansWhenUserConfirmed(f)) continue;
    for (const s of f.spans) {
      (spansByPage[s.page] = spansByPage[s.page] || []).push({ ...s, severity: f.severity });
    }
  }

  const structured = useMemo(() => {
    if (!file.text) return null;
    return extractStructured(file.text, NOMEN_FOR_EXTRACT);
  }, [file.text]);

  const questions = useMemo(() => {
    const qs: Array<{ id: 'patient' | 'procedure'; title: string; detail: string; errorTitle: string; errorBody: string }> =
      [];
    if (structured?.paciente) {
      qs.push({
        id: 'patient',
        title: '¿Reconocés el nombre del paciente?',
        detail: structured.paciente,
        errorTitle: 'Nombre del paciente no reconocido',
        errorBody:
          `El documento muestra "${structured.paciente}" como paciente. Si no corresponde, la prepaga puede rechazar por datos del afiliado/paciente incorrectos.`,
      });
    }
    const proc =
      analysis.detected.procedureGuess?.desc ||
      analysis.detected.procedureGuess?.keyword ||
      (analysis.detected.codes[0] ? `Código ${analysis.detected.codes[0]}` : null);
    if (proc) {
      qs.push({
        id: 'procedure',
        title: '¿Reconocés haber realizado esta intervención?',
        detail: proc,
        errorTitle: 'Intervención no reconocida',
        errorBody:
          `El análisis detectó "${proc}". Si no corresponde al procedimiento realizado, la liquidación puede ser rechazada.`,
      });
    }
    return qs;
  }, [structured?.paciente, analysis.detected.procedureGuess, analysis.detected.codes]);

  function recomputeWithManual(nextChecks: FileEntry['manualChecks'], opts?: { warnIncomplete?: boolean }) {
    const baseFindings =
      autoFindingsSnapshot.current ??
      analysis.findings.filter(
        (f) => f.code !== 'MANUAL_PATIENT_MISMATCH' && f.code !== 'MANUAL_PROCEDURE_MISMATCH',
      );

    const out: Finding[] = baseFindings.filter((f) => f.code !== 'MANUAL_CHECKS_PENDING');

    const patientQ = questions.find((q) => q.id === 'patient');
    const procQ = questions.find((q) => q.id === 'procedure');

    const incomplete = questions.filter((q) => nextChecks?.[q.id] === undefined);
    const shouldWarnIncomplete = (opts?.warnIncomplete ?? manualIncompleteWarned) && incomplete.length > 0;
    if (shouldWarnIncomplete) {
      const missingLabel = incomplete.map((q) => (q.id === 'patient' ? 'paciente' : 'intervención')).join(', ');
      out.unshift({
        severity: 'warn',
        code: 'MANUAL_CHECKS_PENDING',
        title: 'Revisión de datos incontrastables pendiente',
        body: `Falta confirmar (${missingLabel}). Si no lo completás, la liquidación puede quedar con datos sin validar.`,
        action: 'Abrí “Revisión de datos incontrastables” y respondé Sí/No en todas las preguntas.',
      });
    }

    if (nextChecks?.patient === false && patientQ) {
      let patientSpans = findSpans(patientQ.detail, file.ocrWords, { maxResults: 2 });
      if (!patientSpans.length && patientQ.detail.includes(',')) {
        const first = patientQ.detail.split(',')[0].trim();
        if (first.length >= 3) patientSpans = findSpans(first, file.ocrWords, { maxResults: 2 });
      }
      out.unshift({
        severity: 'error',
        code: 'MANUAL_PATIENT_MISMATCH',
        title: patientQ.errorTitle,
        body: patientQ.errorBody,
        action: 'Corregir el documento o volver a generar el parte con los datos correctos.',
        spans: patientSpans.length ? patientSpans : undefined,
      });
    }
    if (nextChecks?.procedure === false && procQ) {
      const ctx = { maxResults: 2 as const, requireProcedureFieldContext: true as const };
      let procSpans = findSpans(procQ.detail, file.ocrWords, ctx);
      if (!procSpans.length) procSpans = findSpans(procQ.detail, file.ocrWords, { maxResults: 2 });
      if (!procSpans.length && analysis.detected.procedureGuess?.keyword) {
        procSpans = findSpans(analysis.detected.procedureGuess.keyword, file.ocrWords, ctx);
        if (!procSpans.length)
          procSpans = findSpans(analysis.detected.procedureGuess.keyword, file.ocrWords, { maxResults: 2 });
      }
      if (!procSpans.length && analysis.detected.codes[0]) {
        procSpans = findSpans(analysis.detected.codes[0], file.ocrWords, ctx);
        if (!procSpans.length) procSpans = findSpans(analysis.detected.codes[0], file.ocrWords, { maxResults: 2 });
      }
      out.unshift({
        severity: 'error',
        code: 'MANUAL_PROCEDURE_MISMATCH',
        title: procQ.errorTitle,
        body: procQ.errorBody,
        action: 'Corregir el documento o volver a generar el parte con los datos correctos.',
        spans: procSpans.length ? procSpans : undefined,
      });
    }

    const summary = {
      ok: out.filter((f) => f.severity === 'ok').length,
      warn: out.filter((f) => f.severity === 'warn').length,
      error: out.filter((f) => f.severity === 'error').length,
    };
    const overall: 'error' | 'warn' | 'ok' = summary.error > 0 ? 'error' : summary.warn > 0 ? 'warn' : 'ok';

    onUpsert({ ...file, manualChecks: nextChecks, analysis: { ...analysis, findings: out, summary, overall } });
  }

  function setManual(qId: 'patient' | 'procedure', v: boolean | undefined) {
    const nextChecks: FileEntry['manualChecks'] = {
      ...(file.manualChecks || {}),
      [qId]: v,
    };
    // keep object small (remove undefined keys)
    if (nextChecks.patient === undefined) delete nextChecks.patient;
    if (nextChecks.procedure === undefined) delete nextChecks.procedure;
    const compact = Object.keys(nextChecks).length ? nextChecks : undefined;
    const isComplete = questions.every((q) => compact?.[q.id] !== undefined);
    if (isComplete) setManualIncompleteWarned(false);
    recomputeWithManual(compact, { warnIncomplete: !isComplete && manualIncompleteWarned });
  }

  return (
    <div className="analysis-detail">
      <div className="panel doc-preview">
        <div className="doc-preview-head">
          <div style={{ fontWeight: 600, fontSize: 13 }}>{file.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 11.5, color: 'var(--text-soft)', fontFamily: 'var(--font-mono)' }}>
              {file.method === 'ocr' ? 'OCR · español' : 'PDF · texto embebido'}
            </div>
            {onReanalyze ? (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => onReanalyze()}
                disabled={reanalyzeBusy}
                title="Vuelve a leer el archivo y aplicar las últimas reglas de detección (corrige encuadres viejos)."
              >
                {reanalyzeBusy ? (
                  <>
                    <span className="spinner" style={{ marginRight: 6 }} />
                    Re-analizando…
                  </>
                ) : (
                  <>
                    <Icon name="refresh" size={14} /> Re-analizar
                  </>
                )}
              </button>
            ) : null}
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <h3 style={{ margin: 0 }}>Resultado del análisis</h3>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => {
                setManualOpen(true);
              }}
              disabled={questions.length === 0 || allowManualReview === false}
              title={questions.length === 0 ? 'No se detectaron datos para revisar' : 'Revisar datos personales'}
            >
              <Icon name="info" size={12} /> Revisar datos incontrastables
            </button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            {analysis.detected.prepagas.length > 0 && (
              <>
                Prepaga: <b>{analysis.detected.prepagas.join(', ')}</b> ·{' '}
              </>
            )}
            {analysis.detected.codes.length > 0 ? (
              <>
                Código en documento:{' '}
                <code style={{ fontFamily: 'var(--font-mono)' }}>{analysis.detected.codes.join(', ')}</code>
              </>
            ) : analysis.detected.procedureGuess?.code ? (
              <>
                Código no encontrado en documento ·{' '}
                <span style={{ color: 'var(--text-soft)' }}>Sugerencia de Trazá (fuente: procedimiento detectado)</span>{' '}
                <code style={{ fontFamily: 'var(--font-mono)' }}>{analysis.detected.procedureGuess.code}</code>
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
                {f.spans && f.spans.length > 0 && f.code !== 'NO_CODE_SUGGEST' && (
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
                    {f.code === 'NO_CODE_SUGGEST'
                      ? 'Fuente: procedimiento detectado en el texto. Revisá y confirmá el código antes de presentar.'
                      : 'Detectamos el procedimiento en el texto. Este es el código de nomenclador que corresponde.'}
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

      {manualOpen && questions.length > 0 && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              const incomplete = questions.some((q) => file.manualChecks?.[q.id] === undefined);
              if (incomplete) {
                setManualIncompleteWarned(true);
                recomputeWithManual(file.manualChecks, { warnIncomplete: true });
              }
              setManualOpen(false);
            }
          }}
        >
          <div className="modal-card">
            <div className="modal-head">
              <div style={{ fontWeight: 800 }}>Revisión de datos incontrastables</div>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => {
                  const incomplete = questions.some((q) => file.manualChecks?.[q.id] === undefined);
                  if (incomplete) {
                    setManualIncompleteWarned(true);
                    recomputeWithManual(file.manualChecks, { warnIncomplete: true });
                  }
                  setManualOpen(false);
                }}
              >
                <Icon name="x" size={12} /> Cerrar
              </button>
            </div>

            <div className="modal-body">
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                Si respondés <b>No</b>, se marcará como <b>error</b>. Para poder finalizar y generar la planilla, completá
                estas confirmaciones.
              </div>

              {questions.map((q) => {
                const current = file.manualChecks?.[q.id];
                return (
                  <div key={q.id} className="q-card">
                    <div className="q-title">{q.title}</div>
                    <div className="q-detail">{q.detail}</div>
                    <div className="q-actions">
                      <button
                        type="button"
                        className={`btn ${current === true ? 'btn-primary' : ''}`}
                        onClick={() => setManual(q.id, true)}
                      >
                        Sí
                      </button>
                      <button
                        type="button"
                        className={`btn ${current === false ? 'btn-primary' : ''}`}
                        onClick={() => setManual(q.id, false)}
                      >
                        No
                      </button>
                      <button type="button" className="btn btn-ghost" onClick={() => setManual(q.id, undefined)}>
                        Desmarcar
                      </button>
                    </div>
                  </div>
                );
              })}

              <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setManualOpen(false)}
                  disabled={questions.some((q) => file.manualChecks?.[q.id] === undefined)}
                  title={
                    questions.some((q) => file.manualChecks?.[q.id] === undefined)
                      ? 'Respondé Sí/No en todas las preguntas para continuar'
                      : undefined
                  }
                >
                  {pendingFinalize ? 'Listo y finalizar' : 'Listo'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
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
