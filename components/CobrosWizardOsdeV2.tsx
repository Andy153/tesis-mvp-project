'use client'

// components/CobrosWizardOsdeV2.tsx
// Wizard con integración directa a Activia. Solo para usuarios con feature flag.
// Pasos 1-3 de Apligem → reemplazados por una llamada automática a OSDE.
//
// Paso 1: Registrar en OSDE (02Q/02A via Activia) — AUTOMATICO
// Paso 2: Registrá el trámite en la EXTRANET de OSDE — MANUAL (sin API)
// Paso 3: Emití la Factura C en ARCA — AUTOMATICO
// Paso 4: Cargá el comprobante en la EXTRANET — MANUAL
// Paso 5: Verificá el cobro — MANUAL

import type { ReactNode } from 'react'
import { FacturaARCA } from '@/components/arca/FacturaARCA'
import { montoParaFacturar } from '@/lib/cobros-montos'
import { useEffect, useState } from 'react'

type OsdeCirugia = {
  id: string
  document_id: string | null
  paciente: string | null
  afiliado: string | null
  fecha_cirugia: string | null
  wizard_paso: number
  wizard_estado: string
  numero_tramite_apligem: string | null
  resultado_consulta: 'aprobado' | 'rechazado' | null
  monto_extranet: number | null
  monto_facturado?: number | null
  nro_autorizacion_osde: string | null
  cod_prestacion: string | null
  nro_tramite_osde: string | null
  fecha_corte_estimada: string | null
  factura_emitida_en: string | null
  comprobante_cargado_en: string | null
  cobrado_en: string | null
  tiene_debito: boolean
  monthly_submission_id: string | null
}

type OsdeCirugiaPatch = Partial<{
  wizard_paso: number
  wizard_estado: string
  resultado_consulta: 'aprobado' | 'rechazado' | null
  monto_extranet: number
  nro_tramite_osde: string
  fecha_corte_estimada: string | null
  factura_emitida_en: string | null
  monto_facturado: number
  comprobante_cargado_en: string | null
  cobrado_en: string | null
  tiene_debito: boolean
  monthly_submission_id: string | null
}>

type Props = {
  cirugiaId: string
  onUpdate?: () => void
  onCollapse?: () => void
}

/** Deriva el paso actual del V2 a partir de los datos, no del wizard_paso. */
export function getV2Step(cir: OsdeCirugia): number {
  if (!cir.numero_tramite_apligem || cir.resultado_consulta !== 'aprobado') return 1
  if (!cir.nro_tramite_osde || !cir.monto_extranet) return 2
  if (!cir.factura_emitida_en) return 3
  if (!cir.comprobante_cargado_en) return 4
  return 5
}

function Step({
  numero, titulo, activo, completado, children,
}: {
  numero: number; titulo: string; activo: boolean; completado: boolean; children?: ReactNode
}) {
  const cls = ['cobros-wizard__step', activo ? 'cobros-wizard__step--active' : '', completado ? 'cobros-wizard__step--completed' : ''].filter(Boolean).join(' ')
  return (
    <div className={cls}>
      <div className="cobros-wizard__step-head">
        <div className="cobros-wizard__step-badge">{completado ? '✓' : numero}</div>
        <span className="cobros-wizard__step-title">{titulo}</span>
      </div>
      {activo && children ? <div className="cobros-wizard__step-body">{children}</div> : null}
    </div>
  )
}

export function CobrosWizardOsdeV2({ cirugiaId, onUpdate, onCollapse }: Props) {
  const [cir, setCir] = useState<OsdeCirugia | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Step 1 — Activia
  const [nroCredencial, setNroCredencial] = useState('')
  const [nroAutorizacion, setNroAutorizacion] = useState('')
  const [codPrestacion, setCodPrestacion] = useState('')
  const [registrando, setRegistrando] = useState(false)
  const [registradoRef, setRegistradoRef] = useState<string | null>(null)
  const [enviandoProtocolo, setEnviandoProtocolo] = useState(false)
  const [protocoloWarning, setProtocoloWarning] = useState(false)

  // Step 2 — EXTRANET
  const [montoExtranet, setMontoExtranet] = useState('')
  const [nroTramiteOsde, setNroTramiteOsde] = useState('')

  // Step 5 — cobro
  const [fechaCorte, setFechaCorte] = useState('')

  const load = async () => {
    try {
      const r = await fetch(`/api/osde/cirugias/${cirugiaId}/wizard`)
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'Error al cargar')
      const c = j.cirugia as OsdeCirugia
      setCir(c)
      setNroCredencial(c.afiliado ?? '')
      setNroAutorizacion(c.nro_autorizacion_osde ?? '')
      setCodPrestacion(c.cod_prestacion ?? '')
      setMontoExtranet(c.monto_extranet != null ? String(c.monto_extranet) : '')
      setNroTramiteOsde(c.nro_tramite_osde ?? '')
      setFechaCorte(c.fecha_corte_estimada ?? '')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [cirugiaId]) // eslint-disable-line

  const save = async (patch: OsdeCirugiaPatch) => {
    setSaving(true); setError(null)
    try {
      const r = await fetch(`/api/osde/cirugias/${cirugiaId}/wizard`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'Error al actualizar')
      await load(); onUpdate?.()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  const registrarEnOsde = async () => {
    if (!nroCredencial.trim() || !codPrestacion.trim()) {
      setError('Completá número de credencial y código de prestación')
      return
    }
    setRegistrando(true); setError(null); setProtocoloWarning(false)
    try {
      const r = await fetch('/api/osde/activia/registrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cirugiaId,
          numeroCredencial: nroCredencial.trim(),
          codigoPreautorizacion: nroAutorizacion.trim() || undefined,
          codPrestacion: codPrestacion.trim(),
        }),
      })
      const j = await r.json()
      if (!r.ok) {
        const cod = j.codigoRtaAdicional ? ` (código ${j.codigoRtaAdicional})` : ''
        throw new Error((j.descripcion ?? j.message ?? 'Error de OSDE') + cod)
      }
      const nroReferencia = j.nroReferencia ?? '—'
      setRegistradoRef(nroReferencia)
      setCir((prev) =>
        prev
          ? {
              ...prev,
              numero_tramite_apligem: j.nroReferencia ?? prev.numero_tramite_apligem,
              resultado_consulta: 'aprobado',
            }
          : prev,
      )

      setRegistrando(false)
      setEnviandoProtocolo(true)
      try {
        const protocoloRes = await fetch('/api/osde/activia/protocolo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cirugiaId }),
        })
        const protocoloJson = await protocoloRes.json()
        if (!protocoloRes.ok || protocoloJson.ok === false) {
          setProtocoloWarning(true)
        }
      } catch {
        setProtocoloWarning(true)
      } finally {
        setEnviandoProtocolo(false)
      }

      // Guardar en DB para futuros accesos
      if (nroAutorizacion.trim()) {
        await save({ nro_autorizacion_osde: nroAutorizacion.trim() } as any)
      }
      if (codPrestacion.trim()) {
        await save({ cod_prestacion: codPrestacion.trim() } as any)
      }

      await load(); onUpdate?.()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al conectar con OSDE')
    } finally {
      setRegistrando(false)
    }
  }

  if (loading) return <p className="cobros-wizard__loading">Cargando...</p>
  if (!cir) return <p className="cobros-wizard__fatal">{error ?? 'No encontrada'}</p>

  /* ── Estados terminales ── */
  if (cir.wizard_estado === 'completado' || cir.cobrado_en) {
    return (
      <div className="cobros-wizard__state-aprobado">
        <div className="cobros-wizard__state-aprobado-icon">🎉</div>
        <h3 className="cobros-wizard__state-aprobado-title">¡Cirugía cobrada!</h3>
        <p className="cobros-wizard__text cobros-wizard__text--none">
          {cir.paciente ? `${cir.paciente} · ` : ''}Ref. Activia {cir.numero_tramite_apligem ?? '—'}
        </p>
      </div>
    )
  }

  if (cir.resultado_consulta === 'rechazado' || cir.wizard_estado === 'rechazado') {
    return (
      <div className="cobros-wizard__panel cobros-wizard__panel--warn">
        <strong>OSDE rechazó la registración</strong>
        <p className="cobros-wizard__text cobros-wizard__text--tight" style={{ marginTop: 8 }}>
          Revisá los datos y volvé a intentar. El código de autorización o prestación puede ser incorrecto.
        </p>
        <button type="button" className="btn btn-primary" disabled={saving}
          onClick={() => save({ wizard_paso: 1, wizard_estado: 'en_curso', resultado_consulta: null, nro_tramite_osde: null, monto_extranet: undefined, factura_emitida_en: null, comprobante_cargado_en: null, cobrado_en: null, tiene_debito: false })}>
          Reiniciar desde el paso 1
        </button>
      </div>
    )
  }

  if (cir.wizard_estado === 'descartado') {
    return (
      <div className="cobros-wizard__panel cobros-wizard__panel--neutral">
        <strong>Seguimiento descartado</strong>
      </div>
    )
  }

  const paso = getV2Step(cir)
  const showBannerDebito = paso === 5 && !!cir.comprobante_cargado_en && !cir.cobrado_en

  return (
    <div className="cobros-wizard">
      <p className="cobros-wizard__intro">
        Cobro de cirugía <strong>OSDE</strong>
        {cir.paciente ? ` · ${cir.paciente}` : ''}
        {cir.fecha_cirugia ? ` · cirugía del ${cir.fecha_cirugia}` : ''}
        <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-soft)', background: 'var(--surface-2)', padding: '2px 6px', borderRadius: 4 }}>
          Integración Activia ✦
        </span>
      </p>

      {error ? <div className="cobros-wizard__error-inline">{error}</div> : null}

      {protocoloWarning && getV2Step(cir) === 1 ? (
        <div className="cobros-wizard__panel cobros-wizard__panel--warn" style={{ marginBottom: 12 }}>
          <p className="cobros-wizard__text" style={{ margin: 0 }}>
            ⚠️ El protocolo se enviará cuando Activia procese la respuesta.
            Podés continuar.
          </p>
        </div>
      ) : null}

      <div className="cobros-wizard__toolbar">
        {paso > 1 && (
          <button type="button" className="btn" style={{ fontSize: 12 }} disabled={saving}
            onClick={() => { if (window.confirm('¿Reiniciar desde paso 1?')) save({ wizard_paso: 1, wizard_estado: 'en_curso', resultado_consulta: null, nro_tramite_osde: null, monto_extranet: undefined, factura_emitida_en: null, comprobante_cargado_en: null, cobrado_en: null, tiene_debito: false }) }}>
            Reiniciar cobro
          </button>
        )}
        <button type="button" className="btn cobros-wizard__btn-muted" style={{ fontSize: 12 }} disabled={saving}
          onClick={() => { if (window.confirm('¿Descartar seguimiento?')) save({ wizard_estado: 'descartado' }) }}>
          Descartar
        </button>
        {onCollapse ? (
          <button type="button" className="btn cobros-wizard__btn-muted" style={{ fontSize: 12 }} onClick={onCollapse}>Cerrar</button>
        ) : null}
      </div>

      {/* ── Paso 1: Registrar en OSDE via Activia ── */}
      <Step numero={1} titulo="Registrar en OSDE" activo={paso === 1} completado={paso > 1}>
        <div className="cobros-wizard__panel" style={{ background: 'var(--surface-2)', marginBottom: 16 }}>
          <p className="cobros-wizard__text" style={{ margin: 0 }}>
            Trazá registra la cirugía directamente en OSDE. Completá los datos y hacé click en <strong>Registrar en OSDE</strong>.
          </p>
        </div>

        <div className="cobros-wizard__file-input-wrap">
          <label className="cobros-wizard__label">N° de credencial del afiliado</label>
          <input className="cobros-wizard__input" value={nroCredencial}
            onChange={(e) => setNroCredencial(e.target.value.replace(/\D/g, ''))}
            placeholder="Ej: 60671956201" />
        </div>

        <div className="cobros-wizard__file-input-wrap">
          <label className="cobros-wizard__label">N° de autorización OSDE <span style={{ fontWeight: 400, color: 'var(--text-soft)' }}>(del parte quirúrgico — 6 a 8 dígitos)</span></label>
          <input className="cobros-wizard__input" value={nroAutorizacion}
            onChange={(e) => setNroAutorizacion(e.target.value.replace(/\D/g, '').slice(0, 8))}
            placeholder="Ej: 829820" maxLength={8} />
        </div>

        <div className="cobros-wizard__file-input-wrap">
          <label className="cobros-wizard__label">Código de prestación OSDE</label>
          <input className="cobros-wizard__input" value={codPrestacion}
            onChange={(e) => setCodPrestacion(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="Ej: 120164" maxLength={6} />
        </div>

        {registrando ? (
          <div className="cobros-wizard__panel" style={{ textAlign: 'center', padding: 24 }}>
            <p className="cobros-wizard__text" style={{ margin: 0 }}>⏳ Conectando con OSDE... (puede tardar hasta 30s)</p>
          </div>
        ) : registradoRef || enviandoProtocolo ? (
          <div className="cobros-wizard__panel" style={{ background: 'var(--green-50)', border: '1px solid var(--green-200)', textAlign: 'center', padding: 16 }}>
            {registradoRef ? (
              <p className="cobros-wizard__text" style={{ margin: 0 }}>
                ✅ Registración exitosa · Ref. Activia: <strong>{registradoRef}</strong>
              </p>
            ) : null}
            {enviandoProtocolo ? (
              <p className="cobros-wizard__text" style={{ margin: registradoRef ? '8px 0 0' : 0 }}>
                ⏳ Enviando protocolo a OSDE...
              </p>
            ) : null}
            {protocoloWarning && !enviandoProtocolo ? (
              <p className="cobros-wizard__text" style={{ margin: '8px 0 0', color: 'var(--text-muted)' }}>
                ⚠️ El protocolo se enviará cuando Activia procese la respuesta.
                Podés continuar.
              </p>
            ) : null}
          </div>
        ) : (
          <button type="button" className="btn btn-primary" disabled={registrando || saving} onClick={registrarEnOsde}>
            Registrar en OSDE →
          </button>
        )}
      </Step>

      {/* ── Paso 2: EXTRANET ── */}
      <Step numero={2} titulo="Registrá el trámite en la EXTRANET de OSDE" activo={paso === 2} completado={paso > 2}>
        <p className="cobros-wizard__text">
          En la EXTRANET de OSDE, cargá el monto y anotá el número de trámite de 10 dígitos que devuelve el sistema.
        </p>
        <p className="cobros-wizard__text" style={{ marginBottom: 12 }}>
          📋 Referencia Activia: {cir.numero_tramite_apligem ?? registradoRef ?? '—'}
        </p>
        <div className="cobros-wizard__file-input-wrap">
          <label className="cobros-wizard__label">Monto en EXTRANET</label>
          <input className="cobros-wizard__input" type="number" min="0" step="0.01"
            value={montoExtranet} onChange={(e) => setMontoExtranet(e.target.value)} placeholder="Ej: 150000" />
        </div>
        <div className="cobros-wizard__file-input-wrap">
          <label className="cobros-wizard__label">N° trámite OSDE (10 dígitos)</label>
          <input className="cobros-wizard__input" value={nroTramiteOsde}
            onChange={(e) => setNroTramiteOsde(e.target.value.replace(/\D/g, '').slice(0, 10))}
            placeholder="1234567890" maxLength={10} />
        </div>
        <button type="button" className="btn btn-primary" disabled={saving}
          onClick={() => save({ wizard_paso: 5, monto_extranet: Number(montoExtranet), nro_tramite_osde: nroTramiteOsde.trim() })}>
          {saving ? 'Guardando...' : 'Trámite registrado →'}
        </button>
      </Step>

      {/* ── Paso 3: ARCA ── */}
      <Step numero={3} titulo="Emití la Factura C en ARCA" activo={paso === 3} completado={paso > 3 || !!cir.factura_emitida_en}>
        {cir.factura_emitida_en ? (
          <div>
            <p className="cobros-wizard__text">Ya emitiste la factura para esta cirugía.</p>
            <button type="button" className="btn btn-primary" disabled={saving} onClick={() => save({ wizard_paso: 6 })}>Continuar →</button>
          </div>
        ) : (
          <FacturaARCA
            receptorOverride={{ cuit: '30687313272', razonSocial: 'OSDE' }}
            submissionId={cir.monthly_submission_id ?? ''}
            monto={montoParaFacturar(cir)}
            periodo={cir.fecha_cirugia ? cir.fecha_cirugia.slice(0, 7) : new Date().toISOString().slice(0, 7)}
            facturaYaEmitida={undefined}
            onExito={async (_cae, _vto, _nro, montoFacturado) => {
              await save({ wizard_paso: 6, factura_emitida_en: new Date().toISOString(), monto_facturado: montoFacturado })
            }}
            onError={(msg) => setError(msg)}
          />
        )}
        <button type="button" className="btn cobros-wizard__btn-muted" style={{ marginTop: 12, fontSize: 13 }} disabled={saving}
          onClick={() => save({ wizard_paso: 4 })}>
          ← Volver al paso anterior
        </button>
      </Step>

      {/* ── Paso 4: Cargar comprobante ── */}
      <Step numero={4} titulo="Cargá el comprobante en la EXTRANET de OSDE" activo={paso === 4} completado={paso > 4 || !!cir.comprobante_cargado_en}>
        <p className="cobros-wizard__text">
          EXTRANET de OSDE → <strong>envío de comprobantes fiscales</strong> → <strong>subir documentación</strong>.
        </p>
        <button type="button" className="btn btn-primary" disabled={saving}
          onClick={() => save({ wizard_paso: 7, comprobante_cargado_en: new Date().toISOString() })}>
          {saving ? 'Guardando...' : 'Comprobante cargado →'}
        </button>
        <button type="button" className="btn cobros-wizard__btn-muted" style={{ marginTop: 12, fontSize: 13 }} disabled={saving}
          onClick={() => save({ wizard_paso: 6, factura_emitida_en: null })}>
          ← Volver al paso anterior
        </button>
      </Step>

      {/* ── Paso 5: Verificar cobro ── */}
      <Step numero={5} titulo="Verificá el cobro" activo={paso === 5} completado={!!cir.cobrado_en}>
        <p className="cobros-wizard__text">
          En la EXTRANET → <strong>cuenta corriente</strong> vas a ver el pago pendiente y, después, el acreditado.
        </p>
        {showBannerDebito && !cir.tiene_debito ? (
          <div className="cobros-wizard__panel cobros-wizard__panel--warn" style={{ marginBottom: 12 }}>
            <strong>¿Hay un débito en cuenta corriente?</strong>
            <button type="button" className="btn btn-primary" disabled={saving} style={{ marginTop: 8 }} onClick={() => save({ tiene_debito: true })}>
              Hay un débito
            </button>
          </div>
        ) : null}
        <div className="cobros-wizard__file-input-wrap">
          <label className="cobros-wizard__label">Fecha de corte estimada (opcional)</label>
          <input className="cobros-wizard__input" type="date" value={fechaCorte} onChange={(e) => setFechaCorte(e.target.value)} />
        </div>
        <div className="cobros-wizard__step-actions">
          <button type="button" className="btn btn-primary" disabled={saving}
            onClick={() => save({ cobrado_en: new Date().toISOString(), fecha_corte_estimada: fechaCorte || null, wizard_estado: 'completado' })}>
            {saving ? 'Guardando...' : 'Ya cobré ✓'}
          </button>
          <button type="button" className="btn" disabled={saving}
            onClick={() => save({ cobrado_en: null, fecha_corte_estimada: fechaCorte || null })}>
            Aún no figura
          </button>
        </div>
        <button type="button" className="btn cobros-wizard__btn-muted" style={{ marginTop: 12, fontSize: 13 }} disabled={saving}
          onClick={() => save({ wizard_paso: 7, comprobante_cargado_en: null })}>
          ← Volver al paso anterior
        </button>
      </Step>
    </div>
  )
}
