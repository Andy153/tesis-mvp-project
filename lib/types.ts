export type Severity = 'error' | 'warn' | 'ok' | 'info';

export interface BBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Span {
  page: number;
  bbox: BBox;
  canvasWidth?: number;
  canvasHeight?: number;
}

export interface Finding {
  severity: Severity;
  code: string;
  title: string;
  body: string;
  action?: string;
  suggestion?: { code: string; desc?: string };
  spans?: Span[];
}

export interface PageWords {
  page: number;
  words: Array<{ text: string; bbox: BBox; confidence?: number }>;
  width: number;
  height: number;
}

export interface Thumbnail {
  dataUrl: string;
  width: number;
  height: number;
}

export interface Analysis {
  findings: Finding[];
  summary: { ok: number; warn: number; error: number };
  overall: 'ok' | 'warn' | 'error';
  detected: {
    codes: string[];
    prepagas: string[];
    sanatorios: string[];
    fechas: string[];
    procedureGuess: { keyword: string; code: string; desc?: string } | null;
  };
  fileName: string;
  analyzedAt: string;
}

export interface FileEntry {
  id: string;
  name: string;
  size: number;
  type: string;
  addedAt: string;
  status: 'analyzing' | 'analyzed' | 'error';
  progress?: number;
  progressMessage?: string;
  text?: string;
  thumbnails?: Thumbnail[];
  method?: 'pdf-text' | 'ocr';
  ocrWords?: PageWords[];
  analysis?: Analysis;
  errorMessage?: string;
}

export interface ExtractionResult {
  text: string;
  thumbnails: Thumbnail[];
  method: 'pdf-text' | 'ocr';
  ocrWords: PageWords[];
}
