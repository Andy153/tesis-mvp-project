'use client';

import { useEffect, useState } from 'react';
import { Sidebar } from './Sidebar';
import { UploadView } from './UploadView';
import { ErrorsView } from './ErrorsView';
import { CalendarView } from './CalendarView';
import type { AuthState, FileEntry } from '@/lib/types';
import { loadHistory, saveHistory } from '@/lib/history';

export default function TrazaApp() {
  const [active, setActive] = useState<string>('upload');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [authStates, setAuthStates] = useState<Record<string, AuthState | undefined>>({});

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
          />
        )}
        {active === 'calendar' && (
          <CalendarView files={files} authStates={authStates} onOpenParte={openFile} />
        )}
        {active === 'errors' && <ErrorsView files={files} onOpenFile={openFile} />}
      </main>
    </div>
  );
}
