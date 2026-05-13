#!/usr/bin/env -S npx tsx
// Sanity check del fallback de similitud que agregamos a runChecks.
// Uso: npx tsx scripts/test-checks-similarity.ts

import { runChecks } from '../lib/checks'

const base = {
  prepaga: 'Swiss Medical',
  numeroAfiliado: '123456',
  sanatorio: 'SANATORIOS DE LA TRINIDAD',
  fechaPracticaISO: new Date().toISOString().slice(0, 10),
}

type Caso = {
  desc: string
  tipoRealizado?: string | null
  diagnosticoOperatorio?: string | null
  expectedCode: string | null
  label: string
}

const casos: Caso[] = [
  // Histeroscopia sola → la entrada más genérica.
  { desc: 'HISTEROSCOPIA', expectedCode: '11010201', label: 'Histeroscopia sola' },

  // CASO REAL (Juana, parte de MENDONCA): tipo_realizado HISTEROSCOPIA pero la
  // descripción técnica menciona "resectoscopio" + "hemostasia" y el diagnóstico
  // es "METRORRAGIA" → debería elegir la histeroscopía OPERATORIA (11010202),
  // no la diagnóstica. Esto es lo que falló antes (eligió 11010201 porque solo
  // se le pasaba tipo_realizado).
  {
    desc: 'dilatacion histeroscopia resectoscopio ctol hemostasia',
    tipoRealizado: 'HISTEROSCOPIA',
    diagnosticoOperatorio: 'METRORRAGIA',
    expectedCode: '11010202',
    label: 'Histeroscopia OPERATORIA (caso real Juana: resectoscopio + metrorragia)',
  },

  // Keywords curadas siguen ganando para los casos cubiertos.
  { desc: 'Cesárea segmentaria', expectedCode: '110403', label: 'Cesárea (keyword)' },
  {
    desc: 'Colecistectomía laparoscópica',
    expectedCode: '8070901',
    label: 'Colecistectomía (keyword)',
  },

  // Casos donde no inferir.
  { desc: 'BIOPSIA', expectedCode: null, label: 'BIOPSIA sola → demasiado genérica' },
  { desc: '', expectedCode: null, label: 'Descripción vacía' },
  {
    desc: 'CIRUGIA INVENTADA QUE NO EXISTE EN EL NOMENCLADOR',
    expectedCode: null,
    label: 'Cirugía inventada → no inferir',
  },

  // FASGO nuevos.
  { desc: 'VIDEOCOLPOSCOPIA', expectedCode: '220102', label: 'Videocolposcopia (FASGO nuevo)' },

  // Especificidad: si el parte menciona "biopsia" explícita, gana la entrada que
  // la contiene en su descripción (porque cubre más del parte).
  {
    desc: 'Histeroscopia diagnóstica con biopsia',
    expectedCode: '110222',
    label: 'Histeroscopia + biopsia → gana la entrada que incluye biopsia',
  },
]

let ok = 0
let fail = 0
for (const c of casos) {
  const res = runChecks({
    ...base,
    codigoNomenclador: null,
    descripcionPractica: c.desc,
    tipoRealizado: c.tipoRealizado ?? null,
    diagnosticoOperatorio: c.diagnosticoOperatorio ?? null,
  })
  const got = res.autoFilledCode
  const blocked = res.blockers.some((b) => b.code === 'CODIGO_AUSENTE')
  const pass = got === c.expectedCode
  console.log(
    `${pass ? '✓' : '✗'}  ${c.label}\n   desc="${c.desc}"\n   esperado=${JSON.stringify(c.expectedCode)} obtenido=${JSON.stringify(got)} bloqueado=${blocked}`,
  )
  if (pass) ok++
  else fail++
}

console.log(`\nResultado: ${ok} OK, ${fail} fallidos`)
process.exit(fail === 0 ? 0 : 1)
