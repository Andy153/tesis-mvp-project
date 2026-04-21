'use client';

import { useEffect, useState } from 'react';
import { Sidebar } from './Sidebar';
import { UploadView } from './UploadView';
import { ErrorsView } from './ErrorsView';
import { CalendarView } from './CalendarView';
import { DocumentsView } from './DocumentsView';
import type { AuthState, FileEntry } from '@/lib/types';
import { loadHistory, saveHistory } from '@/lib/history';
import { buildSwissCxRow, downloadBytes, downloadText, generateSwissCxFiles } from '@/lib/swissCxExport';

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
      const res = await fetch('/api/templates/swiss-cx', { cache: 'no-store' });
      if (!res.ok) throw new Error('No se pudo leer la plantilla Swiss.');
      const templateXlsx = await res.arrayBuffer();

      const row = buildSwissCxRow({ parte, authState: authStates[parte.id] });
      const { xlsx, csv } = await generateSwissCxFiles({ templateXlsx, row });

      const stamp = new Date().toISOString().slice(0, 10);
      const safeSocio = (row.socio || 'socio').replace(/[^\w\-]+/g, '').slice(0, 20);
      const base = `swiss_cx_${stamp}_${safeSocio}`;
      downloadBytes(
        xlsx,
        `${base}.xlsx`,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      downloadText(csv, `${base}.csv`, 'text/csv;charset=utf-8');

      const exportMeta: NonNullable<FileEntry['exports']> = {
        swissCx: {
          createdAt: new Date().toISOString(),
          parteFileId: parte.id,
          batchId: args.batchId,
          row: {
            ...row,
            // normalize required exact empties
            gastos: '',
          },
        },
      };

      setFiles((prev) =>
        prev.map((f) => (f.id === parte.id ? { ...f, exports: { ...(f.exports || {}), ...exportMeta } } : f)),
      );
    } catch (e) {
      // If export fails, still let the user reset the upload screen.
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
