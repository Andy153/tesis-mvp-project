#!/usr/bin/env node
// Lee un XLSX con columnas (Código, Sección, Práctica/Descripción, ...) y mergea los códigos
// NUEVOS al TRAZA_NOMENCLADOR_RAW de lib/nomenclador.js. Los códigos que ya existen se
// reportan como "colisiones" y NO se tocan (para no pisar el nomenclador oficial de Swiss).
//
// Uso:
//   node scripts/merge-nomenclador-xlsx.mjs [path/al.xlsx]
// Default: data/Nomenclador_FASGO_2026.xlsx
//
// Salidas:
//   - lib/nomenclador.js regenerado (formato preservado, claves ordenadas numéricamente)
//   - data/nomenclador-merge-report.json con detalle de nuevos, colisiones e ignorados.

import ExcelJS from 'exceljs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { TRAZA_NOMENCLADOR_RAW, TRAZA_PROC_KEYWORDS } from '../lib/nomenclador.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const xlsxPath = process.argv[2] || path.join(ROOT, 'data', 'Nomenclador_FASGO_2026.xlsx')
const nomencladorOut = path.join(ROOT, 'lib', 'nomenclador.js')
const reportOut = path.join(ROOT, 'data', 'nomenclador-merge-report.json')

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

async function leerXlsx() {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(xlsxPath)
  const ws = wb.worksheets[0]
  if (!ws) throw new Error('El XLSX no tiene hojas.')

  const filas = []
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const codigo = normalizarCodigo(row.getCell(1).value)
    const seccion = String(row.getCell(2).value ?? '').trim()
    const desc = String(row.getCell(3).value ?? '').trim()
    if (!codigo || !desc) continue
    filas.push({ codigo, seccion, desc })
  }
  return { hoja: ws.name, filas }
}

function aplicarMerge(rawActual, filasXlsx) {
  const out = { ...rawActual }
  const nuevos = []
  const colisiones = []
  const duplicadosEnXlsx = []
  const seenInXlsx = new Set()

  for (const fila of filasXlsx) {
    if (seenInXlsx.has(fila.codigo)) {
      duplicadosEnXlsx.push(fila)
      continue
    }
    seenInXlsx.add(fila.codigo)

    if (out[fila.codigo]) {
      colisiones.push({
        codigo: fila.codigo,
        existente: out[fila.codigo].desc,
        xlsx: fila.desc,
        seccion_xlsx: fila.seccion,
      })
      continue
    }

    const specialty = SECCION_A_SPECIALTY[fila.seccion] ?? 'Ginecologia'
    out[fila.codigo] = { desc: fila.desc, specialty }
    nuevos.push({ codigo: fila.codigo, desc: fila.desc, specialty, seccion: fila.seccion })
  }

  return { merged: out, nuevos, colisiones, duplicadosEnXlsx }
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

function regenerarArchivo(rawMerged, keywords) {
  const rawJson = JSON.stringify(ordenarPorCodigoNumerico(rawMerged))
  const kwJson = JSON.stringify(keywords)
  return `// Nomenclador Swiss Medical — Generado desde las 18 hojas oficiales (850 códigos).
// Fuente: CODIGOS-VALIDACION-SWISS - TOTAL.
// Última regeneración por scripts/merge-nomenclador-xlsx.mjs (no editar a mano).

export const TRAZA_NOMENCLADOR_RAW = ${rawJson};

export const TRAZA_PROC_KEYWORDS = ${kwJson};

function _trazaBuildNomencladorFull() {
  const raw = TRAZA_NOMENCLADOR_RAW;
  const out = {};
  for (const k of Object.keys(raw)) {
    const v = raw[k];
    out[k] = { entries: [{ desc: v.desc, specialty: v.specialty }] };
  }
  Object.assign(out, {
    '80209': {
      ambiguous: true,
      entries: [
        {
          desc: 'Enterolisis -debridamiento intestinal- como unica operacion.',
          specialty: 'Cirugía General',
        },
        { desc: 'Enterolisis o adhesciolisis múltiple', specialty: 'Cirugía General' },
      ],
    },
  });
  return out;
}
export const TRAZA_NOMENCLADOR_FULL = _trazaBuildNomencladorFull();
`
}

async function main() {
  console.log(`[merge-nomenclador] XLSX: ${xlsxPath}`)
  const { hoja, filas } = await leerXlsx()
  console.log(`[merge-nomenclador] Hoja "${hoja}": ${filas.length} filas con código+descripción`)

  const totalAntes = Object.keys(TRAZA_NOMENCLADOR_RAW).length
  const { merged, nuevos, colisiones, duplicadosEnXlsx } = aplicarMerge(TRAZA_NOMENCLADOR_RAW, filas)
  const totalDespues = Object.keys(merged).length

  console.log(`\n[merge-nomenclador] Antes:   ${totalAntes} códigos`)
  console.log(`[merge-nomenclador] Nuevos:  +${nuevos.length}`)
  console.log(`[merge-nomenclador] Después: ${totalDespues} códigos`)
  console.log(`[merge-nomenclador] Colisiones ignoradas (se conserva la versión existente): ${colisiones.length}`)
  if (duplicadosEnXlsx.length) {
    console.log(`[merge-nomenclador] Duplicados dentro del XLSX (se conserva la primera ocurrencia): ${duplicadosEnXlsx.length}`)
  }

  const codigo = regenerarArchivo(merged, TRAZA_PROC_KEYWORDS)
  await fs.writeFile(nomencladorOut, codigo, 'utf8')
  console.log(`\n[merge-nomenclador] Escrito: ${path.relative(ROOT, nomencladorOut)}`)

  const reporte = {
    generado_en: new Date().toISOString(),
    xlsx_origen: path.relative(ROOT, xlsxPath),
    hoja,
    total_antes: totalAntes,
    total_despues: totalDespues,
    nuevos_agregados: nuevos,
    colisiones_ignoradas: colisiones,
    duplicados_en_xlsx: duplicadosEnXlsx,
  }
  await fs.mkdir(path.dirname(reportOut), { recursive: true })
  await fs.writeFile(reportOut, JSON.stringify(reporte, null, 2), 'utf8')
  console.log(`[merge-nomenclador] Reporte: ${path.relative(ROOT, reportOut)}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
