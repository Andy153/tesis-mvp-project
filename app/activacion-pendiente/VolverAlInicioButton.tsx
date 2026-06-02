'use client';

import Link from 'next/link';
import { useClerk } from '@clerk/nextjs';

export function VolverAlInicioButton() {
  const { signOut } = useClerk();

  return (
    <Link
      href="/"
      className="btn btn-primary"
      onClick={(event) => {
        event.preventDefault();
        void signOut({ redirectUrl: '/' });
      }}
    >
      Volver al inicio
    </Link>
  );
}
