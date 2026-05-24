#!/usr/bin/env node
/**
 * Genera lib/nomenclador-fasgo.js desde data/Nomenclador_FASGO_2026.xlsx
 * Uso: node scripts/build-fasgo-nomenclador.mjs [ruta.xlsx]
 */
import ExcelJS from 'exceljs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const xlsxPath = process.argv[2] || path.join(ROOT, 'data', 'Nomenclador_FASGO_2026.xlsx')
const outPath = path.join(ROOT, 'lib', 'nomenclador-fasgo.js')

const normalizarCodigo = (c) => String(c ?? '').replace(/[^0-9]/g, '')

const SECCION_A_SPECIALTY = {
  'Operaciones del útero': 'Ginecologia',
  'Operaciones en la mama': 'Ginecologia',
  'Operaciones en vagina, vulva y periné': 'Ginecologia',
  'Operaciones obstétricas': 'Ginecologia',
  'Operaciones oncológicas ginecológicas': 'Ginecologia',
  'Prácticas invasivas ambulatorias': 'Ginecologia',
  'Operaciones uroginecológicas': 'Ginecologia',
  'Operaciones de ovarios y trompas': 'Ginecologia',
  'Prácticas ambulatorias': 'Ginecologia',
  'Pared y cavidad abdominal': 'Cirugia',
}

function specialtyFromSeccion(seccion) {
  return SECCION_A_SPECIALTY[seccion] ?? 'Ginecologia'
}

function ordenarPorCodigoNumerico(obj) {
  const claves = Object.keys(obj).sort((a, b) => {
    const na = Number(a)
    const nb = Number(b)
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb
    return a.localeCompare(b)
  })
  const out = {}
  for (const k of claves) out[k] = obj[k]
  return out
}

async function leerXlsx() {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(xlsxPath)
  const ws = wb.worksheets[0]
  if (!ws) throw new Error('El XLSX no tiene hojas.')

  const filas = []
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const codigoDisplay = String(row.getCell(1).value ?? '').trim()
    const codigo = normalizarCodigo(codigoDisplay)
    const seccion = String(row.getCell(2).value ?? '').trim()
    const desc = String(row.getCell(3).value ?? '').trim()
    if (!codigo || !desc) continue
    filas.push({ codigo, codigoDisplay, seccion, desc })
  }
  return { hoja: ws.name, filas }
}

function buildRaw(filas) {
  const raw = {}
  const duplicados = []
  for (const fila of filas) {
    if (raw[fila.codigo]) {
      duplicados.push(fila)
      continue
    }
    raw[fila.codigo] = {
      desc: fila.desc,
      specialty: specialtyFromSeccion(fila.seccion),
      codigoDisplay: fila.codigoDisplay || fila.codigo,
      seccion: fila.seccion,
    }
  }
  return { raw: ordenarPorCodigoNumerico(raw), duplicados }
}

function generarArchivo(raw) {
  const rawJson = JSON.stringify(raw)
  return `// Nomenclador FASGO 2026 — fallback cuando Swiss no resuelve el código.
// Fuente: Nomenclador_FASGO_2026.xlsx (regenerar con scripts/build-fasgo-nomenclador.mjs)

export const TRAZA_NOMENCLADOR_FASGO_RAW = ${rawJson};

function _trazaBuildFasgoFull() {
  const raw = TRAZA_NOMENCLADOR_FASGO_RAW;
  const out = {};
  for (const k of Object.keys(raw)) {
    const v = raw[k];
    out[k] = {
      entries: [{ desc: v.desc, specialty: v.specialty, codigoDisplay: v.codigoDisplay }],
      source: 'fasgo',
    };
  }
  return out;
}

export const TRAZA_NOMENCLADOR_FASGO_FULL = _trazaBuildFasgoFull();
`
}

async function main() {
  console.log(`[build-fasgo] XLSX: ${xlsxPath}`)
  const { hoja, filas } = await leerXlsx()
  const { raw, duplicados } = buildRaw(filas)
  console.log(`[build-fasgo] Hoja "${hoja}": ${filas.length} filas → ${Object.keys(raw).length} códigos`)
  if (duplicados.length) {
    console.log(`[build-fasgo] Duplicados en XLSX (se conservó la primera): ${duplicados.length}`)
  }

  await fs.writeFile(outPath, generarArchivo(raw), 'utf8')
  console.log(`[build-fasgo] Escrito: ${path.relative(ROOT, outPath)}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
