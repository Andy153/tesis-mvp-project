'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { CobrosWizardOsde } from './CobrosWizardOsde'
import { CobrosWizardOsdeV2 } from './CobrosWizardOsdeV2'
import { hasActiviaIntegration } from '@/lib/feature-flags'

type WizardProps = { cirugiaId: string; onUpdate?: () => void; onCollapse?: () => void }

function WizardRouter(props: WizardProps) {
  const { userId, isLoaded } = useAuth()
  console.log('[WizardRouter] isLoaded:', isLoaded, '| userId:', userId, '| hasActivia:', userId ? hasActiviaIntegration(userId) : false)
  if (!isLoaded) return <p style={{ padding: 16, color: 'var(--text-soft)' }}>Cargando...</p>
  const Wizard = userId && hasActiviaIntegration(userId) ? CobrosWizardOsdeV2 : CobrosWizardOsde
  return <Wizard {...props} />
}

type OsdeCirugia = {
  id: string
  paciente: string | null
  afiliado: string | null
  fecha_cirugia: string | null
  monto_estimado: number | null
  wizard_paso: number
  wizard_estado: string
}

function pasoLabel(estado: string | null): string {
  switch (estado) {
    case 'en_curso': return 'En curso'
    case 'rechazado': return 'Rechazado'
    case 'cobrado': return 'Cobrado'
    case 'descartado': return 'Descartado'
    default: return 'En curso'
  }
}

export function CobrosOsdeBanner() {
  const [cirugias, setCirugias] = useState<OsdeCirugia[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const { userId } = useAuth()
  const usaActivia = userId ? hasActiviaIntegration(userId) : false

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/osde/cirugias')
      const j = await r.json()
      if (r.ok) setCirugias(j.cirugias ?? [])
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { load() }, [load])

  const activas = cirugias.filter((c) => c.wizard_estado === 'en_curso')
  if (activas.length === 0) return null

  return (
    <div style={{ marginBottom: 16 }}>
      {activas.map((cir) => (
        <div key={cir.id} className="cobros-banner">
          <div
            className="cobros-banner__head"
            onClick={() => setExpanded(expanded === cir.id ? null : cir.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setExpanded(expanded === cir.id ? null : cir.id)
              }
            }}
            role="button"
            tabIndex={0}
          >
            <div className="cobros-banner__head-inner">
              <img
                src="/osde-logo.png"
                alt="OSDE"
                className="cobros-banner__logo"
              />
              <div>
                <div className="cobros-banner__title">
                  Cobro OSDE — {cir.paciente ?? 'Cirugía'}{cir.fecha_cirugia ? ` · ${cir.fecha_cirugia}` : ''}
                </div>
                <div className="cobros-banner__meta">
                  Paso {cir.wizard_paso}/{usaActivia ? 5 : 7} · {pasoLabel(cir.wizard_estado)}
                </div>
              </div>
            </div>
            <div className="cobros-banner__actions">
              <span className="cobros-banner__badge">Acción requerida</span>
              <span className="cobros-banner__chevron" aria-hidden>
                {expanded === cir.id ? '▲' : '▼'}
              </span>
            </div>
          </div>

          {expanded === cir.id ? (
            <div className="cobros-banner__body">
              <WizardRouter
                cirugiaId={cir.id}
                onUpdate={load}
                onCollapse={() => setExpanded(null)}
              />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}
