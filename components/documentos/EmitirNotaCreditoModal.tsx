'use client'

import { useState } from 'react'
import { emitirNotaCreditoAction } from '@/app/actions/emitir-nota-credito'

export interface EmitirNotaCreditoModalProps {
  /** Submission ID de la factura original a anular. */
  submissionAnuladaId: string
  /** Datos de la factura original que se muestran en el resumen. */
  facturaOriginal: {
    numero: string // formato "0010-00000003"
    fecha: string // formato "24/05/2026"
    receptorRazonSocial: string
    monto: string // formato "$45.000,00"
    cae: string
  }
  /** Llamado cuando el usuario cancela o se cierra el modal después de éxito. */
  onClose: () => void
  /** Opcional: llamado tras emisión exitosa, antes de cerrar. */
  onSuccess?: (resultado: { cae: string; numeroComprobante: number; pdfUrl?: string }) => void
}

type Estado =
  | { tipo: 'idle' }
  | { tipo: 'emitiendo' }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'exito'; cae: string; numeroComprobante: number; pdfUrl?: string }

export function EmitirNotaCreditoModal({
  submissionAnuladaId,
  facturaOriginal,
  onClose,
  onSuccess,
}: EmitirNotaCreditoModalProps) {
  const [motivo, setMotivo] = useState('')
  const [estado, setEstado] = useState<Estado>({ tipo: 'idle' })

  async function handleEmitir() {
    setEstado({ tipo: 'emitiendo' })

    const resultado = await emitirNotaCreditoAction(submissionAnuladaId, motivo)

    if (!resultado.exito) {
      setEstado({ tipo: 'error', mensaje: resultado.error ?? 'Error desconocido' })
      return
    }

    const exito = {
      cae: resultado.cae!,
      numeroComprobante: resultado.numeroComprobante!,
      pdfUrl: resultado.pdfUrl,
    }
    setEstado({ tipo: 'exito', ...exito })
    onSuccess?.(exito)
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-panel)',
          color: 'var(--text)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          width: '100%',
          maxWidth: 520,
          padding: 24,
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        {estado.tipo === 'exito' ? (
          <SuccessView
            cae={estado.cae}
            numeroComprobante={estado.numeroComprobante}
            pdfUrl={estado.pdfUrl}
            onClose={onClose}
          />
        ) : (
          <ConfirmView
            facturaOriginal={facturaOriginal}
            motivo={motivo}
            setMotivo={setMotivo}
            estado={estado}
            onCancelar={onClose}
            onEmitir={handleEmitir}
          />
        )}
      </div>
    </div>
  )
}

function ConfirmView({
  facturaOriginal,
  motivo,
  setMotivo,
  estado,
  onCancelar,
  onEmitir,
}: {
  facturaOriginal: EmitirNotaCreditoModalProps['facturaOriginal']
  motivo: string
  setMotivo: (v: string) => void
  estado: Estado
  onCancelar: () => void
  onEmitir: () => void
}) {
  const emitiendo = estado.tipo === 'emitiendo'

  return (
    <>
      <h2 style={{ margin: 0, marginBottom: 4, fontSize: 20, fontWeight: 600 }}>
        Emitir Nota de Crédito
      </h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 20, marginTop: 4 }}>
        Vas a anular fiscalmente esta factura ante ARCA. Esta acción no se puede deshacer.
      </p>

      {/* Resumen de la factura original */}
      <div
        style={{
          background: 'var(--bg-sunken)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: 16,
          marginBottom: 20,
        }}
      >
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
          Factura a anular
        </div>
        <div style={{ display: 'grid', gap: 6, fontSize: 14 }}>
          <Row label="Número" value={facturaOriginal.numero} />
          <Row label="Fecha" value={facturaOriginal.fecha} />
          <Row label="Receptor" value={facturaOriginal.receptorRazonSocial} />
          <Row label="Monto" value={facturaOriginal.monto} />
          <Row label="CAE" value={facturaOriginal.cae} />
        </div>
      </div>

      {/* Motivo opcional */}
      <label
        htmlFor="motivo-nc"
        style={{
          display: 'block',
          fontSize: 13,
          fontWeight: 500,
          marginBottom: 6,
          color: 'var(--text)',
        }}
      >
        Motivo (opcional)
      </label>
      <textarea
        id="motivo-nc"
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Para tus registros, no se envía a ARCA. Ej: paciente no se presentó, monto incorrecto..."
        rows={3}
        disabled={emitiendo}
        style={{
          width: '100%',
          padding: 10,
          background: 'var(--bg-sunken)',
          color: 'var(--text)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          fontSize: 13,
          fontFamily: 'inherit',
          resize: 'vertical',
          marginBottom: 20,
        }}
      />

      {/* Mensaje de error */}
      {estado.tipo === 'error' ? (
        <div
          style={{
            background: 'var(--warn)',
            color: '#fff',
            padding: 12,
            borderRadius: 6,
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          {estado.mensaje}
        </div>
      ) : null}

      {/* Botones */}
      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onCancelar}
          disabled={emitiendo}
          style={{
            padding: '10px 20px',
            background: 'transparent',
            color: 'var(--text)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            cursor: emitiendo ? 'not-allowed' : 'pointer',
            fontSize: 14,
          }}
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onEmitir}
          disabled={emitiendo}
          style={{
            padding: '10px 20px',
            background: '#B91C1C',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: emitiendo ? 'wait' : 'pointer',
            fontSize: 14,
            fontWeight: 500,
            opacity: emitiendo ? 0.7 : 1,
          }}
        >
          {emitiendo ? 'Emitiendo…' : 'Emitir Nota de Crédito'}
        </button>
      </div>
    </>
  )
}

function SuccessView({
  cae,
  numeroComprobante,
  pdfUrl,
  onClose,
}: {
  cae: string
  numeroComprobante: number
  pdfUrl?: string
  onClose: () => void
}) {
  const numFmt = String(numeroComprobante).padStart(8, '0')

  return (
    <>
      <h2 style={{ margin: 0, marginBottom: 4, fontSize: 20, fontWeight: 600 }}>
        ✓ Nota de Crédito emitida
      </h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 20, marginTop: 4 }}>
        La factura quedó anulada ante ARCA.
      </p>

      <div
        style={{
          background: 'var(--bg-sunken)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: 16,
          marginBottom: 20,
        }}
      >
        <div style={{ display: 'grid', gap: 6, fontSize: 14 }}>
          <Row label="Número NC" value={numFmt} />
          <Row label="CAE" value={cae} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
        {pdfUrl ? (
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: '10px 20px',
              background: 'transparent',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              fontSize: 14,
              textDecoration: 'none',
            }}
          >
            Ver PDF
          </a>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          style={{
            padding: '10px 20px',
            background: 'var(--accent)',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          Cerrar
        </button>
      </div>
    </>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontWeight: 500, textAlign: 'right' }}>{value}</span>
    </div>
  )
}
