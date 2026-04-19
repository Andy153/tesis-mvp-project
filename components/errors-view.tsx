"use client"

import { useState } from "react"
import { Calendar } from "lucide-react"
import type { FileEntry } from "@/lib/types"

interface ErrorsViewProps {
  files: FileEntry[]
  onOpenFile: (id: string) => void
}

interface FlatError {
  severity: "error" | "warn" | "info"
  title: string
  body: string
  action?: string
  fileId: string
  fileName: string
  fileDate: string
  prepaga: string
  codigo: string | null
}

export function ErrorsView({ files, onOpenFile }: ErrorsViewProps) {
  const [filter, setFilter] = useState<"all" | "error" | "warn">("all")

  const allErrors: FlatError[] = []
  for (const f of files) {
    if (!f.analysis) continue
    for (const finding of f.analysis.findings) {
      if (finding.severity === "ok") continue
      allErrors.push({
        severity: finding.severity as "error" | "warn" | "info",
        title: finding.title,
        body: finding.body,
        action: finding.action,
        fileId: f.id,
        fileName: f.name,
        fileDate: f.addedAt,
        prepaga: f.analysis.detected.prepagas[0] || "-",
        codigo: f.analysis.detected.codes[0] || null,
      })
    }
  }

  const counts = {
    all: allErrors.length,
    error: allErrors.filter((e) => e.severity === "error").length,
    warn: allErrors.filter((e) => e.severity === "warn").length,
  }

  const filtered = filter === "all" ? allErrors : allErrors.filter((e) => e.severity === filter)

  const filesAnalyzed = files.filter((f) => f.analysis).length
  const filesWithErrors = files.filter((f) => f.analysis?.overall === "error").length

  return (
    <div>
      <div className="flex items-end justify-between mb-8 gap-6">
        <div>
          <h1 className="font-serif text-[40px] font-normal m-0 tracking-tight text-foreground">
            Errores detectados
          </h1>
          <p className="text-muted-foreground mt-1.5 text-sm max-w-[600px]">
            Historial consolidado de todos los errores encontrados en tus documentos. Corregilos antes de presentar
            para evitar rechazos.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="p-4 bg-card border border-border rounded-[10px]">
          <div className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground font-medium">
            Documentos analizados
          </div>
          <div className="font-serif text-[32px] font-normal mt-1.5 leading-none tracking-tight">
            {filesAnalyzed}
          </div>
        </div>
        <div className="p-4 bg-card border border-border rounded-[10px]">
          <div className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground font-medium">
            Con errores criticos
          </div>
          <div className="font-serif text-[32px] font-normal mt-1.5 leading-none tracking-tight text-[var(--error)]">
            {filesWithErrors}
          </div>
        </div>
        <div className="p-4 bg-card border border-border rounded-[10px]">
          <div className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground font-medium">Errores totales</div>
          <div className="font-serif text-[32px] font-normal mt-1.5 leading-none tracking-tight text-[var(--error)]">
            {counts.error}
          </div>
        </div>
        <div className="p-4 bg-card border border-border rounded-[10px]">
          <div className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground font-medium">Advertencias</div>
          <div className="font-serif text-[32px] font-normal mt-1.5 leading-none tracking-tight text-[var(--warn)]">
            {counts.warn}
          </div>
        </div>
      </div>

      <div className="flex gap-2.5 items-center mb-4 flex-wrap">
        {(["all", "error", "warn"] as const).map((f) => (
          <div
            key={f}
            className={`inline-flex items-center gap-1.5 py-1 px-3 rounded-full text-xs font-medium border cursor-pointer transition-all ${
              filter === f
                ? "bg-foreground text-background border-foreground"
                : "bg-card text-muted-foreground border-border-strong hover:bg-secondary"
            }`}
            onClick={() => setFilter(f)}
          >
            {f === "all" ? "Todos" : f === "error" ? "Errores" : "Advertencias"}
            <span
              className={`px-1.5 rounded-full text-[10.5px] font-semibold ${
                filter === f ? "bg-[rgba(255,255,255,0.2)]" : "bg-[rgba(0,0,0,0.08)]"
              }`}
            >
              {counts[f]}
            </span>
          </div>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-[10px] p-16 text-center text-muted-foreground">
          <div className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-60">
            <Calendar className="w-12 h-12" />
          </div>
          <div className="text-[15px] font-semibold text-foreground mb-1">
            {allErrors.length === 0 ? "Todavia no analizaste documentos" : "Sin resultados para este filtro"}
          </div>
          <div>
            {allErrors.length === 0
              ? 'Subi un documento en la pestana "Cargar documentos" para empezar'
              : "Proba con otro filtro"}
          </div>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-[10px] overflow-hidden">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="text-left py-3 px-4 text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground font-semibold border-b border-border bg-secondary w-20">
                  Sev.
                </th>
                <th className="text-left py-3 px-4 text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground font-semibold border-b border-border bg-secondary">
                  Problema
                </th>
                <th className="text-left py-3 px-4 text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground font-semibold border-b border-border bg-secondary w-[200px]">
                  Archivo
                </th>
                <th className="text-left py-3 px-4 text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground font-semibold border-b border-border bg-secondary w-[130px]">
                  Prepaga
                </th>
                <th className="text-left py-3 px-4 text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground font-semibold border-b border-border bg-secondary w-[100px]">
                  Codigo
                </th>
                <th className="text-left py-3 px-4 text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground font-semibold border-b border-border bg-secondary w-[100px]"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e, i) => (
                <tr key={i} className="hover:bg-secondary">
                  <td className="py-3.5 px-4 border-b border-border text-[13px] align-top">
                    {e.severity === "error" && (
                      <span className="inline-flex items-center gap-1.5 py-0.5 px-2 rounded-full text-[11px] font-semibold bg-[var(--error-soft)] text-[var(--error)]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--error)]"></span>
                        Error
                      </span>
                    )}
                    {e.severity === "warn" && (
                      <span className="inline-flex items-center gap-1.5 py-0.5 px-2 rounded-full text-[11px] font-semibold bg-[var(--warn-soft)] text-[var(--warn)]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--warn)]"></span>
                        Warn
                      </span>
                    )}
                    {e.severity === "info" && (
                      <span className="inline-flex items-center gap-1.5 py-0.5 px-2 rounded-full text-[11px] font-semibold bg-secondary text-muted-foreground">
                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground"></span>
                        Manual
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 border-b border-border text-[13px] align-top">
                    <div className="font-medium">{e.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{e.action || e.body}</div>
                  </td>
                  <td className="py-3.5 px-4 border-b border-border text-[13px] align-top">
                    <div className="font-mono text-[11.5px] text-muted-foreground">{e.fileName}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {new Date(e.fileDate).toLocaleDateString("es-AR")}
                    </div>
                  </td>
                  <td className="py-3.5 px-4 border-b border-border text-[13px] align-top">{e.prepaga}</td>
                  <td className="py-3.5 px-4 border-b border-border text-[13px] align-top">
                    {e.codigo ? (
                      <code className="font-mono text-[11.5px]">{e.codigo}</code>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 border-b border-border text-[13px] align-top">
                    <button
                      className="inline-flex items-center gap-1.5 py-1.5 px-2.5 rounded-md border-0 bg-transparent text-foreground text-xs font-medium cursor-pointer transition-all hover:bg-secondary"
                      onClick={() => onOpenFile(e.fileId)}
                    >
                      Ver archivo
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
