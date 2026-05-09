'use client';

import type { CSSProperties } from 'react';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { SignUp } from '@clerk/nextjs';
import { validateInvitationToken } from '@/app/actions/invitations';

type ValidateResult = Awaited<ReturnType<typeof validateInvitationToken>>;

function isValidateSuccess(
  r: ValidateResult,
): r is { success: true; data: { medicoClerkId: string } } {
  return r.success === true;
}

function SecretariaSignUpInner() {
  const searchParams = useSearchParams();
  const [phase, setPhase] = useState<'loading' | 'error' | 'form'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const raw = searchParams.get('token');
    const t = raw?.trim() ?? '';

    if (!t) {
      setErrorMessage(
        'Este link no incluye un token de invitación. Pedile al médico que te envíe el link completo.',
      );
      setPhase('error');
      return;
    }

    let cancelled = false;
    (async () => {
      setPhase('loading');
      setErrorMessage(null);
      const res = await validateInvitationToken(t);
      if (cancelled) return;
      if (isValidateSuccess(res)) {
        setToken(t);
        setPhase('form');
      } else {
        setErrorMessage(res.error);
        setPhase('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  const shellStyle: CSSProperties = {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'var(--bg)',
    padding: '24px',
  };

  const cardStyle: CSSProperties = {
    width: '100%',
    maxWidth: 440,
    padding: 28,
    backgroundColor: 'var(--bg-panel)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
  };

  if (phase === 'loading') {
    return (
      <div style={shellStyle}>
        <div style={cardStyle}>
          <p
            style={{
              margin: 0,
              fontSize: 15,
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-display)',
            }}
          >
            Validando invitación…
          </p>
        </div>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div style={shellStyle}>
        <div style={cardStyle}>
          <h1
            style={{
              margin: 0,
              marginBottom: 10,
              fontSize: 22,
              fontWeight: 700,
              fontFamily: 'var(--font-title)',
              color: 'var(--text)',
              letterSpacing: '0.02em',
            }}
          >
            No pudimos validar la invitación
          </h1>
          <p
            style={{
              margin: 0,
              marginBottom: 20,
              fontSize: 14,
              lineHeight: 1.5,
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-display)',
            }}
          >
            {errorMessage ??
              'El link puede haber expirado, haber sido usado o no ser válido.'}
          </p>
          <Link
            href="/sign-in"
            style={{
              display: 'inline-block',
              fontSize: 14,
              padding: '10px 18px',
              backgroundColor: 'var(--accent)',
              color: '#fff',
              borderRadius: 6,
              textDecoration: 'none',
              fontWeight: 600,
              fontFamily: 'var(--font-display)',
            }}
          >
            Ir al inicio de sesión
          </Link>
        </div>
      </div>
    );
  }

  const fallbackRedirectUrl = `/sign-up/secretaria/completar?token=${encodeURIComponent(token ?? '')}`;

  return (
    <div style={shellStyle}>
      <div
        style={{
          width: '100%',
          maxWidth: 480,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          gap: 20,
        }}
      >
        <header style={{ textAlign: 'center', padding: '0 8px' }}>
          <h1
            style={{
              margin: 0,
              marginBottom: 8,
              fontSize: 24,
              fontWeight: 700,
              fontFamily: 'var(--font-title)',
              color: 'var(--text)',
              letterSpacing: '0.02em',
            }}
          >
            Crear cuenta como secretaria
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: 14,
              lineHeight: 1.5,
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-display)',
            }}
          >
            Fuiste invitada por un médico. Completá tu registro para acceder.
          </p>
        </header>
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            width: '100%',
          }}
        >
          <SignUp
            routing="hash"
            signInUrl="/sign-in"
            fallbackRedirectUrl={fallbackRedirectUrl}
          />
        </div>
      </div>
    </div>
  );
}

function SecretariaSignUpFallback() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--bg)',
        padding: '24px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 440,
          padding: 28,
          backgroundColor: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 15,
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-display)',
          }}
        >
          Cargando…
        </p>
      </div>
    </div>
  );
}

export default function SecretariaSignUpPage() {
  return (
    <Suspense fallback={<SecretariaSignUpFallback />}>
      <SecretariaSignUpInner />
    </Suspense>
  );
}
