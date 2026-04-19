"use client"

import { useState, useRef } from "react"
import { Upload, Eye, Trash2 } from "lucide-react"
import type { FileEntry } from "@/lib/types"
import { extractText } from "@/lib/extractor"
import { analyzeDocument } from "@/lib/analyzer"
import { AnalysisDetail } from "./analysis-detail"

interface UploadViewProps {
  files: FileEntry[]
  onAddFile: (file: FileEntry) => void
  onRemoveFile: (id: string) => void
  onSelectFile: (id: string) => void
  selectedFileId: string | null
}

const ACCEPT = "application/pdf,image/png,image/jpeg,image/jpg,image/webp"

export function UploadView({ files, onAddFile, onRemoveFile, onSelectFile, selectedFileId }: UploadViewProps) {
  const [drag, setDrag] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFiles(fileList: FileList | File[]) {
    for (const file of Array.from(fileList)) {
      const id = "f_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6)
      const entry: FileEntry = {
        id,
        name: file.name,
        size: file.size,
        type: file.type,
        addedAt: new Date().toISOString(),
        status: "analyzing",
        progress: 0,
        progressMessage: "Iniciando...",
      }
      onAddFile(entry)

      try {
        const { text, thumbnails, method, ocrWords } = await extractText(file, (p) => {
          onAddFile({ ...entry, progress: p.progress, progressMessage: p.message })
        })

        const analysis = analyzeDocument(text, file.name, ocrWords)

        onAddFile({
          ...entry,
          status: "analyzed",
          progress: 1,
          text,
          thumbnails,
          method,
          ocrWords,
          analysis,
        })
      } catch (err) {
        console.error(err)
        onAddFile({
          ...entry,
          status: "error",
          errorMessage: err instanceof Error ? err.message : "Error procesando archivo",
        })
      }
    }
  }

  const selected = files.find((f) => f.id === selectedFileId)

  return (
    <div>
      <div className="flex items-end justify-between mb-8 gap-6">
        <div>
          <h1 className="font-serif text-[40px] font-normal m-0 tracking-tight text-foreground">
            Cargar documentos
          </h1>
          <p className="text-muted-foreground mt-1.5 text-sm max-w-[600px]">
            Subi parte quirurgico, autorizaciones u otra documentacion. Traza detecta automaticamente errores comunes
            antes de que presentes.
          </p>
        </div>
        {files.length > 0 && (
          <button
            className="inline-flex items-center gap-2 py-2 px-4 rounded-md border border-border-strong bg-card text-foreground text-[13px] font-medium cursor-pointer transition-all hover:bg-secondary"
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="w-3.5 h-3.5" /> Subir mas
          </button>
        )}
      </div>

      {files.length === 0 && (
        <div
          className={`border-2 border-dashed rounded-[10px] p-12 text-center bg-card transition-all cursor-pointer ${
            drag ? "border-primary bg-accent" : "border-border-strong hover:border-primary hover:bg-accent"
          }`}
          onDragOver={(e) => {
            e.preventDefault()
            setDrag(true)
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDrag(false)
            handleFiles(e.dataTransfer.files)
          }}
          onClick={() => inputRef.current?.click()}
        >
          <div
            className={`w-12 h-12 mx-auto mb-3 ${drag ? "text-primary" : "text-muted-foreground"}`}
          >
            <Upload className="w-12 h-12" />
          </div>
          <div className="text-base font-semibold mb-1">Arrastra archivos aca o hace click para subir</div>
          <div className="text-muted-foreground text-[13px]">
            Traza analiza cada documento y detecta errores antes de que presentes
          </div>
          <div className="inline-flex gap-1.5 mt-3 flex-wrap justify-center">
            {["PDF", "PNG", "JPG", "JPEG", "WEBP"].map((fmt) => (
              <span
                key={fmt}
                className="font-mono text-[10.5px] py-0.5 px-2 bg-secondary rounded text-muted-foreground"
              >
                {fmt}
              </span>
            ))}
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
      />

      {files.length > 0 && (
        <div className="mt-6 flex flex-col gap-2">
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

      {selected && selected.status === "analyzed" && <AnalysisDetail file={selected} />}
    </div>
  )
}

interface FileRowProps {
  file: FileEntry
  onClick: () => void
  onRemove: () => void
  isSelected: boolean
}

function FileRow({ file, onClick, onRemove, isSelected }: FileRowProps) {
  const ext = file.name.split(".").pop()?.toUpperCase() || ""
  const size = (file.size / 1024).toFixed(0) + " KB"

  return (
    <div
      className={`grid grid-cols-[44px_1fr_auto_auto_auto] gap-3.5 items-center py-3 px-4 bg-card border rounded-[10px] transition-all cursor-pointer ${
        isSelected ? "border-primary" : "border-border hover:border-border-strong hover:shadow-sm"
      }`}
      onClick={onClick}
    >
      <div className="w-11 h-11 rounded-md bg-secondary grid place-items-center text-muted-foreground font-mono text-[10px] font-semibold overflow-hidden border border-border">
        {file.thumbnails?.[0] ? (
          <img
            src={file.thumbnails[0].dataUrl}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          ext
        )}
      </div>
      <div className="min-w-0">
        <div className="font-semibold text-[13.5px] overflow-hidden text-ellipsis whitespace-nowrap">
          {file.name}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {size} -{" "}
          {new Date(file.addedAt).toLocaleString("es-AR", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
          {file.method && <> - {file.method === "ocr" ? "OCR aplicado" : "texto PDF"}</>}
        </div>
        {file.status === "analyzing" && (
          <div className="mt-1.5 text-[11.5px] text-muted-foreground flex items-center gap-1.5">
            <span className="spinner"></span>
            {file.progressMessage}
            <div className="flex-1 max-w-[180px] h-1 bg-border rounded overflow-hidden">
              <div
                className="h-full bg-primary transition-[width] duration-300"
                style={{ width: `${(file.progress || 0) * 100}%` }}
              ></div>
            </div>
          </div>
        )}
      </div>
      <div className="min-w-[120px] flex justify-end">
        {file.status === "analyzing" && (
          <span className="inline-flex items-center gap-1.5 py-0.5 px-2 rounded-full text-[11px] font-semibold bg-secondary text-muted-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground"></span>
            Analizando
          </span>
        )}
        {file.status === "analyzed" && file.analysis?.overall === "ok" && (
          <span className="inline-flex items-center gap-1.5 py-0.5 px-2 rounded-full text-[11px] font-semibold bg-[var(--ok-soft)] text-[var(--ok)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--ok)]"></span>
            Sin errores
          </span>
        )}
        {file.status === "analyzed" && file.analysis?.overall === "warn" && (
          <span className="inline-flex items-center gap-1.5 py-0.5 px-2 rounded-full text-[11px] font-semibold bg-[var(--warn-soft)] text-[var(--warn)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--warn)]"></span>
            {file.analysis.summary.warn} advertencia{file.analysis.summary.warn > 1 ? "s" : ""}
          </span>
        )}
        {file.status === "analyzed" && file.analysis?.overall === "error" && (
          <span className="inline-flex items-center gap-1.5 py-0.5 px-2 rounded-full text-[11px] font-semibold bg-[var(--error-soft)] text-[var(--error)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--error)]"></span>
            {file.analysis.summary.error} error{file.analysis.summary.error > 1 ? "es" : ""}
          </span>
        )}
        {file.status === "error" && (
          <span className="inline-flex items-center gap-1.5 py-0.5 px-2 rounded-full text-[11px] font-semibold bg-[var(--error-soft)] text-[var(--error)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--error)]"></span>
            Fallo
          </span>
        )}
      </div>
      <button
        className="inline-flex items-center gap-1.5 py-1.5 px-2.5 rounded-md border-0 bg-transparent text-foreground text-xs font-medium cursor-pointer transition-all hover:bg-secondary"
        onClick={(e) => {
          e.stopPropagation()
          onClick()
        }}
      >
        <Eye className="w-3 h-3" /> Ver
      </button>
      <button
        className="inline-flex items-center gap-1.5 py-1.5 px-2.5 rounded-md border-0 bg-transparent text-destructive text-xs font-medium cursor-pointer transition-all hover:bg-[var(--error-soft)]"
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  )
}
