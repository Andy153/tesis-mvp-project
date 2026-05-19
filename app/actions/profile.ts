'use server'

import { auth } from '@clerk/nextjs/server'
import { getProfileFromDB, upsertProfileToDB } from '@/lib/profile-db'
import {
  isValidCondicionIVA,
  type ProfileFiscalFormInput,
} from '@/lib/profile-fiscal-ui'

export type { ProfileFiscalFormInput } from '@/lib/profile-fiscal-ui'

export type SaveProfileFiscalResult = {  success: boolean
  error?: string
}

function normalizeCuit(raw: string): string {
  return String(raw).replace(/\D/g, '')
}

function validateFiscalInput(
  input: ProfileFiscalFormInput,
  existingCuit: string | null,
): string | null {
  const cuitLocked = Boolean(existingCuit?.trim())

  let cuit: string
  if (cuitLocked) {
    cuit = normalizeCuit(existingCuit!)
    if (input.cuit != null && input.cuit !== '') {
      const attempted = normalizeCuit(input.cuit)
      if (attempted !== cuit) {
        return 'El CUIT no puede modificarse una vez guardado.'
      }
    }
  } else {
    if (!input.cuit?.trim()) return 'El CUIT es obligatorio.'
    cuit = normalizeCuit(input.cuit)
    if (cuit.length !== 11) return 'El CUIT debe tener exactamente 11 dígitos.'
  }

  const razonSocial = input.razon_social?.trim() ?? ''
  if (!razonSocial) return 'La razón social es obligatoria.'

  const domicilio = input.domicilio_fiscal?.trim() ?? ''
  if (!domicilio) return 'El domicilio fiscal es obligatorio.'

  const condicion = input.condicion_iva?.trim() ?? ''
  if (!isValidCondicionIVA(condicion)) {
    return 'Seleccioná una condición de IVA válida.'
  }
  const pv = Number(input.punto_venta)
  if (!Number.isInteger(pv) || pv < 1 || pv > 9999) {
    return 'El punto de venta debe ser un número entre 1 y 9999.'
  }

  if (input.afip_ambiente !== 'desarrollo' && input.afip_ambiente !== 'produccion') {
    return 'El ambiente ARCA no es válido.'
  }

  void cuit
  return null
}

export async function saveProfileFiscal(
  input: ProfileFiscalFormInput,
): Promise<SaveProfileFiscalResult> {
  const { userId } = await auth()
  if (!userId) {
    return { success: false, error: 'No autenticado' }
  }

  const existing = await getProfileFromDB(userId)
  const validationError = validateFiscalInput(input, existing?.cuit ?? null)
  if (validationError) {
    return { success: false, error: validationError }
  }

  const cuitLocked = Boolean(existing?.cuit?.trim())
  const cuit = cuitLocked
    ? normalizeCuit(existing!.cuit!)
    : normalizeCuit(input.cuit!)

  const updated = await upsertProfileToDB(userId, {
    cuit,
    razon_social: input.razon_social.trim(),
    domicilio_fiscal: input.domicilio_fiscal.trim(),
    condicion_iva: input.condicion_iva.trim(),
    punto_venta: Number(input.punto_venta),
    afip_ambiente: input.afip_ambiente,
  })

  if (!updated) {
    return {
      success: false,
      error: 'No se pudo guardar el perfil fiscal. Intentá de nuevo.',
    }
  }

  return { success: true }
}
