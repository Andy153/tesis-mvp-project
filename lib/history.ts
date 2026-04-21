import type { Analysis, AuthState, FileEntry } from './types';

const STORAGE_KEY = 'traza.history.v1';

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
  'text' | 'file' | 'thumbnails' | 'ocrWords' | 'progress' | 'progressMessage'
> & {
  analysis?: PersistedAnalysis;
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

export function loadHistory(): { files: PersistedFileEntry[]; authStates: Record<string, PersistedAuthState | undefined> } {
  if (typeof window === 'undefined') return { files: [], authStates: {} };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { files: [], authStates: {} };
    const parsed = JSON.parse(raw) as PersistedHistory;
    if (!parsed || parsed.version !== 1) return { files: [], authStates: {} };
    return { files: parsed.files || [], authStates: parsed.authStates || {} };
  } catch {
    return { files: [], authStates: {} };
  }
}

