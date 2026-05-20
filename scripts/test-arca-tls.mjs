/**
 * Smoke test: TLS + WSDL fetch for AFIP production endpoints.
 * Run: node scripts/test-arca-tls.mjs
 */
import https from 'node:https'
import axios from 'axios'

const ARCA_PROD_ENDPOINTS = [
  { name: 'WSAA', url: 'https://wsaa.afip.gov.ar/ws/services/LoginCms?WSDL' },
  { name: 'WSFE', url: 'https://servicios1.afip.gov.ar/wsfev1/service.asmx?WSDL' },
  {
    name: 'Padrón A13',
    url: 'https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA13?WSDL',
  },
]

function createArcaHttpsAgent() {
  return new https.Agent({
    minVersion: 'TLSv1.2',
    ciphers: 'DEFAULT@SECLEVEL=1',
  })
}

function looksLikeWsdl(body) {
  if (typeof body !== 'string' || body.length < 50) return false
  const head = body.trimStart().slice(0, 200).toLowerCase()
  if (head.startsWith('<!doctype html') || head.startsWith('<html')) return false
  return head.includes('<definitions') || head.includes('<?xml') || head.includes('<wsdl:')
}

async function probe(name, url, httpsAgent) {
  try {
    const res = await axios.get(url, {
      httpsAgent,
      validateStatus: () => true,
      timeout: 30_000,
      maxRedirects: 5,
      responseType: 'text',
    })
    const body = typeof res.data === 'string' ? res.data : String(res.data ?? '')
    const wsdl = looksLikeWsdl(body)

    if (res.status === 200 && wsdl) {
      console.log('OK', `${name}: HTTP ${res.status} — WSDL/XML (${body.length} bytes)`)
      return true
    }

    if (res.status === 200 && !wsdl) {
      const preview = body.replace(/\s+/g, ' ').slice(0, 80)
      console.error('FAIL', `${name}: HTTP 200 but response is HTML, not WSDL — ${preview}…`)
      return false
    }

    console.error('FAIL', `${name}: HTTP ${res.status} (${res.statusText || 'no status text'})`)
    return false
  } catch (err) {
    const code = err.code ?? err.cause?.code
    const msg = err.message?.split('\n')[0] ?? String(err)
    console.error('FAIL', `${name}: ${code ?? 'error'} — ${msg}`)
    return false
  }
}

async function main() {
  const httpsAgent = createArcaHttpsAgent()
  console.log('AFIP prod TLS + WSDL probe (DEFAULT@SECLEVEL=1)\n')

  const results = []
  for (const { name, url } of ARCA_PROD_ENDPOINTS) {
    console.log(`→ ${url}`)
    results.push(await probe(name, url, httpsAgent))
    console.log()
  }

  const passed = results.filter(Boolean).length
  console.log(`${passed}/${results.length} endpoints returned valid WSDL`)

  if (passed < results.length) {
    process.exit(1)
  }
}

main()
