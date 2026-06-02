'use client';

import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { FacturaARCA } from '@/components/arca/FacturaARCA';
import { montoFiscalPrincipal, montoParaFacturar } from '@/lib/cobros-montos';
import { isDemoUser } from '@/lib/demo-user';

type Submission = {
  id: string;
  periodo: string;
  obra_social: string;
  wizard_estado: string | null;
  wizard_paso: number | null;
  enviado_en: string;
  cantidad_partes: number | null;
  monto_total: number | null;
  monto_comprobante?: number | null;
  monto_facturado?: number | null;
  monto_cobrado?: number | null;
  comprobante_smg_path: string | null;
  factura_path: string | null;
  cae_numero: string | null;
  cae_vencimiento: string | null;
  numero_comprobante: number | null;
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
    <span className="cobros-wizard__countdown">
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
  const stepClass = [
    'cobros-wizard__step',
    activo ? 'cobros-wizard__step--active' : '',
    completado ? 'cobros-wizard__step--completed' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={stepClass}>
      <div className="cobros-wizard__step-head">
        <div className="cobros-wizard__step-badge">{completado ? '✓' : numero}</div>
        <span className="cobros-wizard__step-title">{titulo}</span>
      </div>
      {activo && children ? <div className="cobros-wizard__step-body">{children}</div> : null}
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
  const { user } = useUser();
  const demoUser = isDemoUser(user?.id);
  const [sub, setSub] = useState<Submission | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready48h, setReady48h] = useState(false);
  const [readyFactura, setReadyFactura] = useState(false);
  const [comprobanteFile, setComprobanteFile] = useState<File | null>(null);
  const [comprobanteUrlLoading, setComprobanteUrlLoading] = useState(false);
  const [caeNumero, setCaeNumero] = useState('');
  const [caeVencimiento, setCaeVencimiento] = useState('');
  const [exceptionSent, setExceptionSent] = useState(false);
  const demoStateKey = `traza.demo.swiss_wizard_state.${submissionId}`;

  const load = async () => {
    try {
      if (demoUser) {
        try {
          const raw = window.sessionStorage.getItem(demoStateKey);
          if (raw) {
            const parsed = JSON.parse(raw) as Submission;
            if (parsed && parsed.id) {
              setSub(parsed);
              setCaeNumero(parsed.cae_numero ?? '');
              setCaeVencimiento(parsed.cae_vencimiento ?? '');
              setLoading(false);
              return;
            }
          }
        } catch {
          // ignore y caemos al fetch
        }
      }
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
      setCaeNumero(j.submission.cae_numero ?? '');
      setCaeVencimiento(j.submission.cae_vencimiento ?? '');
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
        body: JSON.stringify({
          action,
          ...extraBody,
          ...(demoUser && sub
            ? {
                wizard_paso: sub.wizard_paso,
                wizard_estado: sub.wizard_estado,
                // Persistencia efímera demo (sin DB): reenviar estado relevante
                comprobante_smg_path: sub.comprobante_smg_path,
                monto_total: sub.monto_total,
                monto_comprobante: sub.monto_comprobante,
                monto_facturado: sub.monto_facturado,
                monto_cobrado: sub.monto_cobrado,
                factura_path: sub.factura_path,
                cae_numero: sub.cae_numero,
                cae_vencimiento: sub.cae_vencimiento,
                numero_comprobante: sub.numero_comprobante,
                factura_adjuntada_en: sub.factura_adjuntada_en,
                wizard_completado_en: sub.wizard_completado_en,
              }
            : {}),
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      if (demoUser && j.submission) {
        setSub(j.submission);
        setCaeNumero(j.submission.cae_numero ?? '');
        setCaeVencimiento(j.submission.cae_vencimiento ?? '');
        try {
          window.sessionStorage.setItem(demoStateKey, JSON.stringify(j.submission));
        } catch {
          /* ignore */
        }
      } else {
        await load();
      }
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
      if (demoUser && sub) {
        formData.append('wizard_paso', String(sub.wizard_paso ?? 1));
        if (sub.wizard_estado) formData.append('wizard_estado', sub.wizard_estado);
        if (sub.comprobante_smg_path) formData.append('comprobante_smg_path', sub.comprobante_smg_path);
        if (sub.monto_total != null) formData.append('monto_total', String(sub.monto_total));
        if (sub.factura_path) formData.append('factura_path', sub.factura_path);
        if (sub.cae_numero) formData.append('cae_numero', sub.cae_numero);
        if (sub.cae_vencimiento) formData.append('cae_vencimiento', sub.cae_vencimiento);
        if (sub.numero_comprobante != null) formData.append('numero_comprobante', String(sub.numero_comprobante));
        if (sub.factura_adjuntada_en) formData.append('factura_adjuntada_en', sub.factura_adjuntada_en);
        if (sub.wizard_completado_en) formData.append('wizard_completado_en', sub.wizard_completado_en);
      }
      const r = await fetch(`/api/submissions/${submissionId}/wizard`, {
        method: 'PATCH',
        body: formData,
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      if (demoUser && j.submission) {
        setSub(j.submission);
        setCaeNumero(j.submission.cae_numero ?? '');
        setCaeVencimiento(j.submission.cae_vencimiento ?? '');
        try {
          window.sessionStorage.setItem(demoStateKey, JSON.stringify(j.submission));
        } catch {
          /* ignore */
        }
      } else {
        await load();
      }
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
      if (demoUser && j.submission) {
        setSub(j.submission);
        setCaeNumero(j.submission.cae_numero ?? '');
        setCaeVencimiento(j.submission.cae_vencimiento ?? '');
        try {
          window.sessionStorage.setItem(demoStateKey, JSON.stringify(j.submission));
        } catch {
          /* ignore */
        }
      } else {
        await load();
      }
      onUpdate?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="cobros-wizard__loading">Cargando...</p>;
  if (!sub) return <p className="cobros-wizard__fatal">{error || 'No encontrado'}</p>;

  const estado = sub.wizard_estado ?? '';
  const paso = sub.wizard_paso ?? 1;
  const tieneComprobanteCargado = Boolean(sub.comprobante_smg_path?.trim());

  const revisarComprobante = async () => {
    setComprobanteUrlLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/submissions/${submissionId}/comprobante-url`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'No se pudo obtener el comprobante');
      const url = j.url as string;
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      if (j.filename) a.download = j.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al descargar');
    } finally {
      setComprobanteUrlLoading(false);
    }
  };
  const isAprobado = estado === 'aprobado';
  const isExcepcion = estado === 'excepcion_enviada';
  const isDescartado = estado === 'descartado';

  if (isAprobado) {
    return (
      <div className="cobros-wizard__state-aprobado">
        <div className="cobros-wizard__state-aprobado-icon">🎉</div>
        <h3 className="cobros-wizard__state-aprobado-title">¡Liquidación aprobada!</h3>
        <p className="cobros-wizard__text cobros-wizard__text--none">
          {periodoLabel(sub.periodo)} — el pago debería acreditarse en los próximos días.
        </p>
      </div>
    );
  }

  if (isExcepcion) {
    return (
      <div className="cobros-wizard__panel cobros-wizard__panel--warn">
        <strong>Solicitud de excepción enviada</strong>
        <p className="cobros-wizard__text cobros-wizard__text--tight" style={{ marginTop: 8 }}>
          Se envió un mail a Swiss Medical con la factura y los datos del CAE. Esperá su respuesta.
        </p>
      </div>
    );
  }

  if (isDescartado) {
    return (
      <div className="cobros-wizard__panel cobros-wizard__panel--neutral">
        <strong>Seguimiento descartado</strong>
        <p className="cobros-wizard__text cobros-wizard__text--tight" style={{ marginTop: 8 }}>
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
    <div className="cobros-wizard">
      <p className="cobros-wizard__intro">
        Liquidación <strong>{periodoLabel(sub.periodo)}</strong> · {sub.cantidad_partes ?? 0} parte(s) enviados el{' '}
        {new Date(sub.enviado_en).toLocaleDateString('es-AR')}
      </p>

      {error ? <div className="cobros-wizard__error-inline">{error}</div> : null}

      <div className="cobros-wizard__toolbar">
        {paso > 1 && (
          <button
            type="button"
            className="btn"
            style={{ fontSize: 12 }}
            disabled={saving}
            onClick={() => {
              if (
                window.confirm(
                  '¿Reiniciar el proceso de cobro desde el paso 1?\n\n' +
                    `El envío de planilla de ${periodoLabel(sub.periodo)} con otro parte sigue registrado en Trazá, pero vas a cargar comprobante, factura y adjunto de nuevo para este parte.\n\n` +
                    'Se borran en este seguimiento: comprobante SMG, factura ARCA (CAE/PDF) y datos de adjunto en portal.',
                )
              ) {
                patch('reiniciar_cobro');
              }
            }}
          >
            Reiniciar cobro desde paso 1
          </button>
        )}
        <button
          type="button"
          className="btn cobros-wizard__btn-muted"
          style={{ fontSize: 12 }}
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

      {paso > 1 ? (
        <div className="cobros-wizard__notice">
          Si cargaste un <strong>parte nuevo</strong> en el mismo período que otro envío, usá{' '}
          <strong>Reiniciar cobro desde paso 1</strong> para no quedar en el paso de un parte anterior.
        </div>
      ) : null}

      {/* Paso 1 */}
      <Step numero={1} titulo="Esperá 48 horas para que Swiss Medical procese la liquidación" activo={paso === 1} completado={paso > 1}>
        {!ready48h ? (
          <div>
            <p className="cobros-wizard__text cobros-wizard__text--tight">
              Enviamos la planilla el {new Date(sub.enviado_en).toLocaleDateString('es-AR')}. Swiss Medical necesita tiempo para
              procesarla.
            </p>
            <p className="cobros-wizard__text-accent cobros-wizard__text--none">
              ⏳ <Countdown desde={sub.enviado_en} horas={48} onReady={() => setReady48h(true)} />
            </p>
            <p className="cobros-wizard__text-muted">
              El contador es una recomendación, no bloquea el proceso.
            </p>
            <button type="button" className="btn btn-primary" onClick={() => patch('comprobante_disponible')} disabled={saving}>
              Avanzar y revisar el portal →
            </button>
          </div>
        ) : (
          <div>
            <p className="cobros-wizard__text-accent">✅ Ya pasaron 48 horas. Podés revisar el portal de Swiss Medical.</p>
            <button type="button" className="btn btn-primary" onClick={() => patch('comprobante_disponible')} disabled={saving}>
              Entendido, voy a revisar →
            </button>
          </div>
        )}
      </Step>

      {/* Paso 2 */}
      <Step numero={2} titulo="Revisá el comprobante en el portal de Swiss Medical" activo={paso === 2} completado={paso > 2}>
        <p className="cobros-wizard__text">
          Ingresá al portal de prestadores, andá a <strong>Trámites online → Consulta de liquidación</strong>, seleccioná{' '}
          <strong>{periodoLabel(sub.periodo)}</strong> y verificá que aparezca el comprobante.
        </p>
        <img src="/wizard/paso2_menu.png" alt="Menú Trámites online" className="cobros-wizard__img" />
        <img src="/wizard/paso2_mes.png" alt="Selector de mes" className="cobros-wizard__img cobros-wizard__img--tight" />
        <a
          href="https://www.swissmedical.com.ar/prestadores"
          target="_blank"
          rel="noopener noreferrer"
          className="cobros-wizard__link"
        >
          🔗 Abrir portal Swiss Medical
        </a>
        <br />
        <p className="cobros-wizard__text-soft">¿Aparece el comprobante?</p>
        <div className="cobros-wizard__step-actions">
          <button type="button" className="btn btn-primary" disabled={saving} onClick={() => patch('comprobante_disponible')}>
            Sí, aparece el comprobante
          </button>
          <button type="button" className="btn" onClick={() => onCollapse?.()}>
            Todavía no — vuelvo después
          </button>
        </div>
        <button type="button" className="btn cobros-wizard__btn-muted" style={{ marginTop: 12, fontSize: 13 }} onClick={goBack} disabled={saving}>
          ← Volver al paso anterior
        </button>
      </Step>

      {/* Paso 3 */}
      <Step numero={3} titulo="Descargá y subí el comprobante de Swiss Medical" activo={paso === 3} completado={paso > 3}>
        <p className="cobros-wizard__text">
          {tieneComprobanteCargado
            ? 'Ya tenés un comprobante registrado en Trazá. Podés revisarlo y continuar.'
            : 'Descargá el comprobante desde el portal y subilo acá para tener el registro en Trazá.'}
        </p>
        <img src="/wizard/paso3_comprobante.png" alt="Descargar comprobante y verificar Aprobado" className="cobros-wizard__img" />
        {tieneComprobanteCargado && (
          <div className="cobros-wizard__panel cobros-wizard__panel--ok">
            <p className="cobros-wizard__text cobros-wizard__text--tight" style={{ marginBottom: 10 }}>
              ✓ Comprobante SMG disponible {demoUser ? '— DEMO' : ''}
              {montoFiscalPrincipal(sub) != null && montoFiscalPrincipal(sub)! > 0
                ? ` · monto $${montoFiscalPrincipal(sub)!.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
                : ''}
            </p>
            <div className="cobros-wizard__step-actions">
              <button
                type="button"
                className="btn"
                disabled={comprobanteUrlLoading || saving}
                onClick={() => void revisarComprobante()}
              >
                {comprobanteUrlLoading ? 'Abriendo...' : '📄 Revisar / descargar comprobante'}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={saving}
                onClick={() => patch('subir_comprobante')}
              >
                {saving ? 'Continuando...' : 'Continuar con este comprobante →'}
              </button>
            </div>
          </div>
        )}
        {!demoUser && (
          <>
            <div className="cobros-wizard__file-input-wrap">
              <label className="cobros-wizard__label">Comprobante SMG (PDF)</label>
              <input
                type="file"
                className="cobros-wizard__file-input"
                accept="application/pdf"
                onChange={(e) => setComprobanteFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!comprobanteFile || saving}
              onClick={async () => {
                if (!comprobanteFile) return;
                const fd = new FormData();
                fd.append('file', comprobanteFile);
                await patchFormData('subir_comprobante', fd);
              }}
            >
              {saving ? 'Subiendo...' : 'Subir comprobante'}
            </button>
          </>
        )}
        <button type="button" className="btn cobros-wizard__btn-muted" style={{ marginTop: 12, fontSize: 13 }} onClick={goBack} disabled={saving}>
          ← Volver al paso anterior
        </button>
      </Step>

      {/* Paso 4 */}
      <Step numero={4} titulo="Emitir factura en ARCA" activo={paso === 4} completado={paso > 4}>
        <FacturaARCA
          submissionId={sub.id}
          monto={montoParaFacturar(sub)}
          periodo={sub.periodo}
          facturaYaEmitida={
            sub.cae_numero
              ? {
                  cae: sub.cae_numero,
                  caeVencimiento: sub.cae_vencimiento,
                  nroComprobante: sub.numero_comprobante,
                  pdfPath: sub.factura_path,
                }
              : undefined
          }
          onExito={async (_cae, _vto, _nro, montoFacturado) => {
            await patch('factura_emitida', { monto_facturado: montoFacturado });
          }}
          onNotaCreditoEmitida={async () => {
            await load();
            onUpdate?.();
          }}
          onError={(mensaje) => {
            console.error('Error emitiendo factura:', mensaje);
          }}
        />
        <button
          type="button"
          className="btn cobros-wizard__btn-muted"
          style={{ marginTop: 12, fontSize: 13 }}
          onClick={goBack}
          disabled={saving}
        >
          ← Volver al paso anterior
        </button>
      </Step>

      {/* Paso 5 */}
      <Step numero={5} titulo="Adjuntá la factura en el portal de Swiss Medical" activo={paso === 5} completado={paso > 5}>
        <p className="cobros-wizard__text">
          Descargá la factura del paso anterior y subila manualmente en el portal de prestadores de Swiss Medical. En la
          Consulta de liquidación, hacé click en el <strong>clip 📎</strong> de la fila correspondiente.
        </p>
        <img src="/wizard/paso5_adjuntar.png" alt="Adjuntar factura con el clip" className="cobros-wizard__img" />
        <p className="cobros-wizard__text">
          Una vez adjuntada en el portal, confirmá acá los datos del CAE que ingresaste.
        </p>
        <div className="cobros-wizard__cae-grid">
          <div>
            <label className="cobros-wizard__label">Número de CAE</label>
            <input className="cobros-wizard__input" value={caeNumero} onChange={(e) => setCaeNumero(e.target.value)} placeholder="Ej: 12345678901234" />
          </div>
          <div>
            <label className="cobros-wizard__label">Fecha de vencimiento del CAE</label>
            <input type="date" className="cobros-wizard__input" value={caeVencimiento} onChange={(e) => setCaeVencimiento(e.target.value)} />
          </div>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!caeNumero.trim() || !caeVencimiento || saving}
          onClick={() => patch('adjuntar_factura', { cae_numero: caeNumero, cae_vencimiento: caeVencimiento })}
        >
          {saving ? 'Guardando...' : 'Confirmar adjunto en el portal'}
        </button>
        <button type="button" className="btn cobros-wizard__btn-muted" style={{ marginTop: 12, fontSize: 13 }} onClick={goBack} disabled={saving}>
          ← Volver al paso anterior
        </button>
      </Step>

      {/* Paso 6 */}
      <Step numero={6} titulo="Verificá la aprobación (48 horas)" activo={paso === 6} completado={isAprobado}>
        {!sub.factura_adjuntada_en ? (
          <p className="cobros-wizard__text-soft cobros-wizard__text--none">Completá el paso anterior para iniciar esta espera.</p>
        ) : (
          <div>
            {!readyFactura ? (
              <>
                <p className="cobros-wizard__text cobros-wizard__text--tight">
                  Swiss Medical tiene 48 horas para procesar la factura adjuntada.
                </p>
                <p className="cobros-wizard__text-accent cobros-wizard__text--tight">
                  ⏳ <Countdown desde={sub.factura_adjuntada_en} horas={48} onReady={() => setReadyFactura(true)} />
                </p>
                <p className="cobros-wizard__text-muted">
                  El contador es una recomendación, no bloquea la verificación.
                </p>
              </>
            ) : (
              <p className="cobros-wizard__text-accent">
                ✅ Ya pasaron 48 horas. Revisá si figura <strong>Aprobado</strong> en el portal.
              </p>
            )}
            <a
              href="https://www.swissmedical.com.ar/prestadores"
              target="_blank"
              rel="noopener noreferrer"
              className="cobros-wizard__link cobros-wizard__link--inline"
            >
              🔗 Abrir portal Swiss Medical
            </a>
            <div className="cobros-wizard__step-actions" style={{ marginTop: 8 }}>
              <button type="button" className="btn btn-primary" onClick={() => patch('marcar_aprobado')} disabled={saving}>
                ✓ Figura aprobado
              </button>
              <button
                type="button"
                className="btn cobros-wizard__btn-danger-outline"
                disabled={saving || exceptionSent}
                onClick={() => {
                  if (
                    window.confirm(
                      '¿Confirmar que no fue aprobado? Se enviará un mail de excepción a Swiss Medical con la factura y los datos del CAE.',
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
        <button type="button" className="btn cobros-wizard__btn-muted" style={{ marginTop: 12, fontSize: 13 }} onClick={goBack} disabled={saving}>
          ← Volver al paso anterior
        </button>
      </Step>
    </div>
  );
}
