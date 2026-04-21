'use client';

import { useEffect, useState } from 'react';
import { Sidebar } from './Sidebar';
import { UploadView } from './UploadView';
import { ErrorsView } from './ErrorsView';
import { CalendarView } from './CalendarView';
import { DocumentsView } from './DocumentsView';
import type { AuthState, FileEntry } from '@/lib/types';
import { loadHistory, saveHistory } from '@/lib/history';
import { buildSwissCxRow } from '@/lib/swissCxExport';

export default function TrazaApp() {
  const [active, setActive] = useState<string>('upload');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [authStates, setAuthStates] = useState<Record<string, AuthState | undefined>>({});
  const [uploadVirgin, setUploadVirgin] = useState(false);

  useEffect(() => {
    const loaded = loadHistory();
    if (loaded.files.length > 0) {
      setFiles(loaded.files as FileEntry[]);
    }
    if (loaded.authStates && Object.keys(loaded.authStates).length > 0) {
      setAuthStates(loaded.authStates as Record<string, AuthState | undefined>);
    }
  }, []);

  useEffect(() => {
    saveHistory(files, authStates);
  }, [files, authStates]);

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

  function removeFile(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id));
    if (selectedFileId === id) setSelectedFileId(null);
    setAuthStates((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
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
      const row = buildSwissCxRow({ parte, authState: authStates[parte.id] });

      const fd = new FormData();
      if (parte.file) fd.append('parte', parte.file, parte.name);

      const auth = authStates[parte.id];
      if (auth?.status === 'checked' && auth.file) {
        fd.append('permiso', auth.file, auth.fileName);
      }

      fd.append(
        'payload',
        JSON.stringify({
          row,
          meta: { parteFileName: parte.name, permisoFileName: auth?.status === 'checked' ? auth.fileName : null },
        }),
      );

      const res = await fetch('/api/interventions', { method: 'POST', body: fd });
      if (!res.ok) throw new Error('No se pudo guardar la intervención.');
      const json = (await res.json()) as { id: string; files: any };

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
    <div className="app">
      <Sidebar active={active} setActive={setActive} errorCount={errorCount} />
      <main className="main">
        {active === 'upload' && (
          <UploadView
            files={files}
            onAddFile={upsertFile}
            onRemoveFile={removeFile}
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
        {active === 'documents' && <DocumentsView files={files} onOpenFile={openFile} />}
        {active === 'calendar' && (
          <CalendarView files={files} authStates={authStates} onOpenParte={openFile} />
        )}
        {active === 'errors' && <ErrorsView files={files} onOpenFile={openFile} />}
      </main>
    </div>
  );
}
