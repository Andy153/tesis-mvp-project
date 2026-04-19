// Trazá — Motor de análisis (TypeScript, client-only)
import type {
  Analysis,
  ExtractionResult,
  Finding,
  PageWords,
  Span,
  Thumbnail,
} from './types';
import { TRAZA_NOMENCLADOR_FULL, TRAZA_PROC_KEYWORDS } from './nomenclador.js';

type NomenclatorEntry = { desc: string; specialty?: string };
const NOMENCLADOR: Record<string, NomenclatorEntry> = TRAZA_NOMENCLADOR_FULL as Record<
  string,
  NomenclatorEntry
>;
const PROC_KEYWORDS: Array<{ keywords: string[]; code: string }> = TRAZA_PROC_KEYWORDS as Array<{
  keywords: string[];
  code: string;
}>;

export const TRAZA_PREPAGAS = [
  'Swiss Medical',
  'OSDE',
  'Galeno',
  'Medicus',
  'Omint',
  'Medifé',
  'Sancor Salud',
  'Hospital Italiano',
  'Hospital Británico',
  'Prevención Salud',
];

export const TRAZA_SANATORIOS = [
  'Otamendi',
  'Mater Dei',
  'Los Arcos',
  'Suizo Argentino',
  'Finochietto',
  'Clínica Santa Isabel',
  'Instituto Argentino de Diagnóstico',
  'Clínica Bazterrica',
];

const REQUIRED_FIELDS: Array<{ key: string; labels: string[]; severity: 'error' | 'warn' }> = [
  { key: 'prepaga', labels: ['prepaga', 'obra social', 'convenio', 'financiador', 'cobertura'], severity: 'error' },
  { key: 'fecha', labels: ['fecha'], severity: 'error' },
  { key: 'procedimiento', labels: ['procedimiento', 'práctica', 'intervención', 'cirugía', 'operación'], severity: 'error' },
  { key: 'codigo', labels: ['código', 'codigo nomenclador', 'nomenclador', 'cod. nomenclador'], severity: 'error' },
  { key: 'sanatorio', labels: ['sanatorio', 'clínica', 'institución', 'centro asistencial'], severity: 'warn' },
  { key: 'anestesia', labels: ['anestesia', 'tipo de anestesia'], severity: 'warn' },
  { key: 'diagnostico', labels: ['diagnóstico', 'dx'], severity: 'error' },
];

// =============================================================
// TEXT EXTRACTION (PDF + OCR) — browser only
// =============================================================

type ProgressFn = (p: { progress: number; message: string }) => void;

export async function extractText(file: File, onProgress?: ProgressFn): Promise<ExtractionResult> {
  const type = file.type;
  if (type === 'application/pdf') return extractFromPdf(file, onProgress);
  if (type.startsWith('image/')) return extractFromImage(file, onProgress);
  throw new Error('Formato no soportado: ' + type);
}

async function loadPdfjs() {
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.js');
  // Use the workerSrc from a CDN that matches the installed version
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
  const thumbnails: Thumbnail[] = [];
  let ocrWords: PageWords[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const SCALE = 1.8;
    const viewport = page.getViewport({ scale: SCALE });

    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((i: any) => i.str).join(' ');
    allText += pageText + '\n';

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
    thumbnails.push({ dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height });

    if (pageText.trim().length > 20) {
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
    }

    onProgress?.({ progress: 0.1 + 0.3 * (p / pdf.numPages), message: `Procesando página ${p}/${pdf.numPages}...` });
  }

  let method: 'pdf-text' | 'ocr' = 'pdf-text';
  if (allText.trim().length < 50) {
    method = 'ocr';
    allText = '';
    ocrWords = [];
    for (let i = 0; i < thumbnails.length; i++) {
      const res = await ocrImageWithWords(thumbnails[i].dataUrl, (p) => {
        onProgress?.({ progress: 0.4 + 0.55 * ((i + p) / thumbnails.length), message: `OCR página ${i + 1}/${thumbnails.length}` });
      });
      allText += res.text + '\n';
      ocrWords.push({ page: i, words: res.words, width: thumbnails[i].width, height: thumbnails[i].height });
    }
  }

  onProgress?.({ progress: 1, message: 'Listo' });
  return { text: allText, thumbnails, method, ocrWords };
}

async function extractFromImage(file: File, onProgress?: ProgressFn): Promise<ExtractionResult> {
  onProgress?.({ progress: 0.1, message: 'Cargando imagen...' });
  const dataUrl = await fileToDataUrl(file);
  const dim = await imageDimensions(dataUrl);
  onProgress?.({ progress: 0.2, message: 'Aplicando OCR...' });
  const res = await ocrImageWithWords(dataUrl, (p) => {
    onProgress?.({ progress: 0.2 + 0.75 * p, message: 'Reconociendo texto...' });
  });
  onProgress?.({ progress: 1, message: 'Listo' });
  return {
    text: res.text,
    thumbnails: [{ dataUrl, width: dim.width, height: dim.height }],
    method: 'ocr',
    ocrWords: [{ page: 0, words: res.words, width: dim.width, height: dim.height }],
  };
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
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
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

// =============================================================
// ANALYSIS
// =============================================================

function stripAccents(s: string) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function findSpans(needle: string, ocrPages?: PageWords[]): Span[] {
  if (!ocrPages || !needle) return [];
  const needleTokens = stripAccents(needle.toLowerCase())
    .replace(/[^\w\s.\-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0);
  if (needleTokens.length === 0) return [];

  const spans: Span[] = [];
  for (const page of ocrPages) {
    const words = page.words || [];
    for (let i = 0; i <= words.length - needleTokens.length; i++) {
      let matched = true;
      for (let j = 0; j < needleTokens.length; j++) {
        const wordText = stripAccents((words[i + j].text || '').toLowerCase()).replace(/[^\w.\-]/g, '');
        const nt = needleTokens[j];
        if (wordText !== nt && !wordText.includes(nt) && !nt.includes(wordText)) {
          matched = false;
          break;
        }
      }
      if (matched) {
        const bboxes = [];
        for (let j = 0; j < needleTokens.length; j++) bboxes.push(words[i + j].bbox);
        const x0 = Math.min(...bboxes.map((b) => b.x0));
        const y0 = Math.min(...bboxes.map((b) => b.y0));
        const x1 = Math.max(...bboxes.map((b) => b.x1));
        const y1 = Math.max(...bboxes.map((b) => b.y1));
        spans.push({
          page: page.page,
          bbox: { x0, y0, x1, y1 },
          canvasWidth: page.width,
          canvasHeight: page.height,
        });
        i += needleTokens.length - 1;
      }
    }
  }
  return spans;
}

function fieldLabel(key: string) {
  return ({
    prepaga: 'prepaga / obra social',
    fecha: 'fecha',
    procedimiento: 'procedimiento',
    codigo: 'código de nomenclador',
    sanatorio: 'sanatorio / institución',
    anestesia: 'tipo de anestesia',
    diagnostico: 'diagnóstico',
  } as Record<string, string>)[key] || key;
}

export function analyzeDocument(text: string, fileName: string, ocrWords?: PageWords[]): Analysis {
  const lower = stripAccents(text.toLowerCase());
  const findings: Finding[] = [];

  const foundFields: Record<string, boolean> = {};
  for (const field of REQUIRED_FIELDS) {
    const hit = field.labels.find((l) => lower.includes(stripAccents(l.toLowerCase())));
    if (hit) foundFields[field.key] = true;
  }

  let procedureGuess: Analysis['detected']['procedureGuess'] = null;
  for (const entry of PROC_KEYWORDS) {
    for (const kw of entry.keywords) {
      if (lower.includes(stripAccents(kw.toLowerCase()))) {
        procedureGuess = { keyword: kw, code: entry.code, desc: NOMENCLADOR[entry.code]?.desc };
        break;
      }
    }
    if (procedureGuess) break;
  }

  const codeRegex = /\b(\d{2}[.\-]\d{2}[.\-]\d{2}|\d{4,6})\b/g;
  const rawCodes = Array.from(new Set(Array.from(text.matchAll(codeRegex)).map((m) => m[1])));
  const validCodes: string[] = [];
  for (const raw of rawCodes) {
    const normalized = raw.replace(/-/g, '.');
    if (NOMENCLADOR[normalized]) validCodes.push(normalized);
    else if (NOMENCLADOR[raw]) validCodes.push(raw);
  }

  if (validCodes.length > 0) {
    for (const code of validCodes) {
      findings.push({
        severity: 'ok',
        code: `CODE_OK_${code}`,
        title: `Código ${code} válido`,
        body: `${NOMENCLADOR[code].desc} — reconocido en el nomenclador de Swiss Medical.`,
        spans: findSpans(code, ocrWords),
      });
    }
  } else {
    if (procedureGuess) {
      findings.push({
        severity: 'error',
        code: 'NO_CODE_SUGGEST',
        title: 'Falta el código de nomenclador',
        body: `El documento menciona "${procedureGuess.keyword}" pero no incluye el código correspondiente. Sin código la prepaga no puede procesar la liquidación.`,
        action: `Agregar código ${procedureGuess.code} — ${procedureGuess.desc}.`,
        suggestion: { code: procedureGuess.code, desc: procedureGuess.desc },
        spans: findSpans(procedureGuess.keyword, ocrWords),
      });
    } else {
      findings.push({
        severity: 'error',
        code: 'NO_CODE',
        title: 'Falta el código de nomenclador',
        body: 'No se detectó un código de facturación en el documento. Sin código la prepaga no puede procesar la liquidación.',
        action: 'Agregar el código correspondiente del nomenclador de la prepaga.',
      });
    }
  }

  for (const field of REQUIRED_FIELDS) {
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

  const prepagasDetectadas = TRAZA_PREPAGAS.filter((p) => lower.includes(stripAccents(p.toLowerCase())));
  const sanatoriosDetectados = TRAZA_SANATORIOS.filter((s) => lower.includes(stripAccents(s.toLowerCase())));

  const fechaRegex = /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/g;
  const fechas = Array.from(text.matchAll(fechaRegex)).map((m) => m[0]);
  if (fechas.length > 0) {
    try {
      const fechaStr = fechas[0];
      const parts = fechaStr.split(/[\/\-]/).map(Number);
      let [d, m, y] = parts;
      if (y < 100) y += 2000;
      const fechaPractica = new Date(y, m - 1, d);
      const hoy = new Date();
      const diasDesde = Math.floor((hoy.getTime() - fechaPractica.getTime()) / 86400000);
      const plazoLimite = 60;
      if (diasDesde > plazoLimite) {
        findings.push({
          severity: 'error',
          code: 'PLAZO_VENCIDO',
          title: 'Plazo de presentación posiblemente vencido',
          body: `La fecha detectada (${fechaStr}) es de hace ${diasDesde} días. El plazo estándar de re-facturación es de 60 días.`,
          action: 'Verificar con la prepaga si la presentación es aún admisible.',
          spans: findSpans(fechaStr, ocrWords),
        });
      } else if (diasDesde > 30) {
        findings.push({
          severity: 'warn',
          code: 'PLAZO_CERCANO',
          title: 'Plazo de presentación próximo',
          body: `La fecha detectada (${fechaStr}) es de hace ${diasDesde} días. Quedan ${plazoLimite - diasDesde} días hasta el vencimiento.`,
          action: 'Presentar la liquidación en los próximos días.',
          spans: findSpans(fechaStr, ocrWords),
        });
      } else {
        findings.push({
          severity: 'ok',
          code: 'PLAZO_OK',
          title: 'Dentro del plazo de presentación',
          body: `La fecha detectada (${fechaStr}) está dentro del plazo normal de 60 días.`,
        });
      }
    } catch {}
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
      codes: validCodes,
      prepagas: prepagasDetectadas,
      sanatorios: sanatoriosDetectados,
      fechas: fechas.slice(0, 3),
      procedureGuess,
    },
    fileName,
    analyzedAt: new Date().toISOString(),
  };
}
