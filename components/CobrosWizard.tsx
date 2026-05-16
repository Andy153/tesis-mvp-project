'use client';

import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { FacturaARCA } from '@/components/arca/FacturaARCA';

type Submission = {
  id: string;
  periodo: string;
  obra_social: string;
  wizard_estado: string | null;
  wizard_paso: number | null;
  enviado_en: string;
  cantidad_partes: number | null;
  monto_total: number | null;
  comprobante_smg_path: string | null;
  factura_path: string | null;
  cai_numero: string | null;
  cai_vencimiento: string | null;
  factura_adjuntada_en: string | null;
  wizard_completado_en: string | null;
};

function periodoLabel(p: string): string {
  const [y, m] = p.split('-').map((n) => parseInt(n, 10));
  const meses = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre',
    'Diciembre',
  ];
  if (!y || !m) return p;
  return `${meses[m - 1]} ${y}`;
}

function horasRestantes(desde: string, horas: number): number {
  const diff = Date.now() - new Date(desde).getTime();
  const transcurridas = diff / (1000 * 60 * 60);
  return Math.max(0, horas - transcurridas);
}

function Countdown({ desde, horas, onReady }: { desde: string; horas: number; onReady: () => void }) {
  const [restantes, setRestantes] = useState(horasRestantes(desde, horas));
  const called = useRef(false);

  useEffect(() => {
    if (restantes === 0 && !called.current) {
      called.current = true;
      onReady();
      return;
    }
    const t = setTimeout(() => setRestantes(horasRestantes(desde, horas)), 60000);
    return () => clearTimeout(t);
  }, [restantes, desde, horas, onReady]);

  if (restantes === 0) return null;
  const h = Math.floor(restantes);
  const m = Math.floor((restantes - h) * 60);
  return (
    <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
      {h > 0 ? `${h}h ` : ''}
      {m}min restantes
    </span>
  );
}

type StepProps = {
  numero: number;
  titulo: string;
  activo: boolean;
  completado: boolean;
  children?: ReactNode;
};

function Step({ numero, titulo, activo, completado, children }: StepProps) {
  const bgColor = completado ? '#1f5d3a' : activo ? '#e8f5ee' : '#f5f5f5';
  const borderColor = completado ? '#1f5d3a' : activo ? '#7bc398' : '#d0d7d2';

  return (
    <div
      style={{
        border: `1.5px solid ${borderColor}`,
        borderRadius: 10,
        marginBottom: 10,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          background: bgColor,
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: completado ? 'rgba(255,255,255,0.25)' : activo ? '#1f5d3a' : '#ccc',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {completado ? '✓' : numero}
        </div>
        <span style={{ fontWeight: 600, fontSize: 14, color: completado ? 'white' : activo ? '#1f5d3a' : '#888' }}>
          {titulo}
        </span>
      </div>
      {activo && children && <div style={{ padding: '16px 20px', background: 'white' }}>{children}</div>}
    </div>
  );
}

export function CobrosWizard({
  submissionId,
  onUpdate,
  onCollapse,
}: {
  submissionId: string;
  onUpdate?: () => void;
  onCollapse?: () => void;
}) {
  const [sub, setSub] = useState<Submission | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready48h, setReady48h] = useState(false);
  const [readyFactura, setReadyFactura] = useState(false);
  const [comprobanteFile, setComprobanteFile] = useState<File | null>(null);
  const [caiNumero, setCaiNumero] = useState('');
  const [caiVencimiento, setCaiVencimiento] = useState('');
  const [exceptionSent, setExceptionSent] = useState(false);

  const load = async () => {
    try {
      const r = await fetch(`/api/submissions/${submissionId}/wizard`);
      const contentType = r.headers.get('content-type') ?? '';
      if (!contentType.includes('application/json')) {
        const text = await r.text();
        throw new Error(
          r.status === 404
            ? 'No se encontró el seguimiento de cobro. Recargá la página.'
            : `Error del servidor (${r.status}): ${text.slice(0, 120)}`,
        );
      }
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Error al cargar el wizard');
      setSub(j.submission);
      setCaiNumero(j.submission.cai_numero ?? '');
      setCaiVencimiento(j.submission.cai_vencimiento ?? '');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [submissionId]);

  useEffect(() => {
    if (!sub?.enviado_en) return;
    setReady48h(horasRestantes(sub.enviado_en, 48) === 0);
  }, [sub?.enviado_en]);

  useEffect(() => {
    if (!sub?.factura_adjuntada_en) return;
    setReadyFactura(horasRestantes(sub.factura_adjuntada_en, 48) === 0);
  }, [sub?.factura_adjuntada_en]);

  const patch = async (action: string, extraBody?: Record<string, unknown>) => {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`/api/submissions/${submissionId}/wizard`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extraBody }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      await load();
      onUpdate?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(false);
    }
  };

  const patchFormData = async (action: string, formData: FormData) => {
    setSaving(true);
    setError(null);
    try {
      formData.append('action', action);
      const r = await fetch(`/api/submissions/${submissionId}/wizard`, {
        method: 'PATCH',
        body: formData,
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      await load();
      onUpdate?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(false);
    }
  };

  const sendException = async () => {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`/api/submissions/${submissionId}/wizard`, { method: 'POST' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setExceptionSent(true);
      await load();
      onUpdate?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p style={{ color: '#666', fontSize: 14 }}>Cargando...</p>;
  if (!sub) return <p style={{ color: '#e00', fontSize: 14 }}>{error || 'No encontrado'}</p>;

  const estado = sub.wizard_estado ?? '';
  const paso = sub.wizard_paso ?? 1;
  const isAprobado = estado === 'aprobado';
  const isExcepcion = estado === 'excepcion_enviada';
  const isDescartado = estado === 'descartado';

  const labelStyle: CSSProperties = {
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 4,
    display: 'block',
    color: '#1f5d3a',
  };
  const inputStyle: CSSProperties = {
    width: '100%',
    height: 36,
    padding: '0 12px',
    borderRadius: 8,
    border: '1px solid #d0d7d2',
    fontSize: 14,
    boxSizing: 'border-box',
  };
  const linkStyle: CSSProperties = { color: '#1f5d3a', fontWeight: 600, textDecoration: 'underline' };

  if (isAprobado) {
    return (
      <div style={{ textAlign: 'center', padding: 32 }}>
        <div style={{ fontSize: 48 }}>🎉</div>
        <h3 style={{ color: '#1f5d3a', margin: '12px 0 4px' }}>¡Liquidación aprobada!</h3>
        <p style={{ color: '#555', fontSize: 14 }}>
          {periodoLabel(sub.periodo)} — el pago debería acreditarse en los próximos días.
        </p>
      </div>
    );
  }

  if (isExcepcion) {
    return (
      <div style={{ padding: 20, background: '#fff4d6', border: '1px solid #e0b94a', borderRadius: 10 }}>
        <strong style={{ color: '#7a5a00' }}>Solicitud de excepción enviada</strong>
        <p style={{ color: '#7a5a00', fontSize: 14, margin: '8px 0 0' }}>
          Se envió un mail a Swiss Medical con la factura y los datos del CAI. Esperá su respuesta.
        </p>
      </div>
    );
  }

  if (isDescartado) {
    return (
      <div style={{ padding: 20, background: '#f5f5f5', border: '1px solid #d0d7d2', borderRadius: 10 }}>
        <strong style={{ color: '#555' }}>Seguimiento descartado</strong>
        <p style={{ color: '#666', fontSize: 14, margin: '8px 0 0' }}>
          Este paso a paso ya no aparecerá como acción pendiente.
        </p>
      </div>
    );
  }

  const goBack = async () => {
    if (paso <= 1) return;
    await patch('go_back');
  };

  return (
    <div>
      <p style={{ fontSize: 13, color: '#555', marginBottom: 16 }}>
        Liquidación <strong>{periodoLabel(sub.periodo)}</strong> · {sub.cantidad_partes ?? 0} parte(s) enviados el{' '}
        {new Date(sub.enviado_en).toLocaleDateString('es-AR')}
      </p>

      {error && (
        <div
          style={{
            padding: '8px 12px',
            background: '#fde2e2',
            color: '#842029',
            borderRadius: 6,
            marginBottom: 12,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button
          type="button"
          className="btn"
          style={{ fontSize: 12, color: '#666' }}
          disabled={saving}
          onClick={() => {
            if (
              window.confirm(
                '¿Descartar este seguimiento de cobro? No borra documentos ni envíos, solo oculta este paso a paso de acciones pendientes.',
              )
            ) {
              patch('descartar_seguimiento');
            }
          }}
        >
          Descartar seguimiento
        </button>
      </div>

      {/* Paso 1 */}
      <Step numero={1} titulo="Esperá 48 horas para que Swiss Medical procese la liquidación" activo={paso === 1} completado={paso > 1}>
        {!ready48h ? (
          <div>
            <p style={{ fontSize: 14, color: '#555', margin: '0 0 8px' }}>
              Enviamos la planilla el {new Date(sub.enviado_en).toLocaleDateString('es-AR')}. Swiss Medical necesita tiempo para
              procesarla.
            </p>
            <p style={{ fontSize: 14, color: '#1f5d3a', margin: 0 }}>
              ⏳ <Countdown desde={sub.enviado_en} horas={48} onReady={() => setReady48h(true)} />
            </p>
            <p style={{ fontSize: 13, color: '#666', margin: '10px 0 12px' }}>
              El contador es una recomendación, no bloquea el proceso.
            </p>
            <button type="button" className="btn btn-primary" onClick={() => patch('comprobante_disponible')} disabled={saving}>
              Avanzar y revisar el portal →
            </button>
          </div>
        ) : (
          <div>
            <p style={{ fontSize: 14, color: '#1f5d3a', marginBottom: 12 }}>✅ Ya pasaron 48 horas. Podés revisar el portal de Swiss Medical.</p>
            <button type="button" className="btn btn-primary" onClick={() => patch('comprobante_disponible')} disabled={saving}>
              Entendido, voy a revisar →
            </button>
          </div>
        )}
      </Step>

      {/* Paso 2 */}
      <Step numero={2} titulo="Revisá el comprobante en el portal de Swiss Medical" activo={paso === 2} completado={paso > 2}>
        <p style={{ fontSize: 14, color: '#555', margin: '0 0 12px' }}>
          Ingresá al portal de prestadores, andá a <strong>Trámites online → Consulta de liquidación</strong>, seleccioná{' '}
          <strong>{periodoLabel(sub.periodo)}</strong> y verificá que aparezca el comprobante.
        </p>
        <img src="/wizard/paso2_menu.png" alt="Menú Trámites online" style={{ width: '100%', borderRadius: 8, margin: '12px 0', border: '1px solid #e0e0e0' }} />
        <img src="/wizard/paso2_mes.png" alt="Selector de mes" style={{ width: '100%', borderRadius: 8, margin: '0 0 12px', border: '1px solid #e0e0e0' }} />
        <a
          href="https://www.swissmedical.com.ar/prestadores"
          target="_blank"
          rel="noopener noreferrer"
          style={{ ...linkStyle, display: 'inline-block', marginBottom: 16 }}
        >
          🔗 Abrir portal Swiss Medical
        </a>
        <br />
        <p style={{ fontSize: 13, color: '#888', margin: '0 0 12px' }}>¿Aparece el comprobante?</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={() => patch('comprobante_disponible')}>
            Sí, aparece el comprobante
          </button>
          <button type="button" className="btn" onClick={() => onCollapse?.()}>
            Todavía no — vuelvo después
          </button>
        </div>
        <button type="button" className="btn" style={{ marginTop: 12, fontSize: 13, color: '#666' }} onClick={goBack} disabled={saving}>
          ← Volver al paso anterior
        </button>
      </Step>

      {/* Paso 3 */}
      <Step numero={3} titulo="Descargá y subí el comprobante de Swiss Medical" activo={paso === 3} completado={paso > 3}>
        <p style={{ fontSize: 14, color: '#555', margin: '0 0 12px' }}>
          Descargá el comprobante desde el portal y subilo acá para tener el registro en Trazá.
        </p>
        <img src="/wizard/paso3_comprobante.png" alt="Descargar comprobante y verificar Aprobado" style={{ width: '100%', borderRadius: 8, margin: '12px 0', border: '1px solid #e0e0e0' }} />
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Comprobante SMG (PDF)</label>
          <input type="file" accept="application/pdf" onChange={(e) => setComprobanteFile(e.target.files?.[0] ?? null)} style={{ fontSize: 13 }} />
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!comprobanteFile || saving}
          style={
            !comprobanteFile
              ? { background: '#cdd5d0', color: '#7a8580', cursor: 'not-allowed', borderColor: '#cdd5d0' }
              : undefined
          }
          onClick={async () => {
            if (!comprobanteFile) return;
            const fd = new FormData();
            fd.append('file', comprobanteFile);
            await patchFormData('subir_comprobante', fd);
          }}
        >
          {saving ? 'Subiendo...' : 'Subir comprobante'}
        </button>
        <button type="button" className="btn" style={{ marginTop: 12, marginLeft: 12, marginRight: 12, fontSize: 13, color: '#666' }} onClick={goBack} disabled={saving}>
          ← Volver al paso anterior
        </button>
      </Step>

      {/* Paso 4 */}
      <Step numero={4} titulo="Emitir factura en ARCA" activo={paso === 4} completado={paso > 4}>
        <FacturaARCA
          submissionId={sub.id}
          monto={sub.monto_total ?? 0}
          periodo={sub.periodo}
          onExito={async (cae, caeFechaVto, nroComprobante, pdfBase64, pdfFileName) => {
            await patch('factura_emitida', { cae, caeFechaVto, nroComprobante, pdfBase64, pdfFileName });
          }}
          onError={(mensaje) => {
            console.error('Error emitiendo factura:', mensaje);
          }}
        />
        <button
          type="button"
          className="btn"
          style={{ marginTop: 12, marginLeft: 0, marginRight: 0, fontSize: 13, color: '#666' }}
          onClick={goBack}
          disabled={saving}
        >
          ← Volver al paso anterior
        </button>
      </Step>

      {/* Paso 5 */}
      <Step numero={5} titulo="Adjuntá la factura en el portal de Swiss Medical" activo={paso === 5} completado={paso > 5}>
        <p style={{ fontSize: 14, color: '#555', margin: '0 0 12px' }}>
          Descargá la factura del paso anterior y subila manualmente en el portal de prestadores de Swiss Medical. En la
          Consulta de liquidación, hacé click en el <strong>clip 📎</strong> de la fila correspondiente.
        </p>
        <img src="/wizard/paso5_adjuntar.png" alt="Adjuntar factura con el clip" style={{ width: '100%', borderRadius: 8, margin: '12px 0', border: '1px solid #e0e0e0' }} />
        <p style={{ fontSize: 14, color: '#555', margin: '0 0 12px' }}>
          Una vez adjuntada en el portal, confirmá acá los datos del CAI que ingresaste.
        </p>
        <div style={{ display: 'grid', gap: 10, marginBottom: 12 }}>
          <div>
            <label style={labelStyle}>Número de CAI</label>
            <input style={inputStyle} value={caiNumero} onChange={(e) => setCaiNumero(e.target.value)} placeholder="Ej: 12345678901234" />
          </div>
          <div>
            <label style={labelStyle}>Fecha de vencimiento del CAI</label>
            <input type="date" style={inputStyle} value={caiVencimiento} onChange={(e) => setCaiVencimiento(e.target.value)} />
          </div>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!caiNumero.trim() || !caiVencimiento || saving}
          style={
            !caiNumero.trim() || !caiVencimiento
              ? { background: '#cdd5d0', color: '#7a8580', cursor: 'not-allowed', borderColor: '#cdd5d0' }
              : undefined
          }
          onClick={() => patch('adjuntar_factura', { cai_numero: caiNumero, cai_vencimiento: caiVencimiento })}
        >
          {saving ? 'Guardando...' : 'Confirmar adjunto en el portal'}
        </button>
        <button type="button" className="btn" style={{ marginTop: 12, marginBottom: 12, marginLeft: 12, marginRight: 12, fontSize: 13, color: '#666' }} onClick={goBack} disabled={saving}>
          ← Volver al paso anterior
        </button>
      </Step>

      {/* Paso 6 */}
      <Step numero={6} titulo="Verificá la aprobación (48 horas)" activo={paso === 6} completado={isAprobado}>
        {!sub.factura_adjuntada_en ? (
          <p style={{ fontSize: 14, color: '#888' }}>Completá el paso anterior para iniciar esta espera.</p>
        ) : (
          <div>
            {!readyFactura ? (
              <>
                <p style={{ fontSize: 14, color: '#555', margin: '0 0 8px' }}>
                  Swiss Medical tiene 48 horas para procesar la factura adjuntada.
                </p>
                <p style={{ fontSize: 14, color: '#1f5d3a', margin: '0 0 8px' }}>
                  ⏳ <Countdown desde={sub.factura_adjuntada_en} horas={48} onReady={() => setReadyFactura(true)} />
                </p>
                <p style={{ fontSize: 13, color: '#666', margin: '0 0 12px' }}>
                  El contador es una recomendación, no bloquea la verificación.
                </p>
              </>
            ) : (
              <p style={{ fontSize: 14, color: '#1f5d3a', marginBottom: 12 }}>
                ✅ Ya pasaron 48 horas. Revisá si figura <strong>Aprobado</strong> en el portal.
              </p>
            )}
            <a
              href="https://www.swissmedical.com.ar/prestadores"
              target="_blank"
              rel="noopener noreferrer"
              style={{ ...linkStyle, display: 'inline-block', marginBottom: 12 }}
            >
              🔗 Abrir portal Swiss Medical
            </a>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button type="button" className="btn btn-primary" onClick={() => patch('marcar_aprobado')} disabled={saving}>
                ✓ Figura aprobado
              </button>
              <button
                type="button"
                className="btn"
                style={{ borderColor: '#e07b7b', color: '#842029' }}
                disabled={saving || exceptionSent}
                onClick={() => {
                  if (
                    window.confirm(
                      '¿Confirmar que no fue aprobado? Se enviará un mail de excepción a Swiss Medical con la factura y los datos del CAI.',
                    )
                  ) {
                    sendException();
                  }
                }}
              >
                {exceptionSent ? 'Mail enviado' : '✗ No fue aprobado'}
              </button>
            </div>
          </div>
        )}
        <button type="button" className="btn" style={{ marginTop: 12, fontSize: 13, color: '#666' }} onClick={goBack} disabled={saving}>
          ← Volver al paso anterior
        </button>
      </Step>
    </div>
  );
}
