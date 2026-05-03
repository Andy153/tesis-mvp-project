'use client';

import { useEffect, useRef, useState } from 'react';
import { verificarPinDelMedico } from '@/app/actions/pin';
import { marcarPinIngresado } from '@/lib/pin-session';

type Props = {
  onUnlock: () => void;
};

const MAX_INTENTOS_ANTES_TIMEOUT = 3;
const TIMEOUT_DURACION_MS = 30_000;

export function PinPromptScreen({ onUnlock }: Props) {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pinNoConfigurado, setPinNoConfigurado] = useState(false);
  const [intentosFallidos, setIntentosFallidos] = useState(0);
  const [timeoutHasta, setTimeoutHasta] = useState<number | null>(null);
  const [tiempoRestante, setTiempoRestante] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus al montar
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Countdown del timeout
  useEffect(() => {
    if (!timeoutHasta) return;

    const interval = setInterval(() => {
      const restante = Math.max(0, Math.ceil((timeoutHasta - Date.now()) / 1000));
      setTiempoRestante(restante);

      if (restante === 0) {
        setTimeoutHasta(null);
        setIntentosFallidos(0);
        setError(null);
        inputRef.current?.focus();
      }
    }, 250);

    return () => clearInterval(interval);
  }, [timeoutHasta]);

  // Validación automática al llegar a 4 dígitos
  useEffect(() => {
    if (pin.length === 4 && !loading && !timeoutHasta) {
      validarPin(pin);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  const validarPin = async (pinIngresado: string) => {
    setLoading(true);
    setError(null);

    try {
      const result = await verificarPinDelMedico(pinIngresado);

      if (result.ok) {
        marcarPinIngresado();
        onUnlock();
        return;
      }

      // PIN no configurado
      if (result.error?.includes('no configuró un PIN')) {
        setPinNoConfigurado(true);
        return;
      }

      // PIN incorrecto
      const nuevosIntentos = intentosFallidos + 1;
      setIntentosFallidos(nuevosIntentos);

      if (nuevosIntentos >= MAX_INTENTOS_ANTES_TIMEOUT) {
        setTimeoutHasta(Date.now() + TIMEOUT_DURACION_MS);
        setError(
          `Demasiados intentos fallidos. Esperá ${TIMEOUT_DURACION_MS / 1000} segundos antes de reintentar.`,
        );
      } else {
        setError(
          `PIN incorrecto. Te quedan ${MAX_INTENTOS_ANTES_TIMEOUT - nuevosIntentos} intento${
            MAX_INTENTOS_ANTES_TIMEOUT - nuevosIntentos === 1 ? '' : 's'
          }.`,
        );
      }

      setPin('');
      inputRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al verificar PIN');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valor = e.target.value.replace(/\D/g, '').slice(0, 4);
    setPin(valor);
    if (error && valor.length < 4) setError(null);
  };

  // Estado: PIN no configurado por el médico
  if (pinNoConfigurado) {
    return (
      <div
        style={{
          padding: 48,
          textAlign: 'center',
          backgroundColor: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          margin: 24,
          maxWidth: 480,
          marginInline: 'auto',
        }}
      >
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔐</div>
        <h2 style={{ margin: 0, marginBottom: 12, fontSize: 22 }}>PIN no configurado</h2>
        <p style={{ margin: 0, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          El médico todavía no configuró el PIN de acceso a Centro de Cobros. Pedíselo para que lo cree desde su
          perfil.
        </p>
      </div>
    );
  }

  const enTimeout = timeoutHasta !== null && tiempoRestante > 0;

  return (
    <div
      style={{
        padding: 48,
        textAlign: 'center',
        backgroundColor: 'var(--bg-panel)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        margin: 24,
        maxWidth: 480,
        marginInline: 'auto',
      }}
    >
      <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
      <h2 style={{ margin: 0, marginBottom: 8, fontSize: 22 }}>Centro de Cobros bloqueado</h2>
      <p style={{ margin: 0, marginBottom: 24, color: 'var(--text-muted)' }}>
        Ingresá el PIN de 4 dígitos que te dio el médico.
      </p>

      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        maxLength={4}
        value={pin}
        onChange={handleChange}
        disabled={loading || enTimeout}
        placeholder="• • • •"
        style={{
          fontSize: 32,
          padding: '12px 16px',
          border: '2px solid var(--border)',
          borderRadius: 8,
          letterSpacing: 12,
          textAlign: 'center',
          width: 220,
          fontFamily: 'var(--font-mono)',
          opacity: enTimeout ? 0.5 : 1,
          outline: 'none',
        }}
        onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
        onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
      />

      {loading && (
        <p style={{ marginTop: 16, fontSize: 13, color: 'var(--text-muted)' }}>
          Verificando...
        </p>
      )}

      {error && !enTimeout && (
        <p style={{ marginTop: 16, fontSize: 13, color: 'var(--error)' }}>
          {error}
        </p>
      )}

      {enTimeout && (
        <p style={{ marginTop: 16, fontSize: 14, color: 'var(--error)', fontWeight: 500 }}>
          Demasiados intentos fallidos.
          <br />
          Esperá {tiempoRestante} segundo{tiempoRestante === 1 ? '' : 's'} antes de reintentar.
        </p>
      )}
    </div>
  );
}

