'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { formatCaeDate } from '@/lib/arca/utils';
import { navigateToPerfil } from '@/lib/traza-nav';
import { isDemoUser } from '@/lib/demo-user';
import { buildDemoFacturaResponse, DEMO_PDF_URL } from '@/lib/demo-swiss-cobros-shared';
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
  /** Override del receptor (cuit + razonSocial). Si no se pasa, usa el del emision-config. */
  receptorOverride?: { cuit: string; razonSocial: string };
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
  return <span className="factura-arca__spinner" aria-hidden />;
}

export function FacturaARCA({
  submissionId,
  monto,
  periodo,
  facturaYaEmitida,
  onExito,
  onError,
  onNotaCreditoEmitida,
  receptorOverride,
}: FacturaARCAProps) {
  const { user } = useUser();
  const demoUser = isDemoUser(user?.id);
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
    if (demoUser) {
      setPdfUrl(DEMO_PDF_URL);
      return;
    }
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
  }, [facturaYaEmitida?.cae, facturaYaEmitida?.pdfPath, demoUser]);

  const emitir = async () => {
    if (demoUser) {
      setEstado('loading');
      setMensajeError(null);
      const j = buildDemoFacturaResponse();
      setCaeEmitido(j.cae);
      setCaeFechaVtoEmitido(j.caeFechaVto);
      setNroComprobanteEmitido(j.nroComprobante);
      setPdfUrl(null);
      setPdfPath(j.pdfPath);
      setAmbienteEmitido(j.ambiente);
      setEstado('exito');
      try {
        const r = await fetch('/api/arca/factura/pdf-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pdfPath: j.pdfPath }),
        });
        const jj = await r.json();
        if (r.ok && jj.pdfUrl) setPdfUrl(jj.pdfUrl);
        if (!r.ok) {
          const msg = jj.error ?? 'No se pudo obtener el PDF demo';
          setMensajeError(msg);
        }
      } catch {
        setMensajeError('No se pudo obtener el PDF demo');
      }
      return;
    }

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
    if (demoUser) {
      setPdfUrl(DEMO_PDF_URL);
      return;
    }
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
    const facturaParaNC =
      nroComprobanteEmitido != null && caeEmitido
        ? {
            numero: formatNumeroComprobanteDisplay(0, nroComprobanteEmitido).replace(/^0{4}-/, ''),
            fecha: new Date().toLocaleDateString('es-AR'),
            receptorRazonSocial: receptorOverride?.razonSocial ?? SWISS_MEDICAL_RAZON_SOCIAL,
            monto: formatPesos(montoFacturar),
            cae: caeEmitido,
          }
        : null;

    return (
      <div className="factura-arca">
        <div className="factura-arca__panel factura-arca__panel--ok">
          <div className="factura-arca__title">✓ Factura emitida correctamente</div>
          <p className="factura-arca__meta">
            Ambiente ARCA: <strong>{ambienteLabel}</strong>
          </p>
          {caeEmitido && (
            <p className="factura-arca__row">
              <strong>CAE:</strong> {caeEmitido}
            </p>
          )}
          {nroComprobanteEmitido != null && (
            <p className="factura-arca__row">
              <strong>Comprobante N°:</strong> {nroComprobanteEmitido}
            </p>
          )}
          {caeFechaVtoEmitido && (
            <p className="factura-arca__row">
              <strong>Vencimiento CAE:</strong> {formatCaeDate(caeFechaVtoEmitido)}
            </p>
          )}
          {pdfUrl ? (
            <div style={{ marginTop: 12 }}>
              <a
                href={pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="factura-arca__link-pdf"
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
            <p className="factura-arca__hint">Cargando PDF</p>
          )}
        </div>

        {ncEmitida ? (
          <div className="factura-arca__nc">
            <div className="factura-arca__nc-title">
              ⚠ Esta factura fue anulada con Nota de Crédito N° {String(ncEmitida.numero).padStart(8, '0')}
            </div>
            <div className="factura-arca__nc-meta">
              CAE NC: {ncEmitida.cae}
              {ncEmitida.pdfUrl ? (
                <>
                  {' · '}
                  <a
                    href={ncEmitida.pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="factura-arca__nc-link"
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
          className="btn btn-primary factura-arca__continue"
          disabled={continuando}
          onClick={continuar}
        >
          {continuando ? 'Guardando…' : 'Continuar al paso 5 →'}
        </button>

        {!demoUser && facturaParaNC && !ncEmitida ? (
          <div className="factura-arca__nc-divider">
            <button type="button" className="factura-arca__nc-action" onClick={() => setNcModalAbierto(true)}>
              ¿Algo salió mal? Emitir Nota de Crédito
            </button>
          </div>
        ) : null}

        {!demoUser && ncModalAbierto && facturaParaNC ? (
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
      <div className="factura-arca">
        <div className="factura-arca__panel factura-arca__panel--error">
          <strong>Error al emitir la factura</strong>
          <p className="factura-arca__row" style={{ marginTop: 8 }}>
            {mensajeError ?? 'Error desconocido'}
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setEstado('idle')}>
          Reintentar
        </button>
      </div>
    );
  }

  if (!demoUser && (fiscalLoading || configLoading)) {
    return (
      <p className="cobros-wizard__loading">Verificando configuración para facturar…</p>
    );
  }

  const blockedMessage = demoUser ? null : getFacturacionBlockedMessage(fiscalComplete, certReady);

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
    (!demoUser && !canFacturar) ||
    estado === 'loading' ||
    (necesitaMontoManual && montoFacturar <= 0);

  return (
    <div className="factura-arca">
      {necesitaMontoManual ? (
        <div className="factura-arca__panel factura-arca__panel--warn">
          No se pudo leer el monto del comprobante. Completá el monto manualmente.
          <label className="factura-arca__label-block">
            Monto a facturar
            <input
              type="number"
              min={0}
              step={0.01}
              className="factura-arca__input"
              value={montoManual}
              onChange={(e) => setMontoManual(e.target.value)}
              placeholder="Ej: 435112.91"
            />
          </label>
        </div>
      ) : (
        <p className="factura-arca__muted">
          Monto a facturar: <strong className="factura-arca__accent-strong">{formatPesos(monto)}</strong>
        </p>
      )}
      <p className="factura-arca__muted factura-arca__muted--period">
        Período: <strong>{periodoLabel(periodo)}</strong>
      </p>

      {emisionConfig && (
        <div
          className={
            emisionConfig.esProduccion
              ? 'factura-arca__panel factura-arca__panel--emision-prod'
              : 'factura-arca__panel factura-arca__panel--emision'
          }
          role="alert"
        >
          <p className="factura-arca__title" style={{ fontSize: 14, marginBottom: 8 }}>
            {emisionConfig.esProduccion
              ? 'Vas a emitir una factura REAL en AFIP (producción)'
              : 'Emisión en homologación'}
          </p>
          <p className="factura-arca__row" style={{ fontSize: 13, marginBottom: 6 }}>
            <strong>Ambiente:</strong> {ambienteLabel}
          </p>
          <p className="factura-arca__row" style={{ fontSize: 13, marginBottom: 6 }}>
            <strong>Receptor:</strong> {receptorOverride?.razonSocial ?? SWISS_MEDICAL_RAZON_SOCIAL}
          </p>
          {emisionConfig.esProduccion ? (
            <p className="factura-arca__row" style={{ fontSize: 12, margin: 0 }}>
              El CAE quedará registrado en AFIP. Verificá monto y período antes de confirmar. Necesitás
              certificado de <strong>producción</strong> cargado en Tu perfil.
            </p>
          ) : null}
        </div>
      )}

      <button type="button" className="btn btn-primary" disabled={disabled} onClick={emitir}>
        {estado === 'loading' ? (
          <span className="factura-arca__emit-row">
            <Spinner />
            Emitiendo…
          </span>
        ) : (
          'Emitir Factura C en ARCA'
        )}
      </button>
      <p className="factura-arca__muted factura-arca__muted--footer">
        Factura C · {ambienteLabel}
        {receptorOverride ? ` · ${receptorOverride.razonSocial}` : emisionConfig ? ` · ${emisionConfig.receptor.razonSocial}` : ''}
        {facturaYaEmitida?.cae ? ' · Ya tenés una factura emitida para este período' : ''}
      </p>
    </div>
  );
}
