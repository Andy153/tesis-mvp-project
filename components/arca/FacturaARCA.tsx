'use client';

import { useEffect, useState } from 'react';
import { formatCaeDate } from '@/lib/arca/utils';
import { navigateToPerfil } from '@/lib/traza-nav';
import {
  getFacturacionBlockedMessage,
  getFacturacionBlockedTitle,
  useFiscalProfile,
} from '@/lib/use-fiscal-profile';
import { EmitirNotaCreditoModal } from '@/components/documentos/EmitirNotaCreditoModal';

export interface FacturaARCAProps {
  submissionId: string;
  monto: number;
  periodo: string;
  /** Si la liquidación ya tiene factura emitida (reabrir wizard / volver al paso 4). */
  facturaYaEmitida?: {
    cae: string;
    caeVencimiento: string | null;
    nroComprobante: number | null;
    pdfPath: string | null;
  };
  onExito: (cae: string, caeFechaVto: string, nroComprobante: number) => void | Promise<void>;
  onError: (mensaje: string) => void;
  /** Tras NC durante el wizard de cobros: recargar submission (vuelve al paso 4). */
  onNotaCreditoEmitida?: () => void | Promise<void>;
}

type Estado = 'idle' | 'loading' | 'exito' | 'error';

const SWISS_MEDICAL_RAZON_SOCIAL = 'Swiss Medical S.A.';

type EmisionConfig = {
  ambiente: 'desarrollo' | 'produccion';
  ambienteFuente: 'env' | 'perfil';
  receptor: { cuit: string; cuitFormateado: string; razonSocial: string };
  esProduccion: boolean;
};

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

function formatNumeroComprobanteDisplay(ptoVta: number, nro: number): string {
  return `${String(ptoVta).padStart(4, '0')}-${String(nro).padStart(8, '0')}`;
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

export function FacturaARCA({
  submissionId,
  monto,
  periodo,
  facturaYaEmitida,
  onExito,
  onError,
  onNotaCreditoEmitida,
}: FacturaARCAProps) {
  const {
    loading: fiscalLoading,
    profile,
    complete: fiscalComplete,
    certReady,
    canFacturar,
  } = useFiscalProfile();
  const [estado, setEstado] = useState<Estado>(() =>
    facturaYaEmitida?.cae ? 'exito' : 'idle',
  );
  const [caeEmitido, setCaeEmitido] = useState<string | null>(facturaYaEmitida?.cae ?? null);
  const [caeFechaVtoEmitido, setCaeFechaVtoEmitido] = useState<string | null>(
    facturaYaEmitida?.caeVencimiento ?? null,
  );
  const [nroComprobanteEmitido, setNroComprobanteEmitido] = useState<number | null>(
    facturaYaEmitida?.nroComprobante ?? null,
  );
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfPath, setPdfPath] = useState<string | null>(facturaYaEmitida?.pdfPath ?? null);
  const [ambienteEmitido, setAmbienteEmitido] = useState<'desarrollo' | 'produccion' | null>(null);
  const [refreshingPdfUrl, setRefreshingPdfUrl] = useState(false);
  const [mensajeError, setMensajeError] = useState<string | null>(null);
  const [continuando, setContinuando] = useState(false);
  const [montoManual, setMontoManual] = useState('');
  // --- NC ---
  const [ncModalAbierto, setNcModalAbierto] = useState(false);
  const [ncEmitida, setNcEmitida] = useState<{ cae: string; numero: number; pdfUrl?: string } | null>(null);
  const [emisionConfig, setEmisionConfig] = useState<EmisionConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);

  const necesitaMontoManual = monto === 0;
  const montoFacturar = necesitaMontoManual ? Number(montoManual) || 0 : monto;

  const ambienteEfectivo = ambienteEmitido ?? emisionConfig?.ambiente ?? 'desarrollo';
  const ambienteLabel = ambienteEfectivo === 'produccion' ? 'Producción' : 'Homologación';

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setConfigLoading(true);
      try {
        const r = await fetch('/api/arca/emision-config');
        const j = await r.json();
        if (!cancelled && r.ok) setEmisionConfig(j as EmisionConfig);
      } catch {
        if (!cancelled) setEmisionConfig(null);
      } finally {
        if (!cancelled) setConfigLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!facturaYaEmitida?.cae || !facturaYaEmitida.pdfPath) return;
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch('/api/arca/factura/pdf-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pdfPath: facturaYaEmitida.pdfPath }),
        });
        const j = await r.json();
        if (!cancelled && r.ok) setPdfUrl(j.pdfUrl ?? null);
      } catch {
        /* enlace opcional al reabrir */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [facturaYaEmitida?.cae, facturaYaEmitida?.pdfPath]);

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
      if (j.ambiente === 'produccion' || j.ambiente === 'desarrollo') {
        setAmbienteEmitido(j.ambiente);
      }
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
    // Datos para el modal de NC (solo si hay factura emitida con número)
    const facturaParaNC =
      nroComprobanteEmitido != null && caeEmitido
        ? {
            // El PV se infiere del perfil del usuario en el server.
            // Acá mostramos solo el número para el resumen.
            numero: formatNumeroComprobanteDisplay(0, nroComprobanteEmitido).replace(/^0{4}-/, ''),
            fecha: new Date().toLocaleDateString('es-AR'),
            receptorRazonSocial: SWISS_MEDICAL_RAZON_SOCIAL,
            monto: formatPesos(montoFacturar),
            cae: caeEmitido,
          }
        : null;

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
          <p style={{ fontSize: 12, margin: '0 0 8px', color: '#3d6b55' }}>
            Ambiente ARCA: <strong>{ambienteLabel}</strong>
          </p>
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

        {/* Banner de NC ya emitida sobre esta factura */}
        {ncEmitida ? (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              background: '#fff4d6',
              border: '1px solid #e0b94a',
              borderRadius: 8,
              color: '#7a5a00',
              fontSize: 13,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              ⚠ Esta factura fue anulada con Nota de Crédito N° {String(ncEmitida.numero).padStart(8, '0')}
            </div>
            <div style={{ fontSize: 12 }}>
              CAE NC: {ncEmitida.cae}
              {ncEmitida.pdfUrl ? (
                <>
                  {' · '}
                  <a
                    href={ncEmitida.pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#7a5a00', textDecoration: 'underline', fontWeight: 600 }}
                  >
                    Descargar PDF de la NC
                  </a>
                </>
              ) : null}
            </div>
          </div>
        ) : null}

        <button
          type="button"
          className="btn btn-primary"
          style={{ marginTop: 12 }}
          disabled={continuando}
          onClick={continuar}
        >
          {continuando ? 'Guardando…' : 'Continuar al paso 5 →'}
        </button>

        {/* Botón discreto para emitir NC. Se oculta si ya hay una NC emitida. */}
        {facturaParaNC && !ncEmitida ? (
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #e5e7eb' }}>
            <button
              type="button"
              onClick={() => setNcModalAbierto(true)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#B91C1C',
                fontSize: 13,
                cursor: 'pointer',
                padding: 0,
                textDecoration: 'underline',
              }}
            >
              ¿Algo salió mal? Emitir Nota de Crédito
            </button>
          </div>
        ) : null}

        {ncModalAbierto && facturaParaNC ? (
          <EmitirNotaCreditoModal
            submissionAnuladaId={submissionId}
            facturaOriginal={facturaParaNC}
            onClose={() => setNcModalAbierto(false)}
            onSuccess={async (resultado) => {
              setNcEmitida({
                cae: resultado.cae,
                numero: resultado.numeroComprobante,
                pdfUrl: resultado.pdfUrl,
              });
              setEstado('idle');
              setCaeEmitido(null);
              setCaeFechaVtoEmitido(null);
              setNroComprobanteEmitido(null);
              setPdfUrl(null);
              setPdfPath(null);
              setContinuando(false);
              await onNotaCreditoEmitida?.();
            }}
          />
        ) : null}
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

  if (fiscalLoading || configLoading) {
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
      <p style={{ fontSize: 14, color: '#555', margin: '0 0 12px' }}>
        Período: <strong>{periodoLabel(periodo)}</strong>
      </p>

      {emisionConfig && (
        <div
          style={{
            padding: 14,
            marginBottom: 16,
            borderRadius: 10,
            border: emisionConfig.esProduccion ? '2px solid #b45309' : '1px solid #7bc398',
            background: emisionConfig.esProduccion ? '#fff7ed' : '#e8f5ee',
            color: emisionConfig.esProduccion ? '#9a3412' : '#1f5d3a',
          }}
          role="alert"
        >
          <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: 14 }}>
            {emisionConfig.esProduccion
              ? 'Vas a emitir una factura REAL en AFIP (producción)'
              : 'Emisión en homologación (sin validez fiscal)'}
          </p>
          <p style={{ margin: '0 0 6px', fontSize: 13 }}>
            <strong>Ambiente:</strong> {ambienteLabel}
            {emisionConfig.ambienteFuente === 'env' ? ' (definido en AFIP_AMBIENTE del servidor)' : ''}
          </p>
          <p style={{ margin: '0 0 6px', fontSize: 13 }}>
            <strong>Receptor:</strong> {emisionConfig.receptor.razonSocial} (CUIT{' '}
            {emisionConfig.receptor.cuitFormateado})
          </p>
          {emisionConfig.esProduccion ? (
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.45 }}>
              El CAE quedará registrado en AFIP. Verificá monto y período antes de confirmar. Necesitás
              certificado de <strong>producción</strong> cargado en Tu perfil.
            </p>
          ) : (
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.45 }}>
              Para facturas reales, configurá <code>AFIP_AMBIENTE=produccion</code> en{' '}
              <code>.env.local</code> y reiniciá el servidor.
            </p>
          )}
        </div>
      )}

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
        Factura C · {ambienteLabel}
        {emisionConfig
          ? ` · ${emisionConfig.receptor.razonSocial}`
          : ''}
        {facturaYaEmitida?.cae ? ' · Ya tenés una factura emitida para este período' : ''}
      </p>
    </div>
  );
}
