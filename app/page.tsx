"use client"

import { useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { UploadView } from "@/components/upload-view"
import { ErrorsView } from "@/components/errors-view"
import type { FileEntry } from "@/lib/types"

export default function Home() {
  const [active, setActive] = useState<"upload" | "errors">("upload")
  const [files, setFiles] = useState<FileEntry[]>([])
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null)

  function upsertFile(entry: FileEntry) {
    setFiles((prev) => {
      const idx = prev.findIndex((f) => f.id === entry.id)
      if (idx === -1) return [entry, ...prev]
      const copy = [...prev]
      copy[idx] = entry
      return copy
    })
    if (entry.status === "analyzed") {
      setSelectedFileId(entry.id)
    }
  }

  function removeFile(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id))
    if (selectedFileId === id) setSelectedFileId(null)
  }

  function openFile(id: string) {
    setActive("upload")
    setSelectedFileId(id)
    setTimeout(() => {
      const el = document.querySelector(".analysis-detail")
      if (el) window.scrollTo({ top: (el as HTMLElement).offsetTop - 24, behavior: "smooth" })
    }, 100)
  }

  const errorCount = files.reduce((acc, f) => {
    if (!f.analysis) return acc
    return acc + f.analysis.summary.error
  }, 0)

  return (
    <div className="grid grid-cols-[240px_1fr] min-h-screen">
      <Sidebar active={active} setActive={setActive} errorCount={errorCount} />
      <main className="p-10 max-w-[1280px] w-full">
        {active === "upload" && (
          <UploadView
            files={files}
            onAddFile={upsertFile}
            onRemoveFile={removeFile}
            onSelectFile={setSelectedFileId}
            selectedFileId={selectedFileId}
          />
        )}
        {active === "errors" && <ErrorsView files={files} onOpenFile={openFile} />}
      </main>
    </div>
  )
}
