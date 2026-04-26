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
  try {
    const maskPreview = (raw: string, max = 800) => {
      const s = String(raw || '').replace(/\s+/g, ' ').trim();
      const truncated = s.length > max ? s.slice(0, max) + '…' : s;
      // mask digit runs
      return truncated.replace(/\d/g, 'X');
    };
    // Prefer the explicit extractor; NEVER fall back to DNI/long digit runs.
    const structured = extractStructured(text, TRAZA_NOMENCLADOR_FULL as any);
    if (structured.afiliado && structured.afiliado.length >= 6) return structured.afiliado;

    const norm = normalizeText(text);
    console.log(
      `[TRAZA_PIPELINE] planilla_mapping socio_input text_len=${String(text || '').length} contains_numero=${norm.includes('numero') || norm.includes('nro') || norm.includes('nº') || norm.includes('n°')} contains_plan=${norm.includes('plan')} contains_cobertura=${norm.includes('cobertura')} contains_swiss=${norm.includes('swiss')} contains_documento=${norm.includes('documento') || norm.includes('doc.')} contains_dni=${norm.includes('dni')}`,
    );
    console.log(`[TRAZA_PIPELINE] planilla_mapping socio_input_preview="${maskPreview(text, 800)}"`);

    const maskNum = (v: string) => {
      const s = String(v || '').trim();
      if (!s) return '';
      if (s.length <= 4) return `${s.slice(0, 1)}${'X'.repeat(Math.max(0, s.length - 2))}${s.slice(-1)}(len${s.length})`;
      return `${s.slice(0, 2)}${'X'.repeat(Math.max(0, s.length - 4))}${s.slice(-2)}(len${s.length})`;
    };
    const digitsOnly = (s: string) => String(s || '').replace(/\D/g, '');
    const MIN_LEN_PRIMARY = 10;
    const MIN_LEN_CONTEXTUAL = 10;
    const MIN_LEN_SECONDARY = 10;
    const MAX_LEN = 22;

    const levenshtein = (a: string, b: string) => {
      if (a === b) return 0;
      if (!a) return b.length;
      if (!b) return a.length;
      const m = a.length;
      const n = b.length;
      const dp = new Array(n + 1);
      for (let j = 0; j <= n; j++) dp[j] = j;
      for (let i = 1; i <= m; i++) {
        let prev = dp[0];
        dp[0] = i;
        for (let j = 1; j <= n; j++) {
          const tmp = dp[j];
          const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
          dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
          prev = tmp;
        }
      }
      return dp[n];
    };

    const normalizeTextForSocioCtx = (s: string) => {
      // Keep length stable where possible (same-length replacements) to preserve match indices.
      let out = String(s || '');
      out = out.replace(/\bm[úu]mero\b/gi, 'numero');
      out = out.replace(/\bmumero\b/gi, 'numero');
      out = out.replace(/\bmúmero\b/gi, 'numero');
      out = out.replace(/\bpano\b/gi, 'plan');
      out = out.replace(/\bpian\b/gi, 'plan');
      out = out.replace(/\bpian\b/gi, 'plan');
      return out;
    };

    const findFuzzySignals = (window: string, targets: string[]) => {
      const toks = String(window || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .split(/[^a-z0-9]+/g)
        .filter((t) => t.length >= 4 && t.length <= 18);
      const found = new Set<string>();
      for (const tok of toks) {
        for (const t of targets) {
          const tt = t.replace(/\s+/g, '');
          const d = levenshtein(tok, tt);
          if (d <= 2) {
            found.add(t);
            break;
          }
        }
        if (found.size >= 8) break;
      }
      return [...found];
    };

    // Look for labeled membership/credential numbers; keep generic and avoid DNI.
    // Captures digits even if OCR inserts spaces/dashes/dots between them.
    const primaryLabel =
      String.raw`\b(?:n(?:u|ú)mero|n(?:ro|[º°])?)?\s*(?:de\s*)?(?:credencial|afiliad[oa]|socio|carnet)\b`;
    const primaryLabel2 =
      String.raw`\b(?:credencial|afiliad[oa]|socio|carnet)\b\s*(?:n(?:u|ú)mero|n(?:ro|[º°])?)?\b`;
    const secondaryLabel =
      String.raw`\b(?:n(?:u|ú)mero|n(?:ro|[º°])?)?\s*(?:de\s*)?(?:hc|historia\s+clinica|historia\s+clínica|encuentro|episodio)\b`;
    const secondaryLabel2 =
      String.raw`\b(?:hc|historia\s+clinica|historia\s+clínica|encuentro|episodio)\b\s*(?:n(?:u|ú)mero|n(?:ro|[º°])?)?\b`;
    const coverageHint = String.raw`\b(?:cobertura|plan)\b`;
    const numChunk = String.raw`([0-9][0-9\s.\-–_]{6,40}[0-9])`; // must start+end with digit
    const rePrimary = new RegExp(String.raw`(?:${primaryLabel}|${primaryLabel2})[^0-9]{0,18}${numChunk}`, 'gi');
    const reSecondary = new RegExp(String.raw`(?:${secondaryLabel}|${secondaryLabel2})[^0-9]{0,18}${numChunk}`, 'gi');
    // Keep coverage/plan as a weak hint; treated as secondary bucket.
    const reCoverageHint = new RegExp(String.raw`(?:${coverageHint})[^0-9]{0,18}${numChunk}`, 'gi');
    console.log(`[TRAZA_PIPELINE] planilla_mapping socio_regex_compiled ok=true`);

    const acceptedPrimary: Array<{ raw: string; digits: string; reason: string }> = [];
    const acceptedContextual: Array<{ raw: string; digits: string; reason: string }> = [];
    const acceptedSecondary: Array<{ raw: string; digits: string; reason: string }> = [];
    const rejected: Array<{ raw: string; digits: string; reason: string }> = [];

    const collect = (it: IterableIterator<RegExpMatchArray>, bucket: 'primary' | 'secondary', matchReason: string) => {
      for (const m of it) {
        const raw = String(m[1] || '').trim();
        const dig = digitsOnly(raw);
        const minLen = bucket === 'primary' ? MIN_LEN_PRIMARY : MIN_LEN_SECONDARY;
        if (dig.length < minLen) {
          rejected.push({ raw, digits: dig, reason: `${bucket}:${matchReason}:too_short` });
          continue;
        }
        if (dig.length > MAX_LEN) {
          rejected.push({ raw, digits: dig, reason: `${bucket}:${matchReason}:too_long` });
          continue;
        }
        if (bucket === 'primary') acceptedPrimary.push({ raw, digits: dig, reason: matchReason });
        else acceptedSecondary.push({ raw, digits: dig, reason: matchReason });
      }
    };

    collect(norm.matchAll(rePrimary), 'primary', 'label');
    collect(norm.matchAll(reSecondary), 'secondary', 'label');
    collect(norm.matchAll(reCoverageHint), 'secondary', 'coverage_hint');

    // Contextual strategy: capture "Número: XXXXX" only when nearby context indicates coverage/plan.
    // Never accept if context indicates DNI/document/patient fields.
    const ctxSignalsCoverage = [
      'plan',
      'cobertura',
      'prepaga',
      'obra social',
      'swiss',
      'medical',
      'credencial',
      'afiliad',
      'socio',
      'carnet',
    ];
    const ctxSignalsDoc = ['dni', 'documento', 'tipo de documento', 'doc.', 'paciente', 'apellido y nombre'];
    const normCtx = normalizeTextForSocioCtx(norm);
    const ctxRe =
      /\b(?:numero|n(?:ro|[º°])?|n°|nº)\b\s*[:#]?\s*([0-9][0-9\s.\-–_]{6,40}[0-9])\b/gi;

    const contextualAccepted: Array<{ digits: string; reason: string }> = [];
    const contextualRejected: Array<{ digits: string; reason: string }> = [];
    let ctxLogged = 0;
    for (const m of normCtx.matchAll(ctxRe)) {
      const idx = typeof m.index === 'number' ? m.index : -1;
      const rawNum = String(m[1] || '').trim();
      const dig = digitsOnly(rawNum);
      if (dig.length < MIN_LEN_CONTEXTUAL) {
        contextualRejected.push({ digits: dig, reason: 'too_short' });
        continue;
      }
      if (dig.length > MAX_LEN) {
        contextualRejected.push({ digits: dig, reason: 'too_long' });
        continue;
      }
      if (idx < 0) {
        contextualRejected.push({ digits: dig, reason: 'no_index' });
        continue;
      }
      const from = Math.max(0, idx - 120);
      const to = Math.min(normCtx.length, idx + (m[0]?.length || 0) + 80);
      const winNorm = normCtx.slice(from, to);
      const hasCoverage = ctxSignalsCoverage.some((s) => winNorm.includes(s.replace(/\s+/g, ' ')));
      const hasDoc = ctxSignalsDoc.some((s) => winNorm.includes(s.replace(/\s+/g, ' ')));
      const covFound = findFuzzySignals(winNorm, ctxSignalsCoverage);
      const docFound = findFuzzySignals(winNorm, ctxSignalsDoc);

      if (ctxLogged < 3) {
        const prev = winNorm.replace(/\d/g, 'X');
        console.log(
          `[TRAZA_PIPELINE] planilla_mapping socio_context_window_preview="${prev.slice(0, 220)}"`,
        );
        console.log(
          `[TRAZA_PIPELINE] planilla_mapping socio_context_signals_found=${JSON.stringify({
            coverage: covFound,
            document: docFound,
          })}`,
        );
        ctxLogged++;
      }

      if (hasDoc && !hasCoverage) {
        contextualRejected.push({ digits: dig, reason: 'document_context' });
        continue;
      }
      if (hasCoverage || covFound.length > 0) {
        contextualAccepted.push({ digits: dig, reason: 'coverage_context' });
        continue;
      }
      contextualRejected.push({ digits: dig, reason: 'insufficient_context' });
    }

    for (const c of contextualAccepted) acceptedContextual.push({ raw: '', digits: c.digits, reason: c.reason });
    for (const r of contextualRejected) rejected.push({ raw: '', digits: r.digits, reason: `context:${r.reason}` });

    // Contextual logs (masked).
    console.log(
      `[TRAZA_PIPELINE] planilla_mapping socio_contextual_candidates=${JSON.stringify(
        contextualAccepted.slice(0, 8).map((c) => ({ masked: maskNum(c.digits), context_reason: c.reason })),
      )}`,
    );
    console.log(
      `[TRAZA_PIPELINE] planilla_mapping socio_contextual_rejected=${JSON.stringify(
        contextualRejected.slice(0, 8).map((c) => ({ masked: maskNum(c.digits), context_reason: c.reason })),
      )}`,
    );

    // Debug logs: show candidates masked, never full numbers.
    if (acceptedPrimary.length > 0 || acceptedContextual.length > 0 || acceptedSecondary.length > 0) {
      console.log(
        `[TRAZA_PIPELINE] planilla_mapping socio_labeled_candidates=${JSON.stringify(
          [
            ...acceptedPrimary.map((c) => ({ masked: maskNum(c.digits), source: 'primary', reason: c.reason })),
            ...acceptedContextual.map((c) => ({ masked: maskNum(c.digits), source: 'contextual', reason: c.reason })),
            ...acceptedSecondary.map((c) => ({ masked: maskNum(c.digits), source: 'secondary', reason: c.reason })),
          ].slice(0, 12),
        )}`,
      );
    } else {
      console.log(`[TRAZA_PIPELINE] planilla_mapping socio_labeled_candidates=[]`);
    }
    if (rejected.length > 0) {
      console.log(
        `[TRAZA_PIPELINE] planilla_mapping socio_rejected_candidates=${JSON.stringify(
          rejected.slice(0, 8).map((c) => ({ masked: maskNum(c.digits), reason: c.reason })),
        )}`,
      );
    } else {
      console.log(`[TRAZA_PIPELINE] planilla_mapping socio_rejected_candidates=[]`);
    }

    const pickBest = (arr: Array<{ raw: string; digits: string; reason: string }>) => {
      const uniq = new Map<string, { raw: string; digits: string; reason: string }>();
      for (const a of arr) if (!uniq.has(a.digits)) uniq.set(a.digits, a);
      const list = [...uniq.values()];
      list.sort((a, b) => b.digits.length - a.digits.length);
      return list[0] || null;
    };

    const chosenPrimary = pickBest(acceptedPrimary);
    const chosenContextual = pickBest(acceptedContextual);
    const chosenSecondary = pickBest(acceptedSecondary);
    const chosen = chosenPrimary || chosenContextual || chosenSecondary;
    const chosenSource = chosenPrimary ? 'primary' : chosenContextual ? 'contextual' : chosenSecondary ? 'secondary' : 'none';

    if (!chosen) {
      console.log(`[TRAZA_PIPELINE] planilla_mapping socio_selected_source=none socio_selected_value_masked=`);
      return '';
    }

    console.log(
      `[TRAZA_PIPELINE] planilla_mapping socio_selected_source=${chosenSource} socio_selected_value_masked=${maskNum(chosen.digits)}`,
    );
    return chosen.digits;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`[TRAZA_PIPELINE] planilla_mapping socio_error=${msg || 'unknown'}`);
    return '';
  }
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
  const rawText = (args.parte as any).raw_text || '';
  const rawTextLight = (args.parte as any).raw_text_light || '';
  const rawPages = (args.parte as any).raw_pageTexts as string[] | undefined;
  const rawJoined = rawPages && rawPages.length ? rawPages.join('\n') : '';
  const socioText =
    rawText && rawText.length >= parteText.length
      ? rawText
      : rawTextLight
        ? rawTextLight
        : rawJoined && rawJoined.length >= parteText.length
          ? rawJoined
          : parteText;
  const socio_text_source =
    socioText === rawText
      ? 'raw_text'
      : socioText === rawTextLight
        ? 'raw_text_light'
        : socioText === rawJoined
          ? 'raw_pageTexts_joined'
          : 'parte.text';

  console.log(
    `[TRAZA_PIPELINE] planilla_mapping socio_text_source=${socio_text_source} socio_text_len=${String(socioText || '').length} parte_text_len=${String(parteText || '').length} raw_text_len=${String(rawText || '').length}`,
  );
  const analysis = args.parte.analysis;

  const structured = extractStructured(parteText, TRAZA_NOMENCLADOR_FULL as any);
  const fecha = fmtDate(structured.fechaPractica);

  const socioStructured = (structured.afiliado || '').trim();
  const socioLabeled = bestAfiliadoFromText(socioText);
  const socio = socioStructured || socioLabeled || '';
  const socio_source = socioStructured ? 'extractStructured.afiliado' : socioLabeled ? 'labeled_regex' : 'none';
  const socioDesc =
    (structured.paciente || '').trim() ||
    String(args.parte.aiParteExtract?.paciente?.apellido_nombre || '')
      .trim()
      .replace(/\s+/g, ' ');

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

  const instOpenAi = String(args.parte.aiParteExtract?.sanatorio || '').trim();
  const instDetected = String(analysis?.detected?.sanatorios?.[0] || '').trim();
  const instFromText = String((args.parte as any).institution_from_text || '').trim();
  let institucion = instOpenAi || instDetected || instFromText || '';
  const institucion_source = instOpenAi
    ? 'aiParteExtract.sanatorio'
    : instDetected
      ? 'analysis.detected.sanatorios[0]'
      : instFromText
        ? 'institution_from_text'
        : 'none';
  // Display names: keep detection keywords short but export full institution name
  if (institucion === 'Otamendi') institucion = 'Sanatorio Otamendi';
  if (institucion === 'Mater Dei') institucion = 'Sanatorio Mater Dei';

  // Debug mapping logs (avoid printing full sensitive values).
  const maskNum = (s: string) => {
    const v = String(s || '').trim();
    if (!v) return '';
    if (v.length <= 4) return `${v.slice(0, 1)}${'X'.repeat(Math.max(0, v.length - 2))}${v.slice(-1)}`;
    return `${v.slice(0, 2)}${'X'.repeat(Math.max(0, v.length - 4))}${v.slice(-2)}`;
  };
  console.log(`[TRAZA_PIPELINE] planilla_mapping socio_source=${socio_source} socio_value=${maskNum(socio)}`);
  console.log(
    `[TRAZA_PIPELINE] planilla_mapping institucion_source=${institucion_source} institucion_value="${String(institucion || '').slice(0, 80)}"`,
  );

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

