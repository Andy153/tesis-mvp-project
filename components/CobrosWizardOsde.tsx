'use client'

// components/CobrosWizardOsde.tsx
// Wizard paso a paso para cobro de cirugía OSDE.
// Usa las mismas clases BEM cobros-wizard__* que el de Swiss para heredar estilos.
// Aislado: no importa ni toca nada del flujo Swiss.

import type { ReactNode } from 'react'
import { FacturaARCA } from '@/components/arca/FacturaARCA'
import { useEffect, useState } from 'react'

type WizardEstado = 'en_curso' | 'rechazado' | 'cobrado' | 'descartado'

type Cirugia = {
  id: string
  ai_extraction_id: string | null
  paciente: string | null
  afiliado: string | null
  fecha_cirugia: string | null
  monto_estimado: number | null
  wizard_paso: number
  wizard_estado: WizardEstado
  numero_tramite_apligem: string | null
  numero_registracion_protocolo: string | null
  resultado_consulta: string | null
  factura_emitida_en: string | null
  cae_numero: string | null
  cae_vencimiento: string | null
  numero_comprobante: number | null
  factura_path: string | null
  comprobante_cargado_en: string | null
  cobrado_en: string | null
}

type Props = {
  cirugiaId: string
  onUpdate?: () => void
  onCollapse?: () => void
}

/* ── Step (mismo markup que el de Swiss) ─────────────────────────────────── */

function Step({
  numero,
  titulo,
  activo,
  completado,
  children,
}: {
  numero: number
  titulo: string
  activo: boolean
  completado: boolean
  children?: ReactNode
}) {
  const stepClass = [
    'cobros-wizard__step',
    activo ? 'cobros-wizard__step--active' : '',
    completado ? 'cobros-wizard__step--completed' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={stepClass}>
      <div className="cobros-wizard__step-head">
        <div className="cobros-wizard__step-badge">{completado ? '✓' : numero}</div>
        <span className="cobros-wizard__step-title">{titulo}</span>
      </div>
      {activo && children ? <div className="cobros-wizard__step-body">{children}</div> : null}
    </div>
  )
}

/* ── Componente principal ────────────────────────────────────────────────── */

export function CobrosWizardOsde({ cirugiaId, onUpdate, onCollapse }: Props) {
  const [cir, setCir] = useState<Cirugia | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [numeroTramite, setNumeroTramite] = useState('')
  const [numeroRegistracion, setNumeroRegistracion] = useState('')

  const load = async () => {
    try {
      const r = await fetch(`/api/osde/cirugias/${cirugiaId}/wizard`)
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'Error al cargar la cirugía')
      const c = j.cirugia as Cirugia
      setCir(c)
      setNumeroTramite(c.numero_tramite_apligem ?? '')
      setNumeroRegistracion(c.numero_registracion_protocolo ?? '')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cirugiaId])

  const patch = async (action: string, extra?: Record<string, unknown>) => {
    setSaving(true)
    setError(null)
    try {
      const r = await fetch(`/api/osde/cirugias/${cirugiaId}/wizard`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'Error al actualizar')
      await load()
      onUpdate?.()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  const goBack = async () => patch('go_back')

  if (loading) return <p className="cobros-wizard__loading">Cargando...</p>
  if (!cir) return <p className="cobros-wizard__fatal">{error ?? 'No encontrada'}</p>

  /* ── Estados terminales ──────────────────────────────────────────────── */

  if (cir.wizard_estado === 'cobrado') {
    return (
      <div className="cobros-wizard__state-aprobado">
        <div className="cobros-wizard__state-aprobado-icon">🎉</div>
        <h3 className="cobros-wizard__state-aprobado-title">¡Cirugía cobrada!</h3>
        <p className="cobros-wizard__text cobros-wizard__text--none">
          {cir.paciente ? `${cir.paciente} · ` : ''}Trámite {cir.numero_tramite_apligem ?? '—'}. Circuito OSDE cerrado.
        </p>
      </div>
    )
  }

  if (cir.wizard_estado === 'rechazado') {
    return (
      <div className="cobros-wizard__panel cobros-wizard__panel--warn">
        <strong>Cirugía rechazada en Apligem</strong>
        <p className="cobros-wizard__text cobros-wizard__text--tight" style={{ marginTop: 8 }}>
          OSDE rechazó la registración. Revisá el motivo en Apligem (Consultar), corregí lo que
          corresponda y volvé a empezar.
        </p>
        <button type="button" className="btn btn-primary" disabled={saving} onClick={() => patch('reiniciar')}>
          Reiniciar desde el paso 1
        </button>
      </div>
    )
  }

  if (cir.wizard_estado === 'descartado') {
    return (
      <div className="cobros-wizard__panel cobros-wizard__panel--neutral">
        <strong>Seguimiento descartado</strong>
        <p className="cobros-wizard__text cobros-wizard__text--tight" style={{ marginTop: 8 }}>
          Esta cirugía ya no aparece como pendiente.
        </p>
      </div>
    )
  }

  /* ── Wizard activo ───────────────────────────────────────────────────── */

  const paso = cir.wizard_paso

  return (
    <div className="cobros-wizard">
      <p className="cobros-wizard__intro">
        Cobro de cirugía <strong>OSDE</strong>
        {cir.paciente ? ` · ${cir.paciente}` : ''}
        {cir.afiliado ? ` · afiliado ${cir.afiliado}` : ''}
        {cir.fecha_cirugia ? ` · cirugía del ${cir.fecha_cirugia}` : ''}
      </p>

      {error ? <div className="cobros-wizard__error-inline">{error}</div> : null}

      <div className="cobros-wizard__toolbar">
        {paso > 1 && (
          <button
            type="button"
            className="btn"
            style={{ fontSize: 12 }}
            disabled={saving}
            onClick={() => {
              if (window.confirm('¿Reiniciar el proceso de cobro desde el paso 1?')) {
                patch('reiniciar')
              }
            }}
          >
            Reiniciar cobro desde paso 1
          </button>
        )}
        <button
          type="button"
          className="btn cobros-wizard__btn-muted"
          style={{ fontSize: 12 }}
          disabled={saving}
          onClick={() => {
            if (window.confirm('¿Descartar este seguimiento? No borra nada, solo lo oculta de pendientes.')) {
              patch('descartar_seguimiento')
            }
          }}
        >
          Descartar seguimiento
        </button>
        {onCollapse ? (
          <button type="button" className="btn cobros-wizard__btn-muted" style={{ fontSize: 12 }} onClick={onCollapse}>
            Cerrar
          </button>
        ) : null}
      </div>

      {/* ── Paso 1: Registrar cirugía en Apligem ── */}
      <Step numero={1} titulo="Registrá la cirugía en Apligem" activo={paso === 1} completado={paso > 1}>
        <p className="cobros-wizard__text">
          Abrí Apligem, tocá <strong>Validar</strong> y después <strong>SCIS → Registrar Cirugía</strong>. Seguí los pasos
          (N° de autorización, fecha, matrícula del prescriptor, prestaciones) y anotá el número de trámite.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <img src="/wizard/osde/paso0_apligem.png" alt="Apligem - Menú principal" className="cobros-wizard__img--phone" />
          <img src="/wizard/osde/paso1_registrar.png" alt="SCIS - Registrar Cirugía" className="cobros-wizard__img--phone" />
        </div>
        <div className="cobros-wizard__file-input-wrap">
          <label className="cobros-wizard__label">Número de trámite (opcional)</label>
          <input
            className="cobros-wizard__input"
            value={numeroTramite}
            onChange={(e) => setNumeroTramite(e.target.value)}
            placeholder="El que devuelve Apligem"
          />
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={saving}
          onClick={() => patch('registrar_cirugia', { numero_tramite_apligem: numeroTramite })}
        >
          {saving ? 'Guardando...' : 'Ya la registré →'}
        </button>
      </Step>

      {/* ── Paso 2: Enviar protocolo ── */}
      <Step numero={2} titulo="Enviá el protocolo en Apligem" activo={paso === 2} completado={paso > 2}>
        <p className="cobros-wizard__text">
          En Apligem, enviá la foto del protocolo del parte quirúrgico. Te devuelve un número de registración aparte.
        </p>
        <img src="/wizard/osde/paso2_protocolo.png" alt="Apligem - Enviar protocolo" className="cobros-wizard__img--phone" />
        <div className="cobros-wizard__file-input-wrap">
          <label className="cobros-wizard__label">Número de registración (opcional)</label>
          <input
            className="cobros-wizard__input"
            value={numeroRegistracion}
            onChange={(e) => setNumeroRegistracion(e.target.value)}
            placeholder="El que devuelve Apligem"
          />
        </div>
        <div className="cobros-wizard__step-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={saving}
            onClick={() => patch('protocolo_enviado', { numero_registracion_protocolo: numeroRegistracion })}
          >
            {saving ? 'Guardando...' : 'Protocolo enviado →'}
          </button>
        </div>
        <button type="button" className="btn cobros-wizard__btn-muted" style={{ marginTop: 12, fontSize: 13 }} onClick={goBack} disabled={saving}>
          ← Volver al paso anterior
        </button>
      </Step>

      {/* ── Paso 3: Verificar aprobación ── */}
      <Step numero={3} titulo="Verificá que figure aprobada" activo={paso === 3} completado={paso > 3}>
        <p className="cobros-wizard__text">
          En Apligem → <strong>Consultar</strong>, filtrá por número de afiliado y mirá si figura{' '}
          <strong>Aprobado</strong> (verde) o <strong>Rechazado</strong> (rojo).
        </p>
        <img src="/wizard/osde/paso3_consultar.png" alt="Apligem - Consultar estado" className="cobros-wizard__img--phone" />
        <p className="cobros-wizard__text-soft">¿Cómo figura en Apligem?</p>
        <div className="cobros-wizard__step-actions">
          <button type="button" className="btn btn-primary" disabled={saving} onClick={() => patch('marcar_aprobado')}>
            ✓ Figura aprobado
          </button>
          <button type="button" className="btn cobros-wizard__btn-danger-outline" disabled={saving} onClick={() => {
            if (window.confirm('¿Confirmar que fue rechazado? Vas a poder reiniciar el proceso después.')) {
              patch('marcar_rechazado')
            }
          }}>
            ✗ Fue rechazado
          </button>
        </div>
        <button type="button" className="btn cobros-wizard__btn-muted" style={{ marginTop: 12, fontSize: 13 }} onClick={goBack} disabled={saving}>
          ← Volver al paso anterior
        </button>
      </Step>

      {/* ── Paso 4: Factura ARCA ── */}
      <Step numero={4} titulo="Emití la Factura C en ARCA" activo={paso === 4} completado={paso > 4}>
        <FacturaARCA
          submissionId={cir.id}
          monto={cir.monto_estimado ?? 0}
          periodo={cir.fecha_cirugia ? cir.fecha_cirugia.slice(0, 7) : new Date().toISOString().slice(0, 7)}
          facturaYaEmitida={
            cir.cae_numero
              ? {
                  cae: cir.cae_numero,
                  caeVencimiento: cir.cae_vencimiento,
                  nroComprobante: cir.numero_comprobante,
                  pdfPath: cir.factura_path,
                }
              : undefined
          }
          onExito={async () => {
            await patch('factura_emitida', {})
          }}
          onError={(mensaje) => {
            console.error('Error emitiendo factura OSDE:', mensaje)
            setError(mensaje)
          }}
        />
        <button type="button" className="btn cobros-wizard__btn-muted" style={{ marginTop: 12, fontSize: 13 }} onClick={goBack} disabled={saving}>
          ← Volver al paso anterior
        </button>
      </Step>

      {/* ── Paso 5: Cargar comprobante en EXTRANET ── */}
      <Step numero={5} titulo="Cargá el comprobante en la EXTRANET de OSDE" activo={paso === 5} completado={paso > 5}>
        <p className="cobros-wizard__text">
          Entrá a la EXTRANET de OSDE → <strong>envío de comprobantes fiscales</strong> →{' '}
          <strong>subir documentación</strong>, y cargá la factura. Pasa a <strong>recibidos</strong>.
        </p>
        {/* TODO(extranet): sumar capturas y URL cuando las tengas. */}
        <p className="cobros-wizard__text-muted">
          Todavía no tenemos capturas de la EXTRANET; las sumamos cuando las consigas.
        </p>
        <div className="cobros-wizard__step-actions">
          <button type="button" className="btn btn-primary" disabled={saving} onClick={() => patch('comprobante_cargado')}>
            {saving ? 'Guardando...' : 'Comprobante cargado →'}
          </button>
        </div>
        <button type="button" className="btn cobros-wizard__btn-muted" style={{ marginTop: 12, fontSize: 13 }} onClick={goBack} disabled={saving}>
          ← Volver al paso anterior
        </button>
      </Step>

      {/* ── Paso 6: Verificar cobro ── */}
      <Step numero={6} titulo="Verificá el cobro" activo={paso === 6} completado={false}>
        <p className="cobros-wizard__text">
          En la EXTRANET → <strong>cuenta corriente</strong> vas a ver el pago pendiente y, después, el acreditado.
        </p>
        <div className="cobros-wizard__panel cobros-wizard__panel--neutral">
          <p className="cobros-wizard__text cobros-wizard__text--tight">
            Ojo: OSDE no paga el mes calendario completo. Hace cortes según el último dígito de tu número
            de prestador, así que el pago puede venir partido.
          </p>
        </div>
        <div className="cobros-wizard__step-actions">
          <button type="button" className="btn btn-primary" disabled={saving} onClick={() => patch('marcar_cobrado')}>
            {saving ? 'Guardando...' : 'Cobrado ✓'}
          </button>
          <button type="button" className="btn" disabled={saving} onClick={() => onCollapse?.()}>
            Todavía no — vuelvo después
          </button>
        </div>
        <button type="button" className="btn cobros-wizard__btn-muted" style={{ marginTop: 12, fontSize: 13 }} onClick={goBack} disabled={saving}>
          ← Volver al paso anterior
        </button>
      </Step>
    </div>
  )
}
