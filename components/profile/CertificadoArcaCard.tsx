'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { isFiscalProfileComplete } from '@/lib/profile-fiscal-ui'
import { notifyCertStatusUpdated } from '@/lib/use-fiscal-profile'
import type { ProfileDB } from '@/lib/profile-db'

type CertStatus = {
  hasKey: boolean
  hasCert: boolean
  ready: boolean
}

type CertificadoArcaCardProps = {
  dbProfile: ProfileDB | null
  profileLoading: boolean
}

function certBadgeLabel(status: CertStatus | null): string {
  if (!status) return '—'
  if (status.hasKey && status.hasCert) return 'Listo para facturar'
  if (status.hasKey) return 'Falta certificado'
  return 'No configurado'
}

function certBadgeClass(status: CertStatus | null): string {
  if (!status) return 'profile-fiscal-status'
  if (status.hasKey && status.hasCert) {
    return 'profile-fiscal-status profile-fiscal-status--ok profile-fiscal-status--prominent'
  }
  if (status.hasKey) return 'profile-fiscal-status profile-fiscal-status--warn'
  return 'profile-fiscal-status profile-fiscal-status--pending'
}

function formatCertUploadedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString('es-AR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {
    return ''
  }
}

export function CertificadoArcaCard({ dbProfile, profileLoading }: CertificadoArcaCardProps) {
  const fiscalComplete = isFiscalProfileComplete(dbProfile)

  const [certStatus, setCertStatus] = useState<CertStatus | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [csrPem, setCsrPem] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copyOk, setCopyOk] = useState(false)
  const [certFile, setCertFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadSuccess, setUploadSuccess] = useState(false)
  const [certUploadedAt, setCertUploadedAt] = useState<string | null>(null)
  const certInputRef = useRef<HTMLInputElement>(null)

  const certReady = Boolean(certStatus?.hasKey && certStatus?.hasCert)

  const loadCertStatus = useCallback(async () => {
    setStatusLoading(true)
    try {
      const r = await fetch('/api/profile/fiscal/cert-status')
      if (!r.ok) {
        setCertStatus(null)
        return
      }
      const j = await r.json()
      setCertStatus({
        hasKey: Boolean(j.hasKey),
        hasCert: Boolean(j.hasCert),
        ready: Boolean(j.ready),
      })
    } catch {
      setCertStatus(null)
    } finally {
      setStatusLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!fiscalComplete) {
      setStatusLoading(false)
      return
    }
    void loadCertStatus()
  }, [fiscalComplete, loadCertStatus])

  useEffect(() => {
    const onRefresh = () => void loadCertStatus()
    window.addEventListener('traza:fiscal-profile-updated', onRefresh)
    return () => window.removeEventListener('traza:fiscal-profile-updated', onRefresh)
  }, [loadCertStatus])

  async function generateCsr(force: boolean) {
    setGenerating(true)
    setError(null)
    setCopyOk(false)
    try {
      const r = await fetch('/api/profile/fiscal/generate-csr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      })
      const j = await r.json()
      if (!r.ok) {
        setError(j.error ?? 'No se pudo generar el CSR.')
        return
      }
      setCsrPem(j.csr ?? null)
      if (j.certStatus) {
        setCertStatus({
          hasKey: Boolean(j.certStatus.hasKey),
          hasCert: Boolean(j.certStatus.hasCert),
          ready: Boolean(j.certStatus.hasKey && j.certStatus.hasCert),
        })
      } else {
        await loadCertStatus()
      }
    } catch {
      setError('Error de conexión al generar el CSR.')
    } finally {
      setGenerating(false)
    }
  }

  function handleGenerarCsr() {
    if (!fiscalComplete) return

    if (certStatus?.hasKey) {
      const ok = window.confirm(
        'Ya tenés una clave privada guardada. Si generás un CSR nuevo, la clave anterior dejará de servir y el certificado que tengas en ARCA quedará invalidado.\n\n¿Querés regenerar la clave y el CSR?',
      )
      if (!ok) return
      void generateCsr(true)
      return
    }

    void generateCsr(false)
  }

  async function handleCopy() {
    if (!csrPem) return
    try {
      await navigator.clipboard.writeText(csrPem)
      setCopyOk(true)
      setTimeout(() => setCopyOk(false), 3000)
    } catch {
      setError('No se pudo copiar al portapapeles.')
    }
  }

  function handleDownload() {
    if (!csrPem) return
    const blob = new Blob([csrPem], { type: 'application/x-pem-file' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'solicitud_arca.csr'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  async function uploadCert(force: boolean) {
    if (!certFile) return
    setUploading(true)
    setUploadError(null)
    setUploadSuccess(false)
    try {
      const fd = new FormData()
      fd.append('file', certFile)
      if (force) fd.append('force', 'true')

      const r = await fetch('/api/profile/fiscal/upload-cert', {
        method: 'POST',
        body: fd,
      })
      const j = await r.json()
      if (!r.ok) {
        setUploadError(j.error ?? 'No se pudo subir el certificado.')
        return
      }
      if (j.certStatus) {
        setCertStatus({
          hasKey: Boolean(j.certStatus.hasKey),
          hasCert: Boolean(j.certStatus.hasCert),
          ready: Boolean(j.certStatus.ready),
        })
      } else {
        await loadCertStatus()
      }
      setUploadSuccess(true)
      setCertUploadedAt(new Date().toISOString())
      setCertFile(null)
      if (certInputRef.current) certInputRef.current.value = ''
      notifyCertStatusUpdated()
    } catch {
      setUploadError('Error de conexión al subir el certificado.')
    } finally {
      setUploading(false)
    }
  }

  function handleUploadCert() {
    if (!certFile || !certStatus?.hasKey) return
    if (certStatus.hasCert) {
      const ok = window.confirm(
        'Ya tenés un certificado guardado. Si subís otro, reemplazará al anterior. El certificado debe corresponder a la misma clave privada que generaste con Trazá.\n\n¿Continuar?',
      )
      if (!ok) return
      void uploadCert(true)
      return
    }
    void uploadCert(false)
  }

  const disabled = profileLoading || statusLoading || !fiscalComplete || generating
  const uploadDisabled =
    profileLoading || statusLoading || !fiscalComplete || uploading || !certStatus?.hasKey

  const certUploadedLabel = certUploadedAt ? formatCertUploadedAt(certUploadedAt) : null

  return (
    <div
      className={`panel profile-fiscal-card${certReady ? ' profile-fiscal-card--cert-ready' : ''}`}
      style={{ padding: 16, marginTop: 14 }}
    >
      <div className="profile-fiscal-card__head">
        <div>
          <div style={{ fontWeight: 800, fontSize: '1.05rem' }}>Certificado ARCA</div>
          <p className="field-hint" style={{ marginTop: 4, marginBottom: 0 }}>
            Clave privada en Trazá y certificado emitido por ARCA para facturar.
          </p>
        </div>
        {!profileLoading && fiscalComplete && !statusLoading && (
          <span className={certBadgeClass(certStatus)}>{certBadgeLabel(certStatus)}</span>
        )}
      </div>

      {!fiscalComplete && !profileLoading && (
        <div
          className="profile-fiscal-alert profile-fiscal-alert--warn"
          style={{ marginTop: 12 }}
          role="status"
        >
          Completá tu cuenta fiscal primero para poder generar el CSR.
        </div>
      )}

      {fiscalComplete && certReady && (
        <div className="profile-cert-ready-banner" role="status">
          <p className="profile-cert-ready-banner__title">✓ Certificado subido correctamente</p>
          {certUploadedLabel ? (
            <p className="profile-cert-ready-banner__meta">Guardado el {certUploadedLabel}</p>
          ) : (
            <p className="profile-cert-ready-banner__meta">Activo en tu cuenta de Trazá</p>
          )}
          <p className="profile-cert-ready-banner__hint">
            Tu certificado ARCA está activo en Trazá. Ya podés emitir facturas desde el centro de
            cobros.
          </p>
        </div>
      )}

      {fiscalComplete && certStatus?.hasKey && !certStatus.hasCert && (
        <div className="profile-fiscal-banner" style={{ marginTop: 12 }} role="note">
          <strong style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>
            Clave privada guardada
          </strong>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--text-muted)' }}>
            Subí el certificado que te devuelva ARCA en la sección de abajo. Si regenerás el CSR,
            la clave anterior deja de servir.
          </p>
        </div>
      )}

      {fiscalComplete && (
        <>
          {statusLoading ? (
            <p className="field-hint" style={{ marginTop: 14 }}>
              Verificando certificados…
            </p>
          ) : (
            <ul className="profile-cert-status-list" style={{ marginTop: 14 }}>
              <li className={certStatus?.hasKey ? 'profile-cert-status-list__item--ok' : undefined}>
                <span>Clave privada</span>
                <span>{certStatus?.hasKey ? 'Guardada en Trazá ✓' : '— Pendiente'}</span>
              </li>
              <li className={certStatus?.hasCert ? 'profile-cert-status-list__item--ok' : undefined}>
                <span>Certificado ARCA</span>
                <span>{certStatus?.hasCert ? 'Certificado ARCA ✓' : '— Pendiente'}</span>
              </li>
            </ul>
          )}

          <div className="profile-fiscal-form__actions" style={{ marginTop: 12, borderTop: 'none', paddingTop: 0 }}>
            <button
              type="button"
              className={certReady ? 'btn btn-ghost' : 'btn btn-primary'}
              disabled={disabled}
              onClick={handleGenerarCsr}
            >
              {generating ? 'Generando CSR…' : certStatus?.hasKey ? 'Regenerar CSR' : 'Generar CSR'}
            </button>
          </div>

          {!certReady && (
            <p className="field-hint" style={{ marginTop: 8 }}>
              La clave privada se guarda automáticamente en Trazá. Solo necesitás copiar el CSR al
              portal de ARCA.
            </p>
          )}

          {certStatus?.hasKey && (
            <section className="profile-fiscal-form__section" style={{ marginTop: 16 }}>
              {certReady ? (
                <>
                  <h3 className="profile-fiscal-form__section-title">Certificado ARCA</h3>
                  <p className="field-hint" style={{ marginBottom: 0 }}>
                    Configuración completa. Solo necesitás volver a subir un archivo si ARCA te
                    emitió un certificado nuevo.
                  </p>
                  {uploadSuccess && (
                    <div
                      className="profile-fiscal-alert profile-fiscal-alert--ok"
                      style={{ marginTop: 12 }}
                      role="status"
                    >
                      Certificado actualizado correctamente.
                    </div>
                  )}
                  <details className="profile-cert-replace">
                    <summary>Reemplazar certificado</summary>
                    <div className="profile-cert-replace__body">
                      <p className="field-hint" style={{ marginBottom: 10 }}>
                        El archivo debe corresponder a la misma clave privada que generaste con
                        Trazá (.crt, .pem o .cer).
                      </p>
                      <input
                        ref={certInputRef}
                        type="file"
                        accept=".crt,.pem,.cer"
                        className="profile-fiscal-input"
                        style={{ maxHeight: 'none', padding: '8px 12px' }}
                        disabled={uploadDisabled}
                        onChange={(e) => {
                          setCertFile(e.target.files?.[0] ?? null)
                          setUploadError(null)
                          setUploadSuccess(false)
                        }}
                      />
                      <div
                        className="profile-fiscal-form__actions"
                        style={{ marginTop: 10, borderTop: 'none', paddingTop: 0 }}
                      >
                        <button
                          type="button"
                          className="btn btn-ghost"
                          disabled={uploadDisabled || !certFile || uploading}
                          onClick={handleUploadCert}
                        >
                          {uploading ? 'Validando y subiendo…' : 'Subir nuevo certificado'}
                        </button>
                      </div>
                    </div>
                  </details>
                </>
              ) : (
                <>
                  <h3 className="profile-fiscal-form__section-title">Subir certificado</h3>
                  <p className="field-hint" style={{ marginBottom: 10 }}>
                    Subí el archivo .crt, .pem o .cer que te entregó ARCA. Trazá verifica que
                    coincida con tu clave privada antes de guardarlo.
                  </p>
                  <input
                    ref={certInputRef}
                    type="file"
                    accept=".crt,.pem,.cer"
                    className="profile-fiscal-input"
                    style={{ maxHeight: 'none', padding: '8px 12px' }}
                    disabled={uploadDisabled}
                    onChange={(e) => {
                      setCertFile(e.target.files?.[0] ?? null)
                      setUploadError(null)
                      setUploadSuccess(false)
                    }}
                  />
                  <div
                    className="profile-fiscal-form__actions"
                    style={{ marginTop: 10, borderTop: 'none', paddingTop: 0 }}
                  >
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={uploadDisabled || !certFile}
                      onClick={handleUploadCert}
                    >
                      {uploading ? 'Validando y subiendo…' : 'Subir certificado'}
                    </button>
                  </div>
                  {uploadSuccess && (
                    <div
                      className="profile-fiscal-alert profile-fiscal-alert--ok"
                      style={{ marginTop: 12 }}
                      role="status"
                    >
                      Certificado guardado. Ya podés facturar desde el centro de cobros.
                    </div>
                  )}
                </>
              )}
              {uploadError && (
                <div className="profile-fiscal-alert profile-fiscal-alert--error" style={{ marginTop: 12 }} role="alert">
                  {uploadError}
                </div>
              )}
            </section>
          )}

          {csrPem && (
            <div className="profile-csr-output" style={{ marginTop: 16 }}>
              <p className="field-hint" style={{ marginBottom: 8 }}>
                Copiá este CSR y pegalo en el portal de ARCA para obtener tu certificado.
              </p>
              <textarea
                className="profile-csr-textarea"
                readOnly
                value={csrPem}
                rows={10}
                aria-label="CSR generado"
              />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                <button type="button" className="btn" onClick={handleCopy} disabled={!csrPem}>
                  {copyOk ? '✓ Copiado' : 'Copiar CSR'}
                </button>
                <button type="button" className="btn btn-ghost" onClick={handleDownload}>
                  Descargar .csr
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="profile-fiscal-alert profile-fiscal-alert--error" style={{ marginTop: 12 }} role="alert">
              {error}
            </div>
          )}
        </>
      )}
    </div>
  )
}

