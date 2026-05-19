import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { generateCsrPem } from '@/lib/arca/generate-csr'
import { getArcaCertStatus, uploadUserKeyPem, userHasKeyPem } from '@/lib/arca/profile-certs'
import { getProfileFromDB } from '@/lib/profile-db'

const KEY_EXISTS_MESSAGE =
  'Ya existe una clave privada. Si querés regenerar, confirmá explícitamente.'

function parseForce(req: NextRequest, body: unknown): boolean {
  const fromQuery = req.nextUrl.searchParams.get('force') === 'true'
  if (fromQuery) return true
  if (body && typeof body === 'object' && 'force' in body) {
    return (body as { force?: unknown }).force === true
  }
  return false
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  let body: unknown = null
  try {
    body = await req.json()
  } catch {
    body = null
  }

  const force = parseForce(req, body)

  const profile = await getProfileFromDB(userId)
  const cuit = profile?.cuit?.trim() ?? ''
  const razonSocial = profile?.razon_social?.trim() ?? ''

  if (!cuit || !razonSocial) {
    return NextResponse.json(
      {
        error:
          'Completá al menos CUIT y razón social en tu cuenta fiscal antes de generar el CSR.',
      },
      { status: 400 },
    )
  }

  const hasKey = await userHasKeyPem(userId)
  if (hasKey && !force) {
    return NextResponse.json({ error: KEY_EXISTS_MESSAGE }, { status: 409 })
  }

  try {
    const { csrPem, keyPem } = generateCsrPem({ cuit, razonSocial })
    await uploadUserKeyPem(userId, keyPem, { upsert: force })

    const certStatus = await getArcaCertStatus(userId)

    return NextResponse.json({
      csr: csrPem,
      keyUploaded: true,
      regenerated: force && hasKey,
      certStatus,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
