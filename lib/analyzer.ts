// Trazá — Motor de análisis (TypeScript, client-only)
import type { Analysis, ExtractionResult, Finding, PageWords, Span } from './types';
import { parteExtractToAnalysisText } from './ai/parteExtractToAnalysisText';
import type { ParteQuirurgicoExtract } from './ai/schemas';
import { TRAZA_NOMENCLADOR_FULL, TRAZA_PROC_KEYWORDS } from './nomenclador.js';
import { TRAZA_PREPAGAS, TRAZA_REQUIRED_FIELDS, TRAZA_SANATORIOS } from './traza-constants';
import { matchScore } from './semantic';

/** Incrementar al cambiar reglas de análisis para invalidar análisis guardados en `loadHistory`. */
export const TRAZA_ANALYZER_REVISION = 13;

type NomenRow = { entries: Array<{ desc: string; specialty?: string }>; ambiguous?: boolean };
const NOMEN = TRAZA_NOMENCLADOR_FULL as Record<string, NomenRow>;

type ProcKw = { keywords: string[]; code: string };
const PROC_KEYWORDS = TRAZA_PROC_KEYWORDS as ProcKw[];

type ProgressFn = (p: { progress: number; message: string }) => void;

async function fetchParteExtractionFromOpenAI(imageDataUrl: string): Promise<ParteQuirurgicoExtract | null> {
  try {
    const res = await fetch('/api/ai/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: imageDataUrl, documentType: 'parte_quirurgico' }),
    });
    const json = (await res.json()) as { ok?: boolean; data?: ParteQuirurgicoExtract };
    if (!json || json.ok !== true || !json.data) return null;
    return json.data;
  } catch {
    return null;
  }
}

/**
 * Primera página solamente (Commit 2). Si OpenAI responde ok, reemplaza `text` y repite el mismo
 * string en cada entrada de `pageTexts`. `method`, `ocrWords` y `thumbnails` quedan del pipeline legacy.
 */
async function tryOverlayOpenAiParteText(result: ExtractionResult, onProgress?: ProgressFn): Promise<ExtractionResult> {
  const first = result.thumbnails[0]?.dataUrl;
  const n = result.pageTexts.length;
  if (!first || n === 0) {
    onProgress?.({ progress: 1, message: 'Listo' });
    return result;
  }
  onProgress?.({ progress: 1, message: 'Finalizando...' });
  const data = await fetchParteExtractionFromOpenAI(first);
  if (!data) {
    onProgress?.({ progress: 1, message: 'Listo' });
    return result;
  }
  const text = parteExtractToAnalysisText(data);
  const pageTexts = Array.from({ length: n }, () => text);
  onProgress?.({ progress: 1, message: 'Listo' });
  return { ...result, text, pageTexts };
}

export async function extractText(file: File, onProgress?: ProgressFn): Promise<ExtractionResult> {
  const type = file.type;
  if (type === 'application/pdf') return extractFromPdf(file, onProgress);
  if (type.startsWith('image/')) return extractFromImage(file, onProgress);
  throw new Error('Formato no soportado: ' + type);
}

async function loadPdfjs() {
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.js');
  pdfjs.GlobalWorkerOptions.workerSrc =
    'https://unpkg.com/pdfjs-dist@3.11.174/legacy/build/pdf.worker.min.js';
  return pdfjs;
}

async function extractFromPdf(file: File, onProgress?: ProgressFn): Promise<ExtractionResult> {
  onProgress?.({ progress: 0.1, message: 'Leyendo PDF...' });
  const arrayBuffer = await file.arrayBuffer();
  const pdfjs = await loadPdfjs();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;

  let allText = '';
  const pageTexts: string[] = [];
  const thumbnails: ExtractionResult['thumbnails'] = [];
  let ocrWords: PageWords[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const SCALE = 1.8;
    const viewport = page.getViewport({ scale: SCALE });

    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((i: any) => i.str).join(' ');
    pageTexts.push(pageText);
    allText += pageText + '\n';

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
    thumbnails.push({ dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height });

    const pageWords: PageWords['words'] = [];
    for (const item of textContent.items as any[]) {
      if (!item.str || !item.str.trim()) continue;
      const tx = item.transform;
      const m = pdfjs.Util.transform(viewport.transform, tx);
      const fontHeight = Math.hypot(m[2], m[3]);
      const widthPdf = item.width || (item.str.length * (Math.abs(tx[0]) || 12) * 0.5);
      const widthCanvas = widthPdf * SCALE;
      const baseX = m[4];
      const baseY = m[5];
      const x0 = baseX;
      const y0 = baseY - fontHeight;
      const x1 = baseX + widthCanvas;
      const y1 = baseY;
      const tokens = item.str.split(/\s+/).filter((t: string) => t.length > 0);
      if (tokens.length === 0) continue;
      const totalChars = item.str.length || 1;
      let cursor = 0;
      for (const tok of tokens) {
        const wx0 = x0 + (cursor / totalChars) * widthCanvas;
        const wx1 = x0 + ((cursor + tok.length) / totalChars) * widthCanvas;
        pageWords.push({ text: tok, bbox: { x0: wx0, y0, x1: wx1, y1 } });
        cursor += tok.length + 1;
      }
    }
    ocrWords.push({ page: p - 1, words: pageWords, width: canvas.width, height: canvas.height });

    onProgress?.({ progress: 0.1 + 0.3 * (p / pdf.numPages), message: `Procesando página ${p}/${pdf.numPages}...` });
  }

  let method: 'pdf-text' | 'ocr' = 'pdf-text';
  if (allText.trim().length < 50) {
    method = 'ocr';
    allText = '';
    ocrWords = [];
    pageTexts.length = 0;
    for (let i = 0; i < thumbnails.length; i++) {
      const res = await ocrImageWithWords(thumbnails[i].dataUrl, (prog) => {
        onProgress?.({
          progress: 0.4 + 0.55 * ((i + prog) / thumbnails.length),
          message: `OCR página ${i + 1}/${thumbnails.length}`,
        });
      });
      pageTexts.push(res.text);
      allText += res.text + '\n';
      ocrWords.push({ page: i, words: res.words, width: thumbnails[i].width, height: thumbnails[i].height });
    }
  } else {
    // PDF híbrido: completar con OCR solo páginas casi vacías para mejorar encuadre.
    const sparsePages = ocrWords.filter((p) => (p.words || []).length < 8).map((p) => p.page);
    for (let k = 0; k < sparsePages.length; k++) {
      const i = sparsePages[k];
      const res = await ocrImageWithWords(thumbnails[i].dataUrl, (prog) => {
        onProgress?.({
          progress: 0.45 + 0.5 * ((k + prog) / sparsePages.length),
          message: `OCR página ${i + 1}/${thumbnails.length} (refuerzo)`,
        });
      });
      pageTexts[i] = res.text || pageTexts[i];
      const idx = ocrWords.findIndex((p) => p.page === i);
      if (idx >= 0) {
        ocrWords[idx] = { page: i, words: res.words, width: thumbnails[i].width, height: thumbnails[i].height };
      }
    }
    allText = pageTexts.join('\n') + '\n';
  }

  const base: ExtractionResult = { text: allText, thumbnails, method, ocrWords, pageTexts };
  return tryOverlayOpenAiParteText(base, onProgress);
}

async function extractFromImage(file: File, onProgress?: ProgressFn): Promise<ExtractionResult> {
  onProgress?.({ progress: 0.1, message: 'Cargando imagen...' });
  const dataUrl = await fileToDataUrl(file);
  const dim = await imageDimensions(dataUrl);
  onProgress?.({ progress: 0.2, message: 'Aplicando OCR...' });
  const res = await ocrImageWithWords(dataUrl, (prog) => {
    onProgress?.({ progress: 0.2 + 0.75 * prog, message: 'Reconociendo texto...' });
  });
  const base: ExtractionResult = {
    text: res.text,
    thumbnails: [{ dataUrl, width: dim.width, height: dim.height }],
    method: 'ocr',
    ocrWords: [{ page: 0, words: res.words, width: dim.width, height: dim.height }],
    pageTexts: [res.text],
  };
  return tryOverlayOpenAiParteText(base, onProgress);
}

function imageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((r) => {
    const img = new Image();
    img.onload = () => r({ width: img.naturalWidth, height: img.naturalHeight });
    img.src = dataUrl;
  });
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function ocrImageWithWords(
  dataUrl: string,
  onProg?: (p: number) => void,
): Promise<{ text: string; words: PageWords['words'] }> {
  const Tesseract: any = await import('tesseract.js');
  const { data } = await Tesseract.recognize(dataUrl, 'spa', {
    logger: (m: any) => {
      if (m.status === 'recognizing text' && onProg) onProg(m.progress || 0);
    },
  });
  return {
    text: data.text,
    words: (data.words || []).map((w: any) => ({
      text: w.text,
      bbox: w.bbox,
      confidence: w.confidence,
    })),
  };
}

function stripAccents(s: string) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Evita que "parto" matchee dentro de "partograma", etc. */
function hasWholeWord(haystackLower: string, needle: string): boolean {
  const n = stripAccents(needle.toLowerCase());
  if (!n.trim()) return false;
  const re = new RegExp(`(?:^|[^a-z0-9áéíóúüñ])${escapeRegExp(n)}(?:$|[^a-z0-9áéíóúüñ])`, 'i');
  return re.test(haystackLower);
}

function isPartogramDocument(lower: string, fileNameLower: string): boolean {
  const fn = stripAccents(fileNameLower.toLowerCase());
  if (/\bparto\s*grama\b/i.test(fn) || fn.includes('partogram')) return true;
  return (
    /\bparto\s*grama\b/i.test(lower) ||
    lower.includes('partograma') ||
    lower.includes('partogram') ||
    (lower.includes('dilatacion cervical') && lower.includes('frecuencia cardiaca fetal')) ||
    (lower.includes('membranas ovulares') && lower.includes('dilatacion')) ||
    (lower.includes('frecuencia cardiaca fetal') && lower.includes('tension arterial')) ||
    (lower.includes('personal carga') && lower.includes('dilatacion cervical'))
  );
}

/** Para partogramas: fecha junto a "fecha procedimiento"; se prefiere la última aparición (suele estar en hoja 2). */
function extractPartogramProcedureDateStr(text: string): string | null {
  type Hit = { s: string; idx: number };
  let best: Hit | null = null;
  const consider = (dateStr: string | undefined, idx: number) => {
    if (!dateStr || !/\d/.test(dateStr)) return;
    if (!best || idx >= best.idx) best = { s: dateStr, idx };
  };

  const linePatterns = [
    /fecha\s*(del\s*)?procedimiento\s*[.:]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/gi,
    /fec\.?\s*procedimiento\s*[.:]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/gi,
    /fecha\s*de\s*procedimiento\s*[.:]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/gi,
  ];
  for (const re of linePatterns) {
    const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
    for (const m of text.matchAll(r)) {
      const raw = m.length >= 3 ? m[2] || m[1] : m[1];
      if (raw && /\d{1,2}[\/\-]\d{1,2}/.test(String(raw))) consider(String(raw).trim(), m.index ?? 0);
    }
  }
  if (best) return best.s;

  const lower = stripAccents(text.toLowerCase());
  const markers = [
    'fecha procedimiento',
    'fecha del procedimiento',
    'fec. procedimiento',
    'fec procedimiento',
    'fecha de procedimiento',
  ];
  for (const marker of markers) {
    let from = 0;
    let lastIdx = -1;
    while (true) {
      const i = lower.indexOf(marker, from);
      if (i === -1) break;
      lastIdx = i;
      from = i + 1;
    }
    if (lastIdx === -1) continue;
    const slice = text.slice(lastIdx, lastIdx + 140);
    const dm = slice.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/);
    if (dm) consider(dm[0], lastIdx);
  }
  return best?.s ?? null;
}

export type FindSpanOpts = {
  maxResults?: number;
  /** Página 0-based donde el texto plano contiene la fecha de plazo (alinea OCR con la hoja correcta). */
  preferPage?: number | null;
  /** Exige cercanía a etiquetas de procedimiento/código en la misma página (reduce falsos en otras hojas). */
  requireProcedureFieldContext?: boolean;
  /** Para hallazgos de plazo: exige contexto de etiqueta "fecha" y evita contextos clínicos no válidos. */
  requirePlazoDateContext?: boolean;
};

function parseNeedleCalendarDate(needleRaw: string): { d: number; m: number; y: number } | null {
  const s = stripAccents(needleRaw.trim());
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (!m) return null;
  let y = parseInt(m[3], 10);
  if (y < 100) y += 2000;
  return { d: parseInt(m[1], 10), m: parseInt(m[2], 10), y };
}

function digitsOnly(s: string) {
  return (s || '').replace(/\D/g, '');
}

/** Clave numérica única día+mes+año (4 dígitos año) para comparar celdas OCR sueltas. */
function dateKeyFromParts(d: number, m: number, y: number) {
  return `${String(d).padStart(2, '0')}${String(m).padStart(2, '0')}${y}`;
}

/** Interpreta `ddmmyy` cuando el token OCR aporta exactamente 6 dígitos. */
function sixDigitsToKey(raw: string): string | null {
  const d = digitsOnly(raw);
  if (d.length !== 6) return null;
  const dd = parseInt(d.slice(0, 2), 10);
  const mm = parseInt(d.slice(2, 4), 10);
  let yy = parseInt(d.slice(4, 6), 10);
  if (yy < 100) yy += 2000;
  return dateKeyFromParts(dd, mm, yy);
}

function wordMatchesCalendarDate(raw: string, dt: { d: number; m: number; y: number }): boolean {
  const rawTrim = raw.trim();
  const embedded = rawTrim.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/);
  const candidate = embedded?.[1] || rawTrim;
  const p = parseNeedleCalendarDate(candidate);
  if (p && p.d === dt.d && p.m === dt.m && p.y === dt.y) return true;
  const dig = digitsOnly(candidate);
  const key8 = dateKeyFromParts(dt.d, dt.m, dt.y);
  const key6 = key8.slice(0, 4) + key8.slice(-2);
  if (dig.length === 8) {
    const dd = parseInt(dig.slice(0, 2), 10);
    const mm = parseInt(dig.slice(2, 4), 10);
    const yy = parseInt(dig.slice(4, 8), 10);
    if (dd === dt.d && mm === dt.m && yy === dt.y) return true;
  }
  if (dig.length === 6) {
    const k6 = sixDigitsToKey(candidate);
    if (k6 === dateKeyFromParts(dt.d, dt.m, dt.y)) return true;
  }
  if (dig.length > 8 && dig.length <= 14 && (dig.includes(key8) || dig.includes(key6))) return true;
  return false;
}

/** Distancia en índices de palabra a la etiqueta más cercana tipo "fecha" / "procedimiento" (misma página). */
function dateContextScore(page: PageWords, anchorWordIndex: number): number {
  const words = page.words || [];
  const hints = ['fecha', 'fec.', 'fec ', 'proced', 'practica', 'práctica', 'operacion', 'operación'];
  let best = 10_000;
  for (let i = 0; i < words.length; i++) {
    const t = stripAccents((words[i].text || '').toLowerCase());
    for (const h of hints) {
      if (t.includes(h)) {
        best = Math.min(best, Math.abs(i - anchorWordIndex));
      }
    }
  }
  return best;
}

type DateCand = {
  page: PageWords;
  anchorIndex: number;
  y0: number;
  bboxes: Array<{ x0: number; y0: number; x1: number; y1: number }>;
};

type FindDateSpanOpts = { maxResults: number; preferPage?: number | null; requirePlazoDateContext?: boolean };

function hasPlazoDateContext(page: PageWords, anchorWordIndex: number): boolean {
  const words = page.words || [];
  const from = Math.max(0, anchorWordIndex - 7);
  const to = Math.min(words.length - 1, anchorWordIndex + 7);
  let hasFechaLabel = false;
  let hasBlocked = false;
  const blockedHints = ['nac', 'nacimiento', 'apgar', 'postoperatorio', 'impresion', 'impresión', 'ingreso', 'egreso', 'inicio', 'hora'];
  for (let i = from; i <= to; i++) {
    const t = stripAccents((words[i].text || '').toLowerCase());
    if (t.includes('fecha') || t.includes('fec.')) hasFechaLabel = true;
    if (blockedHints.some((h) => t.includes(h))) hasBlocked = true;
  }
  return hasFechaLabel && !hasBlocked;
}

/** Fechas: sin substring suelto; se elige la coincidencia más cercana a "fecha"/"procedimiento" en la página. */
function findDateSpans(needle: string, ocrPages: PageWords[], spanOpts: FindDateSpanOpts): Span[] {
  const maxResults = spanOpts.maxResults;
  const preferPage = spanOpts.preferPage;
  const requirePlazoDateContext = spanOpts.requirePlazoDateContext === true;
  const dt = parseNeedleCalendarDate(needle);
  if (!dt) return [];
  const needleNorm = stripAccents(needle.trim().toLowerCase()).replace(/\s+/g, '').replace(/[\/\-]/g, '');
  const cands: DateCand[] = [];

  for (const page of ocrPages) {
    const words = page.words || [];
    for (let i = 0; i < words.length; i++) {
      const raw = (words[i].text || '').trim();
      const wNorm = stripAccents(raw.toLowerCase()).replace(/\s+/g, '').replace(/[\/\-]/g, '');
      if (wNorm === needleNorm || wordMatchesCalendarDate(raw, dt)) {
        if (requirePlazoDateContext && !hasPlazoDateContext(page, i)) continue;
        cands.push({ page, anchorIndex: i, y0: words[i].bbox.y0, bboxes: [words[i].bbox] });
      }
    }
    for (let i = 0; i <= words.length - 3; i++) {
      const d0 = parseInt(digitsOnly(words[i].text || ''), 10);
      const d1 = parseInt(digitsOnly(words[i + 1].text || ''), 10);
      const yStr = digitsOnly(words[i + 2].text || '');
      let yw = parseInt(yStr, 10);
      if (yStr.length > 0 && yStr.length <= 2) yw += 2000;
      if (d0 === dt.d && d1 === dt.m && yw === dt.y) {
        if (requirePlazoDateContext && !hasPlazoDateContext(page, i)) continue;
        cands.push({
          page,
          anchorIndex: i,
          y0: Math.min(words[i].bbox.y0, words[i + 1].bbox.y0, words[i + 2].bbox.y0),
          bboxes: [words[i].bbox, words[i + 1].bbox, words[i + 2].bbox],
        });
      }
    }
  }

  if (cands.length === 0) return [];

  cands.sort((a, b) => {
    const sa = dateContextScore(a.page, a.anchorIndex);
    const sb = dateContextScore(b.page, b.anchorIndex);
    if (sa !== sb) return sa - sb;
    // Misma cercanía a etiquetas: la práctica suele documentarse en páginas posteriores del PDF.
    if (a.page.page !== b.page.page) return b.page.page - a.page.page;
    return a.y0 - b.y0;
  });

  const candBboxKey = (c: DateCand) => {
    const sb = c.bboxes;
    const x0 = Math.min(...sb.map((b) => b.x0));
    const y0 = Math.min(...sb.map((b) => b.y0));
    return `${c.page.page}:${Math.round(x0 / 24)}:${Math.round(y0 / 24)}`;
  };
  const ranked: DateCand[] = [];
  const seenKey = new Set<string>();
  for (const c of cands) {
    const k = candBboxKey(c);
    if (seenKey.has(k)) continue;
    seenKey.add(k);
    ranked.push(c);
  }

  if (preferPage !== undefined && preferPage !== null) {
    const pref = preferPage;
    ranked.sort((a, b) => {
      const onA = a.page.page === pref ? 0 : 1;
      const onB = b.page.page === pref ? 0 : 1;
      if (onA !== onB) return onA - onB;
      const sa = dateContextScore(a.page, a.anchorIndex);
      const sb = dateContextScore(b.page, b.anchorIndex);
      if (sa !== sb) return sa - sb;
      if (a.page.page !== b.page.page) return b.page.page - a.page.page;
      return a.y0 - b.y0;
    });
  }

  const out: Span[] = [];
  const cap = Math.max(1, maxResults);
  for (let k = 0; k < Math.min(cap, ranked.length); k++) {
    const c = ranked[k];
    const sb = c.bboxes;
    const x0 = Math.min(...sb.map((b) => b.x0));
    const y0 = Math.min(...sb.map((b) => b.y0));
    const x1 = Math.max(...sb.map((b) => b.x1));
    const y1 = Math.max(...sb.map((b) => b.y1));
    out.push({
      page: c.page.page,
      bbox: { x0, y0, x1, y1 },
      canvasWidth: c.page.width,
      canvasHeight: c.page.height,
    });
  }
  return out;
}

function tokenMatches(nt: string, wordRaw: string, needleTokenCount: number): boolean {
  const wordText = stripAccents((wordRaw || '').toLowerCase()).replace(/[^\w.\-]/g, '');
  const shortAlphaToken =
    needleTokenCount === 1 && nt.length > 0 && nt.length <= 5 && /^[a-záéíóúüñ]+$/i.test(nt);
  const lettersOnlyWord =
    needleTokenCount === 1 && nt.length >= 6 && nt.length <= 28 && /^[a-záéíóúüñ]+$/i.test(nt);
  const codeLikeToken =
    needleTokenCount === 1 &&
    nt.length >= 4 &&
    (/^\d+([\.\-]\d+)*$/.test(nt) || /^\d{2}[.\-]\d{2}[.\-]\d{2}$/.test(nt));
  const shortDigitToken = needleTokenCount === 1 && /^\d+$/.test(nt) && nt.length <= 3;
  if (shortAlphaToken || lettersOnlyWord || codeLikeToken || shortDigitToken) {
    return wordText === nt;
  }
  return wordText === nt || wordText.includes(nt) || nt.includes(wordText);
}

/** Distancia en palabras a pistas de bloque quirúrgico / nomenclador en la misma página. */
function procedureFieldBundleDistance(page: PageWords, anchorWordIndex: number): number {
  const words = page.words || [];
  const hints = ['proced', 'practica', 'práctica', 'ciruj', 'operac', 'operación', 'nomencl', 'codigo', 'código', 'cod.', 'cód', 'interv'];
  let best = 10_000;
  for (let j = 0; j < words.length; j++) {
    const t = stripAccents((words[j].text || '').toLowerCase());
    for (const h of hints) {
      if (t.includes(h)) best = Math.min(best, Math.abs(j - anchorWordIndex));
    }
  }
  return best;
}

/** Para NO_CODE: encuadrar una sola vez el bloque de intervención. */
function findInterventionAnchorSpan(ocrPages?: PageWords[]): Span[] | undefined {
  if (!ocrPages) return undefined;
  const anchors = [
    'operaciones practicadas',
    'tipo procedimiento realizado',
    'tipo procedimiento',
    'datos de la intervencion quirurgica',
    'datos de la intervención quirúrgica',
    'intervencion',
    'intervención',
    'procedimiento',
  ];
  for (const a of anchors) {
    const spans = findSpans(a, ocrPages, { requireProcedureFieldContext: true, maxResults: 1 });
    if (spans.length > 0) return spans;
  }
  for (const a of anchors) {
    const spans = findSpans(a, ocrPages, { maxResults: 1 });
    if (spans.length > 0) return spans;
  }

  // Fallback visual: algunos PDFs escaneados no exponen texto en esa sección.
  // En ese caso marcamos una única caja en el bloque típico de intervención (mitad/baja de pág. 1).
  const byPage = [...ocrPages].sort((a, b) => a.page - b.page);
  const page0 = byPage[0];
  if (!page0) return undefined;
  const w = page0.width || 1000;
  const h = page0.height || 1400;
  const synthetic: Span = {
    page: page0.page,
    bbox: {
      x0: w * 0.08,
      y0: h * 0.30,
      x1: w * 0.94,
      y1: h * 0.76,
    },
    canvasWidth: w,
    canvasHeight: h,
  };
  return [synthetic];
}

/**
 * Ubica texto en `ocrWords` para dibujar rectángulos. En OCR hay que ser estricto: fechas partidas
 * en tokens cortos generan demasiados falsos; por defecto solo `maxResults` cajas (1).
 */
export function findSpans(needle: string, ocrPages?: PageWords[], opts?: FindSpanOpts): Span[] {
  if (!ocrPages || !needle) return [];
  const maxResults = opts?.maxResults ?? 1;

  const trimmed = needle.trim();
  if (parseNeedleCalendarDate(trimmed)) {
    return findDateSpans(trimmed, ocrPages, {
      maxResults,
      preferPage: opts?.preferPage ?? null,
      requirePlazoDateContext: opts?.requirePlazoDateContext ?? false,
    });
  }

  const needleTokens = stripAccents(needle.toLowerCase())
    .replace(/[^\w\s.\-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0);
  if (needleTokens.length === 0) return [];

  const spanFromBboxes = (page: PageWords, bboxes: Array<{ x0: number; y0: number; x1: number; y1: number }>) => {
    const x0 = Math.min(...bboxes.map((b) => b.x0));
    const y0 = Math.min(...bboxes.map((b) => b.y0));
    const x1 = Math.max(...bboxes.map((b) => b.x1));
    const y1 = Math.max(...bboxes.map((b) => b.y1));
    return {
      page: page.page,
      bbox: { x0, y0, x1, y1 },
      canvasWidth: page.width,
      canvasHeight: page.height,
    };
  };

  if (opts?.requireProcedureFieldContext) {
    type MC = { span: Span; dist: number };
    const scored: MC[] = [];
    for (const page of ocrPages) {
      const words = page.words || [];
      for (let i = 0; i <= words.length - needleTokens.length; i++) {
        let matched = true;
        for (let j = 0; j < needleTokens.length; j++) {
          if (!tokenMatches(needleTokens[j], words[i + j].text || '', needleTokens.length)) {
            matched = false;
            break;
          }
        }
        if (matched) {
          const bboxes = [];
          for (let j = 0; j < needleTokens.length; j++) bboxes.push(words[i + j].bbox);
          scored.push({
            span: spanFromBboxes(page, bboxes),
            dist: procedureFieldBundleDistance(page, i),
          });
          i += needleTokens.length - 1;
        }
      }
    }
    scored.sort((a, b) => {
      if (a.dist !== b.dist) return a.dist - b.dist;
      if (a.span.page !== b.span.page) return a.span.page - b.span.page;
      return a.span.bbox.y0 - b.span.bbox.y0;
    });
    const cap = Math.max(1, maxResults);
    if (scored.length > 0) return scored.slice(0, cap).map((x) => x.span);
  }

  const spans: Span[] = [];
  for (const page of ocrPages) {
    const words = page.words || [];
    for (let i = 0; i <= words.length - needleTokens.length; i++) {
      let matched = true;
      for (let j = 0; j < needleTokens.length; j++) {
        if (!tokenMatches(needleTokens[j], words[i + j].text || '', needleTokens.length)) {
          matched = false;
          break;
        }
      }
      if (matched) {
        const bboxes = [];
        for (let j = 0; j < needleTokens.length; j++) bboxes.push(words[i + j].bbox);
        spans.push(spanFromBboxes(page, bboxes));
        if (spans.length >= maxResults) return spans;
        i += needleTokens.length - 1;
      }
    }
  }
  return spans;
}

function fieldLabel(key: string) {
  return (
    ({
      prepaga: 'prepaga / obra social',
      fecha: 'fecha',
      procedimiento: 'procedimiento',
      codigo: 'código de nomenclador',
      sanatorio: 'sanatorio / institución',
      anestesia: 'tipo de anestesia',
      diagnostico: 'diagnóstico',
    } as Record<string, string>)[key] || key
  );
}

/** Página 0-based donde conviene resaltar la fecha de plazo (última hoja que la contiene o bloque procedimiento). */
function findPreferPageForPlazoDate(pageTexts: string[] | undefined, fechaStr: string, isPartogram: boolean): number | null {
  if (!pageTexts?.length || !fechaStr) return null;
  const lowerPages = pageTexts.map((t) => stripAccents(t.toLowerCase()));
  if (isPartogram) {
    for (let p = pageTexts.length - 1; p >= 0; p--) {
      const lo = lowerPages[p];
      if ((lo.includes('fecha') && lo.includes('procedim')) || lo.includes('fec. procedim')) return p;
    }
  }
  const hits: number[] = [];
  for (let p = 0; p < pageTexts.length; p++) {
    if (pageTexts[p].includes(fechaStr)) hits.push(p);
  }
  if (hits.length) return hits[hits.length - 1];
  return null;
}

function extractGeneralPlazoDateStr(text: string): string | null {
  // Prioriza fechas rotuladas como "Fecha" y evita campos de tiempo/eventos clínicos no aptos para plazo.
  const re = /fecha(?:\s*(?:de|del))?\s*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/gi;
  const badCtx = ['nac', 'nacimiento', 'apgar', 'postoperatorio', 'impresion', 'impresión', 'ingreso', 'egreso', 'inicio', 'hora'];
  let best: { date: string; score: number; idx: number } | null = null;
  for (const m of text.matchAll(re)) {
    const date = m[1];
    const idx = m.index ?? 0;
    const ctx = stripAccents(text.slice(Math.max(0, idx - 40), Math.min(text.length, idx + 80)).toLowerCase());
    const hasBad = badCtx.some((b) => ctx.includes(b));
    if (hasBad) continue;
    let score = 0;
    if (ctx.includes('n° cirugia') || ctx.includes('n° cirugia') || ctx.includes('n cirugia')) score += 2;
    if (ctx.includes('centro de procedimientos')) score += 1;
    if (idx < 3000) score += 1;
    const cand = { date, score, idx };
    if (!best || cand.score > best.score || (cand.score === best.score && cand.idx < best.idx)) best = cand;
  }
  return best?.date ?? null;
}

export function analyzeDocument(
  text: string,
  fileName: string,
  ocrWords?: PageWords[],
  pageTexts?: string[],
): Analysis {
  const lower = stripAccents(text.toLowerCase());
  const findings: Finding[] = [];
  const isPartogram = isPartogramDocument(lower, fileName || '');

  const foundFields: Record<string, boolean> = {};
  for (const field of TRAZA_REQUIRED_FIELDS) {
    const hit = field.labels.find((l) => lower.includes(stripAccents(l.toLowerCase())));
    if (hit) foundFields[field.key] = true;
  }

  let procedureGuess: Analysis['detected']['procedureGuess'] = null;
  if (!isPartogram) {
    for (const entry of PROC_KEYWORDS) {
      for (const kw of entry.keywords) {
        if (hasWholeWord(lower, kw)) {
          const entryInNomen = NOMEN[entry.code];
          const descSugerido = entryInNomen?.entries?.[0]?.desc || '';
          procedureGuess = { keyword: kw, code: entry.code, desc: descSugerido };
          break;
        }
      }
      if (procedureGuess) break;
    }
  }

  // En partogramas los números largos (DNI, afiliado, internación) no son códigos de nomenclador.
  const codeRegex = isPartogram
    ? /\b(\d{2}[.\-]\d{2}[.\-]\d{2})\b/g
    : /\b(\d{2}[.\-]\d{2}[.\-]\d{2}|\d{4,8})\b/g;
  const rawCodes = Array.from(new Set(Array.from(text.matchAll(codeRegex)).map((m) => m[1])));
  const validCodes: string[] = [];
  for (const raw of rawCodes) {
    const normalized = raw.replace(/-/g, '.');
    if (NOMEN[normalized]) validCodes.push(normalized);
    else if (NOMEN[raw]) validCodes.push(raw);
  }

  if (!isPartogram && validCodes.length > 0) {
    for (const code of validCodes) {
      const nomen = NOMEN[code];
      const practices = nomen.entries || [];
      const isAmbiguous = !!nomen.ambiguous;

      const scored = practices
        .map((p, i) => ({
          idx: i,
          desc: p.desc,
          specialty: p.specialty,
          score: matchScore(text, p.desc),
        }))
        .sort((a, b) => b.score - a.score);

      const best = scored[0];
      const THRESHOLD = 0.35;

      if (!isAmbiguous) {
        if (best && best.score >= THRESHOLD) {
          findings.push({
            severity: 'ok',
            code: `CODE_OK_${code}`,
            title: `Código ${code} coincide con el procedimiento`,
            body: `${best.desc} — matchea con el procedimiento descrito en el documento.`,
            spans: findSpans(code, ocrWords, { requireProcedureFieldContext: true }),
          });
        } else if (procedureGuess && procedureGuess.code !== code) {
          const wrongDesc = best?.desc || '';
          findings.push({
            severity: 'error',
            code: 'CODE_MISMATCH',
            title: `Código ${code} no corresponde al procedimiento`,
            body: `El documento describe "${procedureGuess.keyword}", pero el código ${code} (${wrongDesc}) es otra práctica. Esto provoca rechazo de la liquidación.`,
            action: `Reemplazar por código ${procedureGuess.code} — ${procedureGuess.desc}.`,
            suggestion: { code: procedureGuess.code, desc: procedureGuess.desc },
            spans: findSpans(code, ocrWords, { requireProcedureFieldContext: true }),
          });
        } else {
          findings.push({
            severity: 'warn',
            code: `CODE_UNVERIFIED_${code}`,
            title: `Código ${code} válido pero no verificable`,
            body: `${best?.desc || ''} — el documento no tiene suficiente texto para confirmar que este es el código correcto.`,
            action: 'Revisar manualmente que el código corresponda al procedimiento.',
            spans: findSpans(code, ocrWords, { requireProcedureFieldContext: true }),
          });
        }
      } else {
        const matching = scored.filter((s) => s.score >= THRESHOLD);

        if (matching.length === 1) {
          findings.push({
            severity: 'ok',
            code: `CODE_DISAMBIGUATED_${code}`,
            title: `Código ${code} tiene múltiples prácticas — identificamos la correcta`,
            body: `El código ${code} corresponde a ${practices.length} prácticas distintas en el nomenclador. Según el texto del documento, se trata de: ${matching[0].desc}.`,
            spans: findSpans(code, ocrWords, { requireProcedureFieldContext: true }),
          });
        } else {
          findings.push({
            severity: 'warn',
            code: `CODE_AMBIGUOUS_${code}`,
            title: `Código ${code} es ambiguo en el nomenclador Swiss`,
            body: `El nomenclador oficial tiene ${practices.length} prácticas distintas asignadas al mismo código ${code}. Necesitamos confirmar cuál corresponde.`,
            ambiguous: {
              code,
              options: practices
                .map((p, i) => ({
                  code,
                  desc: p.desc,
                  specialty: p.specialty,
                  score: scored.find((s) => s.idx === i)?.score || 0,
                }))
                .sort((a, b) => b.score - a.score),
            },
            action: 'Elegir la práctica que corresponde al procedimiento realizado.',
            spans: findSpans(code, ocrWords, { requireProcedureFieldContext: true }),
          });
        }
      }
    }
  } else if (!isPartogram) {
    if (procedureGuess) {
      findings.push({
        severity: 'error',
        code: 'NO_CODE_SUGGEST',
        title: 'Falta el código de nomenclador',
        body: `El documento menciona "${procedureGuess.keyword}" pero no incluye el código correspondiente. Sin código la prepaga no puede procesar la liquidación.`,
        action: `Agregar código ${procedureGuess.code} — ${procedureGuess.desc}.`,
        suggestion: { code: procedureGuess.code, desc: procedureGuess.desc },
        spans: findSpans(procedureGuess.keyword, ocrWords, { requireProcedureFieldContext: true }),
      });
    } else {
      const interventionAnchor = findInterventionAnchorSpan(ocrWords);
      findings.push({
        severity: 'error',
        code: 'NO_CODE',
        title: 'Falta el código de nomenclador',
        body: 'No se detectó un código de facturación en el documento. Sin código la prepaga no puede procesar la liquidación.',
        action: 'Agregar el código correspondiente del nomenclador de la prepaga.',
        spans: interventionAnchor,
      });
    }
  }

  if (!isPartogram) {
    for (const field of TRAZA_REQUIRED_FIELDS) {
      if (field.key === 'codigo') continue;
      if (!foundFields[field.key]) {
        findings.push({
          severity: field.severity,
          code: `MISSING_${field.key.toUpperCase()}`,
          title: `Falta ${fieldLabel(field.key)}`,
          body: `No se detecta el campo "${field.labels[0]}" en el documento. Este campo es requerido por las prepagas para procesar la liquidación.`,
          action: `Agregar ${fieldLabel(field.key)} al documento antes de presentar.`,
        });
      }
    }
  }

  const prepagasDetectadas = TRAZA_PREPAGAS.filter((p) => lower.includes(stripAccents(p.toLowerCase())));
  const sanatoriosDetectados = TRAZA_SANATORIOS.filter((s) => lower.includes(stripAccents(s.toLowerCase())));

  const fechaRegex = /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/g;
  const fechas = Array.from(text.matchAll(fechaRegex)).map((m) => m[0]);
  const fechaStrForPlazo = isPartogram ? extractPartogramProcedureDateStr(text) : extractGeneralPlazoDateStr(text);
  const preferDatePage = fechaStrForPlazo ? findPreferPageForPlazoDate(pageTexts, fechaStrForPlazo, isPartogram) : null;
  if (fechaStrForPlazo) {
    try {
      const fechaStr = fechaStrForPlazo;
      const parts = fechaStr.split(/[\/\-]/).map(Number);
      let [d, m, y] = parts;
      if (y < 100) y += 2000;
      const fechaPractica = new Date(y, m - 1, d);
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      fechaPractica.setHours(0, 0, 0, 0);
      if (isNaN(fechaPractica.getTime())) {
        /* ignore */
      } else {
        const diasHasta = Math.floor((fechaPractica.getTime() - hoy.getTime()) / 86400000);
        if (diasHasta > 1) {
          findings.push({
            severity: 'error',
            code: 'FECHA_FUTURA',
            title: 'Fecha de práctica en el futuro',
            body: `La fecha ${fechaStr} parece posterior a hoy. Revisá si hay un error de tipeo en el año o en el día/mes.`,
            action: 'Corregir la fecha de la práctica en el documento o en el sistema de origen.',
            spans: findSpans(fechaStr, ocrWords, {
              preferPage: preferDatePage,
              maxResults: 6,
              requirePlazoDateContext: true,
            }),
          });
        } else if (!isPartogram) {
          const diasDesde = Math.floor((hoy.getTime() - fechaPractica.getTime()) / 86400000);
          const plazoLimite = 60;
          if (diasDesde > plazoLimite) {
            findings.push({
              severity: 'error',
              code: 'PLAZO_VENCIDO',
              title: 'Plazo de presentación posiblemente vencido',
              body: `La fecha detectada (${fechaStr}) es de hace ${diasDesde} días. El plazo estándar de re-facturación es de 60 días.`,
              action: 'Verificar con la prepaga si la presentación es aún admisible.',
              spans: findSpans(fechaStr, ocrWords, {
                preferPage: preferDatePage,
                maxResults: 6,
                requirePlazoDateContext: true,
              }),
            });
          } else if (diasDesde > 30) {
            findings.push({
              severity: 'warn',
              code: 'PLAZO_CERCANO',
              title: 'Plazo de presentación próximo',
              body: `La fecha detectada (${fechaStr}) es de hace ${diasDesde} días. Quedan ${plazoLimite - diasDesde} días hasta el vencimiento.`,
              action: 'Presentar la liquidación en los próximos días.',
              spans: findSpans(fechaStr, ocrWords, {
                preferPage: preferDatePage,
                maxResults: 6,
                requirePlazoDateContext: true,
              }),
            });
          } else {
            findings.push({
              severity: 'ok',
              code: 'PLAZO_OK',
              title: 'Dentro del plazo de presentación',
              body: `La fecha detectada (${fechaStr}) está dentro del plazo normal de 60 días.`,
            });
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  const wordCount = text.split(/\s+/).filter((w) => w.length > 2).length;
  if (wordCount < 20) {
    findings.push({
      severity: 'warn',
      code: 'LOW_CONTENT',
      title: 'Contenido escaso o ilegible',
      body: `Solo se pudieron reconocer ${wordCount} palabras. El documento puede estar mal escaneado o incompleto.`,
      action: 'Re-escanear en mayor resolución o solicitar copia legible.',
    });
  }

  const summary = {
    ok: findings.filter((f) => f.severity === 'ok').length,
    warn: findings.filter((f) => f.severity === 'warn').length,
    error: findings.filter((f) => f.severity === 'error').length,
  };
  const overall: 'error' | 'warn' | 'ok' =
    summary.error > 0 ? 'error' : summary.warn > 0 ? 'warn' : 'ok';

  return {
    findings,
    summary,
    overall,
    detected: {
      codes: isPartogram ? [] : validCodes,
      prepagas: prepagasDetectadas,
      sanatorios: sanatoriosDetectados,
      fechas: (fechaStrForPlazo ? [fechaStrForPlazo, ...fechas] : fechas).filter((v, i, a) => a.indexOf(v) === i).slice(0, 5),
      procedureGuess,
    },
    fileName,
    analyzedAt: new Date().toISOString(),
  };
}
