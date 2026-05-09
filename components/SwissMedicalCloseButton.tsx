'use client'

import { useEffect, useState } from 'react'

type PeriodInfo = {
  periodo: string
  cantidad_pendientes: number
  ya_enviado: boolean
  enviado_en: string | null
  status_envio: string | null
}

type Feedback =
  | { kind: 'success'; message: string; submissionId?: string }
  | { kind: 'warning'; message: string }
  | { kind: 'error'; message: string }
  | null

function periodoLabel(p: string): string {
  const [y, m] = p.split('-').map((n) => parseInt(n, 10))
  if (!y || !m) return p
  const meses = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ]
  return `${meses[m - 1]} ${y}`
}

export function SwissMedicalCloseButton({ onSent }: { onSent?: () => void }) {
  const [periods, setPeriods] = useState<PeriodInfo[]>([])
  const [loadingPeriods, setLoadingPeriods] = useState(true)
  const [selected, setSelected] = useState<string>('')
  const [sending, setSending] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)

  const loadPeriods = async () => {
    setLoadingPeriods(true)
    try {
      const r = await fetch('/api/submissions/swiss-medical/periods')
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Error cargando períodos')
      const list: PeriodInfo[] = j.periods ?? []
      setPeriods(list)
      const firstSendable = list.find((p) => !p.ya_enviado && p.cantidad_pendientes > 0)
      if (firstSendable) setSelected(firstSendable.periodo)
      else if (list[0]) setSelected(list[0].periodo)
    } catch (e: any) {
      setFeedback({ kind: 'error', message: e.message ?? 'Error cargando períodos' })
    } finally {
      setLoadingPeriods(false)
    }
  }

  useEffect(() => {
    loadPeriods()
  }, [])

  const selectedInfo = periods.find((p) => p.periodo === selected)
  const canSend =
    !!selectedInfo &&
    !selectedInfo.ya_enviado &&
    selectedInfo.cantidad_pendientes > 0 &&
    !sending

  const handleSend = async () => {
    if (!selected) return
    const info = periods.find((p) => p.periodo === selected)
    const ok = window.confirm(
      `Vas a cerrar el período ${periodoLabel(selected)} y enviar ${info?.cantidad_pendientes ?? 0} parte(s) por mail a Swiss Medical, junto con la planilla generada.\n\nEsta acción no se puede deshacer.\n\n¿Confirmar envío?`,
    )
    if (!ok) return

    console.log('[Trazá UI] iniciando envío para periodo', selected)
    setSending(true)
    setFeedback(null)
    try {
      const r = await fetch('/api/submissions/swiss-medical/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodo: selected }),
      })
      const j = await r.json()
      console.log('[Trazá UI] respuesta /send', r.status, j)

      if (r.status === 200 && j.ok) {
        const sinPdf = j.partes_sin_pdf?.length ?? 0
        const msg =
          sinPdf > 0
            ? `Liquidación enviada (${j.cantidad_partes} partes). ⚠️ ${sinPdf} parte(s) sin PDF adjunto.`
            : `Liquidación enviada exitosamente: ${j.cantidad_partes} parte(s) y planilla adjunta.`
        setFeedback({ kind: 'success', message: msg, submissionId: j.submission_id })
        await loadPeriods()
        onSent?.()
      } else if (r.status === 409) {
        setFeedback({
          kind: 'warning',
          message: j.error ?? 'Este período ya tiene un envío en curso o completado.',
        })
        await loadPeriods()
      } else {
        setFeedback({ kind: 'error', message: j.error ?? `Error ${r.status}` })
        await loadPeriods()
      }
    } catch (e: any) {
      console.error('[Trazá UI] error en handleSend', e)
      setFeedback({ kind: 'error', message: e.message ?? 'Error de red' })
    } finally {
      setSending(false)
    }
  }

  const feedbackBg =
    feedback?.kind === 'success'
      ? '#e6f4ec'
      : feedback?.kind === 'warning'
        ? '#fff4d6'
        : '#fde2e2'
  const feedbackBorder =
    feedback?.kind === 'success'
      ? '#7bc398'
      : feedback?.kind === 'warning'
        ? '#e0b94a'
        : '#e07b7b'
  const feedbackColor =
    feedback?.kind === 'success'
      ? '#0f5132'
      : feedback?.kind === 'warning'
        ? '#7a5a00'
        : '#842029'

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          disabled={loadingPeriods || sending || periods.length === 0}
          style={{
            height: 36,
            padding: '0 12px',
            borderRadius: 8,
            border: '1px solid var(--border, #d0d7d2)',
            background: 'white',
            fontSize: 14,
            minWidth: 240,
          }}
        >
          {loadingPeriods && <option>Cargando períodos...</option>}
          {!loadingPeriods && periods.length === 0 && (
            <option value="">No hay períodos disponibles</option>
          )}
          {!loadingPeriods &&
            periods.map((p) => (
              <option key={p.periodo} value={p.periodo}>
                {periodoLabel(p.periodo)}
                {p.ya_enviado
                  ? ' — ya enviado'
                  : p.cantidad_pendientes === 0
                    ? ' — sin pendientes'
                    : ` — ${p.cantidad_pendientes} parte(s) Swiss`}
              </option>
            ))}
        </select>

        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            console.log('[Trazá UI] click en Cerrar y enviar', { selected, canSend })
            handleSend()
          }}
          disabled={!canSend}
        >
          {sending ? 'Enviando...' : 'Cerrar y enviar mes a Swiss Medical'}
        </button>

        {selectedInfo?.ya_enviado && selectedInfo.enviado_en && (
          <span style={{ fontSize: 12, color: 'var(--text-soft, #6b7280)' }}>
            Enviado el {new Date(selectedInfo.enviado_en).toLocaleString('es-AR')}
          </span>
        )}
      </div>

      {feedback && (
        <div
          style={{
            marginTop: 12,
            padding: '10px 14px',
            borderRadius: 8,
            border: `1px solid ${feedbackBorder}`,
            background: feedbackBg,
            color: feedbackColor,
            fontSize: 14,
          }}
        >
          <div>{feedback.message}</div>
          {feedback.kind === 'success' &&
            'submissionId' in feedback &&
            feedback.submissionId && (
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                ID: {feedback.submissionId}
              </div>
            )}
        </div>
      )}
    </div>
  )
}

