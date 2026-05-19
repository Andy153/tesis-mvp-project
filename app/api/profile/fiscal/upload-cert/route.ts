import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import {
  certificateMatchesPrivateKey,
  certificateToPem,
  INVALID_CERT_MESSAGE,
  KEY_CERT_MISMATCH_MESSAGE,
  parseCertificateFromBytes,
  privateKeyFromPem,
} from '@/lib/arca/parse-cert'
import {
  certStatusWithReady,
  getArcaCertStatus,
  readUserKeyPem,
  uploadUserCertPem,
  userHasKeyPem,
} from '@/lib/arca/profile-certs'

const NO_KEY_MESSAGE = 'No hay clave privada. Generá un CSR primero.'

function parseForceFromForm(form: FormData): boolean {
  return form.get('force') === 'true'
}

function parseForceFromBody(body: unknown): boolean {
  if (body && typeof body === 'object' && 'force' in body) {
    return (body as { force?: unknown }).force === true
  }
  return false
}

async function readCertBytes(req: NextRequest): Promise<{ bytes: Buffer; force: boolean }> {
  const contentType = req.headers.get('content-type') ?? ''

  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData()
    const file = form.get('file') ?? form.get('cert')
    const force = parseForceFromForm(form)

    if (!file || typeof file === 'string') {
      throw new Error('Falta el archivo del certificado.')
    }

    const arrayBuffer = await file.arrayBuffer()
    return { bytes: Buffer.from(arrayBuffer), force }
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    throw new Error('Body inválido. Enviá multipart/form-data o JSON con certBase64.')
  }

  const force = parseForceFromBody(body)

  if (body && typeof body === 'object') {
    const b = body as { certBase64?: string; cert?: string }
    if (typeof b.certBase64 === 'string' && b.certBase64.trim()) {
      return { bytes: Buffer.from(b.certBase64, 'base64'), force }
    }
    if (typeof b.cert === 'string' && b.cert.trim()) {
      return { bytes: Buffer.from(b.cert, 'utf8'), force }
    }
  }

  throw new Error('Falta el certificado (archivo o certBase64).')
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const hasKey = await userHasKeyPem(userId)
  if (!hasKey) {
    return NextResponse.json({ error: NO_KEY_MESSAGE }, { status: 400 })
  }

  const statusBefore = await getArcaCertStatus(userId)

  let bytes: Buffer
  let force: boolean
  try {
    const parsed = await readCertBytes(req)
    bytes = parsed.bytes
    force = parsed.force
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: 400 })
  }

  if (statusBefore.hasCert && !force) {
    return NextResponse.json(
      {
        error:
          'Ya existe un certificado. Si querés reemplazarlo, confirmá explícitamente.',
      },
      { status: 409 },
    )
  }

  try {
    const cert = parseCertificateFromBytes(bytes)
    const keyPem = await readUserKeyPem(userId)
    const privateKey = privateKeyFromPem(keyPem)

    if (!certificateMatchesPrivateKey(cert, privateKey)) {
      return NextResponse.json({ error: KEY_CERT_MISMATCH_MESSAGE }, { status: 400 })
    }

    const certPem = certificateToPem(cert)
    await uploadUserCertPem(userId, certPem, { upsert: force || statusBefore.hasCert })

    const certStatus = certStatusWithReady(await getArcaCertStatus(userId))

    return NextResponse.json({
      ok: true,
      certStatus,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const status = message === INVALID_CERT_MESSAGE ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
