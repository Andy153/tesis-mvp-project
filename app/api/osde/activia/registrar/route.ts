import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'
import { registrarCirugia02Q, registrarPrestacion02A } from '@/lib/activia/client'
import { hasActiviaIntegration } from '@/lib/feature-flags'

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!hasActiviaIntegration(userId)) return NextResponse.json({ error: 'not_enabled' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const { cirugiaId, numeroCredencial, codigoPreautorizacion, codPrestacion } = body

  if (!cirugiaId || !numeroCredencial || !codPrestacion) {
    return NextResponse.json({ error: 'missing_params' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: cirugia, error: cirErr } = await supabase
    .from('osde_cirugias')
    .select('id')
    .eq('id', cirugiaId)
    .eq('clerk_user_id', userId)
    .single()

  if (cirErr || !cirugia) {
    return NextResponse.json({ error: 'cirugia_no_encontrada' }, { status: 404 })
  }

  // Intentar 02Q si hay autorización, sino 02A
  const result = codigoPreautorizacion
    ? await registrarCirugia02Q({ numeroCredencial, codigoPreautorizacion, codPrestacion })
    : await registrarPrestacion02A({ numeroCredencial, codPrestacion })

  if (!result.success) {
    return NextResponse.json(
      {
        error: 'activia_error',
        codRtaGeneral: result.codRtaGeneral,
        codigoRtaAdicional: result.codigoRtaAdicional,
        descripcion: result.descripcion,
        message: result.error ?? result.descripcion,
      },
      { status: 422 }
    )
  }

  // Guardar resultado en la cirugía
  const { error: updateErr } = await supabase
    .from('osde_cirugias')
    .update({
      numero_tramite_apligem: result.nroReferencia,
      resultado_consulta: 'aprobado',
      wizard_paso: 2,
      updated_at: new Date().toISOString(),
    })
    .eq('id', cirugiaId)
    .eq('clerk_user_id', userId)

  if (updateErr) {
    return NextResponse.json({ error: 'update_failed' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    nroReferencia: result.nroReferencia,
    nombreBeneficiario: result.nombreBeneficiario,
  })
}
