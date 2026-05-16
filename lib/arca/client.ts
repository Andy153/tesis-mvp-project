import Afip from '@afipsdk/afip.js'

export const afipClient = new Afip({
  CUIT: Number(process.env.AFIP_CUIT) || 20409378472,
  production: false,
  access_token: process.env.AFIP_SDK_ACCESS_TOKEN || '',
})
