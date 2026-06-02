import { auth, clerkClient } from '@clerk/nextjs/server'
import { Resend } from 'resend'
import { Clock } from 'lucide-react'
import { Logo } from '@/components/Logo'
import { MAIL_FROM } from '@/lib/swissCxSend'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { VolverAlInicioButton } from './VolverAlInicioButton'
import styles from './activacion-pendiente.module.css'

const CONTACT_EMAIL = 'soporte@traza.app'
const TEAM_NOTIFY_EMAIL = 'tesisgrupo2026@gmail.com'

export const metadata = {
  title: 'Activación pendiente — Trazá',
  description:
    'Tu cuenta está siendo activada. Te contactaremos para coordinar el acceso.',
}

async function notifyTeamIfNewPendingUser(userId: string) {
  try {
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('clerk_user_id')
      .eq('clerk_user_id', userId)
      .maybeSingle()

    if (existingProfile) return

    const client = await clerkClient()
    const user = await client.users.getUser(userId)
    const emailAddress =
      user.emailAddresses.find((entry) => entry.id === user.primaryEmailAddressId)
        ?.emailAddress ??
      user.emailAddresses[0]?.emailAddress ??
      ''
    const firstName = user.firstName ?? ''
    const lastName = user.lastName ?? ''

    const resendApiKey = process.env.RESEND_API_KEY?.trim()
    if (!resendApiKey) return

    const resend = new Resend(resendApiKey)
    const sendResult = await resend.emails.send({
      from: MAIL_FROM,
      to: [TEAM_NOTIFY_EMAIL],
      subject: 'Nuevo usuario en Trazá — activación pendiente',
      text: `Un nuevo usuario se registró y está esperando activación.

Nombre: ${firstName} ${lastName}
Email: ${emailAddress}
Clerk ID: ${userId}

Para activar su cuenta ejecutá en Supabase:

INSERT INTO profiles (clerk_user_id, subscription_status)
VALUES ('${userId}', 'active')
ON CONFLICT (clerk_user_id)
DO UPDATE SET subscription_status = 'active';`,
    })

    if (sendResult.error) return
  } catch {
    // fail silent
  }
}

export default async function ActivacionPendientePage() {
  const { userId } = await auth()

  if (userId) {
    await notifyTeamIfNewPendingUser(userId)
  }

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.logoWrap}>
          <Logo size={48} variant="dark" />
        </div>

        <Clock className={styles.icon} aria-hidden />

        <h1 className={styles.title}>Tu cuenta está siendo activada</h1>

        <p className={styles.body}>
          En breve te contactaremos para coordinar el acceso. Una vez activada tu
          cuenta vas a recibir un mail de confirmación.
        </p>

        <div className={styles.actions}>
          <VolverAlInicioButton />
        </div>

        <p className={styles.footer}>
          ¿Dudas? Escribinos a{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
      </main>
    </div>
  )
}
