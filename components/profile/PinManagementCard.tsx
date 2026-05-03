'use client';

import { useState } from 'react';
import { useUserRole } from '@/lib/use-user-role';
import { setMedicoPin, clearMedicoPin } from '@/app/actions/pin';
import { useUser } from '@clerk/nextjs';

export function PinManagementCard() {
  const { rol, hasPin, isLoaded } = useUserRole();
  const { user } = useUser();

  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // No mostramos esta sección si no es médico
  if (!isLoaded || rol !== 'medico') return null;

  const handleGuardarPin = async () => {
    setError(null);
    setSuccess(null);

    if (!/^\d{4}$/.test(pin)) {
      setError('El PIN debe ser exactamente 4 dígitos numéricos');
      return;
    }

    setLoading(true);
    try {
      await setMedicoPin(pin);
      // Refrescar metadata local de Clerk
      await user?.reload();
      setSuccess('PIN configurado correctamente');
      setPin('');
      setMostrarFormulario(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar PIN');
    } finally {
      setLoading(false);
    }
  };

  const handleEliminarPin = async () => {
    if (!confirm('¿Eliminar el PIN? La secretaria no podrá acceder a Centro de Cobros hasta que crees uno nuevo.'))
      return;

    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      await clearMedicoPin();
      await user?.reload();
      setSuccess('PIN eliminado');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar PIN');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        padding: 24,
        backgroundColor: 'var(--bg-panel)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        marginBottom: 16,
      }}
    >
      <h3 style={{ margin: 0, marginBottom: 8, fontSize: 16 }}>PIN de acceso a Centro de Cobros</h3>
      <p style={{ margin: 0, marginBottom: 16, fontSize: 13, color: 'var(--text-muted)' }}>
        Tu secretaría necesita este PIN para acceder a la información financiera. Solo compartilo con personas de
        confianza.
      </p>

      {hasPin && !mostrarFormulario && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span
            style={{
              fontSize: 13,
              padding: '4px 10px',
              backgroundColor: 'var(--accent-soft)',
              color: 'var(--accent-ink)',
              borderRadius: 6,
            }}
          >
            ✓ PIN configurado
          </span>
          <button
            onClick={() => setMostrarFormulario(true)}
            disabled={loading}
            style={{
              fontSize: 13,
              padding: '6px 12px',
              backgroundColor: 'var(--bg-sunken)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            Cambiar PIN
          </button>
          <button
            onClick={handleEliminarPin}
            disabled={loading}
            style={{
              fontSize: 13,
              padding: '6px 12px',
              backgroundColor: 'transparent',
              color: 'var(--error)',
              border: '1px solid var(--error)',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            Eliminar PIN
          </button>
        </div>
      )}

      {!hasPin && !mostrarFormulario && (
        <button
          onClick={() => setMostrarFormulario(true)}
          disabled={loading}
          style={{
            fontSize: 14,
            padding: '8px 16px',
            backgroundColor: 'var(--accent)',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          Crear PIN de 4 dígitos
        </button>
      )}

      {mostrarFormulario && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="text"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            placeholder="• • • •"
            autoFocus
            style={{
              fontSize: 24,
              padding: '10px 14px',
              border: '1px solid var(--border)',
              borderRadius: 6,
              letterSpacing: 8,
              textAlign: 'center',
              maxWidth: 200,
              fontFamily: 'var(--font-mono)',
            }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleGuardarPin}
              disabled={loading || pin.length !== 4}
              style={{
                fontSize: 14,
                padding: '8px 16px',
                backgroundColor: 'var(--accent)',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: pin.length === 4 ? 'pointer' : 'not-allowed',
                opacity: pin.length === 4 ? 1 : 0.5,
              }}
            >
              {loading ? 'Guardando...' : 'Guardar PIN'}
            </button>
            <button
              onClick={() => {
                setMostrarFormulario(false);
                setPin('');
                setError(null);
              }}
              disabled={loading}
              style={{
                fontSize: 14,
                padding: '8px 16px',
                backgroundColor: 'transparent',
                color: 'var(--text-muted)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {error && (
        <p style={{ marginTop: 12, fontSize: 13, color: 'var(--error)' }}>
          {error}
        </p>
      )}
      {success && (
        <p style={{ marginTop: 12, fontSize: 13, color: 'var(--accent-ink)' }}>
          {success}
        </p>
      )}
    </div>
  );
}

