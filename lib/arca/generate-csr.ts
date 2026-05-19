import forge from 'node-forge'

export type GenerateCsrParams = {
  cuit: string
  razonSocial: string
}

export type GenerateCsrResult = {
  csrPem: string
  keyPem: string
}

export function generateCsrPem(params: GenerateCsrParams): GenerateCsrResult {
  const cuit = String(params.cuit).replace(/\D/g, '')
  const razonSocial = String(params.razonSocial).trim()

  if (cuit.length !== 11) {
    throw new Error('El CUIT debe tener 11 dígitos para generar el CSR.')
  }
  if (!razonSocial) {
    throw new Error('La razón social es obligatoria para generar el CSR.')
  }

  const keys = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 })
  const csr = forge.pki.createCertificationRequest()
  csr.publicKey = keys.publicKey

  csr.setSubject([
    { name: 'countryName', value: 'AR' },
    { name: 'organizationName', value: razonSocial },
    { name: 'commonName', value: razonSocial },
    { name: 'serialNumber', value: `CUIT ${cuit}` },
  ])

  csr.sign(keys.privateKey)

  return {
    csrPem: forge.pki.certificationRequestToPem(csr),
    keyPem: forge.pki.privateKeyToPem(keys.privateKey),
  }
}
