import forge from 'node-forge'

export const INVALID_CERT_MESSAGE = 'El archivo no es un certificado válido'

export const KEY_CERT_MISMATCH_MESSAGE =
  'Este certificado no corresponde a la clave privada generada. Asegurate de haber usado el CSR que generó Trazá en el portal de ARCA.'

export function parseCertificateFromBytes(bytes: Buffer): forge.pki.Certificate {
  const asText = bytes.toString('utf8')
  const trimmed = asText.trim()

  try {
    if (trimmed.includes('BEGIN CERTIFICATE')) {
      return forge.pki.certificateFromPem(trimmed)
    }

    const der = forge.util.createBuffer(bytes.toString('binary'))
    const asn1 = forge.asn1.fromDer(der)
    return forge.pki.certificateFromAsn1(asn1)
  } catch {
    throw new Error(INVALID_CERT_MESSAGE)
  }
}

export function certificateMatchesPrivateKey(
  cert: forge.pki.Certificate,
  privateKey: forge.pki.rsa.PrivateKey,
): boolean {
  const pub = cert.publicKey as forge.pki.rsa.PublicKey
  if (!pub?.n || !pub?.e || !privateKey?.n || !privateKey?.e) {
    return false
  }
  return pub.n.compareTo(privateKey.n) === 0 && pub.e.compareTo(privateKey.e) === 0
}

export function certificateToPem(cert: forge.pki.Certificate): string {
  return forge.pki.certificateToPem(cert)
}

export function privateKeyFromPem(keyPem: string): forge.pki.rsa.PrivateKey {
  const key = forge.pki.privateKeyFromPem(keyPem)
  return key as forge.pki.rsa.PrivateKey
}
