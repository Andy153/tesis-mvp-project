'use client'

import { useClerk } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'

export function VolverAlInicioButton() {
  const { signOut } = useClerk()
  const router = useRouter()

  const handleClick = async () => {
    await signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <button onClick={handleClick} className="btn btn-primary">
      Volver al inicio
    </button>
  )
}
