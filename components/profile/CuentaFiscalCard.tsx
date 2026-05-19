'use client'

import { FormCuentaFiscal } from '@/components/profile/FormCuentaFiscal'
import { buildCuentaFiscalInitial, isFiscalProfileComplete } from '@/lib/profile-fiscal-ui'
import type { ProfileDB } from '@/lib/profile-db'

type CuentaFiscalCardProps = {
  dbProfile: ProfileDB | null
  loading: boolean
  onSaved?: () => void
}

export function CuentaFiscalCard({ dbProfile, loading, onSaved }: CuentaFiscalCardProps) {
  const initial = buildCuentaFiscalInitial(dbProfile)
  const complete = isFiscalProfileComplete(dbProfile)

  return (
    <div className="panel profile-fiscal-card" style={{ padding: 16, marginTop: 14 }}>
      <div className="profile-fiscal-card__head">
        <div>
          <div style={{ fontWeight: 800, fontSize: '1.05rem' }}>Cuenta fiscal</div>
          <p className="field-hint" style={{ marginTop: 4, marginBottom: 0 }}>
            Requerida para emitir facturas electrónicas con ARCA/AFIP.
          </p>
        </div>
        {!loading && (
          <span
            className={`profile-fiscal-status${complete ? ' profile-fiscal-status--ok' : ' profile-fiscal-status--pending'}`}
          >
            {complete ? 'Completa' : 'Incompleta'}
          </span>
        )}
      </div>

      <div className="profile-fiscal-banner" role="note">
        <strong style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>Información crítica</strong>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--text-muted)' }}>
          Verificá CUIT, razón social y punto de venta antes de guardar. El CUIT queda fijo después del
          primer guardado. Sin estos datos no podés facturar en Trazá.
        </p>
      </div>

      {loading ? (
        <p className="field-hint" style={{ marginTop: 14 }}>
          Cargando datos fiscales…
        </p>
      ) : (
        <FormCuentaFiscal key={JSON.stringify(initial)} initial={initial} onSaved={onSaved} />
      )}
    </div>
  )
}
