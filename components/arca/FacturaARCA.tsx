'use client';

import { useState } from 'react';
import { formatCaeDate } from '@/lib/arca/utils';
import { navigateToPerfil } from '@/lib/traza-nav';
import {
  getFacturacionBlockedMessage,
  getFacturacionBlockedTitle,
  useFiscalProfile,
} from '@/lib/use-fiscal-profile';

export interface FacturaARCAProps {
  submissionId: string;
  monto: number;
  periodo: string;
  onExito: (cae: string, caeFechaVto: string, nroComprobante: number) => void | Promise<void>;
  onError: (mensaje: string) => void;
}

type Estado = 'idle' | 'loading' | 'exito' | 'error';

const SWISS_MEDICAL_CUIT = '30692317714';

function lastDayOfMonth(periodo: string): string {
  const [year, month] = periodo.split('-').map(Number);
  const last = new Date(year, month, 0).getDate();
  return `${periodo}-${String(last).padStart(2, '0')}`;
}

function periodoLabel(p: string): string {
  const [y, m] = p.split('-').map((n) => parseInt(n, 10));
  const meses = [
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre',
  ];
  if (!y || !m) return p;
  return `${meses[m - 1]} ${y}`;
}

function formatPesos(monto: number): string {
  return `$${monto.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function Spinner() {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 14,
        height: 14,
        border: '2px solid rgba(255,255,255,0.35)',
        borderTopColor: '#fff',
        borderRadius: '50%',
        animation: 'factura-arca-spin 0.7s linear infinite',
      }}
      aria-hidden
    />
  );
}

export function FacturaARCA({ submissionId, monto, periodo, onExito, onError }: FacturaARCAProps) {
  const {
    loading: fiscalLoading,
    complete: fiscalComplete,
    certReady,
    canFacturar,
  } = useFiscalProfile();
  const [estado, setEstado] = useState<Estado>('idle');
  const [caeEmitido, setCaeEmitido] = useState<string | null>(null);
  const [caeFechaVtoEmitido, setCaeFechaVtoEmitido] = useState<string | null>(null);
  const [nroComprobanteEmitido, setNroComprobanteEmitido] = useState<number | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfPath, setPdfPath] = useState<string | null>(null);
  const [refreshingPdfUrl, setRefreshingPdfUrl] = useState(false);
  const [mensajeError, setMensajeError] = useState<string | null>(null);
  const [continuando, setContinuando] = useState(false);
  const [montoManual, setMontoManual] = useState('');

  const necesitaMontoManual = monto === 0;
  const montoFacturar = necesitaMontoManual ? Number(montoManual) || 0 : monto;

  const emitir = async () => {
    const blockedMsg = getFacturacionBlockedMessage(fiscalComplete, certReady);
    if (blockedMsg) {
      setMensajeError(blockedMsg);
      setEstado('error');
      onError(blockedMsg);
      return;
    }

    setEstado('loading');
    setMensajeError(null);
    try {
      const r = await fetch('/api/arca/factura', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cuitReceptor: SWISS_MEDICAL_CUIT,
          importeTotal: montoFacturar,
          periodoDesde: `${periodo}-01`,
          periodoHasta: lastDayOfMonth(periodo),
          periodo,
          submissionId,
        }),
      });
      const j = await r.json();
      if (!r.ok || !j.exito) {
        const msg = j.errores?.[0] ?? j.error ?? 'No se pudo emitir la factura';
        setMensajeError(msg);
        setEstado('error');
        onError(msg);
        return;
      }
      setCaeEmitido(j.cae);
      setCaeFechaVtoEmitido(j.caeFechaVto ?? null);
      setNroComprobanteEmitido(j.nroComprobante ?? null);
      setPdfUrl(j.pdfUrl ?? null);
      setPdfPath(j.pdfPath ?? null);
      setEstado('exito');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error de conexión';
      setMensajeError(msg);
      setEstado('error');
      onError(msg);
    }
  };

  const refreshPdfUrl = async () => {
    if (!pdfPath || refreshingPdfUrl) return;
    setRefreshingPdfUrl(true);
    try {
      const r = await fetch('/api/arca/factura/pdf-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfPath }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'No se pudo renovar el enlace');
      setPdfUrl(j.pdfUrl ?? null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al renovar el enlace';
      setMensajeError(msg);
    } finally {
      setRefreshingPdfUrl(false);
    }
  };

  const continuar = async () => {
    if (!caeEmitido || nroComprobanteEmitido == null || continuando) return;
    setContinuando(true);
    try {
      await onExito(caeEmitido, caeFechaVtoEmitido ?? '', nroComprobanteEmitido);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al guardar';
      setMensajeError(msg);
      setEstado('error');
      onError(msg);
    } finally {
      setContinuando(false);
    }
  };

  if (estado === 'exito') {
    return (
      <div>
        <div
          style={{
            padding: 16,
            background: '#e8f5ee',
            border: '1px solid #7bc398',
            borderRadius: 8,
            color: '#1f5d3a',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 8 }}>✓ Factura emitida correctamente</div>
          {caeEmitido && (
            <p style={{ fontSize: 14, margin: '4px 0' }}>
              <strong>CAE:</strong> {caeEmitido}
            </p>
          )}
          {nroComprobanteEmitido != null && (
            <p style={{ fontSize: 14, margin: '4px 0' }}>
              <strong>Comprobante N°:</strong> {nroComprobanteEmitido}
            </p>
          )}
          {caeFechaVtoEmitido && (
            <p style={{ fontSize: 14, margin: '4px 0' }}>
              <strong>Vencimiento CAE:</strong> {formatCaeDate(caeFechaVtoEmitido)}
            </p>
          )}
          {pdfUrl ? (
            <div style={{ marginTop: 12 }}>
              <a
                href={pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'inline-block', color: '#16a34a', fontWeight: 600 }}
              >
                📄 Descargar factura PDF
              </a>
              {pdfPath && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ display: 'block', marginTop: 8, fontSize: 12, padding: '4px 0' }}
                  disabled={refreshingPdfUrl}
                  onClick={() => void refreshPdfUrl()}
                >
                  {refreshingPdfUrl ? 'Renovando enlace…' : 'Renovar enlace de descarga'}
                </button>
              )}
            </div>
          ) : (
            <p style={{ fontSize: 12, color: '#888', margin: '12px 0 0' }}>
              El PDF no pudo generarse, pero el CAE es válido.
            </p>
          )}
        </div>
        <button
          type="button"
          className="btn btn-primary"
          style={{ marginTop: 12 }}
          disabled={continuando}
          onClick={continuar}
        >
          {continuando ? 'Guardando…' : 'Continuar al paso 5 →'}
        </button>
      </div>
    );
  }

  if (estado === 'error') {
    return (
      <div>
        <div
          style={{
            padding: 16,
            background: '#fef2f2',
            border: '1px solid #fca5a5',
            borderRadius: 8,
            color: '#991b1b',
            marginBottom: 12,
          }}
        >
          <strong>Error al emitir la factura</strong>
          <p style={{ fontSize: 14, margin: '8px 0 0' }}>{mensajeError ?? 'Error desconocido'}</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setEstado('idle')}>
          Reintentar
        </button>
      </div>
    );
  }

  if (fiscalLoading) {
    return (
      <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>
        Verificando configuración para facturar…
      </p>
    );
  }

  const blockedMessage = getFacturacionBlockedMessage(fiscalComplete, certReady);

  if (blockedMessage) {
    return (
      <div className="factura-fiscal-blocked">
        <p className="factura-fiscal-blocked__title">
          {getFacturacionBlockedTitle(fiscalComplete, certReady)}
        </p>
        <p className="factura-fiscal-blocked__text">{blockedMessage}</p>
        <button type="button" className="btn btn-primary" onClick={navigateToPerfil}>
          Ir a Tu perfil
        </button>
      </div>
    );
  }

  const disabled =
    !canFacturar || estado === 'loading' || (necesitaMontoManual && montoFacturar <= 0);

  return (
    <div>
      <style>{`@keyframes factura-arca-spin { to { transform: rotate(360deg); } }`}</style>
      {necesitaMontoManual ? (
        <div
          style={{
            padding: 12,
            marginBottom: 12,
            background: '#fff4d6',
            border: '1px solid #e0b94a',
            borderRadius: 8,
            color: '#7a5a00',
            fontSize: 13,
          }}
        >
          No se pudo leer el monto del comprobante. Completá el monto manualmente.
          <label style={{ display: 'block', marginTop: 8, fontWeight: 600 }}>
            Monto a facturar
            <input
              type="number"
              min={0}
              step={0.01}
              value={montoManual}
              onChange={(e) => setMontoManual(e.target.value)}
              placeholder="Ej: 435112.91"
              style={{
                display: 'block',
                width: '100%',
                marginTop: 4,
                height: 36,
                padding: '0 12px',
                borderRadius: 8,
                border: '1px solid #e0b94a',
                fontSize: 14,
                boxSizing: 'border-box',
              }}
            />
          </label>
        </div>
      ) : (
        <p style={{ fontSize: 14, color: '#555', margin: '0 0 8px' }}>
          Monto a facturar: <strong style={{ color: '#1f5d3a' }}>{formatPesos(monto)}</strong>
        </p>
      )}
      <p style={{ fontSize: 14, color: '#555', margin: '0 0 16px' }}>
        Período: <strong>{periodoLabel(periodo)}</strong>
      </p>
      <button
        type="button"
        className="btn btn-primary"
        disabled={disabled}
        onClick={emitir}
        style={
          disabled
            ? { background: '#cdd5d0', color: '#7a8580', cursor: 'not-allowed', borderColor: '#cdd5d0' }
            : undefined
        }
      >
        {estado === 'loading' ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Spinner />
            Emitiendo…
          </span>
        ) : (
          'Emitir Factura C en ARCA'
        )}
      </button>
      <p style={{ fontSize: 12, color: '#888', margin: '12px 0 0' }}>
        Se emitirá a Swiss Medical · Factura C · Homologación
      </p>
    </div>
  );
}
