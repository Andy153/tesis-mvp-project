"use client"

import { useState } from "react"
import type { FileEntry, Finding, Span, Thumbnail } from "@/lib/types"
import { TargetIcon, SparklesIcon } from "./icons"

interface AnalysisDetailProps {
  file: FileEntry
}

export function AnalysisDetail({ file }: AnalysisDetailProps) {
  const { analysis, thumbnails } = file
  const [activeFindingIdx, setActiveFindingIdx] = useState<number | null>(null)

  if (!analysis) return null

  const sorted = [...analysis.findings].sort((a, b) => {
    const order = { error: 0, warn: 1, ok: 2, info: 3 }
    return order[a.severity] - order[b.severity]
  })

  const activeFinding = activeFindingIdx !== null ? sorted[activeFindingIdx] : null
  const activeSpans = activeFinding?.spans || []

  // Group spans by page
  const spansByPage: Record<number, Array<Span & { severity: string }>> = {}
  for (const f of sorted) {
    if (!f.spans) continue
    if (f.severity === "ok") continue
    for (const s of f.spans) {
      if (!spansByPage[s.page]) spansByPage[s.page] = []
      spansByPage[s.page].push({ ...s, severity: f.severity })
    }
  }

  return (
    <div className="analysis-detail mt-6 grid grid-cols-[1.1fr_1fr] gap-4">
      <div className="bg-card border border-border rounded-[10px] shadow-sm overflow-hidden min-h-[500px] flex flex-col">
        <div className="py-3.5 px-4 border-b border-border flex justify-between items-center">
          <div className="font-semibold text-[13px]">{file.name}</div>
          <div className="text-[11.5px] text-muted-foreground font-mono">
            {file.method === "ocr" ? "OCR - espanol" : "PDF - texto embebido"}
          </div>
        </div>
        <div className="flex-1 overflow-auto bg-secondary p-4 flex flex-col gap-4 items-center">
          {thumbnails?.map((thumb, i) => (
            <DocPage
              key={i}
              thumb={thumb}
              pageIdx={i}
              spans={spansByPage[i] || []}
              activeSpanBboxes={activeSpans.filter((s) => s.page === i).map((s) => s.bbox)}
            />
          ))}
          {!thumbnails?.length && (
            <div className="p-5 text-muted-foreground text-xs">Sin preview disponible</div>
          )}
        </div>
        <div className="py-2.5 px-4 border-t border-border flex items-center gap-2.5 text-[11px] text-muted-foreground">
          <span className="w-2.5 h-2.5 rounded bg-[rgba(214,56,56,0.3)] border-2 border-[#D63838]"></span> Error
          <span className="w-2.5 h-2.5 rounded bg-[rgba(196,133,15,0.3)] border-2 border-[#C4850F] ml-2"></span>{" "}
          Advertencia
          <span className="ml-auto text-muted-foreground">Click un hallazgo para resaltar</span>
        </div>
      </div>

      <div className="bg-card border border-border rounded-[10px] shadow-sm overflow-hidden flex flex-col">
        <div className="py-3.5 px-4 border-b border-border">
          <h3 className="m-0 text-sm font-semibold">Resultado del analisis</h3>
          <div className="text-xs text-muted-foreground mt-0.5">
            {analysis.detected.prepagas.length > 0 && (
              <>
                Prepaga: <b>{analysis.detected.prepagas.join(", ")}</b> -{" "}
              </>
            )}
            {analysis.detected.codes.length > 0 ? (
              <>
                Codigo detectado: <code className="font-mono text-[11.5px]">{analysis.detected.codes.join(", ")}</code>
              </>
            ) : (
              <span className="text-muted-foreground">Sin codigo detectado</span>
            )}
          </div>
        </div>
        <div className="p-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="p-2.5 rounded-md text-center border border-border">
              <div className="font-serif text-[28px] leading-none text-[var(--error)]">
                {analysis.summary.error}
              </div>
              <div className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground mt-1 font-medium">
                Errores
              </div>
            </div>
            <div className="p-2.5 rounded-md text-center border border-border">
              <div className="font-serif text-[28px] leading-none text-[var(--warn)]">
                {analysis.summary.warn}
              </div>
              <div className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground mt-1 font-medium">
                Advertencias
              </div>
            </div>
            <div className="p-2.5 rounded-md text-center border border-border">
              <div className="font-serif text-[28px] leading-none text-[var(--ok)]">
                {analysis.summary.ok}
              </div>
              <div className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground mt-1 font-medium">
                OK
              </div>
            </div>
          </div>

          {sorted.map((f, i) => (
            <FindingCard
              key={i}
              finding={f}
              isActive={activeFindingIdx === i}
              onClick={() => f.spans?.length && setActiveFindingIdx(activeFindingIdx === i ? null : i)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

interface DocPageProps {
  thumb: Thumbnail
  pageIdx: number
  spans: Array<Span & { severity: string }>
  activeSpanBboxes: Array<{ x0: number; y0: number; x1: number; y1: number }>
}

function DocPage({ thumb, pageIdx, spans, activeSpanBboxes }: DocPageProps) {
  const hasActive = activeSpanBboxes.length > 0
  return (
    <div className="w-full max-w-[560px] relative">
      <div
        className="relative bg-card border border-border shadow-md w-full overflow-hidden"
        style={{ aspectRatio: `${thumb.width} / ${thumb.height}` }}
      >
        <img src={thumb.dataUrl} alt={`pagina ${pageIdx + 1}`} className="w-full h-auto block" />
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox={`0 0 ${thumb.width} ${thumb.height}`}
          preserveAspectRatio="none"
        >
          {spans.map((s, i) => {
            const { x0, y0, x1, y1 } = s.bbox
            const isActive = activeSpanBboxes.some((b) => b.x0 === x0 && b.y0 === y0)
            const dim = hasActive && !isActive
            return (
              <rect
                key={i}
                x={x0 - 4}
                y={y0 - 4}
                width={x1 - x0 + 8}
                height={y1 - y0 + 8}
                rx="3"
                className={`
                  fill-transparent transition-all duration-250
                  ${s.severity === "error" ? "stroke-[#D63838] fill-[rgba(214,56,56,0.12)]" : ""}
                  ${s.severity === "warn" ? "stroke-[#C4850F] fill-[rgba(196,133,15,0.12)]" : ""}
                  ${isActive ? "stroke-[3.5px] fill-[rgba(214,56,56,0.25)] drop-shadow-[0_0_6px_rgba(214,56,56,0.5)]" : "stroke-[2.5px]"}
                  ${dim ? "opacity-25" : ""}
                `}
              />
            )
          })}
        </svg>
      </div>
    </div>
  )
}

interface FindingCardProps {
  finding: Finding
  isActive: boolean
  onClick: () => void
}

function FindingCard({ finding, isActive, onClick }: FindingCardProps) {
  const hasSpans = (finding.spans?.length || 0) > 0
  const severityClasses = {
    error: "border-l-[var(--error)] bg-[#FCF0EE]",
    warn: "border-l-[var(--warn)] bg-[#FBF5E9]",
    ok: "border-l-[var(--ok)] bg-[#EDF5EF]",
    info: "border-l-[#5B7184] bg-[#EEF1F4]",
  }

  return (
    <div
      className={`p-3.5 rounded-md mb-2.5 border-l-[3px] transition-all ${severityClasses[finding.severity]} ${
        hasSpans ? "cursor-pointer hover:translate-x-0.5" : ""
      } ${isActive ? "shadow-[0_0_0_2px_var(--error)] translate-x-0.5" : ""}`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="font-semibold text-[13px]">{finding.title}</span>
        {hasSpans && (
          <span className="inline-flex items-center gap-1 text-[10.5px] text-[var(--error)] font-medium bg-[rgba(214,56,56,0.1)] py-0.5 px-1.5 rounded-full">
            <TargetIcon className="w-[11px] h-[11px]" /> en documento
          </span>
        )}
      </div>
      <div className="text-[12.5px] text-muted-foreground leading-relaxed">{finding.body}</div>
      {finding.suggestion && (
        <div className="mt-2.5 p-3 bg-card border border-border rounded-md">
          <div className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.08em] font-semibold text-primary mb-2">
            <SparklesIcon className="w-3 h-3" /> Sugerencia de Traza
          </div>
          <div className="flex items-baseline gap-3 p-2.5 bg-accent rounded-md border border-[rgba(45,95,78,0.15)]">
            <span className="font-mono text-lg font-bold text-accent-foreground tracking-wide flex-shrink-0">
              {finding.suggestion.code}
            </span>
            <span className="text-[12.5px] text-foreground leading-snug">{finding.suggestion.desc}</span>
          </div>
          <div className="mt-2 text-[11.5px] text-muted-foreground italic">
            Detectamos el procedimiento en el texto. Este es el codigo de nomenclador que corresponde.
          </div>
        </div>
      )}
      {finding.action && !finding.suggestion && (
        <div className="mt-2 text-xs text-foreground font-medium">&#8594; {finding.action}</div>
      )}
    </div>
  )
}
