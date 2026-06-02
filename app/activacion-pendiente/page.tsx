import { Clock } from 'lucide-react'
import { Logo } from '@/components/Logo'
import { VolverAlInicioButton } from './VolverAlInicioButton'
import styles from './activacion-pendiente.module.css'

const CONTACT_EMAIL = 'soporte@traza.app'

export const metadata = {
  title: 'Activación pendiente — Trazá',
  description:
    'Tu cuenta está siendo activada. Te contactaremos para coordinar el acceso.',
}

export default function ActivacionPendientePage() {
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
