import { TRAZA_NOMENCLADOR_RAW } from './nomenclador'
import { TRAZA_NOMENCLADOR_FASGO_RAW } from './nomenclador-fasgo'

export type NomencladorSource = 'swiss' | 'fasgo'

export type NomencladorEntry = {
  desc: string
  specialty: string
  codigoDisplay?: string
  seccion?: string
}

const SWISS_RAW = TRAZA_NOMENCLADOR_RAW as Record<string, NomencladorEntry>
const FASGO_RAW = TRAZA_NOMENCLADOR_FASGO_RAW as Record<
  string,
  NomencladorEntry & { codigoDisplay?: string; seccion?: string }
>

/** Normaliza código tipo `22.00.01` o `110102` → solo dígitos. */
export function normalizeNomencladorCode(code: string | null | undefined): string {
  return String(code ?? '').replace(/[^0-9]/g, '')
}

export function isCodeInSwissNomenclador(code: string | null | undefined): boolean {
  const k = normalizeNomencladorCode(code)
  return Boolean(k && SWISS_RAW[k])
}

export function isCodeInFasgoNomenclador(code: string | null | undefined): boolean {
  const k = normalizeNomencladorCode(code)
  return Boolean(k && FASGO_RAW[k])
}

export function lookupNomencladorEntry(
  code: string | null | undefined,
): { code: string; source: NomencladorSource; entry: NomencladorEntry } | null {
  const k = normalizeNomencladorCode(code)
  if (!k) return null
  if (SWISS_RAW[k]) {
    return { code: k, source: 'swiss', entry: SWISS_RAW[k] }
  }
  if (FASGO_RAW[k]) {
    return { code: k, source: 'fasgo', entry: FASGO_RAW[k] }
  }
  return null
}

export function isCodeInAnyNomenclador(code: string | null | undefined): boolean {
  return lookupNomencladorEntry(code) !== null
}
