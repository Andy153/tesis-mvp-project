'use server'

// Uso previsto: middleware de suscripción (Fase 5). No integrar en UI hasta entonces.

import { supabaseAdmin } from '@/lib/supabase-admin'

export type SubscriptionCheckResult = {
  allowed: boolean
  status: string
  trialEndsAt: Date | null
}

function isTrialStillActive(trialEndsAt: Date | null): boolean {
  if (!trialEndsAt) return true
  return trialEndsAt.getTime() > Date.now()
}

function isAllowedStatus(
  status: string,
  trialEndsAt: Date | null,
): boolean {
  if (status === 'exempt' || status === 'active') return true
  if (status === 'trialing') return isTrialStillActive(trialEndsAt)
  return false
}

export async function checkSubscriptionStatus(
  clerkId: string,
): Promise<SubscriptionCheckResult> {
  const denied: SubscriptionCheckResult = {
    allowed: false,
    status: 'inactive',
    trialEndsAt: null,
  }

  if (!clerkId.trim()) return denied

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('subscription_status, trial_ends_at')
    .eq('clerk_user_id', clerkId)
    .maybeSingle()

  if (error || !data) return denied

  const status = String(data.subscription_status ?? 'inactive')
  const trialEndsAt = data.trial_ends_at
    ? new Date(data.trial_ends_at)
    : null

  return {
    allowed: isAllowedStatus(status, trialEndsAt),
    status,
    trialEndsAt,
  }
}
