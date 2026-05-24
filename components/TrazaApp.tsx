'use client';

import { useEffect, useState } from 'react';
import { Logo } from './Logo';
import { Icon } from './Icon';
import { Sidebar } from './Sidebar';
import { UploadView } from './UploadView';
import { ErrorsView } from './ErrorsView';
import { DocumentsView } from './DocumentsView';
import { ProfileView } from './ProfileView';
import { DashboardView } from './DashboardView';
import { CobrosView } from './dashboard/CobrosView';
import { CobrosGuard } from '@/components/cobros/CobrosGuard';
import { AutoAssignRole } from '@/components/auth/AutoAssignRole';
import { SmgDeletionBlockedCard } from './SmgDeletionBlockedCard';
import type { AuthState, FileEntry, RemoveFileResult, SmgDeleteBlockPayload } from '@/lib/types';
import { loadHistory, saveHistory } from '@/lib/history';
import { buildSwissCxRow } from '@/lib/swissCxExport';
import { applyThemeMode, DEFAULT_PROFILE, loadProfile } from '@/lib/profile';

export default function TrazaApp() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [active, setActive] = useState<string>('dashboard');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [authStates, setAuthStates] = useState<Record<string, AuthState | undefined>>({});
  const [uploadVirgin, setUploadVirgin] = useState(false);
  const [smgDeleteBlock, setSmgDeleteBlock] = useState<SmgDeleteBlockPayload | null>(null);
  const [smgForceDeleting, setSmgForceDeleting] = useState(false);
  // Mismo valor inicial en SSR y primer render del cliente (evita hydration mismatch:
  // loadProfile() en el servidor usa DEFAULT_PROFILE; en el cliente lee localStorage).
  const [userProfile, setUserProfile] = useState(DEFAULT_PROFILE);

  useEffect(() => {
    const p = loadProfile();
    setUserProfile(p);
    applyThemeMode(p.theme);
  }, []);

  useEffect(() => {
    const loaded = loadHistory();
    if (loaded.files.length > 0) {
      setFiles(loaded.files);
    }
    if (loaded.authStates && Object.keys(loaded.authStates).length > 0) {
      setAuthStates(loaded.authStates as Record<string, AuthState | undefined>);
    }
  }, []);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'traza.profile.v1') {
        const p = loadProfile();
        setUserProfile(p);
        applyThemeMode(p.theme);
      }
    };
    window.addEventListener('storage', onStorage);
    const id = window.setInterval(() => {
      const p = loadProfile();
      setUserProfile(p);
      applyThemeMode(p.theme);
    }, 1500);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    saveHistory(files, authStates);
  }, [files, authStates]);

  useEffect(() => {
    const onNavigate = (e: Event) => {
      const view = (e as CustomEvent<{ view?: string }>).detail?.view;
      if (view) setActive(view);
    };
    window.addEventListener('traza:navigate', onNavigate);
    return () => window.removeEventListener('traza:navigate', onNavigate);
  }, []);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileNavOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileNavOpen]);

  useEffect(() => {
    if (mobileNavOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileNavOpen]);

  function upsertFile(entry: FileEntry) {
    setUploadVirgin(false);
    setFiles((prev) => {
      const idx = prev.findIndex((f) => f.id === entry.id);
      if (idx === -1) return [entry, ...prev];
      const copy = [...prev];
      copy[idx] = entry;
      return copy;
    });
    if (entry.status === 'analyzed') {
      setSelectedFileId(entry.id);
    }
  }

  function handleAuthDecision(fileId: string, state: AuthState) {
    setAuthStates((prev) => ({ ...prev, [fileId]: state }));
  }

  function handleAuthUpload(fileId: string, state: AuthState) {
    setAuthStates((prev) => ({ ...prev, [fileId]: state }));
  }

  function handleAuthReset(fileId: string) {
    setAuthStates((prev) => {
      const copy = { ...prev };
      delete copy[fileId];
      return copy;
    });
  }

  async function deleteLiquidacionForced(liquidacionId: string): Promise<RemoveFileResult> {
    try {
      const policyRes = await fetch(
        `/api/liquidaciones/deletion-policy?liquidacion_id=${encodeURIComponent(liquidacionId)}&force=1`,
      );
      const policy = await policyRes.json();
      if (!policy.allowed) {
        return {
          ok: false,
          blocked: true,
          message: policy.message ?? 'No se puede eliminar este documento.',
          canForceDelete: policy.canForceDelete === true,
        };
      }
      const del = await fetch(`/api/liquidaciones/${liquidacionId}?force=1`, { method: 'DELETE' });
      if (del.status === 409) {
        const body = await del.json();
        return {
          ok: false,
          blocked: true,
          message: body.error ?? 'No se puede eliminar este documento.',
          canForceDelete: body.canForceDelete === true,
        };
      }
      if (!del.ok) return { ok: false, message: 'No se pudo eliminar el registro en la nube.' };
      window.dispatchEvent(new CustomEvent('traza:swiss-periods-refresh'));
      return { ok: true };
    } catch {
      return { ok: false, message: 'Error de red al eliminar el documento.' };
    }
  }

  async function removeFile(id: string, options?: { force?: boolean }): Promise<RemoveFileResult> {
    const victim = files.find((f) => f.id === id);
    const docId = victim?.documentId;
    const forceQ = options?.force ? '&force=1' : '';
    if (docId) {
      try {
        const policyRes = await fetch(
          `/api/liquidaciones/deletion-policy?document_id=${encodeURIComponent(docId)}${forceQ}`,
        );
        const policy = await policyRes.json();
        if (!policy.allowed) {
          return {
            ok: false,
            blocked: true,
            message:
              policy.message ??
              'Este documento no puede eliminarse porque el proceso con Swiss Medical ya está en curso.',
            canForceDelete: policy.canForceDelete === true,
          };
        }

        const r = await fetch(`/api/liquidaciones?document_id=${encodeURIComponent(docId)}`);
        const j = await r.json();
        for (const liq of j.liquidaciones ?? []) {
          const del = await fetch(`/api/liquidaciones/${liq.id}?force=${options?.force ? '1' : '0'}`, {
            method: 'DELETE',
          });
          if (del.status === 409) {
            const body = await del.json();
            return {
              ok: false,
              blocked: true,
              message: body.error ?? 'No se puede eliminar este documento.',
              canForceDelete: body.canForceDelete === true,
            };
          }
          if (!del.ok) {
            return { ok: false, message: 'No se pudo eliminar el registro en la nube.' };
          }
        }
      } catch {
        return { ok: false, message: 'Error de red al eliminar el documento.' };
      }
    }

    setFiles((prev) => prev.filter((f) => f.id !== id));
    if (selectedFileId === id) setSelectedFileId(null);
    setAuthStates((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
    window.dispatchEvent(new CustomEvent('traza:swiss-periods-refresh'));
    return { ok: true };
  }

  function updateFileTracking(id: string, updater: (item: FileEntry) => FileEntry) {
    setFiles((prev) => prev.map((f) => (f.id === id ? updater(f) : f)));
  }

  function openFile(id: string) {
    setActive('upload');
    setUploadVirgin(false);
    setSelectedFileId(id);
    setTimeout(() => {
      const el = document.querySelector('.analysis-detail') as HTMLElement | null;
      if (el) window.scrollTo({ top: el.offsetTop - 24, behavior: 'smooth' });
    }, 100);
  }

  const errorCount = files.reduce((acc, f) => {
    if (!f.analysis) return acc;
    return acc + f.analysis.summary.error;
  }, 0);

  async function handleFinalizeUpload(args: { parteFileId: string | null; batchId: string | null }) {
    const parte =
      (args.parteFileId ? files.find((f) => f.id === args.parteFileId) : null) ||
      (args.batchId ? files.find((f) => f.batchId === args.batchId) : null) ||
      files[0] ||
      null;
    if (!parte || !parte.text || !parte.analysis) {
      setUploadVirgin(true);
      setSelectedFileId(null);
      return;
    }

    try {
      const prepagas = parte.analysis?.detected?.prepagas || [];
      const isSwiss = prepagas.includes('Swiss Medical');
      if (!isSwiss) {
        // Para prepagas no-Swiss: permitir "Listo y guardar" sin generar planilla/export.
        setFiles((prev) =>
          prev.map((f) =>
            f.id === parte.id
              ? {
                  ...f,
                  tracking: { ...(f.tracking || { estado: 'borrador' }), estado: 'listo_para_presentar' },
                }
              : f,
          ),
        );
        return;
      }
      const auth = authStates[parte.id];
      const authErrors =
        auth?.status === 'checked' ? (auth.crossCheck || []).some((x) => x.severity === 'error') : false;
      const row = buildSwissCxRow({ parte, authState: auth });

      const fd = new FormData();
      if (parte.file) fd.append('parte', parte.file, parte.name);

      if (auth?.status === 'checked' && auth.file) {
        fd.append('permiso', auth.file, auth.fileName);
      }

      fd.append(
        'payload',
        JSON.stringify({
          row,
          skipPlanilla: auth?.status === 'checked' && authErrors ? true : false,
          skipReason: auth?.status === 'checked' && authErrors ? 'AUTH_MISMATCH' : null,
          meta: { parteFileName: parte.name, permisoFileName: auth?.status === 'checked' ? auth.fileName : null },
        }),
      );

      const res = await fetch('/api/interventions', { method: 'POST', body: fd });
      if (!res.ok) throw new Error('No se pudo guardar la intervención.');
      const json = (await res.json()) as { id: string; files: any };

      const planillaError =
        auth?.status === 'checked' && authErrors
          ? 'No se pudo generar la planilla porque la autorización no coincide con el parte. Revisá la autorización subida.'
          : undefined;

      setFiles((prev) =>
        prev.map((f) =>
          f.id === parte.id
            ? {
                ...f,
                exports: {
                  ...(f.exports || {}),
                  swissCx: {
                    createdAt: new Date().toISOString(),
                    parteFileId: parte.id,
                    batchId: args.batchId,
                    row,
                    planillaError,
                    files: json.files,
                  },
                },
              }
            : f,
        ),
      );
    } catch (e) {
      console.error(e);
    } finally {
      setUploadVirgin(true);
      setSelectedFileId(null);
    }
  }

  return (
    <>
      {smgDeleteBlock && (
        <SmgDeletionBlockedCard
          message={smgDeleteBlock.message}
          onClose={() => setSmgDeleteBlock(null)}
          forceDeleting={smgForceDeleting}
          onForceDelete={
            smgDeleteBlock.canForceDelete
              ? () => {
                  void (async () => {
                    setSmgForceDeleting(true);
                    let result: RemoveFileResult;
                    if (smgDeleteBlock.fileId) {
                      result = await removeFile(smgDeleteBlock.fileId, { force: true });
                    } else if (smgDeleteBlock.liquidacionId) {
                      result = await deleteLiquidacionForced(smgDeleteBlock.liquidacionId);
                    } else {
                      result = { ok: false, message: 'No se pudo identificar el documento.' };
                    }
                    setSmgForceDeleting(false);
                    if (result.ok) {
                      setSmgDeleteBlock(null);
                      return;
                    }
                    if (result.ok === false && result.message) {
                      setSmgDeleteBlock({
                        ...smgDeleteBlock,
                        message: result.message,
                        canForceDelete: result.canForceDelete === true,
                      });
                    }
                  })();
                }
              : undefined
          }
        />
      )}
      <AutoAssignRole />
      <div className="app">
        <header className="app-mob-header">
        <div className="app-mob-header__brand">
          <Logo size={40} variant="dark" />
          <span className="brand__wordmark">Trazá</span>
        </div>
        <button
          type="button"
          className="app-mob-menu-btn"
          aria-label="Abrir menú"
          aria-expanded={mobileNavOpen}
          aria-controls="main-sidebar"
          onClick={() => setMobileNavOpen(true)}
        >
          <Icon name="menu" size={22} />
        </button>
      </header>
      <div
        className={`nav-backdrop${mobileNavOpen ? ' is-visible' : ''}`}
        aria-hidden={!mobileNavOpen}
        onClick={() => setMobileNavOpen(false)}
      />
      <Sidebar
        active={active}
        setActive={(id) => {
          setActive(id);
          setMobileNavOpen(false);
        }}
        errorCount={errorCount}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
        user={{
          displayName: userProfile.displayName,
          profesion: userProfile.profesion,
          avatarDataUrl: userProfile.avatarDataUrl,
        }}
      />
      <main className="main">
        {active === 'dashboard' && <DashboardView onNavigate={(view) => setActive(view)} onOpenFile={openFile} />}
        {active === 'cobros' && (
          <CobrosGuard>
            <CobrosView files={files} onUpdateTracking={updateFileTracking} />
          </CobrosGuard>
        )}
        {active === 'upload' && (
          <UploadView
            files={files}
            onAddFile={upsertFile}
            onRemoveFile={async (fileId) => {
              const result = await removeFile(fileId);
              if (result.ok === false && result.blocked && result.message) {
                setSmgDeleteBlock({
                  fileId,
                  message: result.message,
                  canForceDelete: result.canForceDelete === true,
                });
              }
              return result;
            }}
            onSelectFile={setSelectedFileId}
            selectedFileId={selectedFileId}
            authStates={authStates}
            onAuthDecision={handleAuthDecision}
            onAuthUpload={handleAuthUpload}
            onAuthReset={handleAuthReset}
            showVirgin={uploadVirgin}
            onFinalizeUpload={handleFinalizeUpload}
            onCloseVisualization={() => {
              setActive('documents');
              setSelectedFileId(null);
              setUploadVirgin(true);
            }}
            onEditUpload={(parteFileId) => {
              setUploadVirgin(false);
              setSelectedFileId(parteFileId);
              setFiles((prev) =>
                prev.map((f) => {
                  if (f.id !== parteFileId) return f;
                  if (!f.exports?.swissCx) return f;
                  // keep row metadata, but drop server links so "finalize" can be run again
                  return {
                    ...f,
                    exports: { ...f.exports, swissCx: { ...f.exports.swissCx, files: undefined } },
                  };
                }),
              );
            }}
          />
        )}
        {active === 'documents' && (
          <DocumentsView
            files={files}
            onOpenFile={openFile}
            onUpdateTracking={updateFileTracking}
            onRemoveFile={async (fileId) => {
              const result = await removeFile(fileId);
              if (result.ok === false && result.blocked && result.message) {
                setSmgDeleteBlock({
                  fileId,
                  message: result.message,
                  canForceDelete: result.canForceDelete === true,
                });
              }
              return result;
            }}
            onSmgDeleteBlocked={(payload) => setSmgDeleteBlock(payload)}
          />
        )}
        {active === 'errors' && <ErrorsView files={files} authStates={authStates} onOpenFile={openFile} />}
        {active === 'settings' && <ProfileView />}
      </main>
    </div>
    </>
  );
}
