'use client'

import { useState } from 'react'
import { saveProfileFiscal } from '@/app/actions/profile'
import {
  CONDICION_IVA_OPCIONES,
  isValidCondicionIVA,
  type CuentaFiscalInitial,
  type ProfileFiscalFormInput,
} from '@/lib/profile-fiscal-ui'
import { notifyFiscalProfileUpdated } from '@/lib/use-fiscal-profile'

function normalizeCuitInput(value: string): string {
  return value.replace(/\D/g, '').slice(0, 11)
}

function normalizePuntoVentaInput(value: string): string {
  return value.replace(/\D/g, '').slice(0, 4)
}

function validateClient(values: CuentaFiscalInitial): string | null {
  if (!values.cuitLocked) {
    if (!values.cuit.trim()) return 'El CUIT es obligatorio.'
    if (values.cuit.length !== 11) return 'El CUIT debe tener exactamente 11 dígitos.'
  }

  if (!values.razonSocial.trim()) return 'La razón social es obligatoria.'
  if (!values.domicilioFiscal.trim()) return 'El domicilio fiscal es obligatorio.'

  if (!isValidCondicionIVA(values.condicionIVA.trim())) {
    return 'Seleccioná una condición de IVA.'
  }

  const pv = parseInt(values.puntoVenta, 10)
  if (!Number.isInteger(pv) || pv < 1 || pv > 9999) {
    return 'El punto de venta debe ser un número entre 1 y 9999.'
  }

  return null
}

export function FormCuentaFiscal({
  initial,
  onSaved,
}: {
  initial: CuentaFiscalInitial
  onSaved?: () => void
}) {
  const [values, setValues] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    const clientError = validateClient(values)
    if (clientError) {
      setError(clientError)
      return
    }

    setSaving(true)
    try {
      const payload: ProfileFiscalFormInput = {
        razon_social: values.razonSocial.trim(),
        domicilio_fiscal: values.domicilioFiscal.trim(),
        condicion_iva: values.condicionIVA,
        punto_venta: parseInt(values.puntoVenta, 10),
        afip_ambiente: values.afipAmbiente,
      }
      if (!values.cuitLocked) {
        payload.cuit = values.cuit
      } else if (values.cuit) {
        payload.cuit = values.cuit
      }

      const result = await saveProfileFiscal(payload)
      if (!result.success) {
        setError(result.error ?? 'No se pudo guardar.')
        return
      }
      setSuccess(true)
      setValues((prev) => ({ ...prev, cuitLocked: true }))
      onSaved?.()
      notifyFiscalProfileUpdated()
      setTimeout(() => setSuccess(false), 4000)
    } catch {
      setError('No se pudo guardar. Intentá de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="profile-fiscal-form" onSubmit={handleSubmit} noValidate>
      <section className="profile-fiscal-form__section">
        <h3 className="profile-fiscal-form__section-title">Identificación del emisor</h3>
        <div className="profile-fiscal-form__grid profile-fiscal-form__grid--2">
          <label className="field">
            <span className="field-label">CUIT</span>
            <input
              id="cuit"
              name="cuit"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              className="profile-fiscal-input"
              placeholder="11 dígitos sin guiones"
              value={values.cuit}
              readOnly={values.cuitLocked}
              onChange={(e) =>
                setValues((v) => ({ ...v, cuit: normalizeCuitInput(e.target.value) }))
              }
              aria-readonly={values.cuitLocked}
            />
            <span className="field-hint">
              {values.cuitLocked
                ? 'Registrado. No se puede modificar.'
                : 'Una vez guardado, no podrás cambiarlo.'}
            </span>
          </label>

          <label className="field">
            <span className="field-label">Razón social</span>
            <input
              id="razon_social"
              name="razon_social"
              type="text"
              required
              className="profile-fiscal-input"
              value={values.razonSocial}
              onChange={(e) => setValues((v) => ({ ...v, razonSocial: e.target.value }))}
            />
          </label>
        </div>
      </section>

      <section className="profile-fiscal-form__section">
        <h3 className="profile-fiscal-form__section-title">Domicilio y condición fiscal</h3>
        <label className="field">
          <span className="field-label">Domicilio fiscal</span>
          <input
            id="domicilio_fiscal"
            name="domicilio_fiscal"
            type="text"
            required
            className="profile-fiscal-input"
            placeholder="Calle, número, localidad"
            value={values.domicilioFiscal}
            onChange={(e) => setValues((v) => ({ ...v, domicilioFiscal: e.target.value }))}
          />
        </label>

        <label className="field" style={{ marginTop: 12 }}>
          <span className="field-label">Condición IVA</span>
          <select
            id="condicion_iva"
            name="condicion_iva"
            className="profile-fiscal-input profile-fiscal-input--select"
            required
            value={values.condicionIVA}
            onChange={(e) => setValues((v) => ({ ...v, condicionIVA: e.target.value }))}
          >
            <option value="" disabled>
              Seleccionar…
            </option>
            {CONDICION_IVA_OPCIONES.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="profile-fiscal-form__section">
        <h3 className="profile-fiscal-form__section-title">Comprobantes ARCA</h3>
        <div className="profile-fiscal-form__grid profile-fiscal-form__grid--2">
          <label className="field">
            <span className="field-label">Punto de venta</span>
            <input
              id="punto_venta"
              name="punto_venta"
              type="text"
              inputMode="numeric"
              required
              className="profile-fiscal-input"
              placeholder="Ej: 10"
              value={values.puntoVenta}
              onChange={(e) =>
                setValues((v) => ({ ...v, puntoVenta: normalizePuntoVentaInput(e.target.value) }))
              }
            />
            <span className="field-hint">Número entre 1 y 9999.</span>
          </label>

          <label className="field">
            <span className="field-label">Ambiente ARCA</span>
            <select
              id="afip_ambiente"
              name="afip_ambiente"
              className="profile-fiscal-input profile-fiscal-input--select"
              value={values.afipAmbiente}
              onChange={(e) =>
                setValues((v) => ({
                  ...v,
                  afipAmbiente: e.target.value as 'desarrollo' | 'produccion',
                }))
              }
            >
              <option value="desarrollo">Desarrollo (homologación)</option>
              <option value="produccion">Producción</option>
            </select>
            <span className="field-hint">
              Desarrollo para pruebas; producción emite comprobantes reales.
            </span>
          </label>
        </div>
      </section>

      {error && (
        <div className="profile-fiscal-alert profile-fiscal-alert--error" role="alert">
          {error}
        </div>
      )}
      {success && (
        <div className="profile-fiscal-alert profile-fiscal-alert--ok" role="status">
          Datos fiscales guardados. Ya podés facturar desde el centro de cobros.
        </div>
      )}

      <div className="profile-fiscal-form__actions">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Guardando…' : success ? '✓ Guardado' : 'Guardar datos fiscales'}
        </button>
      </div>
    </form>
  )
}
