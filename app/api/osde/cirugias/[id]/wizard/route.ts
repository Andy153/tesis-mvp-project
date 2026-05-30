import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COLUMNS = `
  id, clerk_user_id, document_id,
  paciente, afiliado, fecha_cirugia, monto_estimado,
  wizard_paso, wizard_estado,
  numero_tramite_apligem, numero_registracion_protocolo, resultado_consulta,
  factura_emitida_en, comprobante_cargado_en, cobrado_en,
  created_at, updated_at
`

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: Request, ctx: RouteContext) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const { data, error } = await supabaseAdmin
    .from('osde_cirugias')
    .select(COLUMNS)
    .eq('id', id)
    .eq('clerk_user_id', userId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ cirugia: data })
}

export async function PATCH(req: Request, ctx: RouteContext) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const { data: row, error: rowErr } = await supabaseAdmin
    .from('osde_cirugias')
    .select('id, wizard_paso, wizard_estado')
    .eq('id', id)
    .eq('clerk_user_id', userId)
    .maybeSingle()
  if (rowErr) return NextResponse.json({ error: rowErr.message }, { status: 500 })
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }

  const action = body.action as string | undefined
  const nowIso = new Date().toISOString()
  const update: Record<string, unknown> = { updated_at: nowIso }
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

  switch (action) {
    case 'registrar_cirugia':
      update.numero_tramite_apligem = str(body.numero_tramite_apligem)
      update.wizard_paso = 2
      update.wizard_estado = 'en_curso'
      break
    case 'protocolo_enviado':
      update.numero_registracion_protocolo = str(body.numero_registracion_protocolo)
      update.wizard_paso = 3
      break
    case 'marcar_aprobado':
      update.resultado_consulta = 'aprobado'
      update.wizard_paso = 4
      break
    case 'marcar_rechazado':
      update.resultado_consulta = 'rechazado'
      update.wizard_estado = 'rechazado'
      break
    case 'factura_emitida':
      update.factura_emitida_en = nowIso
      update.wizard_paso = 5
      break
    case 'comprobante_cargado':
      update.comprobante_cargado_en = nowIso
      update.wizard_paso = 6
      break
    case 'marcar_cobrado':
      update.cobrado_en = nowIso
      update.wizard_estado = 'cobrado'
      update.wizard_paso = 7
      break
    case 'reiniciar':
      update.wizard_paso = 1
      update.wizard_estado = 'en_curso'
      update.resultado_consulta = 'pendiente'
      update.numero_tramite_apligem = null
      update.numero_registracion_protocolo = null
      update.factura_emitida_en = null
      update.comprobante_cargado_en = null
      update.cobrado_en = null
      break
    case 'descartar_seguimiento':
      update.wizard_estado = 'descartado'
      break
    case 'go_back':
      update.wizard_paso = Math.max(1, Number(row.wizard_paso ?? 1) - 1)
      break
    default:
      return NextResponse.json({ error: 'Acción no reconocida' }, { status: 400 })
  }

  const { error: updErr } = await supabaseAdmin
    .from('osde_cirugias')
    .update(update)
    .eq('id', id)
    .eq('clerk_user_id', userId)
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })
  return NextResponse.json({ ok: true, wizard_estado: update.wizard_estado ?? row.wizard_estado })
}
