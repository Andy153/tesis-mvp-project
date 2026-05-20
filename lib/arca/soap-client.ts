import https from 'https'
import axios from 'axios'
import { createClientAsync, type Client } from 'soap'

/**
 * AFIP production endpoints negotiate TLS with legacy DH parameters (< 2048 bits).
 * OpenSSL 3 (Node 17+) uses SECLEVEL=2 by default and rejects those handshakes
 * ("dh key too small"). Lowering to SECLEVEL=1 is scoped to this agent only.
 */
export function createArcaHttpsAgent(): https.Agent {
  return new https.Agent({
    minVersion: 'TLSv1.2',
    ciphers: 'DEFAULT@SECLEVEL=1',
  })
}

let arcaAxiosInstance: ReturnType<typeof axios.create> | undefined

function getArcaAxiosInstance(httpsAgent: https.Agent) {
  if (!arcaAxiosInstance) {
    arcaAxiosInstance = axios.create({ httpsAgent })
  }
  return arcaAxiosInstance
}

export async function createArcaSoapClient(wsdlUrl: string): Promise<Client> {
  const httpsAgent = createArcaHttpsAgent()
  return createClientAsync(wsdlUrl, {
    request: getArcaAxiosInstance(httpsAgent),
    wsdl_options: { httpsAgent },
  })
}
