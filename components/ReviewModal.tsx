// components/ReviewModal.tsx
'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { runChecks, type CheckIssue } from '@/lib/checks'

type Liquidacion = {
  id: string
  periodo: string | null
  estado: string
  estado_revision: string | null
  motivos_revision: any[]
  prepaga: string | null
  ai_extractions: {
    id: string
    paciente: string | null
    codigo_nomenclador: string | null
    descripcion_practica: string | null
    fecha_practica: string | null
    sanatorio: string | null
    prepaga: string | null
    datos_extras: any
    edited_by_user: boolean
    edited_fields: string[]
  }
  documents: {
    id: string
    nombre_archivo: string | null
    storage_path: string | null
  }
}

type Props = {
  liquidacionId: string
  onClose: () => void
  onSaved?: (result: { confirmed: boolean }) => void
}

function periodoLabel(p: string | null): string {
  if (!p) return '—'
  const [y, m] = p.split('-').map((n) => parseInt(n, 10))
  if (!y || !m) return p
  const meses = [
    'Enero','Febrero','Marzo','Abril','Mayo','Junio',
    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
  ]
  return `${meses[m - 1]} ${y}`
}

export function ReviewModal({ liquidacionId, onClose, onSaved }: Props) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [liq, setLiq] = useState<Liquidacion | null>(null)

  // Estado editable del formulario
  const [paciente, setPaciente] = useState('')
  const [numeroAfiliado, setNumeroAfiliado] = useState('')
  const [sanatorio, setSanatorio] = useState('')
  const [codigo, setCodigo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [fecha, setFecha] = useState('') // YYYY-MM-DD
  const [fechaWasMissing, setFechaWasMissing] = useState(false)

  // Cargar la liquidación al abrir
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const r = await fetch(`/api/liquidaciones/${liquidacionId}`)
        const j = await r.json()
        if (!r.ok) throw new Error(j.error || 'Error cargando')
        if (cancelled) return
        const data = j.liquidacion as Liquidacion
        setLiq(data)
        setPaciente(data.ai_extractions.paciente ?? '')
        setNumeroAfiliado(
          data.ai_extractions.datos_extras?.cobertura?.numero_afiliado
            ? String(data.ai_extractions.datos_extras.cobertura.numero_afiliado)
            : '',
        )
        setSanatorio(data.ai_extractions.sanatorio ?? '')
        setCodigo(data.ai_extractions.codigo_nomenclador ?? '')
        setDescripcion(data.ai_extractions.descripcion_practica ?? '')
        setFecha(data.ai_extractions.fecha_practica ?? '')
        setFechaWasMissing(!data.ai_extractions.fecha_practica)
      } catch (e: any) {
        if (!cancelled) setError(e.message ?? 'Error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [liquidacionId])

  // Re-correr chequeos en vivo a medida que el médico edita
  const checks = useMemo(() => {
    return runChecks({
      prepaga: liq?.ai_extractions.datos_extras?.cobertura?.prepaga ?? liq?.prepaga ?? null,
      numeroAfiliado: numeroAfiliado || null,
      sanatorio: sanatorio || null,
      codigoNomenclador: codigo || null,
      descripcionPractica: descripcion || null,
      tipoRealizado:
        liq?.ai_extractions.datos_extras?.procedimiento?.tipo_realizado ?? null,
      diagnosticoOperatorio:
        liq?.ai_extractions.datos_extras?.procedimiento?.diagnostico_operatorio ?? null,
      fechaPracticaISO: fecha || null,
    })
  }, [liq, numeroAfiliado, sanatorio, codigo, descripcion, fecha])

  const canConfirm = !saving && !loading && checks.blockers.length === 0 && !checks.isOutOfScope

  async function handleSave(action: 'confirm' | 'save_draft') {
    if (!liq) return
    setSaving(true)
    setError(null)
    try {
      const r = await fetch(`/api/liquidaciones/${liquidacionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          paciente,
          numero_afiliado: numeroAfiliado,
          sanatorio,
          codigo_nomenclador: codigo,
          descripcion_practica: descripcion,
          fecha_practica_iso: fecha || null,
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Error guardando')
      onSaved?.({ confirmed: action === 'confirm' })
      onClose()
    } catch (e: any) {
      setError(e.message ?? 'Error')
    } finally {
      setSaving(false)
    }
  }

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    backdropFilter: 'blur(2px)',
    WebkitBackdropFilter: 'blur(2px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9990,
    padding: 16,
    animation: 'modalOverlayIn 0.18s ease-out both',
  }
  const modalStyle: React.CSSProperties = {
    position: 'relative' as const,
    zIndex: 9991,
    background: 'white',
    borderRadius: 12,
    maxWidth: 640,
    width: '100%',
    maxHeight: '90vh',
    overflow: 'auto',
    padding: 24,
    boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
    animation: 'modalCardIn 0.22s ease-out both',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 4,
    color: '#1f5d3a',
  }
  const inputStyle: React.CSSProperties = {
    width: '100%',
    height: 38,
    padding: '0 12px',
    borderRadius: 8,
    border: '1px solid #d0d7d2',
    fontSize: 14,
  }

  return (
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div style={modalStyle}>
        <h2 style={{ margin: 0, marginBottom: 4, color: '#1f5d3a' }}>Revisar parte quirúrgico</h2>
        <p style={{ margin: 0, marginBottom: 16, fontSize: 13, color: '#6b7280' }}>
          {liq?.periodo
            ? `Período de cierre: ${periodoLabel(liq.periodo)}`
            : 'Completá los datos para asignar a un período de cierre.'}
        </p>

        {loading && <p>Cargando...</p>}
        {error && (
          <div style={{ padding: 10, background: '#fde2e2', color: '#842029', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>
            {error}
          </div>
        )}

        {!loading && liq && (
          <>
            {/* Lista de blockers/warnings */}
            {checks.blockers.length > 0 && (
              <div style={{ background: '#fde2e2', border: '1px solid #e07b7b', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                <strong style={{ color: '#842029', fontSize: 13 }}>Datos faltantes o inválidos:</strong>
                <ul style={{ margin: '6px 0 0 18px', padding: 0, color: '#842029', fontSize: 13 }}>
                  {checks.blockers.map((b: CheckIssue, i: number) => (
                    <li key={i}>{b.message}</li>
                  ))}
                </ul>
              </div>
            )}
            {checks.warnings.length > 0 && (
              <div style={{ background: '#fff4d6', border: '1px solid #e0b94a', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                <strong style={{ color: '#7a5a00', fontSize: 13 }}>Avisos:</strong>
                <ul style={{ margin: '6px 0 0 18px', padding: 0, color: '#7a5a00', fontSize: 13 }}>
                  {checks.warnings.map((w: CheckIssue, i: number) => (
                    <li key={i}>{w.message}</li>
                  ))}
                </ul>
              </div>
            )}
            {checks.isOutOfScope && (
              <div style={{ background: '#e0e8ff', border: '1px solid #7589c4', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 13, color: '#1e3a8a' }}>
                Este parte no es de Swiss Medical. No puede procesarse desde esta vista.
              </div>
            )}

            {/* Form */}
            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <label style={labelStyle}>Paciente</label>
                <input style={inputStyle} value={paciente} onChange={(e) => setPaciente(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Número de afiliado</label>
                <input style={inputStyle} value={numeroAfiliado} onChange={(e) => setNumeroAfiliado(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Sanatorio</label>
                <input style={inputStyle} value={sanatorio} onChange={(e) => setSanatorio(e.target.value)} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Código nomenclador</label>
                  <input style={inputStyle} value={codigo} onChange={(e) => setCodigo(e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>Descripción de la práctica</label>
                  <input style={inputStyle} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Fecha de práctica</label>
                {fechaWasMissing ? (
                  <input
                    type="date"
                    style={inputStyle}
                    value={fecha}
                    onChange={(e) => setFecha(e.target.value)}
                  />
                ) : (
                  <input style={{ ...inputStyle, background: '#f7f7f7', color: '#666' }} value={fecha} readOnly />
                )}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button
                type="button"
                className="btn"
                onClick={() => handleSave('save_draft')}
                disabled={saving}
              >
                {saving ? 'Guardando...' : 'Cerrar (guardar incompleto)'}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => handleSave('confirm')}
                disabled={!canConfirm}
                title={canConfirm ? '' : 'Resolvé los datos faltantes para confirmar'}
                style={
                  !canConfirm
                    ? {
                        background: '#cdd5d0',
                        color: '#7a8580',
                        cursor: 'not-allowed',
                        borderColor: '#cdd5d0',
                      }
                    : undefined
                }
              >
                {saving ? 'Confirmando...' : 'Confirmar y agregar a la planilla'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
