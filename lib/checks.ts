// lib/checks.ts
//
// Motor de chequeos pre-envío para Swiss Medical.
// Función pura, testeable sin DB.
//
// Responsabilidades:
// - Detectar bloqueantes (B1-B7)
// - Auto-completar código por keywords si la IA no lo devolvió pero hay descripción
// - Calcular el estado_revision y los motivos resultantes

import { TRAZA_PROC_KEYWORDS, TRAZA_NOMENCLADOR_RAW } from './nomenclador'

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
  descripcionPractica: string | null | undefined
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

const STOPWORDS = new Set([
  'de','del','la','el','las','los','en','con','sin','por','para','o','y','a','u',
  'un','una','mas','como','unica','unico','tipo','via','operacion','practica',
  'procedimiento','cirugia','operatoria','tratamiento','tecnica',
])

/**
 * Busca un código en TRAZA_PROC_KEYWORDS comparando contra una descripción.
 * Devuelve el código si encuentra match, null si no.
 *
 * Estrategia en dos pasadas:
 *   1) Keywords curadas (TRAZA_PROC_KEYWORDS) — más específicas primero.
 *   2) Fallback: buscar en las descripciones de TRAZA_NOMENCLADOR_RAW por
 *      coincidencia de palabras significativas. Prefiere Ginecologia y el match
 *      con mayor proporción de palabras coincidentes.
 */
function findCodeByDescription(description: string | null | undefined): string | null {
  if (isEmpty(description)) return null
  const haystack = normalize(description as string)

  // --- Pasada 1: keywords curadas (específicas primero) ---
  for (const entry of TRAZA_PROC_KEYWORDS) {
    for (const kw of entry.keywords) {
      const needle = normalize(kw)
      if (needle.length === 0) continue
      if (haystack.includes(needle)) {
        return entry.code
      }
    }
  }

  // --- Pasada 2: fallback contra descripciones del nomenclador ---
  return findCodeByNomencladorDesc(haystack)
}

function findCodeByNomencladorDesc(haystack: string): string | null {
  const inputWords = haystack
    .split(/[\s,.\-/()]+/)
    .filter(w => w.length >= 3 && !STOPWORDS.has(w))

  if (inputWords.length === 0) return null

  const nomen = TRAZA_NOMENCLADOR_RAW as Record<string, { desc: string; specialty: string }>

  let bestCode: string | null = null
  let bestScore = 0
  let bestSpecialtyBonus = 0

  for (const [code, val] of Object.entries(nomen)) {
    const descNorm = normalize(val.desc)
    let matched = 0
    for (const w of inputWords) {
      if (descNorm.includes(w)) matched++
    }
    if (matched === 0) continue

    const score = matched / inputWords.length
    const specialtyBonus = val.specialty === 'Ginecologia' ? 1 : 0

    const isBetter =
      score > bestScore ||
      (score === bestScore && specialtyBonus > bestSpecialtyBonus)

    if (isBetter) {
      bestCode = code
      bestScore = score
      bestSpecialtyBonus = specialtyBonus
    }
  }

  if (bestScore >= 0.5) return bestCode
  return null
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
  // Si la IA no devolvió código, intentamos auto-completar por keywords.
  let codigoFinal = input.codigoNomenclador
  if (isEmpty(codigoFinal)) {
    const inferred = findCodeByDescription(input.descripcionPractica)
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
    fechaPracticaISO: null, // se setea aparte porque viene parseada
  }
}
