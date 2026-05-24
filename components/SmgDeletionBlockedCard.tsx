'use client'

import { Icon } from './Icon'

type Props = {
  message: string
  onClose: () => void
  onForceDelete?: () => void
  forceDeleting?: boolean
}

export function SmgDeletionBlockedCard({ message, onClose, onForceDelete, forceDeleting }: Props) {
  return (
    <div
      className="modal-overlay smg-deletion-modal"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="modal-card" style={{ maxWidth: 480 }}>
        <div className="modal-head">
          <div style={{ fontWeight: 800, fontSize: '1.05rem' }}>Proceso con Swiss Medical</div>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onClose} aria-label="Cerrar">
            <Icon name="x" size={14} />
          </button>
        </div>
        <div className="modal-body">
          <p style={{ color: 'var(--text-muted)', fontSize: 15, lineHeight: 1.55, margin: 0 }}>{message}</p>
          <div
            style={{
              marginTop: 18,
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <button type="button" className="btn" onClick={onClose} disabled={forceDeleting}>
              Volver
            </button>
            {onForceDelete && (
              <button
                type="button"
                className="btn btn-danger"
                disabled={forceDeleting}
                onClick={() => {
                  if (
                    window.confirm(
                      '¿Sacar este documento de Trazá igualmente? Solo se elimina en tu cuenta; si ya fue enviado por mail a Swiss Medical, contactalos por separado.',
                    )
                  ) {
                    onForceDelete()
                  }
                }}
              >
                {forceDeleting ? 'Eliminando…' : 'Sacar de Trazá igualmente'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
