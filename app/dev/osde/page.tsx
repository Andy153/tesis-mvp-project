'use client'

import { useState } from 'react'
import { CobrosWizardOsde } from '@/components/CobrosWizardOsde'

export default function DevOsdePage() {
  const [id, setId] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const crear = async () => {
    setCreating(true)
    setError('')
    try {
      const r = await fetch('/api/osde/cirugias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paciente: 'Juan Pérez',
          afiliado: '60671956201',
          fecha_cirugia: '2026-05-20',
          monto_estimado: 180000,
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'Error al crear')
      setId(j.id)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div style={{ maxWidth: 560, margin: '40px auto', padding: '0 16px' }}>
      <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>
        Dev — Wizard OSDE
      </h1>
      {error && (
        <div style={{ padding: 8, marginBottom: 12, border: '1px solid red', borderRadius: 6, color: 'red', fontSize: 13 }}>
          {error}
        </div>
      )}
      {!id ? (
        <button className="btn btn-primary" onClick={crear} disabled={creating}>
          {creating ? 'Creando...' : 'Crear cirugía de prueba'}
        </button>
      ) : (
        <CobrosWizardOsde cirugiaId={id} />
      )}
    </div>
  )
}
