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

export interface AmbiguousOption {
  code: string;
  desc: string;
  specialty?: string;
  score: number;
}

export interface Finding {
  severity: Severity;
  code: string;
  title: string;
  body: string;
  action?: string;
  suggestion?: { code: string; desc?: string };
  spans?: Span[];
  ambiguous?: {
    code: string;
    options: AmbiguousOption[];
  };
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

export interface StructuredDoc {
  dni: string | null;
  afiliado: string | null;
  paciente: string | null;
  fechaPractica: Date | null;
  fechaAutorizacion: Date | null;
  fechaVencimiento: Date | null;
  nroAutorizacion: string | null;
  prepaga: string | null;
  codigo: string | null;
  procedimientoDesc: string | null;
}

export type SwissCxRow = {
  fecha: string;
  socio: string;
  socioDesc: string;
  codigo: string;
  cant: string;
  detalle: string;
  institucion: string;
  cir: 'X' | '';
  ayud: 'X' | '';
  inst: 'X' | '';
  urgencia: 'X' | '';
  gastos: '';
  nroAutorizacion: string;
};

export interface CrossCheckFinding {
  severity: 'ok' | 'warn' | 'error';
  title: string;
  body: string;
  action?: string;
}

export type AuthState =
  | { status: 'uploading' }
  | { status: 'processing'; fileName: string; file?: File }
  | { status: 'missing' }
  | { status: 'skipped' }
  | { status: 'error'; fileName?: string; errorMessage?: string }
  | {
      status: 'checked';
      fileName: string;
      file?: File;
      bonoText: string;
      bonoData: StructuredDoc;
      parteData: StructuredDoc;
      crossCheck: CrossCheckFinding[];
    };

export interface FileEntry {
  id: string;
  name: string;
  size: number;
  type: string;
  addedAt: string;
  batchId?: string;
  manualChecks?: {
    patient?: boolean;
    procedure?: boolean;
  };
  status: 'analyzing' | 'analyzed' | 'error';
  progress?: number;
  progressMessage?: string;
  text?: string;
  file?: File;
  thumbnails?: Thumbnail[];
  method?: 'pdf-text' | 'ocr';
  ocrWords?: PageWords[];
  analysis?: Analysis;
  errorMessage?: string;
  exports?: {
    swissCx?: {
      createdAt: string;
      parteFileId: string;
      batchId: string | null;
      row: SwissCxRow;
      planillaError?: string;
      files?: {
        interventionId: string;
        parteUrl: string;
        permisoUrl?: string;
        xlsxUrl?: string;
        csvUrl?: string;
      };
    };
  };
}

export interface ExtractionResult {
  text: string;
  thumbnails: Thumbnail[];
  method: 'pdf-text' | 'ocr';
  ocrWords: PageWords[];
}
