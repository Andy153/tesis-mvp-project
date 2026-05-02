// Trazá — Motor de análisis (TypeScript, client-only)
import type { Analysis, ExtractionResult, Finding, PageWords, Span } from './types';
import { extractStructured } from './authz';
import { parteExtractToAnalysisText } from './ai/parteExtractToAnalysisText';
import type { ParteQuirurgicoExtract } from './ai/schemas';
import { TRAZA_NOMENCLADOR_FULL, TRAZA_PROC_KEYWORDS } from './nomenclador.js';
import { TRAZA_PREPAGAS, TRAZA_REQUIRED_FIELDS, TRAZA_SANATORIOS } from './traza-constants';
import { matchScore } from './semantic';

/** Incrementar al cambiar reglas de análisis para invalidar análisis guardados en `loadHistory`. */
export const TRAZA_ANALYZER_REVISION = 19;

const PIPE = '[TRAZA_PIPELINE]';

function safePreview(raw: string, maxChars = 300) {
  const s = String(raw || '')
    .replace(/\s+/g, ' ')
    .trim()
    // Redact common PII-ish patterns and long digit runs.
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]')
    .replace(/\b\d{4,}\b/g, (m) => `${m.slice(0, 1)}${'X'.repeat(Math.max(0, m.length - 2))}${m.slice(-1)}`)
    .replace(/\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/g, '[date]');
  if (!s) return '';
  return s.length <= maxChars ? s : s.slice(0, maxChars) + '…';
}

function detectParteSignals(lower: string) {
  const hits: string[] = [];
  const rules: Array<{ id: string; test: (t: string) => boolean }> = [
    { id: 'has_quirofano', test: (t) => t.includes('quirofano') || t.includes('quirófano') },
    { id: 'has_ciruj', test: (t) => t.includes('ciruj') },
    { id: 'has_anest', test: (t) => t.includes('anest') },
    { id: 'has_instrument', test: (t) => t.includes('instrument') },
    { id: 'has_parte_quir', test: (t) => t.includes('parte') && t.includes('quir') },
    { id: 'has_intervencion', test: (t) => t.includes('intervencion') || t.includes('intervención') },
    { id: 'has_diagnostico_operatorio', test: (t) => t.includes('diagnostico') && t.includes('operator') },
  ];
  for (const r of rules) if (r.test(lower)) hits.push(r.id);
  return hits;
}

function normalizeInstitutionCandidate(s: string) {
  return stripAccents(String(s || '').toLowerCase())
    .replace(/\s+/g, ' ')
    .replace(/[|•·]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string) {
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
}

function canonicalOcrKey(norm: string) {
  // Canonicalize common OCR confusions for grouping (NOT for final display).
  return String(norm || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/rn/g, 'm')
    .replace(/[il]/g, 'i')
    .replace(/0/g, 'o')
    .trim();
}

function applyOcrCorrections(norm: string) {
  // Conservative corrections: only apply when the replacement makes the token look more language-like.
  // This is generic and does not hardcode institution names.
  const tokens = String(norm || '')
    .split(' ')
    .map((t) => t.trim())
    .filter(Boolean);

  const healthVocab = [
    // Generic healthcare/institution terms
    'sanatorio',
    'clinica',
    'hospital',
    'maternidad',
    'instituto',
    'centro',
    'medical',
    'salud',
    'laboratorio',
    'diagnostico',
    'consultorio',
    'quirurgico',
    'ambulatorio',
    'medico',
    'medica',
    'medicina',
    'universitario',
    'universitaria',
    'general',
    'municipal',
    'regional',
    'asociacion',
    'asociación',
    'fundacion',
    'fundación',
    'argentina',
    'buenos',
    'aires',
  ].map((x) => stripAccents(x));

  const spanishishTokens = new Set(healthVocab);

  const fixToken = (t: string) => {
    const raw = t;
    const cand: Array<{ v: string; why: string }> = [];
    cand.push({ v: raw, why: 'as_is' });
    // common swaps
    cand.push({ v: raw.replace(/rn/g, 'm'), why: 'rn->m' });
    cand.push({ v: raw.replace(/m/g, 'rn'), why: 'm->rn' });
    cand.push({ v: raw.replace(/l/g, 'i'), why: 'l->i' });
    cand.push({ v: raw.replace(/i/g, 'l'), why: 'i->l' });
    // vowel confusion: only if it creates a known generic word
    cand.push({ v: raw.replace(/a/g, 'o'), why: 'a->o' });
    cand.push({ v: raw.replace(/o/g, 'a'), why: 'o->a' });

    const scoreToken = (v: string) => {
      const nv = stripAccents(v.toLowerCase());
      let s = 0;
      if (spanishishTokens.has(nv)) s += 6;
      // penalize weird letter combos often produced by OCR
      if (/(lz|zr|zi|ii|lll)/.test(nv)) s -= 2;
      if (/[^a-z0-9]/.test(nv)) s -= 1;
      // prefer fewer edits
      return s;
    };

    let best = raw;
    let bestWhy = 'as_is';
    let bestScore = scoreToken(raw);
    for (const c of cand) {
      const sc = scoreToken(c.v);
      if (sc > bestScore) {
        bestScore = sc;
        best = c.v;
        bestWhy = c.why;
      }
    }
    const applied = best !== raw && bestWhy !== 'as_is';
    return { token: best, applied, why: bestWhy };
  };

  const fixed = tokens.map(fixToken);
  const applied = fixed.some((x) => x.applied);
  const out = fixed.map((x) => x.token).join(' ').replace(/\s+/g, ' ').trim();
  const why = fixed.filter((x) => x.applied).map((x) => x.why);
  return { corrected: out, correction_applied: applied, corrections: why.slice(0, 8) };
}

function extractInstitutionFromPageTexts(pageTexts: string[]) {
  const keywordHints = ['clinica', 'clínica', 'sanatorio', 'hospital', 'medical', 'maternidad', 'instituto', 'centro'];
  const candidates: Array<{ norm: string; display: string; page_idx: number; line_idx: number; score: number }> = [];

  for (let p = 0; p < pageTexts.length; p++) {
    const raw = String(pageTexts[p] || '');
    const lines = raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 10);
    const fallback = raw.replace(/\s+/g, ' ').trim().slice(0, 500);
    const headerLines = lines.length ? lines : fallback ? [fallback] : [];

    for (let i = 0; i < headerLines.length; i++) {
      const line = headerLines[i];
      const norm = normalizeInstitutionCandidate(line);
      if (!norm || norm.length < 8) continue;

      // Heuristics: uppercase-ish line and contains institution hints.
      const letters = line.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, '');
      const upper = letters ? letters === letters.toUpperCase() && letters !== letters.toLowerCase() : false;
      const hintHits = keywordHints.filter((k) => stripAccents(norm).includes(stripAccents(k)));
      const hasHint = hintHits.length > 0;

      // Soft filter: must be header-like (uppercase) OR has institution hint.
      if (!upper && !hasHint) continue;

      let score = 0;
      if (upper) score += 2;
      score += hintHits.length * 2;
      score += Math.min(2, Math.floor(norm.length / 18));
      if (i <= 1) score += 2;
      if (/^(dr|dra)\b/i.test(line)) score -= 2;
      if (/\b(mp|mn)\b/i.test(norm)) score -= 1;

      candidates.push({
        norm,
        display: line.replace(/\s+/g, ' ').trim(),
        page_idx: p,
        line_idx: i,
        score,
      });
    }
  }

  if (candidates.length === 0) return { institution_from_text: null as string | null, meta: { candidates: [] as any[] } };

  // Normalize + apply OCR corrections before grouping.
  const enriched = candidates.map((c) => {
    const corr = applyOcrCorrections(c.norm);
    const key = canonicalOcrKey(corr.corrected);
    return { ...c, corrected_norm: corr.corrected, key, correction_applied: corr.correction_applied, corrections: corr.corrections };
  });

  // Cluster by similarity of keys (Levenshtein) to group "sulzo" ~ "suizo" without hardcoding.
  type Cluster = {
    repKey: string;
    members: typeof enriched;
    pages: Set<number>;
  };
  const clusters: Cluster[] = [];
  const maxDistFor = (s: string) => (s.length <= 14 ? 1 : s.length <= 26 ? 2 : 3);
  for (const e of enriched) {
    let bestIdx = -1;
    let bestDist = 999;
    for (let i = 0; i < clusters.length; i++) {
      const d = levenshtein(e.key, clusters[i].repKey);
      const thr = Math.min(maxDistFor(e.key), maxDistFor(clusters[i].repKey));
      if (d <= thr && d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    if (bestIdx === -1) {
      clusters.push({ repKey: e.key, members: [e], pages: new Set<number>([e.page_idx]) });
    } else {
      clusters[bestIdx].members.push(e);
      clusters[bestIdx].pages.add(e.page_idx);
      // keep shortest key as representative for stability
      if (e.key.length < clusters[bestIdx].repKey.length) clusters[bestIdx].repKey = e.key;
    }
  }

  const cleanScore = (display: string) => {
    const s = String(display || '').trim();
    const letters = s.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, '');
    let score = 0;
    // prefer more letters (vs junk)
    score += Math.min(3, Math.floor(letters.length / 10));
    // penalize too many mixed symbols
    if (/[_=<>]/.test(s)) score -= 1;
    // penalize very short or very long header lines
    if (s.length < 10) score -= 2;
    if (s.length > 70) score -= 1;
    // penalize typical OCR weird bigrams
    const n = normalizeInstitutionCandidate(s);
    if (/(lz|zr|zi|ii|vv)/.test(n)) score -= 2;
    return score;
  };

  const isTitleCaseish = (s: string) => {
    const ws = String(s || '')
      .split(/\s+/)
      .filter((w) => w.length >= 3);
    if (ws.length === 0) return false;
    let cap = 0;
    for (const w of ws.slice(0, 20)) {
      if (/^[A-ZÁÉÍÓÚÜÑ]/.test(w)) cap++;
    }
    return cap / Math.max(1, Math.min(20, ws.length)) >= 0.5;
  };

  const toTitleCase = (s: string) =>
    String(s || '')
      .split(' ')
      .filter(Boolean)
      .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
      .join(' ');

  const rankedClusters = clusters
    .map((cl) => {
      const pages = cl.pages.size;
      const avg = cl.members.reduce((a, m) => a + m.score, 0) / Math.max(1, cl.members.length);
      const anyCorrection = cl.members.some((m) => m.correction_applied);
      // representative = best display by (member.score + cleanScore), break ties by earlier line_idx.
      const bestMember = [...cl.members].sort((a, b) => {
        const sa = a.score + cleanScore(a.display);
        const sb = b.score + cleanScore(b.display);
        if (sa !== sb) return sb - sa;
        if (a.line_idx !== b.line_idx) return a.line_idx - b.line_idx;
        return b.display.length - a.display.length;
      })[0];
      return {
        repKey: cl.repKey,
        pages,
        avgScore: Number(avg.toFixed(2)),
        anyCorrection,
        bestDisplay: bestMember?.display || '',
        bestMemberCorrectionApplied: Boolean(bestMember?.correction_applied),
        bestCorrectedNorm: bestMember?.corrected_norm || '',
        members: cl.members,
      };
    })
    .sort((a, b) => {
      if (a.pages !== b.pages) return b.pages - a.pages;
      const sa = a.avgScore + cleanScore(a.bestDisplay);
      const sb = b.avgScore + cleanScore(b.bestDisplay);
      if (sa !== sb) return sb - sa;
      return b.bestDisplay.length - a.bestDisplay.length;
    });

  const chosen = rankedClusters[0];
  const cleanInstitutionDisplay = (raw: string) => {
    const original = String(raw || '');
    let s = original.replace(/\s+/g, ' ').trimStart();
    // Remove leading garbage chars (OCR artifacts) before the real header.
    s = s.replace(/^[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+/g, '');
    // Remove single-letter prefixes like "a ", "m " (common OCR artifacts).
    // Apply a few times in case OCR stacks prefixes: "a > [ Clinica..."
    for (let k = 0; k < 3; k++) {
      const next = s.replace(/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]\s+/g, '');
      if (next === s) break;
      s = next;
      s = s.replace(/^[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+/g, '');
    }
    s = s.trim();
    return { cleaned: s, cleaning_applied: s !== original.trim() };
  };

  const healthDomainVocab = [
    'clinica',
    'hospital',
    'sanatorio',
    'maternidad',
    'instituto',
    'centro',
    'medical',
    'salud',
    'laboratorio',
    'diagnostico',
    'consultorio',
    'quirurgico',
    'ambulatorio',
  ].map((x) => stripAccents(x));

  const correctHealthDomainTokens = (s: string) => {
    const tokenCorrections: Array<{ from: string; to: string; distance: number }> = [];
    const ws = String(s || '')
      .split(/\s+/)
      .filter(Boolean);
    const out = ws.map((w) => {
      const raw = w;
      const norm = stripAccents(raw.toLowerCase()).replace(/[^a-z]/g, '');
      if (norm.length < 6) return raw;
      // Only consider tokens that already look "health-ish" after OCR (share some letters)
      let best: { to: string; d: number } | null = null;
      for (const v of healthDomainVocab) {
        if (!v) continue;
        const d = levenshtein(norm, v);
        if (d <= 2 && (best == null || d < best.d)) best = { to: v, d };
        if (best && best.d === 0) break;
      }
      if (!best) return raw;
      // Keep casing style: if original starts with capital, capitalize replacement.
      const repl = /^[A-ZÁÉÍÓÚÜÑ]/.test(raw) ? best.to[0].toUpperCase() + best.to.slice(1) : best.to;
      if (stripAccents(raw.toLowerCase()) !== best.to) tokenCorrections.push({ from: raw, to: repl, distance: best.d });
      return repl;
    });
    return { corrected: out.join(' '), tokenCorrections, correction_applied: tokenCorrections.length > 0 };
  };

  const rawInstitution =
    chosen?.bestMemberCorrectionApplied && chosen?.bestCorrectedNorm
      ? (isTitleCaseish(chosen?.bestDisplay || '') ? toTitleCase(chosen.bestCorrectedNorm) : chosen.bestCorrectedNorm)
      : chosen?.bestDisplay?.trim() || '';
  const healthCorrected = correctHealthDomainTokens(rawInstitution);
  const cleaned = cleanInstitutionDisplay(healthCorrected.corrected);
  const institution = cleaned.cleaned || null;
  const correctionApplied = Boolean(chosen?.anyCorrection);
  const tokenCorrectionApplied = healthCorrected.correction_applied;

  return {
    institution_from_text: institution,
    meta: {
      correction_applied: correctionApplied || tokenCorrectionApplied,
      cleaning_applied: cleaned.cleaning_applied,
      cleaned_institution: safePreview(institution || '', 120),
      institution_token_corrections: healthCorrected.tokenCorrections.slice(0, 12),
      corrected_institution_candidate: safePreview(healthCorrected.corrected || '', 140),
      normalized_candidates: rankedClusters.slice(0, 5).map((c) => ({
        key: c.repKey,
        pages: c.pages,
        avgScore: c.avgScore,
        anyCorrection: c.anyCorrection,
        chosen_display: safePreview(c.bestDisplay, 80),
        corrected_norm: safePreview(c.bestCorrectedNorm, 60),
        variants: Array.from(
          new Set(c.members.map((m) => safePreview(m.display, 60))),
        ).slice(0, 6),
      })),
      chosen_candidate: safePreview(institution || '', 120),
    },
  };
}

function diagnosePartogram(lower: string, fileNameLower: string) {
  const reasons: string[] = [];
  const fn = stripAccents((fileNameLower || '').toLowerCase());
  if (/\bparto\s*grama\b/i.test(fn) || fn.includes('partogram')) reasons.push('filename_partogram');
  if (/\bparto\s*grama\b/i.test(lower)) reasons.push('text_word_partograma');
  if (lower.includes('partograma')) reasons.push('text_includes_partograma');
  if (lower.includes('partogram')) reasons.push('text_includes_partogram');
  if (lower.includes('dilatacion cervical') && lower.includes('frecuencia cardiaca fetal')) reasons.push('combo_dilatacion+fcf');
  if (lower.includes('membranas ovulares') && lower.includes('dilatacion')) reasons.push('combo_membranas+dilatacion');
  if (lower.includes('frecuencia cardiaca fetal') && lower.includes('tension arterial')) reasons.push('combo_fcf+ta');
  if (lower.includes('personal carga') && lower.includes('dilatacion cervical')) reasons.push('combo_personal_carga+dilatacion');
  return reasons;
}

type PageScore = {
  page_idx: number;
  keyword_score: number;
  text_length_score: number;
  titlecase_score: number;
  total_score: number;
  keyword_hits: string[];
  text_len: number;
};

function rankPagesByRelevance(pageTexts: string[]) {
  const keywords = [
    'procedimiento',
    'operacion',
    'operación',
    'intervencion',
    'intervención',
    'diagnostico',
    'diagnóstico',
    'quirurgico',
    'quirúrgico',
    'indicacion',
    'indicación',
    'descripcion',
    'descripción',
    'practica',
    'práctica',
    'protocolo',
    'parte',
  ];

  const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

  const lengths = pageTexts.map((t) => (t || '').trim().length);
  const maxLen = Math.max(1, ...lengths);
  const p95 = (() => {
    const sorted = [...lengths].sort((a, b) => a - b);
    const idx = Math.floor(0.95 * (sorted.length - 1));
    return Math.max(1, sorted[idx] ?? 1);
  })();

  const scores: PageScore[] = pageTexts.map((raw, i) => {
    const t = String(raw || '').replace(/\s+/g, ' ').trim();
    const lower = stripAccents(t.toLowerCase());
    const hits: string[] = [];
    let kwScore = 0;
    for (const kw of keywords) {
      const k = stripAccents(kw.toLowerCase());
      if (!k) continue;
      if (lower.includes(k)) {
        hits.push(k);
        kwScore += 1;
      }
    }

    // Length score: saturates around p95; uses log for stability across docs.
    const len = t.length;
    const textLenScore = clamp01(Math.log(1 + len) / Math.log(1 + p95));

    // Titlecase/uppercase heuristic: more uppercase words -> more likely headers/sections.
    const words = t.split(/\s+/).filter((w) => w.length >= 4).slice(0, 2200);
    let upperWords = 0;
    for (const w of words) {
      const letters = w.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, '');
      if (letters.length < 4) continue;
      const upper = letters.toUpperCase();
      const lower2 = letters.toLowerCase();
      if (letters === upper && letters !== lower2) upperWords++;
    }
    const upperRatio = words.length ? upperWords / words.length : 0;
    const titleScore = clamp01(upperRatio / 0.12);

    // Weighted total: keywords matter most; length and titles as generic tie-breakers.
    const total = kwScore * 3.0 + textLenScore * 2.0 + titleScore * 1.0;

    return {
      page_idx: i,
      keyword_score: kwScore,
      text_length_score: Number(textLenScore.toFixed(3)),
      titlecase_score: Number(titleScore.toFixed(3)),
      total_score: Number(total.toFixed(3)),
      keyword_hits: hits.slice(0, 12),
      text_len: len,
    };
  });

  const sorted = [...scores].sort((a, b) => b.total_score - a.total_score || b.text_len - a.text_len);

  // Decide if the ranking is "clear": top is meaningfully higher than next.
  const top = sorted[0];
  const second = sorted[1];
  const clear = Boolean(top && second && top.total_score >= second.total_score * 1.2 && top.total_score - second.total_score >= 2);

  const chooseTopN = (n: number) =>
    sorted
      .slice(0, n)
      .map((s) => s.page_idx)
      .filter((v, idx, arr) => arr.indexOf(v) === idx)
      .sort((a, b) => a - b);

  let selected: number[] = [];
  let reason = '';
  if (pageTexts.length <= 1) {
    selected = [0];
    reason = 'single_page';
  } else if (clear) {
    selected = chooseTopN(Math.min(3, pageTexts.length));
    reason = 'top_by_score_clear';
  } else {
    // Fallback: if long docs, prefer tail pages (often contain dense description).
    if (pageTexts.length > 4) {
      selected = Array.from(new Set([0, pageTexts.length - 2, pageTexts.length - 1])).sort((a, b) => a - b);
      reason = 'fallback_first_last2';
    } else {
      const mid = Math.floor((pageTexts.length - 1) / 2);
      selected = Array.from(new Set([0, mid, pageTexts.length - 1])).sort((a, b) => a - b);
      reason = 'fallback_first_middle_last';
    }
  }

  return { scores, sorted, selected_pages: selected, selected_reason: reason, max_len: maxLen, p95_len: p95 };
}

function softTitleCaseInstitution(raw: string) {
  const s = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!s) return { out: '', applied: false };
  const lowerConnectors = new Set(['y', 'de', 'del', 'la', 'las', 'los', 'el', 'en']);
  const words = s.split(' ').filter(Boolean);
  const outWords = words.map((w, idx) => {
    // Preserve all-uppercase acronyms (>=2 letters)
    const letters = w.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, '');
    if (letters.length >= 2 && w === w.toUpperCase()) return w;
    const core = w.toLowerCase();
    if (idx > 0 && lowerConnectors.has(stripAccents(core))) return core;
    // Capitalize first letter, keep rest as lower
    return core.length ? core[0].toUpperCase() + core.slice(1) : core;
  });
  const out = outWords.join(' ');
  return { out, applied: out !== s };
}

type NomenRow = { entries: Array<{ desc: string; specialty?: string }>; ambiguous?: boolean };
const NOMEN = TRAZA_NOMENCLADOR_FULL as Record<string, NomenRow>;

type ProcKw = { keywords: string[]; code: string };
const PROC_KEYWORDS = TRAZA_PROC_KEYWORDS as ProcKw[];

type ProgressFn = (p: { progress: number; message: string }) => void;

async function fetchParteExtractionFromOpenAI(imagesDataUrl: string | string[]): Promise<ParteQuirurgicoExtract | null> {
  try {
    const t0 = Date.now();
    const images = Array.isArray(imagesDataUrl) ? imagesDataUrl : [imagesDataUrl];
    const res = await fetch('/api/ai/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imagesBase64: images.slice(0, 5),
        imageBase64: images[0],
        documentType: 'parte_quirurgico',
      }),
    });
    const json = (await res.json()) as { ok?: boolean; data?: ParteQuirurgicoExtract };
    const dt = Date.now() - t0;
    console.log(`${PIPE} openai:client_fetch_ms=${dt} status=${res.status} ok=${json?.ok === true}`);
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
async function tryOverlayOpenAiParteText(
  result: ExtractionResult,
  onProgress?: ProgressFn,
  preferredPages?: number[],
): Promise<ExtractionResult> {
  const first = result.thumbnails[0]?.dataUrl;
  const n = result.pageTexts.length;
  console.log(
    `${PIPE} overlay_openai:gate pageTexts=${n} thumbs=${result.thumbnails.length} using_thumb_idx=0 has_thumb0=${Boolean(first)}`,
  );
  const inst =
    result.institution_from_text && result.institution_from_text.trim()
      ? { institution_from_text: result.institution_from_text, meta: { source: 'precomputed' } }
      : extractInstitutionFromPageTexts(result.pageTexts || []);
  const instRaw = inst.institution_from_text || null;
  const tc = softTitleCaseInstitution(instRaw || '');
  const institution_from_text = tc.out || null;
  console.log(`${PIPE} institution_titlecase_applied=${tc.applied} institution_titlecase_final="${safePreview(institution_from_text || '', 140)}"`);
  if (institution_from_text) {
    console.log(
      `${PIPE} institution_from_text="${safePreview(institution_from_text, 120)}" meta=${JSON.stringify(inst.meta)}`,
    );
  } else {
    console.log(`${PIPE} institution_from_text=null meta=${JSON.stringify(inst.meta)}`);
  }
  const prefValid =
    preferredPages && preferredPages.length
      ? preferredPages.filter((p) => Number.isFinite(p) && p >= 0 && p < result.thumbnails.length).slice(0, 5)
      : null;

  const ranked =
    !prefValid && result.pageTexts?.length && result.pageTexts.length > 1 ? rankPagesByRelevance(result.pageTexts) : null;
  const selectedPages = prefValid ? prefValid : ranked?.selected_pages?.length ? ranked.selected_pages : null;

  const selection_source = prefValid
    ? 'preferred_pages'
    : ranked?.selected_pages?.length
      ? 'internal_ranking'
      : 'fallback';

  const thumbCount = result.thumbnails.length;
  const uniquePages = (xs: number[]) => Array.from(new Set(xs));
  const pagesToSend =
    thumbCount <= 2
      ? uniquePages([0, 1].filter((p) => p >= 0 && p < thumbCount))
      : uniquePages([0, ...((selectedPages && selectedPages.length ? selectedPages : [0]) as number[])])
          .filter((p) => p >= 0 && p < thumbCount)
          .slice(0, 5);
  const imagesToSend = pagesToSend.map((p) => result.thumbnails[p]?.dataUrl).filter(Boolean) as string[];
  console.log(
    `${PIPE} overlay_openai:selection preferred_pages=${JSON.stringify(preferredPages || [])} selection_source=${selection_source} selected_pages=${JSON.stringify(selectedPages || [])} images_sent_to_openai=${imagesToSend.length} sent_pages=${JSON.stringify(pagesToSend)}`,
  );
  if (!first || n === 0) {
    onProgress?.({ progress: 1, message: 'Listo' });
    return result;
  }
  onProgress?.({ progress: 1, message: 'Finalizando...' });
  console.log(
    `${PIPE} overlay_openai:sending images=${imagesToSend.length} pages=${JSON.stringify(pagesToSend)} dataUrl_lens=${imagesToSend.map((s) => s.length).join(',')}`,
  );
  const t0 = Date.now();
  const data = await fetchParteExtractionFromOpenAI(imagesToSend.length ? imagesToSend : first);
  console.log(`${PIPE} overlay_openai:done ms=${Date.now() - t0} success=${Boolean(data)}`);
  if (!data) {
    onProgress?.({ progress: 1, message: 'Listo' });
    return { ...result, institution_from_text: institution_from_text || undefined };
  }
  console.log(`${PIPE} openai:fields top_level=${Object.keys(data as any).join(',')}`);
  const openaiInstRaw = (data as any)?.sanatorio;
  const openaiInst = typeof openaiInstRaw === 'string' ? openaiInstRaw.trim() : '';
  const textInst = (institution_from_text || '').trim();
  let source: 'openai' | 'fallback_text' = 'openai';
  let finalData = data;
  if (!openaiInst && textInst) {
    source = 'fallback_text';
    finalData = { ...(data as any), sanatorio: textInst } as ParteQuirurgicoExtract;
  }
  {
    const rawPrepaga = (finalData as any)?.cobertura?.prepaga;
    const inferred =
      inferPrepagaFromText(rawPrepaga) ||
      inferPrepagaFromText(result.raw_text_light) ||
      inferPrepagaFromText(result.raw_text) ||
      inferPrepagaFromText(result.text) ||
      null;
    if (!String(rawPrepaga || '').trim() && inferred) {
      finalData = {
        ...(finalData as any),
        cobertura: { ...((finalData as any).cobertura || {}), prepaga: inferred },
      } as ParteQuirurgicoExtract;
    }
  }
  {
    const rawName = (finalData as any)?.paciente?.apellido_nombre;
    const cleaned = normalizePacienteApellidoNombre(rawName);
    if (cleaned !== null && String(rawName || '').trim() !== cleaned) {
      finalData = {
        ...(finalData as any),
        paciente: { ...((finalData as any).paciente || {}), apellido_nombre: cleaned },
      } as ParteQuirurgicoExtract;
    } else if (cleaned === null && rawName != null && String(rawName).trim() !== '') {
      finalData = {
        ...(finalData as any),
        paciente: { ...((finalData as any).paciente || {}), apellido_nombre: null },
      } as ParteQuirurgicoExtract;
    }
  }
  const finalInst = String((finalData as any)?.sanatorio || '').trim();
  console.log(`${PIPE} openai_institution="${safePreview(openaiInst, 120)}"`);
  console.log(`${PIPE} institution_final="${safePreview(finalInst, 120)}" source=${source}`);
  if (openaiInst && textInst) {
    const a = normalizeInstitutionCandidate(openaiInst);
    const b = normalizeInstitutionCandidate(textInst);
    if (a && b && a !== b) {
      console.log(
        `${PIPE} institution_discrepancy openai="${safePreview(openaiInst, 90)}" text="${safePreview(textInst, 90)}"`,
      );
    }
  }
  let text = parteExtractToAnalysisText(finalData);
  if (!data.paciente?.apellido_nombre?.trim()) {
    const legacyPaciente = extractStructured(result.text.slice(0, 25_000), TRAZA_NOMENCLADOR_FULL as any).paciente;
    if (legacyPaciente?.trim()) {
      text = `Paciente: ${legacyPaciente.trim().replace(/\s+/g, ' ')}\n${text}`;
    }
  }
  const pageTexts = Array.from({ length: n }, () => text);
  onProgress?.({ progress: 1, message: 'Listo' });
  return {
    ...result,
    text,
    pageTexts,
    aiParteExtract: finalData,
    institution_from_text: institution_from_text || undefined,
  };
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
  const tAll0 = Date.now();
  console.log(`${PIPE} pdf:start name=${file.name} size=${file.size} type=${file.type}`);
  onProgress?.({ progress: 0.1, message: 'Leyendo PDF...' });
  const tRead0 = Date.now();
  const arrayBuffer = await file.arrayBuffer();
  console.log(`${PIPE} pdf:stage file_arraybuffer_ms=${Date.now() - tRead0} bytes=${arrayBuffer.byteLength}`);
  const tPdf0 = Date.now();
  const pdfjs = await loadPdfjs();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  console.log(`${PIPE} pdf:stage load_pdfjs+getDocument_ms=${Date.now() - tPdf0} numPages=${pdf.numPages}`);

  let allText = '';
  const pageTexts: string[] = [];
  const thumbnails: ExtractionResult['thumbnails'] = [];
  let ocrWords: PageWords[] = [];

  const tRender0 = Date.now();
  for (let p = 1; p <= pdf.numPages; p++) {
    const tPage0 = Date.now();
    const page = await pdf.getPage(p);
    // Página 1 más nítida para OpenAI Vision y para OCR en esa hoja.
    const SCALE = p === 1 ? 2.75 : 1.8;
    const viewport = page.getViewport({ scale: SCALE });

    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((i: any) => i.str).join(' ');
    pageTexts.push(pageText);
    allText += pageText + '\n';
    console.log(`${PIPE} pdf:page_text_preview page_idx=${p - 1} text_len=${pageText.length} preview="${safePreview(pageText, 300)}"`);

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
    console.log(
      `${PIPE} pdf:page_done p=${p}/${pdf.numPages} scale=${SCALE} canvas=${Math.round(canvas.width)}x${Math.round(canvas.height)} text_items=${(textContent.items as any[]).length} pageText_len=${pageText.length} ms=${Date.now() - tPage0}`,
    );
  }
  console.log(
    `${PIPE} pdf:stage render_loop_ms=${Date.now() - tRender0} thumbs=${thumbnails.length} pageTexts=${pageTexts.length} allText_len=${allText.length}`,
  );

  const pipelineStartedAt = Date.now();
  const rawAllText = allText;
  const rawPageTexts = [...pageTexts];
  const embeddedTextLen = rawAllText.trim().length;
  const hasEmbeddedText = embeddedTextLen >= 50;
  const rankedFast = hasEmbeddedText && rawPageTexts.length ? rankPagesByRelevance(rawPageTexts) : null;
  const fastSelectedPages = rankedFast?.selected_pages?.length
    ? rankedFast.selected_pages
    : pdf.numPages >= 5
      ? [1, Math.max(0, pdf.numPages - 2), pdf.numPages - 1]
      : pdf.numPages > 1
        ? [0, Math.floor((pdf.numPages - 1) / 2), pdf.numPages - 1]
        : [0];
  console.log(`${PIPE} pipeline_mode=fast_default ocr_skipped=true embedded_text_len=${embeddedTextLen}`);
  console.log(`${PIPE} fast_selected_pages=${JSON.stringify(Array.from(new Set(fastSelectedPages)).sort((a, b) => a - b))}`);
  if (rankedFast) {
    console.log(`${PIPE} page_selection selected_reasons=${JSON.stringify({ reason: rankedFast.selected_reason, p95_len: rankedFast.p95_len })}`);
  } else {
    console.log(
      `${PIPE} page_selection selected_reasons=${JSON.stringify({
        reason: hasEmbeddedText ? 'positional_fallback_no_ranking' : 'positional_fallback_no_embedded_text',
        numPages: pdf.numPages,
      })}`,
    );
  }

  // Fast base: do NOT run OCR yet.
  // Header OCR light: if scanned PDF (no embedded text), OCR only the top slice of selected pages for institution.
  let headerOcrMs = 0;
  let institutionFromHeader: string | null = null;
  if (!hasEmbeddedText && thumbnails.length > 0) {
    const headerPagesAll = Array.from(new Set(fastSelectedPages)).filter((p) => p >= 0 && p < thumbnails.length);
    const headerPages = headerPagesAll.slice(0, 2); // OCR 1st; try 2nd only if needed
    const tHdr0 = Date.now();
    try {
      const headerTexts: string[] = [];
      const triedPages: number[] = [];
      for (let k = 0; k < headerPages.length; k++) {
        const p = headerPages[k];
        const thumb = thumbnails[p];
        if (!thumb?.dataUrl) continue;
        const cropped = await cropTopDataUrl(thumb.dataUrl, 0.2);
        const r = await ocrImageTextLight(cropped);
        triedPages.push(p);
        headerTexts.push(r.text || '');
        const instHdrTry = extractInstitutionFromPageTexts(headerTexts);
        institutionFromHeader = instHdrTry.institution_from_text;
        if (institutionFromHeader && institutionFromHeader.trim().length >= 8) break;
      }
      headerOcrMs = Date.now() - tHdr0;
      console.log(`${PIPE} header_ocr pages=${JSON.stringify(headerPages)} tried_pages=${JSON.stringify(triedPages)} ms=${headerOcrMs}`);
      console.log(`${PIPE} institution_from_header="${safePreview(institutionFromHeader || '', 140)}"`);
    } catch (e) {
      headerOcrMs = Date.now() - tHdr0;
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`${PIPE} header_ocr pages=${JSON.stringify(headerPages)} ms=${headerOcrMs} error=${msg || 'unknown'}`);
    }
  }

  // Cover OCR light (fast_default scanned): capture admin text from first page only.
  let rawTextLight: string | undefined = undefined;
  if (!hasEmbeddedText && thumbnails[0]?.dataUrl) {
    const tCov0 = Date.now();
    try {
      const cropped = await cropTopDataUrl(thumbnails[0].dataUrl, 0.55);
      const r = await ocrImageTextLight(cropped);
      rawTextLight = r.text || '';
      const ms = Date.now() - tCov0;
      console.log(`${PIPE} cover_ocr_light ms=${ms}`);
      console.log(`${PIPE} cover_ocr_light_preview="${safePreview(rawTextLight, 220)}"`);
    } catch (e) {
      const ms = Date.now() - tCov0;
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`${PIPE} cover_ocr_light ms=${ms} error=${msg || 'unknown'}`);
      rawTextLight = '';
    }
  }

  const baseFast: ExtractionResult = {
    text: rawAllText,
    thumbnails,
    method: 'pdf-text',
    ocrWords,
    pageTexts: rawPageTexts,
    raw_text: rawAllText,
    raw_text_light: rawTextLight,
    raw_pageTexts: rawPageTexts,
    institution_from_text: institutionFromHeader || undefined,
  };

  const tOpenAi0 = Date.now();
  const overlaid = await tryOverlayOpenAiParteText(baseFast, onProgress, fastSelectedPages);
  const openai_ms = Date.now() - tOpenAi0;

  const ai = overlaid.aiParteExtract as any;
  const aiOk = Boolean(ai);
  const keyPaciente = String(ai?.paciente?.apellido_nombre || '').trim();
  const keyProc = String(ai?.procedimiento?.tipo_realizado || '').trim() || String(ai?.procedimiento?.descripcion_tecnica || '').trim();
  const keyFecha = String(ai?.cirugia?.fecha || '').trim();
  const lowQuality = !aiOk || (!keyPaciente && !keyProc) || (!keyPaciente && !keyFecha);

  if (!lowQuality) {
    console.log(`${PIPE} pipeline_mode=fast_default ocr_skipped=true openai_ms=${openai_ms} total_ms=${Date.now() - pipelineStartedAt}`);
    console.log(
      `${PIPE} pdf:done method=pdf-text thumbs=${thumbnails.length} pages=${pdf.numPages} ocrPages=${ocrWords.length} total_ms=${Date.now() - tAll0}`,
    );
    return overlaid;
  }

  const fallback_reason = !aiOk
    ? 'openai_failed'
    : !keyPaciente && !keyProc
      ? 'openai_missing_paciente_and_procedimiento'
      : !keyPaciente && !keyFecha
        ? 'openai_missing_paciente_and_fecha'
        : 'openai_low_quality';
  console.log(`${PIPE} pipeline_mode=ocr_fallback ocr_skipped=false fallback_reason=${fallback_reason} openai_ms=${openai_ms}`);

  // OCR fallback: run the existing OCR pipeline only now.
  let method: 'pdf-text' | 'ocr' = 'pdf-text';
  let ocrMs = 0;
  if (rawAllText.trim().length < 50) {
    method = 'ocr';
    allText = '';
    ocrWords = [];
    pageTexts.length = 0;
    console.log(`${PIPE} ocr:mode full reason=fallback_after_openai allText_trim_len_lt_50`);
    const tOcr0 = Date.now();
    for (let i = 0; i < thumbnails.length; i++) {
      const tPageOcr0 = Date.now();
      const res = await ocrImageWithWords(thumbnails[i].dataUrl, (prog) => {
        onProgress?.({
          progress: 0.4 + 0.55 * ((i + prog) / thumbnails.length),
          message: `OCR página ${i + 1}/${thumbnails.length}`,
        });
      });
      console.log(
        `${PIPE} ocr:page_text_preview page_idx=${i} text_len=${res.text.length} preview="${safePreview(res.text, 300)}"`,
      );
      pageTexts.push(res.text);
      allText += res.text + '\n';
      ocrWords.push({ page: i, words: res.words, width: thumbnails[i].width, height: thumbnails[i].height });
      console.log(
        `${PIPE} ocr:page_done idx=${i}/${thumbnails.length - 1} words=${res.words.length} text_len=${res.text.length} ms=${Date.now() - tPageOcr0}`,
      );
    }
    ocrMs = Date.now() - tOcr0;
    console.log(`${PIPE} ocr:stage full_ocr_ms=${ocrMs}`);
  } else {
    // PDF híbrido: completar con OCR solo páginas casi vacías para mejorar encuadre.
    const sparsePages = ocrWords.filter((p) => (p.words || []).length < 8).map((p) => p.page);
    console.log(
      `${PIPE} ocr:mode hybrid sparse_pages=${sparsePages.length}/${thumbnails.length} sparse_idx=${sparsePages.join(',')}`,
    );
    const tHybrid0 = Date.now();
    for (let k = 0; k < sparsePages.length; k++) {
      const i = sparsePages[k];
      const tPageOcr0 = Date.now();
      const res = await ocrImageWithWords(thumbnails[i].dataUrl, (prog) => {
        onProgress?.({
          progress: 0.45 + 0.5 * ((k + prog) / sparsePages.length),
          message: `OCR página ${i + 1}/${thumbnails.length} (refuerzo)`,
        });
      });
      console.log(
        `${PIPE} ocr:page_text_preview page_idx=${i} text_len=${res.text.length} preview="${safePreview(res.text, 300)}"`,
      );
      pageTexts[i] = res.text || pageTexts[i];
      const idx = ocrWords.findIndex((p) => p.page === i);
      if (idx >= 0) {
        ocrWords[idx] = { page: i, words: res.words, width: thumbnails[i].width, height: thumbnails[i].height };
      }
      console.log(
        `${PIPE} ocr:page_done hybrid idx=${i} words=${res.words.length} text_len=${res.text.length} ms=${Date.now() - tPageOcr0}`,
      );
    }
    allText = pageTexts.join('\n') + '\n';
    ocrMs = Date.now() - tHybrid0;
    console.log(`${PIPE} ocr:stage hybrid_ocr_ms=${ocrMs}`);
  }

  const baseOcr: ExtractionResult = {
    text: allText,
    thumbnails,
    method,
    ocrWords,
    pageTexts,
    raw_text: allText,
    raw_pageTexts: [...pageTexts],
  };
  const tOpenAi1 = Date.now();
  const overlaid2 = await tryOverlayOpenAiParteText(baseOcr, onProgress);
  const openai_ms2 = Date.now() - tOpenAi1;
  console.log(
    `${PIPE} pipeline_mode=ocr_fallback ocr_skipped=false fallback_reason=${fallback_reason} ocr_ms=${ocrMs} openai_ms=${openai_ms2} total_ms=${Date.now() - pipelineStartedAt}`,
  );
  console.log(
    `${PIPE} pdf:done method=${method} thumbs=${thumbnails.length} pages=${pdf.numPages} ocrPages=${ocrWords.length} total_ms=${Date.now() - tAll0}`,
  );
  return overlaid2;
}

async function extractFromImage(file: File, onProgress?: ProgressFn): Promise<ExtractionResult> {
  const tAll0 = Date.now();
  console.log(`${PIPE} image:start name=${file.name} size=${file.size} type=${file.type}`);
  onProgress?.({ progress: 0.1, message: 'Cargando imagen...' });
  const tLoad0 = Date.now();
  const dataUrl = await fileToDataUrl(file);
  const dim = await imageDimensions(dataUrl);
  console.log(`${PIPE} image:stage load_ms=${Date.now() - tLoad0} dataUrl_len=${dataUrl.length} dim=${dim.width}x${dim.height}`);
  onProgress?.({ progress: 0.2, message: 'Aplicando OCR...' });
  const tOcr0 = Date.now();
  const res = await ocrImageWithWords(dataUrl, (prog) => {
    onProgress?.({ progress: 0.2 + 0.75 * prog, message: 'Reconociendo texto...' });
  });
  console.log(`${PIPE} image:stage ocr_ms=${Date.now() - tOcr0} words=${res.words.length} text_len=${res.text.length}`);
  const base: ExtractionResult = {
    text: res.text,
    thumbnails: [{ dataUrl, width: dim.width, height: dim.height }],
    method: 'ocr',
    ocrWords: [{ page: 0, words: res.words, width: dim.width, height: dim.height }],
    pageTexts: [res.text],
    raw_text: res.text,
    raw_pageTexts: [res.text],
  };
  // Phase 2 (selection only): rank pages but do NOT change behavior yet.
  {
    const ranked = rankPagesByRelevance(base.pageTexts);
    console.log(
      `${PIPE} page_selection page_scores=${JSON.stringify(
        ranked.sorted.slice(0, Math.min(8, ranked.sorted.length)).map((s) => ({
          page_idx: s.page_idx,
          keyword_score: s.keyword_score,
          text_length_score: s.text_length_score,
          titlecase_score: s.titlecase_score,
          total_score: s.total_score,
          text_len: s.text_len,
          keyword_hits: s.keyword_hits,
        })),
      )}`,
    );
    console.log(`${PIPE} page_selection selected_pages=${JSON.stringify(ranked.selected_pages)}`);
    console.log(
      `${PIPE} page_selection selected_reasons=${JSON.stringify({
        reason: ranked.selected_reason,
        p95_len: ranked.p95_len,
      })}`,
    );
  }
  console.log(`${PIPE} image:done total_ms=${Date.now() - tAll0}`);
  return tryOverlayOpenAiParteText(base, onProgress, [0]);
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
  const t0 = Date.now();
  const Tesseract: any = await import('tesseract.js');
  const { data } = await Tesseract.recognize(dataUrl, 'spa', {
    logger: (m: any) => {
      if (m.status === 'recognizing text' && onProg) onProg(m.progress || 0);
    },
  });
  console.log(
    `${PIPE} ocr:recognize_ms=${Date.now() - t0} text_len=${(data?.text || '').length} words=${(data?.words || []).length}`,
  );
  return {
    text: data.text,
    words: (data.words || []).map((w: any) => ({
      text: w.text,
      bbox: w.bbox,
      confidence: w.confidence,
    })),
  };
}

async function ocrImageTextLight(dataUrl: string, onProg?: (p: number) => void): Promise<{ text: string }> {
  const t0 = Date.now();
  const Tesseract: any = await import('tesseract.js');
  const { data } = await Tesseract.recognize(dataUrl, 'spa', {
    logger: (m: any) => {
      if (m.status === 'recognizing text' && onProg) onProg(m.progress || 0);
    },
  });
  console.log(`${PIPE} header_ocr:recognize_ms=${Date.now() - t0} text_len=${(data?.text || '').length}`);
  return { text: String(data?.text || '') };
}

function cropTopDataUrl(dataUrl: string, ratio: number): Promise<string> {
  const r = Math.max(0.05, Math.min(0.5, ratio));
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || (img as any).width || 1;
      const h = img.naturalHeight || (img as any).height || 1;
      const cropH = Math.max(1, Math.floor(h * r));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = cropH;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, cropH, 0, 0, w, cropH);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function stripAccents(s: string) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizePacienteApellidoNombre(raw: string | null | undefined): string | null {
  const s0 = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!s0) return null;
  let s = s0.replace(/^paciente\s*[:\-]\s*/i, '').trim();
  if (!s) return null;

  const stop = new Set([
    'pariente',
    'familiar',
    'acompanante',
    'acompañante',
    'responsable',
    'tutor',
    'padre',
    'madre',
  ]);

  const lowerToken = (x: string) => stripAccents(x.trim().toLowerCase());
  const addCommaIfLooksLikeFullName = (x: string) => {
    const t = x.replace(/\s+/g, ' ').trim();
    if (!t) return t;
    if (t.includes(',')) return t;
    const parts = t.split(' ').filter(Boolean);
    if (parts.length >= 2 && parts.length <= 5) return `${parts[0]}, ${parts.slice(1).join(' ')}`;
    return t;
  };

  if (s.includes(',')) {
    const [a, ...rest] = s.split(',');
    const head = a.trim();
    const tail = rest.join(',').trim();
    if (stop.has(lowerToken(head))) {
      const cleaned = tail.replace(/^[:,\-]\s*/, '').trim();
      return cleaned ? addCommaIfLooksLikeFullName(cleaned) : null;
    }
  }

  const parts = s.split(' ').filter(Boolean);
  if (parts.length >= 2 && stop.has(lowerToken(parts[0]))) {
    s = parts.slice(1).join(' ').trim();
    if (!s) return null;
  }

  return addCommaIfLooksLikeFullName(s);
}

function inferPrepagaFromText(raw: string | null | undefined): string | null {
  const s = String(raw || '').trim();
  if (!s) return null;
  const n = stripAccents(s.toLowerCase());
  if (n.includes('osde')) return 'OSDE';
  if (n.includes('swiss') || n.includes('smm') || n.includes('smg') || n.includes('medical')) return 'SWISS MEDICAL';
  if (n.includes('medife') || n.includes('medifé')) return 'MEDIFE';
  if (n.includes('galeno')) return 'GALENO';
  if (n.includes('medicus')) return 'MEDICUS';
  return null;
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

/** Resalta el procedimiento en el PDF: strict → suelto → tokens sueltos / descripción → caja de intervención. */
function findSpansForProcedureKeyword(
  keyword: string,
  ocrPages?: PageWords[],
  opts?: { desc?: string },
): Span[] | undefined {
  if (!ocrPages) return undefined;

  const strict = findSpans(keyword, ocrPages, { requireProcedureFieldContext: true, maxResults: 2 });
  if (strict.length) return strict;
  const loose = findSpans(keyword, ocrPages, { maxResults: 2 });
  if (loose.length) return loose;

  const needleTokens = stripAccents(keyword.toLowerCase())
    .replace(/[^\w\s.\-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0);
  for (const tok of needleTokens) {
    if (tok.length < 4) continue;
    const one = findSpans(tok, ocrPages, { maxResults: 1 });
    if (one.length) return one;
  }

  if (opts?.desc) {
    const descToks = stripAccents(opts.desc.toLowerCase())
      .replace(/[^\w\s.\-]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 4);
    for (const tok of descToks.slice(0, 8)) {
      const one = findSpans(tok, ocrPages, { maxResults: 1 });
      if (one.length) return one;
    }
  }

  return ocrPages.length > 0 ? findInterventionAnchorSpan(ocrPages) : undefined;
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
    // Solo texto *antes* del match para badCtx: si incluimos lo que viene después, la línea
    // siguiente "fecha nacimiento: …" mete "nacimiento" en el contexto y descarta un `fecha:`
    // válido de cirugía (p. ej. texto serializado desde OpenAI).
    const ctxBefore = stripAccents(text.slice(Math.max(0, idx - 40), idx).toLowerCase());
    const hasBad = badCtx.some((b) => ctxBefore.includes(b));
    if (hasBad) continue;
    const ctx = stripAccents(text.slice(Math.max(0, idx - 40), Math.min(text.length, idx + 80)).toLowerCase());
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
  const tAll0 = Date.now();
  const lower = stripAccents(text.toLowerCase());
  const findings: Finding[] = [];
  const isPartogram = isPartogramDocument(lower, fileName || '');
  console.log(
    `${PIPE} analyze:start fileName=${fileName} text_len=${text.length} pages=${pageTexts?.length ?? 0} ocrPages=${ocrWords?.length ?? 0} isPartogram=${isPartogram}`,
  );
  const partogramReasons = diagnosePartogram(lower, fileName || '');
  const parteSignals = detectParteSignals(lower);
  const hasPartogramSection = isPartogram || partogramReasons.length > 0;
  const hasSurgicalOrProcedureSection = parteSignals.length > 0;
  const isPartogramOnly = hasPartogramSection && !hasSurgicalOrProcedureSection;
  const partogramDecisionReason = isPartogramOnly
    ? 'partogram_signals_present_and_no_surgical_signals'
    : hasPartogramSection && hasSurgicalOrProcedureSection
      ? 'mixed_document_partogram_and_surgical_signals'
      : hasSurgicalOrProcedureSection
        ? 'surgical_signals_present'
        : 'no_partogram_or_surgical_signals';

  console.log(
    `${PIPE} analyze:doc_class hasPartogramSection=${hasPartogramSection} hasSurgicalOrProcedureSection=${hasSurgicalOrProcedureSection} isPartogramOnly=${isPartogramOnly} decision_reason=${partogramDecisionReason}`,
  );
  console.log(
    `${PIPE} analyze:isPartogram reasons=${hasPartogramSection ? (partogramReasons.length ? partogramReasons.join(',') : 'unknown') : 'none'} parte_signals=${parteSignals.length ? parteSignals.join(',') : 'none'}`,
  );

  const foundFields: Record<string, boolean> = {};
  for (const field of TRAZA_REQUIRED_FIELDS) {
    const hit = field.labels.find((l) => lower.includes(stripAccents(l.toLowerCase())));
    if (hit) foundFields[field.key] = true;
  }

  let procedureGuess: Analysis['detected']['procedureGuess'] = null;
  if (!isPartogramOnly) {
    let scannedKeywords = 0;
    let wholeWordHits = 0;
    const nearHits: string[] = [];
    for (const entry of PROC_KEYWORDS) {
      for (const kw of entry.keywords) {
        scannedKeywords++;
        const kwLower = stripAccents(kw.toLowerCase());
        if (hasWholeWord(lower, kw)) {
          wholeWordHits++;
          const entryInNomen = NOMEN[entry.code];
          const descSugerido = entryInNomen?.entries?.[0]?.desc || '';
          procedureGuess = { keyword: kw, code: entry.code, desc: descSugerido };
          break;
        }
        // Diagnostics only: substring signal (we still require `hasWholeWord` for behavior).
        if (nearHits.length < 6 && kwLower.length >= 5 && lower.includes(kwLower)) {
          nearHits.push(kwLower);
        }
      }
      if (procedureGuess) break;
    }
    console.log(
      `${PIPE} analyze:procedureGuess sources=PROC_KEYWORDS scanned_keywords=${scannedKeywords} wholeword_hits=${wholeWordHits} near_substring_hits=${nearHits.length ? nearHits.join(',') : 'none'}`,
    );
  }
  console.log(`${PIPE} analyze:procedureGuess ${procedureGuess ? `code=${procedureGuess.code} kw=${procedureGuess.keyword}` : 'none'}`);
  if (isPartogramOnly) {
    console.log(`${PIPE} analyze:procedureGuess skipped reason=is_partogram_only`);
  } else if (!procedureGuess) {
    console.log(
      `${PIPE} analyze:procedureGuess none reason=no_wholeword_keyword_match parte_signals=${parteSignals.length ? parteSignals.join(',') : 'none'}`,
    );
  }

  // En partogramas los números largos (DNI, afiliado, internación) no son códigos de nomenclador.
  const codeRegex = isPartogramOnly
    ? /\b(\d{2}[.\-]\d{2}[.\-]\d{2})\b/g
    : /\b(\d{2}[.\-]\d{2}[.\-]\d{2}|\d{4,8})\b/g;
  console.log(`${PIPE} analyze:codes regex=${codeRegex.toString()} isPartogramOnly=${isPartogramOnly} hasPartogramSection=${hasPartogramSection}`);
  const rawCodes = Array.from(new Set(Array.from(text.matchAll(codeRegex)).map((m) => m[1])));
  const validCodes: string[] = [];
  const discarded: Array<{ raw: string; normalized: string; reason: string }> = [];
  for (const raw of rawCodes) {
    const normalized = raw.replace(/-/g, '.');
    if (NOMEN[normalized]) validCodes.push(normalized);
    else if (NOMEN[raw]) validCodes.push(raw);
    else discarded.push({ raw, normalized, reason: 'not_in_nomenclador' });
  }
  const maskCode = (c: string) => {
    const s = String(c || '');
    const keep = s.length <= 4 ? 1 : 2;
    return `${s.slice(0, keep)}${'X'.repeat(Math.max(0, s.length - keep * 2))}${s.slice(-keep)}(len${s.length})`;
  };
  console.log(
    `${PIPE} analyze:codes raw=${rawCodes.length} valid=${validCodes.length} raw_list=${rawCodes.slice(0, 12).join(',')}${rawCodes.length > 12 ? ',…' : ''}`,
  );
  if (rawCodes.length > 0) {
    const sample = rawCodes.slice(0, 10).map((c) => maskCode(c)).join(',');
    console.log(`${PIPE} analyze:codes raw_masked_sample=${sample}`);
  }
  if (discarded.length > 0) {
    const sample = discarded
      .slice(0, 10)
      .map((d) => `${maskCode(d.raw)}->${maskCode(d.normalized)}:${d.reason}`)
      .join(' | ');
    console.log(`${PIPE} analyze:codes discarded_sample=${sample}${discarded.length > 10 ? ' | …' : ''}`);
  }
  if (isPartogramOnly) {
    console.log(`${PIPE} nomenclador:matching attempt=no reason=is_partogram_only`);
  }

  const tNomen0 = Date.now();
  if (!isPartogramOnly && validCodes.length > 0) {
    console.log(`${PIPE} nomenclador:matching attempt=yes reason=valid_codes_present`);
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
  } else if (!isPartogramOnly) {
    console.log(`${PIPE} nomenclador:matching attempt=no reason=no_valid_codes`);
    if (procedureGuess) {
      findings.push({
        severity: 'warn',
        code: 'NO_CODE_SUGGEST',
        title: 'Código no encontrado en el documento',
        body: `No se detectó un código de nomenclador escrito explícitamente. Detectamos una posible práctica a partir del texto (“${procedureGuess.keyword}”). Revisá y confirmá el código antes de presentar.`,
        action: `Revisar y confirmar: ${procedureGuess.code} — ${procedureGuess.desc}.`,
        suggestion: { code: procedureGuess.code, desc: procedureGuess.desc },
        spans: findSpansForProcedureKeyword(procedureGuess.keyword, ocrWords, { desc: procedureGuess.desc }),
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
  console.log(`${PIPE} nomenclador:stage ms=${Date.now() - tNomen0}`);

  const prepagasDetectadas = TRAZA_PREPAGAS.filter((p) => lower.includes(stripAccents(p.toLowerCase())));
  const sanatoriosDetectados = TRAZA_SANATORIOS.filter((s) => lower.includes(stripAccents(s.toLowerCase())));
  if (prepagasDetectadas.length > 0) {
    // If we already detected a prepaga by name, don't require the literal label "prepaga/obra social" to appear.
    foundFields.prepaga = true;
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

  console.log(
    `${PIPE} analyze:done overall=${overall} findings=${findings.length} ok=${summary.ok} warn=${summary.warn} error=${summary.error} total_ms=${Date.now() - tAll0}`,
  );
  return {
    findings,
    summary,
    overall,
    detected: {
      codes: isPartogramOnly ? [] : validCodes,
      prepagas: prepagasDetectadas,
      sanatorios: sanatoriosDetectados,
      fechas: (fechaStrForPlazo ? [fechaStrForPlazo, ...fechas] : fechas).filter((v, i, a) => a.indexOf(v) === i).slice(0, 5),
      procedureGuess,
    },
    fileName,
    analyzedAt: new Date().toISOString(),
  };
}
