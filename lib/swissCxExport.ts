import ExcelJS from 'exceljs';
import { extractStructured } from './authz';
import { TRAZA_NOMENCLADOR_FULL } from './nomenclador.js';
import type { AuthState, FileEntry, Finding, SwissCxRow } from './types';

type Row = SwissCxRow;

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function fmtDate(d: Date | null) {
  if (!d) return '';
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function normalizeText(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function bestAfiliadoFromText(text: string) {
  // Prefer the explicit extractor, then fall back to "longest digit run" heuristic
  const structured = extractStructured(text, TRAZA_NOMENCLADOR_FULL as any);
  if (structured.afiliado && structured.afiliado.length >= 6) return structured.afiliado;

  const candidates = [...text.matchAll(/\b(\d{6,20})\b/g)].map((m) => m[1]);
  if (candidates.length === 0) return structured.afiliado || '';
  candidates.sort((a, b) => b.length - a.length);
  return candidates[0];
}

function detectFlags(text: string) {
  const t = normalizeText(text);
  const hasAyud = /\bayud(ante|\.| )|\b1er ayud|\b2do ayud|\bayudantia/.test(t);
  const hasInst = /\binstrument(ador|ista|acion|ación)|\binstrum\b|\binstrument/.test(t);
  const hasCir = /\bcirujan|\bcir\.\b|\bcir\b/.test(t);
  const urgByWord = /\burgenc|\bemergenc|\bguardia\b|\bferiado\b/.test(t);
  return { hasAyud, hasInst, hasCir, urgByWord };
}

function isWeekend(d: Date | null) {
  if (!d) return false;
  const day = d.getDay(); // 0 Sun .. 6 Sat
  return day === 0 || day === 6;
}

export function buildSwissCxRow(args: {
  parte: FileEntry;
  authState: AuthState | undefined;
}): Row {
  const parteText = args.parte.text || '';
  const analysis = args.parte.analysis;

  const structured = extractStructured(parteText, TRAZA_NOMENCLADOR_FULL as any);
  const fecha = fmtDate(structured.fechaPractica);

  const socio = bestAfiliadoFromText(parteText);
  const socioDesc = structured.paciente || '';

  const codigo =
    structured.codigo ||
    analysis?.detected?.codes?.[0] ||
    analysis?.detected?.procedureGuess?.code ||
    '';

  const nomenAny = TRAZA_NOMENCLADOR_FULL as any;
  const detalle =
    structured.procedimientoDesc ||
    analysis?.detected?.procedureGuess?.desc ||
    (codigo && nomenAny[codigo]?.entries?.[0]?.desc ? String(nomenAny[codigo].entries[0].desc) : '');

  let institucion = analysis?.detected?.sanatorios?.[0] || '';
  // Display names: keep detection keywords short but export full institution name
  if (institucion === 'Otamendi') institucion = 'Sanatorio Otamendi';
  if (institucion === 'Mater Dei') institucion = 'Sanatorio Mater Dei';

  const { hasAyud, hasInst, hasCir, urgByWord } = detectFlags(parteText);
  const urgencia = urgByWord || isWeekend(structured.fechaPractica) ? 'X' : '';

  let nroAutorizacion = '';
  const auth = args.authState;
  if (auth?.status === 'checked') {
    const hasErrors = (auth.crossCheck || []).some((x) => x.severity === 'error');
    if (!hasErrors) {
      nroAutorizacion = auth.bonoData?.nroAutorizacion || '';
    }
  }

  return {
    fecha,
    socio,
    socioDesc,
    codigo,
    cant: '1',
    detalle,
    institucion,
    cir: hasCir ? 'X' : '',
    ayud: hasAyud ? 'X' : '',
    inst: hasInst ? 'X' : '',
    urgencia,
    gastos: '',
    nroAutorizacion,
  };
}

export async function generateSwissCxFiles(args: {
  templateXlsx: ArrayBuffer;
  row: Row;
}): Promise<{ xlsx: Uint8Array; csv: string }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(args.templateXlsx);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('La plantilla no tiene hojas.');

  const r = args.row;
  ws.getCell('A5').value = r.fecha;
  ws.getCell('B5').value = r.socio;
  ws.getCell('C5').value = r.socioDesc;
  ws.getCell('D5').value = r.codigo;
  ws.getCell('E5').value = r.cant;
  ws.getCell('F5').value = r.detalle;
  ws.getCell('G5').value = r.institucion;
  ws.getCell('H5').value = r.cir;
  ws.getCell('I5').value = r.ayud;
  ws.getCell('J5').value = r.inst;
  ws.getCell('K5').value = r.urgencia;
  ws.getCell('L5').value = r.gastos;
  ws.getCell('M5').value = r.nroAutorizacion;

  const xlsxBuf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  const xlsx = new Uint8Array(xlsxBuf);

  const cols = [
    r.fecha,
    r.socio,
    r.socioDesc,
    r.codigo,
    r.cant,
    r.detalle,
    r.institucion,
    r.cir,
    r.ayud,
    r.inst,
    r.urgencia,
    r.gastos,
    r.nroAutorizacion,
  ];

  const esc = (v: string) => {
    const s = String(v ?? '');
    if (/[;"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const csv = cols.map(esc).join(';') + '\n';

  return { xlsx, csv };
}

export function applyPlanillaValidationFindings(args: { file: FileEntry; row: SwissCxRow }): FileEntry {
  const analysis = args.file.analysis;
  if (!analysis) return args.file;
  const dropCodes = new Set([
    'PLANILLA_MISSING_FECHA',
    'PLANILLA_MISSING_SOCIO',
    'PLANILLA_MISSING_PACIENTE',
    'PLANILLA_MISSING_CODIGO',
  ]);
  const base = analysis.findings.filter((f) => !dropCodes.has(f.code));
  const out: Finding[] = [...base];

  const miss = (key: string, title: string, body: string) => {
    out.unshift({ severity: 'error', code: key, title, body, action: 'Editar la planilla antes de finalizar.' });
  };

  if (!args.row.fecha?.trim()) miss('PLANILLA_MISSING_FECHA', 'Falta fecha para generar planilla', 'No hay fecha válida en la planilla.');
  if (!args.row.socio?.trim()) miss('PLANILLA_MISSING_SOCIO', 'Falta N° de socio para generar planilla', 'No se pudo confirmar el número de afiliado.');
  if (!args.row.socioDesc?.trim())
    miss('PLANILLA_MISSING_PACIENTE', 'Falta paciente reconocido para generar planilla', 'No se confirmó el nombre del paciente.');
  if (!args.row.codigo?.trim())
    miss('PLANILLA_MISSING_CODIGO', 'Falta código para generar planilla', 'No se detectó/confirmó el código de nomenclador.');

  const summary = {
    ok: out.filter((f) => f.severity === 'ok').length,
    warn: out.filter((f) => f.severity === 'warn').length,
    error: out.filter((f) => f.severity === 'error').length,
  };
  const overall: 'error' | 'warn' | 'ok' = summary.error > 0 ? 'error' : summary.warn > 0 ? 'warn' : 'ok';
  return { ...args.file, analysis: { ...analysis, findings: out, summary, overall } };
}

export function downloadBytes(bytes: Uint8Array, fileName: string, mime: string) {
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const blob = new Blob([ab as ArrayBuffer], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function downloadText(text: string, fileName: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

