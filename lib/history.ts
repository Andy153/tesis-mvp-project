import type { Analysis, AuthState, FileEntry } from './types';
import { analyzeDocument, TRAZA_ANALYZER_REVISION } from './analyzer';

const STORAGE_KEY = 'traza.history.v1';
const TEXT_CAP = 180_000;

type PersistedFinding = {
  severity: 'error' | 'warn' | 'ok' | 'info';
  code: string;
  title: string;
  body: string;
  action?: string;
};

type PersistedAnalysis = Omit<Analysis, 'findings'> & { findings: PersistedFinding[] };

export type PersistedFileEntry = Omit<
  FileEntry,
  'file' | 'thumbnails' | 'ocrWords' | 'progress' | 'progressMessage' | 'text'
> & {
  analysis?: PersistedAnalysis;
  text?: string;
};

export type PersistedAuthState =
  | { status: 'uploading' }
  | { status: 'processing'; fileName: string }
  | { status: 'missing' }
  | { status: 'skipped' }
  | { status: 'error'; fileName?: string; errorMessage?: string }
  | {
      status: 'checked';
      fileName: string;
      crossCheck: Array<{ severity: 'ok' | 'warn' | 'error'; title: string; body: string; action?: string }>;
    };

export type PersistedHistory = {
  version: 1;
  savedAt: string;
  /** Coincide con `TRAZA_ANALYZER_REVISION` del último guardado; si cambia, se re-analiza el texto guardado. */
  analyzerRevision?: number;
  files: PersistedFileEntry[];
  authStates: Record<string, PersistedAuthState | undefined>;
};

function minifyAnalysis(a: Analysis): PersistedAnalysis {
  return {
    ...a,
    findings: a.findings.map((f) => ({
      severity: f.severity,
      code: f.code,
      title: f.title,
      body: f.body,
      action: f.action,
    })),
  };
}

function minifyAuthState(s: AuthState): PersistedAuthState {
  if (s.status === 'checked') {
    return { status: 'checked', fileName: s.fileName, crossCheck: s.crossCheck || [] };
  }
  if (s.status === 'processing') return { status: 'processing', fileName: s.fileName };
  if (s.status === 'error') return { status: 'error', fileName: s.fileName, errorMessage: s.errorMessage };
  if (s.status === 'missing') return { status: 'missing' };
  if (s.status === 'skipped') return { status: 'skipped' };
  return { status: 'uploading' };
}

export function saveHistory(files: FileEntry[], authStates: Record<string, AuthState | undefined>) {
  if (typeof window === 'undefined') return;
  try {
    const persisted: PersistedHistory = {
      version: 1,
      savedAt: new Date().toISOString(),
      analyzerRevision: TRAZA_ANALYZER_REVISION,
      files: files
        .filter((f) => f.status !== 'analyzing')
        .map((f) => ({
          id: f.id,
          name: f.name,
          size: f.size,
          type: f.type,
          addedAt: f.addedAt,
          batchId: f.batchId,
          manualChecks: f.manualChecks,
          status: f.status,
          analysis: f.analysis ? minifyAnalysis(f.analysis) : undefined,
          method: f.method,
          errorMessage: f.errorMessage,
          exports: f.exports,
          text: f.text ? f.text.slice(0, TEXT_CAP) : undefined,
          pageTexts: f.pageTexts,
          raw_text: f.raw_text ? f.raw_text.slice(0, TEXT_CAP) : undefined,
          raw_text_light: f.raw_text_light ? f.raw_text_light.slice(0, TEXT_CAP) : undefined,
          raw_pageTexts: f.raw_pageTexts,
          institution_from_text: f.institution_from_text,
          aiParteExtract: f.aiParteExtract,
        })),
      authStates: Object.fromEntries(
        Object.entries(authStates).map(([k, v]) => [k, v ? minifyAuthState(v) : undefined]),
      ),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  } catch {
    // ignore persistence errors (quota, privacy mode, etc.)
  }
}

function persistedToFileEntry(f: PersistedFileEntry, savedRevision: number): FileEntry {
  const needReanalyze =
    f.status === 'analyzed' && Boolean(f.text) && savedRevision !== TRAZA_ANALYZER_REVISION;
  const analysis: Analysis | undefined =
    needReanalyze && f.text
      ? analyzeDocument(f.text, f.name, undefined, f.pageTexts)
      : f.analysis
        ? ({ ...f.analysis, findings: f.analysis.findings as Analysis['findings'] } as Analysis)
        : undefined;
    return {
    id: f.id,
    name: f.name,
    size: f.size,
    type: f.type,
    addedAt: f.addedAt,
    batchId: f.batchId,
    manualChecks: f.manualChecks,
    status: f.status,
    text: f.text,
    pageTexts: f.pageTexts,
    raw_text: f.raw_text,
    raw_text_light: f.raw_text_light,
    raw_pageTexts: f.raw_pageTexts,
    institution_from_text: f.institution_from_text,
    aiParteExtract: f.aiParteExtract,
    analysis,
    method: f.method,
    errorMessage: f.errorMessage,
    exports: f.exports,
  };
}

export function loadHistory(): { files: FileEntry[]; authStates: Record<string, PersistedAuthState | undefined> } {
  if (typeof window === 'undefined') return { files: [], authStates: {} };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { files: [], authStates: {} };
    const parsed = JSON.parse(raw) as PersistedHistory;
    if (!parsed || parsed.version !== 1) return { files: [], authStates: {} };
    const savedRevision = parsed.analyzerRevision ?? 0;
    const files = (parsed.files || [])
      .filter((f) => {
        if (f.status === 'analyzed' && !f.text) return false;
        return true;
      })
      .map((f) => persistedToFileEntry(f, savedRevision));
    return { files, authStates: parsed.authStates || {} };
  } catch {
    return { files: [], authStates: {} };
  }
}
