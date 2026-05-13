// lib/checks.ts
//
// Motor de chequeos pre-envío para Swiss Medical.
// Función pura, testeable sin DB.
//
// Responsabilidades:
// - Detectar bloqueantes (B1-B7)
// - Auto-completar código por keywords (matcher curado) y, como fallback,
//   buscar por similitud en todo el nomenclador antes de bloquear.
// - Calcular el estado_revision y los motivos resultantes

import { TRAZA_NOMENCLADOR_RAW, TRAZA_PROC_KEYWORDS } from './nomenclador'

// ============================================================================
// Tipos
// ============================================================================

export type CheckCode =
  | 'PREPAGA_NO_SWISS'
  | 'PREPAGA_AUSENTE'
  | 'CODIGO_AUSENTE'
  | 'SANATORIO_AUSENTE'
  | 'AFILIADO_AUSENTE'
  | 'PLAZO_VENCIDO'
  | 'FECHA_AUSENTE'

export type CheckIssue = {
  code: CheckCode
  severity: 'blocker' | 'warning'
  message: string
  field?: string
}

export type EstadoRevision = 'bloqueado' | 'en_revision' | 'confirmado'

export type CheckInputs = {
  prepaga: string | null | undefined
  numeroAfiliado: string | null | undefined
  sanatorio: string | null | undefined
  codigoNomenclador: string | null | undefined
  /** Detalle técnico de la práctica (p. ej. "dilatacion histeroscopia resectoscopio…"). */
  descripcionPractica: string | null | undefined
  /** Nombre canónico/breve de la práctica (p. ej. "HISTEROSCOPIA"). */
  tipoRealizado?: string | null
  /** Diagnóstico operatorio (p. ej. "METRORRAGIA"). Agrega contexto clínico. */
  diagnosticoOperatorio?: string | null
  fechaPracticaISO: string | null | undefined // 'YYYY-MM-DD'
}

export type CheckResult = {
  blockers: CheckIssue[]
  warnings: CheckIssue[]
  estado_revision: EstadoRevision | null // null si fuera_de_alcance (no es Swiss)
  isOutOfScope: boolean // true si la prepaga no es Swiss
  autoFilledCode: string | null // si rellenamos un código por keywords
}

// ============================================================================
// Helpers
// ============================================================================

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true
  if (typeof v !== 'string') return false
  return v.trim() === ''
}

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function isSwissMedical(prepaga: string | null | undefined): boolean {
  if (isEmpty(prepaga)) return false
  const p = normalize(prepaga as string)
  return p.includes('swiss') || p.includes('smg') || p === 'sm'
}

/**
 * Calcula el próximo "día 1° del mes siguiente" desde una fecha dada.
 * Si hoy es 9 de mayo → próximo cierre = 1 de junio.
 * Si hoy es 1 de mayo → próximo cierre = 1 de junio (ya pasó el de hoy a las 9 AM).
 *
 * Para simplificar, asumimos que el cierre del mismo día 1° ya pasó.
 * Esto da el plazo más restrictivo posible (más seguro: nunca enviamos algo vencido).
 */
function nextCierreDate(now: Date = new Date()): Date {
  const year = now.getFullYear()
  const month = now.getMonth() // 0-indexed
  // Primer día del mes siguiente
  if (month === 11) {
    return new Date(year + 1, 0, 1, 9, 0, 0, 0)
  }
  return new Date(year, month + 1, 1, 9, 0, 0, 0)
}

/**
 * Días entre fecha de práctica y próximo cierre.
 * Negativo si la práctica está en el futuro relativo al cierre (raro, no debería pasar).
 */
function daysUntilCierre(fechaPracticaISO: string, now: Date = new Date()): number {
  const fp = new Date(`${fechaPracticaISO}T00:00:00`)
  if (Number.isNaN(fp.getTime())) return Number.POSITIVE_INFINITY
  const cierre = nextCierreDate(now)
  const ms = cierre.getTime() - fp.getTime()
  return Math.floor(ms / (24 * 60 * 60 * 1000))
}

/**
 * Busca un código en TRAZA_PROC_KEYWORDS comparando contra una descripción.
 * Devuelve el código si encuentra match, null si no.
 *
 * Estrategia: normalizar (sin tildes, lowercase), buscar la keyword más específica
 * (las primeras del array son las más específicas, así que iteramos en orden).
 */
export function findCodeByDescription(description: string | null | undefined): string | null {
  if (isEmpty(description)) return null
  const haystack = normalize(description as string)
  for (const entry of TRAZA_PROC_KEYWORDS) {
    for (const kw of entry.keywords) {
      const needle = normalize(kw)
      if (needle.length === 0) continue
      if (haystack.includes(needle)) {
        return entry.code
      }
    }
  }
  return null
}

// Palabras genéricas que aparecen en muchas entradas del nomenclador y no aportan
// poder discriminativo. Las filtramos del tokenizado para evitar falsos positivos.
const STOPWORDS_INFERENCIA = new Set([
  'operacion',
  'operacional',
  'tratamiento',
  'tratamientos',
  'intervencion',
  'intervenciones',
  'unica',
  'unico',
  'completa',
  'completo',
  'parcial',
  'parciales',
  'general',
  'generales',
  'tipo',
  'tipos',
  'caso',
  'casos',
  'incluye',
  'incluido',
  'incluida',
  'segun',
  'segunda',
  'primera',
  'tiempo',
  'tiempos',
  'cualquier',
  'misma',
  'mismo',
  'otro',
  'otra',
  'otros',
  'otras',
])

function tokenizarParaInferencia(desc: string): string[] {
  const norm = normalize(desc).replace(/[^a-z0-9 ]+/g, ' ')
  const tokens = norm.split(/\s+/).filter((t) => t.length >= 4 && !STOPWORDS_INFERENCIA.has(t))
  return Array.from(new Set(tokens))
}

/**
 * Match flexible entre tokens para tolerar variaciones de género/sufijo del
 * español médico:  "resectoscopio" ↔ "resectoscopía",  "diagnóstica" ↔
 * "diagnóstico",  "operatoria" ↔ "operatorio",  "biopsia" ↔ "biopsias".
 *
 * Estrategia: si los dos tokens tienen ≥6 chars y comparten los primeros 6,
 * los consideramos equivalentes. Para tokens más cortos, exigimos igualdad
 * exacta (evita confundir "test" con "testículo").
 */
function tokensSimilares(a: string, b: string): boolean {
  if (a === b) return true
  if (a.length < 6 || b.length < 6) return false
  return a.slice(0, 6) === b.slice(0, 6)
}

/**
 * Fallback: si el matcher de keywords no encontró nada, buscamos el código
 * más parecido recorriendo TRAZA_NOMENCLADOR_RAW por similitud de tokens.
 *
 * Recibe múltiples fuentes (tipo_realizado, descripcion_tecnica,
 * diagnostico_operatorio) y las combina en un único conjunto de tokens del
 * parte. Más fuentes = más contexto clínico = mejor pick.
 *
 * Score: F-beta con β=2.
 *   - precision = matched / |tokens_del_nomenclador|   → qué tan específica
 *   - recall    = matched / |tokens_del_parte|        → qué tanto cubre
 *   - F2 = (1 + β²) · p · r / (β² · p + r),  con β=2
 *
 * Elegimos F2 (no F1) porque clínicamente es mucho más grave perder un dato
 * específico del parte (recall) que elegir una entrada con palabras extras
 * (precision). Ej: si el parte dice "histeroscopia con resectoscopio", el
 * código operatorio (incluye "resectoscopia") debe ganar sobre la diagnóstica
 * (solo cubre "histeroscopia").
 *
 * Salvaguardas:
 *   - Tokens del parte filtrados por stopwords y longitud ≥4.
 *   - Si el parte tiene 1 solo token, exigir ≥10 chars (evita inferir por
 *     "biopsia", "parto", "hernia" que son demasiado genéricos).
 *   - Si el parte tiene >1 token, exigir matched ≥2 (similar criterio).
 *   - F2 mínimo: 0.25 (debajo de eso, retornar null y bloquear).
 *   - Empate: gana descripción más corta y, sub-empate, código numérico menor.
 */
export function findCodeBySimilarity(
  ...fuentes: Array<string | null | undefined>
): string | null {
  const tokensSet = new Set<string>()
  for (const src of fuentes) {
    if (isEmpty(src)) continue
    for (const t of tokenizarParaInferencia(src as string)) tokensSet.add(t)
  }
  const tokensParte = Array.from(tokensSet)
  if (tokensParte.length === 0) return null
  if (tokensParte.length === 1 && tokensParte[0].length < 10) return null

  const MIN_MATCHED = tokensParte.length === 1 ? 1 : 2
  const MIN_F2 = 0.25
  const BETA2 = 4 // β² con β=2

  const raw = TRAZA_NOMENCLADOR_RAW as Record<string, { desc: string; specialty: string }>
  let best: { code: string; score: number; descLen: number } | null = null

  for (const code of Object.keys(raw)) {
    const entry = raw[code]
    if (!entry?.desc) continue
    const tokensNomen = tokenizarParaInferencia(entry.desc)
    if (tokensNomen.length === 0) continue

    let matched = 0
    for (const tp of tokensParte) {
      if (tokensNomen.some((tn) => tokensSimilares(tp, tn))) matched += 1
    }
    if (matched < MIN_MATCHED) continue

    const precision = matched / tokensNomen.length
    const recall = matched / tokensParte.length
    const f2 = ((1 + BETA2) * precision * recall) / (BETA2 * precision + recall)
    if (f2 < MIN_F2) continue

    if (
      !best ||
      f2 > best.score ||
      (f2 === best.score && entry.desc.length < best.descLen) ||
      (f2 === best.score &&
        entry.desc.length === best.descLen &&
        Number(code) < Number(best.code))
    ) {
      best = { code, score: f2, descLen: entry.desc.length }
    }
  }

  return best?.code ?? null
}

// ============================================================================
// Motor principal
// ============================================================================

export function runChecks(input: CheckInputs, now: Date = new Date()): CheckResult {
  const blockers: CheckIssue[] = []
  const warnings: CheckIssue[] = []
  let autoFilledCode: string | null = null

  // ---- B1/B2: prepaga ----
  if (isEmpty(input.prepaga)) {
    blockers.push({
      code: 'PREPAGA_AUSENTE',
      severity: 'blocker',
      message: 'No se detectó la prepaga del paciente.',
      field: 'prepaga',
    })
    // Sin prepaga, no podemos saber si es Swiss. Lo tratamos como bloqueado, no fuera_de_alcance.
    return finalizeResult(blockers, warnings, autoFilledCode, false)
  }

  if (!isSwissMedical(input.prepaga)) {
    // Fuera de alcance: el parte existe pero no es Swiss. No bloquea, no avisa,
    // simplemente no entra a este flujo.
    return {
      blockers: [],
      warnings: [],
      estado_revision: null,
      isOutOfScope: true,
      autoFilledCode: null,
    }
  }

  // ---- B3: código de nomenclador ----
  // Si la IA no devolvió código:
  //   1) probar el matcher curado de keywords (preciso, pocos falsos positivos).
  //   2) fallback: similitud de tokens contra TRAZA_NOMENCLADOR_RAW completo.
  // Sólo bloqueamos si ambos fallan.
  let codigoFinal = input.codigoNomenclador
  if (isEmpty(codigoFinal)) {
    // Fuentes posibles del parte. El orden importa para keywords (probamos
    // primero el campo más limpio), pero para similitud las combinamos todas.
    const fuentes = [
      input.tipoRealizado,
      input.descripcionPractica,
      input.diagnosticoOperatorio,
    ]

    // Paso 1: matcher de keywords curadas, en orden de "señal sobre ruido".
    // Detenemos al primer hit (las keywords son específicas y curadas a mano).
    let inferred: string | null = null
    for (const f of fuentes) {
      if (isEmpty(f)) continue
      const r = findCodeByDescription(f)
      if (r) {
        inferred = r
        break
      }
    }

    // Paso 2: similitud sobre todo el contexto combinado. Más tokens = mejor
    // pick (la entrada del nomenclador que cubra más del parte gana).
    if (!inferred) {
      inferred = findCodeBySimilarity(...fuentes)
    }

    if (inferred) {
      codigoFinal = inferred
      autoFilledCode = inferred
    } else {
      blockers.push({
        code: 'CODIGO_AUSENTE',
        severity: 'blocker',
        message:
          'No se detectó código de nomenclador y no pudimos inferirlo desde la descripción.',
        field: 'codigo_nomenclador',
      })
    }
  }

  // ---- B4: sanatorio ----
  if (isEmpty(input.sanatorio)) {
    blockers.push({
      code: 'SANATORIO_AUSENTE',
      severity: 'blocker',
      message: 'No se detectó el sanatorio o institución donde se realizó la práctica.',
      field: 'sanatorio',
    })
  }

  // ---- B5: número de afiliado ----
  if (isEmpty(input.numeroAfiliado)) {
    blockers.push({
      code: 'AFILIADO_AUSENTE',
      severity: 'blocker',
      message: 'No se detectó el número de afiliado de Swiss Medical.',
      field: 'numero_afiliado',
    })
  }

  // ---- B6/B7: fecha y plazo ----
  if (isEmpty(input.fechaPracticaISO)) {
    blockers.push({
      code: 'FECHA_AUSENTE',
      severity: 'blocker',
      message: 'No se detectó la fecha de la práctica.',
      field: 'fecha_practica',
    })
  } else {
    const days = daysUntilCierre(input.fechaPracticaISO as string, now)
    if (days > 60) {
      blockers.push({
        code: 'PLAZO_VENCIDO',
        severity: 'blocker',
        message: `La fecha de práctica está fuera del plazo de presentación (${days} días al próximo cierre, máximo 60).`,
        field: 'fecha_practica',
      })
    }
  }

  return finalizeResult(blockers, warnings, autoFilledCode, false)
}

function finalizeResult(
  blockers: CheckIssue[],
  warnings: CheckIssue[],
  autoFilledCode: string | null,
  isOutOfScope: boolean,
): CheckResult {
  let estado_revision: EstadoRevision | null
  if (isOutOfScope) {
    estado_revision = null
  } else if (blockers.length > 0) {
    estado_revision = 'bloqueado'
  } else {
    estado_revision = 'en_revision'
  }
  return { blockers, warnings, estado_revision, isOutOfScope, autoFilledCode }
}

// ============================================================================
// Helper para mapear desde el shape "raw" de la extracción AI a CheckInputs.
// Útil para llamar desde history-db.ts y desde el endpoint de recheck.
// ============================================================================

export function checkInputsFromExtraction(rawExtraction: any): CheckInputs {
  return {
    prepaga: rawExtraction?.cobertura?.prepaga ?? null,
    numeroAfiliado: rawExtraction?.cobertura?.numero_afiliado
      ? String(rawExtraction.cobertura.numero_afiliado)
      : null,
    sanatorio: rawExtraction?.sanatorio ?? null,
    codigoNomenclador: rawExtraction?.procedimiento?.codigo_nomenclador
      ? String(rawExtraction.procedimiento.codigo_nomenclador)
      : null,
    descripcionPractica:
      rawExtraction?.procedimiento?.descripcion_tecnica ??
      rawExtraction?.procedimiento?.tipo_realizado ??
      null,
    tipoRealizado: rawExtraction?.procedimiento?.tipo_realizado ?? null,
    diagnosticoOperatorio:
      rawExtraction?.procedimiento?.diagnostico_operatorio ?? null,
    fechaPracticaISO: null, // se setea aparte porque viene parseada
  }
}
