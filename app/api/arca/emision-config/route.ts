import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { isDemoUser } from '@/lib/demo-user'
import {
  formatCuitDisplay,
  getEffectiveAfipAmbiente,
  getReceptorFacturaEmision,
} from '@/lib/arca/emision-config'
import { getProfileFromDB } from '@/lib/profile-db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  if (isDemoUser(userId)) {
    const receptor = getReceptorFacturaEmision()
    return NextResponse.json({
      ambiente: 'desarrollo',
      ambienteFuente: 'env',
      receptor: {
        cuit: receptor.cuit,
        cuitFormateado: formatCuitDisplay(receptor.cuit),
        razonSocial: receptor.razonSocial,
      },
      esProduccion: false,
    })
  }

  const profile = await getProfileFromDB(userId)
  const ambiente = getEffectiveAfipAmbiente(profile?.afip_ambiente)
  const receptor = getReceptorFacturaEmision()

  return NextResponse.json({
    ambiente,
    ambienteFuente:
      process.env.AFIP_AMBIENTE?.trim().toLowerCase() === 'produccion' ||
      process.env.AFIP_AMBIENTE?.trim().toLowerCase() === 'desarrollo'
        ? 'env'
        : 'perfil',
    receptor: {
      cuit: receptor.cuit,
      cuitFormateado: formatCuitDisplay(receptor.cuit),
      razonSocial: receptor.razonSocial,
    },
    esProduccion: ambiente === 'produccion',
  })
}
