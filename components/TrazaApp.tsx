'use client';

import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { UploadView } from './UploadView';
import { ErrorsView } from './ErrorsView';
import type { FileEntry } from '@/lib/types';

export default function TrazaApp() {
  const [active, setActive] = useState<string>('upload');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);

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

  function removeFile(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id));
    if (selectedFileId === id) setSelectedFileId(null);
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
          />
        )}
        {active === 'errors' && <ErrorsView files={files} onOpenFile={openFile} />}
      </main>
    </div>
  );
}
