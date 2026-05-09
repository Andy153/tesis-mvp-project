import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'
import { generateSwissCxFiles } from '@/lib/swissCxExport'
import { buildSwissRowsForPeriod } from '@/lib/swissCxBuild'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { periodo?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const periodo = body.periodo
  if (!periodo || !/^\d{4}-\d{2}$/.test(periodo)) {
    return NextResponse.json(
      { error: 'Falta periodo o formato inválido. Esperado YYYY-MM.' },
      { status: 400 },
    )
  }

  const built = await buildSwissRowsForPeriod(userId, periodo)
  if (built.ok === false) {
    return NextResponse.json(
      {
        error: built.error,
        periodo,
        encontrados_total: 'encontradosTotal' in built ? built.encontradosTotal : undefined,
      },
      { status: built.status },
    )
  }

  const templatePath = path.join(process.cwd(), 'templates', 'planilla cx swiss.xlsx')
  let templateXlsx: Buffer
  try {
    templateXlsx = await readFile(templatePath)
  } catch (e) {
    console.error('[TRAZA] build:template_read error:', e)
    return NextResponse.json(
      { error: 'No se pudo leer el template de la planilla.' },
      { status: 500 },
    )
  }

  // Cast explícito a ArrayBuffer (no SharedArrayBuffer) para satisfacer al type checker
  const templateAB = templateXlsx.buffer.slice(
    templateXlsx.byteOffset,
    templateXlsx.byteOffset + templateXlsx.byteLength,
  ) as ArrayBuffer

  const { xlsx, csv } = await generateSwissCxFiles({
    templateXlsx: templateAB,
    rows: built.rows,
  })

  return NextResponse.json({
    periodo,
    cantidad_partes: built.rows.length,
    rows: built.rows,
    xlsx_base64: Buffer.from(xlsx).toString('base64'),
    csv,
    partes: built.partes.map((p) => ({
      extraction_id: p.extraction_id,
      document_id: p.document_id,
      paciente: p.paciente,
      fecha_practica: p.fecha_practica,
      storage_path: p.storage_path,
      nombre_archivo: p.nombre_archivo,
    })),
  })
}
