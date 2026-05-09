'use client';

import type { CSSProperties } from 'react';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { markInvitationAsUsed } from '@/app/actions/invitations';
import { assignSecretariaRole } from '@/app/actions/assign-secretaria-role';

type MarkResult = Awaited<ReturnType<typeof markInvitationAsUsed>>;

function isMarkSuccess(
  r: MarkResult,
): r is { success: true; data: { medicoClerkId: string } } {
  return r.success === true;
}

function CompletarSecretariaInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoaded, isSignedIn } = useUser();

  const [phase, setPhase] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const hasRun = useRef(false);
  const redirectTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    if (hasRun.current) return;

    const token = searchParams.get('token')?.trim() ?? '';
    if (!token) {
      hasRun.current = true;
      setErrorMessage(
        'Falta el token de invitación en la URL. Pedile al médico que te envíe el link completo.',
      );
      setPhase('error');
      return;
    }

    if (!isSignedIn || !user) {
      hasRun.current = true;
      setErrorMessage(
        'No detectamos tu sesión. Volvé al link de invitación e intentá registrarte de nuevo.',
      );
      setPhase('error');
      return;
    }

    hasRun.current = true;

    let cancelled = false;
    (async () => {
      try {
        const markRes = await markInvitationAsUsed(token, user.id);
        if (cancelled) return;
        if (!isMarkSuccess(markRes)) {
          setErrorMessage(markRes.error);
          setPhase('error');
          return;
        }

        const roleRes = await assignSecretariaRole(
          user.id,
          markRes.data.medicoClerkId,
        );
        if (cancelled) return;
        if (!roleRes.success) {
          setErrorMessage(
            roleRes.error ?? 'No pudimos asignar el rol de secretaria.',
          );
          setPhase('error');
          return;
        }

        try {
          await user.reload();
        } catch {
          // No es crítico: el JWT se refresca igualmente en el próximo render del root.
        }

        if (cancelled) return;
        setPhase('success');

        redirectTimer.current = window.setTimeout(() => {
          router.push('/');
        }, 3000);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : 'Error inesperado.';
        setErrorMessage(msg);
        setPhase('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, user, searchParams, router]);

  useEffect(() => {
    return () => {
      if (redirectTimer.current !== null) {
        window.clearTimeout(redirectTimer.current);
      }
    };
  }, []);

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

  const titleStyle: CSSProperties = {
    margin: 0,
    marginBottom: 10,
    fontSize: 22,
    fontWeight: 700,
    fontFamily: 'var(--font-title)',
    color: 'var(--text)',
    letterSpacing: '0.02em',
  };

  const bodyStyle: CSSProperties = {
    margin: 0,
    marginBottom: 20,
    fontSize: 14,
    lineHeight: 1.5,
    color: 'var(--text-muted)',
    fontFamily: 'var(--font-display)',
  };

  const buttonStyle: CSSProperties = {
    display: 'inline-block',
    fontSize: 14,
    padding: '10px 18px',
    backgroundColor: 'var(--accent)',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    textDecoration: 'none',
    fontWeight: 600,
    fontFamily: 'var(--font-display)',
    cursor: 'pointer',
  };

  if (phase === 'loading') {
    return (
      <div style={shellStyle}>
        <div style={cardStyle}>
          <h1 style={titleStyle}>Completando tu registro…</h1>
          <p style={{ ...bodyStyle, marginBottom: 0 }}>
            Estamos vinculando tu cuenta con la del médico que te invitó.
          </p>
        </div>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div style={shellStyle}>
        <div style={cardStyle}>
          <h1 style={titleStyle}>No pudimos completar el registro</h1>
          <p style={bodyStyle}>
            {errorMessage ??
              'Ocurrió un error al finalizar tu invitación. Pedile al médico que genere un link nuevo.'}
          </p>
          <button
            type="button"
            onClick={() => router.push('/sign-in')}
            style={buttonStyle}
          >
            Ir al inicio de sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={shellStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>¡Tu cuenta fue creada exitosamente!</h1>
        <p style={bodyStyle}>
          Ya estás vinculada al médico que te invitó. Te redirigimos a la app
          en unos segundos.
        </p>
        <button
          type="button"
          onClick={() => {
            if (redirectTimer.current !== null) {
              window.clearTimeout(redirectTimer.current);
              redirectTimer.current = null;
            }
            router.push('/');
          }}
          style={buttonStyle}
        >
          Ir a la app ahora
        </button>
      </div>
    </div>
  );
}

function CompletarSecretariaFallback() {
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

export default function CompletarSecretariaPage() {
  return (
    <Suspense fallback={<CompletarSecretariaFallback />}>
      <CompletarSecretariaInner />
    </Suspense>
  );
}
