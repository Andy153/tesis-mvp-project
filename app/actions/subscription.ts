'use server'

// Server action wrapper; la lógica vive en lib/subscription.ts (middleware + actions).

export {
  checkSubscriptionStatus,
  type SubscriptionCheckResult,
} from '@/lib/subscription'
