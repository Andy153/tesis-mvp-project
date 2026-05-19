'use client'

import { useCallback, useEffect, useState } from 'react'
import { isFiscalProfileComplete } from '@/lib/profile-fiscal-ui'
import type { ProfileDB } from '@/lib/profile-db'

export type ArcaCertStatusClient = {
  hasKey: boolean
  hasCert: boolean
  ready: boolean
}

export function getFacturacionBlockedMessage(
  fiscalComplete: boolean,
  certReady: boolean,
): string | null {
  if (fiscalComplete && certReady) return null
  if (!fiscalComplete && !certReady) {
    return 'Completá tu cuenta fiscal y configurá tu certificado ARCA para poder facturar'
  }
  if (!fiscalComplete) {
    return 'Completá tu cuenta fiscal para poder facturar'
  }
  return 'Configurá tu certificado ARCA para poder facturar'
}

export function getFacturacionBlockedTitle(
  fiscalComplete: boolean,
  certReady: boolean,
): string {
  if (!fiscalComplete && !certReady) return 'Configuración incompleta'
  if (!fiscalComplete) return 'Cuenta fiscal incompleta'
  return 'Certificado ARCA pendiente'
}

export function useFiscalProfile() {
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<ProfileDB | null>(null)
  const [certStatus, setCertStatus] = useState<ArcaCertStatusClient | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [profileRes, certRes] = await Promise.all([
        fetch('/api/profile'),
        fetch('/api/profile/fiscal/cert-status'),
      ])

      if (profileRes.ok) {
        const j = await profileRes.json()
        setProfile(j.profile ?? null)
      } else {
        setProfile(null)
      }

      if (certRes.ok) {
        const j = await certRes.json()
        setCertStatus({
          hasKey: Boolean(j.hasKey),
          hasCert: Boolean(j.hasCert),
          ready: Boolean(j.ready),
        })
      } else {
        setCertStatus(null)
      }
    } catch {
      setProfile(null)
      setCertStatus(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const onRefresh = () => void load()
    window.addEventListener('traza:fiscal-profile-updated', onRefresh)
    window.addEventListener('traza:cert-status-updated', onRefresh)
    return () => {
      window.removeEventListener('traza:fiscal-profile-updated', onRefresh)
      window.removeEventListener('traza:cert-status-updated', onRefresh)
    }
  }, [load])

  const complete = isFiscalProfileComplete(profile)
  const certReady = Boolean(certStatus?.ready)
  const canFacturar = complete && certReady

  return {
    loading,
    profile,
    complete,
    certStatus,
    certReady,
    canFacturar,
    reload: load,
  }
}

export function notifyFiscalProfileUpdated() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('traza:fiscal-profile-updated'))
}

export function notifyCertStatusUpdated() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('traza:cert-status-updated'))
}
