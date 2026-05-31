import { clerkClient } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import type { UserMetadata } from '@/lib/roles'

export type SubscriptionCheckResult = {
  allowed: boolean
  status: string
  trialEndsAt: Date | null
}

type ClerkPublicMetadata = UserMetadata & {
  medicoClerkId?: string
}

const denied: SubscriptionCheckResult = {
  allowed: false,
  status: 'inactive',
  trialEndsAt: null,
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

async function resolveSubscriptionClerkId(
  clerkId: string,
): Promise<string | null> {
  const client = await clerkClient()
  const user = await client.users.getUser(clerkId)
  const metadata = (user.publicMetadata ?? {}) as ClerkPublicMetadata

  if (metadata.rol === 'medico') return clerkId

  if (metadata.rol === 'secretaria') {
    const medicoClerkId = metadata.medicoClerkId?.trim()
    return medicoClerkId || null
  }

  return null
}

async function checkProfileSubscription(
  profileClerkId: string,
): Promise<SubscriptionCheckResult> {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('subscription_status, trial_ends_at')
    .eq('clerk_user_id', profileClerkId)
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

export async function checkSubscriptionStatus(
  clerkId: string,
): Promise<SubscriptionCheckResult> {
  if (!clerkId.trim()) return denied

  const profileClerkId = await resolveSubscriptionClerkId(clerkId)
  if (!profileClerkId) return denied

  return checkProfileSubscription(profileClerkId)
}
