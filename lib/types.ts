export interface Thumbnail {
  dataUrl: string
  width: number
  height: number
}

export interface OcrWord {
  text: string
  bbox: {
    x0: number
    y0: number
    x1: number
    y1: number
  }
  confidence?: number
}

export interface OcrPage {
  page: number
  words: OcrWord[]
  width: number
  height: number
}

export interface Span {
  page: number
  bbox: {
    x0: number
    y0: number
    x1: number
    y1: number
  }
  canvasWidth: number
  canvasHeight: number
}

export interface Suggestion {
  code: string
  desc: string
}

export interface Finding {
  severity: "error" | "warn" | "ok" | "info"
  code: string
  title: string
  body: string
  action?: string
  suggestion?: Suggestion
  spans?: Span[]
}

export interface Analysis {
  findings: Finding[]
  summary: {
    ok: number
    warn: number
    error: number
  }
  overall: "ok" | "warn" | "error"
  detected: {
    codes: string[]
    prepagas: string[]
    sanatorios: string[]
    fechas: string[]
    procedureGuess?: {
      keyword: string
      code: string
      desc: string
    } | null
  }
  fileName: string
  analyzedAt: string
}

export interface FileEntry {
  id: string
  name: string
  size: number
  type: string
  addedAt: string
  status: "analyzing" | "analyzed" | "error"
  progress?: number
  progressMessage?: string
  text?: string
  thumbnails?: Thumbnail[]
  method?: "pdf-text" | "ocr"
  ocrWords?: OcrPage[]
  analysis?: Analysis
  errorMessage?: string
}
