"use client";

import { useState, useEffect } from "react";
import { useWizardProgress } from "./wizard-arca/useWizardProgress";
import {
  WIZARD_STEPS,
  type WizardStepId,
} from "./wizard-arca/types";
import { toggleWizardManualStep } from "@/app/actions/wizard-arca";

interface WizardArcaSetupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tieneFacturaEmitida?: boolean;
}

// ──────────────────────────────────────────────────────────────────────
// Estilos compartidos (inline para no depender de Tailwind/shadcn)
// ──────────────────────────────────────────────────────────────────────
const cssTokens = {
  bgPanel: "var(--bg-panel, #ffffff)",
  bgSunken: "var(--bg-sunken, #f3f4f6)",
  text: "var(--text, #111827)",
  textMuted: "var(--text-muted, #6b7280)",
  border: "var(--border, #e5e7eb)",
  accent: "var(--accent, #146c43)",
  accentSoft: "var(--accent-soft, #d1fae5)",
  warn: "var(--warn, #d97706)",
  warnSoft: "#fef3c7",
  error: "var(--error, #b91c1c)",
};

// ──────────────────────────────────────────────────────────────────────
// ManualStepCheck inline (checkbox manual con persistencia)
// ──────────────────────────────────────────────────────────────────────
function ManualStepCheck({
  stepId,
  label = "Ya hice este paso en ARCA",
  isCompleto,
  onChange,
}: {
  stepId: WizardStepId;
  label?: string;
  isCompleto: boolean;
  onChange: () => void;
}) {
  const [checked, setChecked] = useState(isCompleto);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setChecked(isCompleto);
  }, [isCompleto]);

  async function handleToggle() {
    const next = !checked;
    setChecked(next);
    setSaving(true);
    try {
      const result = await toggleWizardManualStep(stepId, next);
      if (!result.ok) {
        setChecked(!next);
        console.error("Error guardando paso manual:", result.error);
      } else {
        onChange();
      }
    } catch (e) {
      setChecked(!next);
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: 14,
        background: cssTokens.bgSunken,
        border: `1px solid ${cssTokens.border}`,
        borderRadius: 8,
        cursor: saving ? "wait" : "pointer",
        marginTop: 12,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={handleToggle}
        disabled={saving}
        style={{ width: 18, height: 18, cursor: "pointer", accentColor: cssTokens.accent }}
      />
      <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{label}</span>
      {saving && <span style={{ fontSize: 12, color: cssTokens.textMuted }}>Guardando…</span>}
      {checked && !saving && <span style={{ color: cssTokens.accent, fontWeight: 700 }}>✓</span>}
    </label>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Componentes auxiliares para los pasos
// ──────────────────────────────────────────────────────────────────────
function CalloutWarning({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: cssTokens.warnSoft,
        border: `1px solid ${cssTokens.warn}`,
        borderRadius: 8,
        padding: 14,
        marginTop: 14,
        fontSize: 14,
        lineHeight: 1.5,
      }}
    >
      <strong style={{ display: "block", marginBottom: 6, color: "#92400e" }}>
        ⚠️ Atención
      </strong>
      <div style={{ color: "#7c2d12" }}>{children}</div>
    </div>
  );
}

function CalloutSuccess({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: cssTokens.accentSoft,
        border: `1px solid ${cssTokens.accent}`,
        borderRadius: 8,
        padding: 14,
        marginTop: 14,
        fontSize: 14,
        lineHeight: 1.5,
      }}
    >
      {children}
    </div>
  );
}

function CalloutInfo({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: cssTokens.bgSunken,
        border: `1px solid ${cssTokens.border}`,
        borderRadius: 8,
        padding: 14,
        marginTop: 14,
        fontSize: 14,
        lineHeight: 1.5,
      }}
    >
      {children}
    </div>
  );
}

function ExternalLinkButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="btn btn-ghost"
      style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 12 }}
    >
      {children} ↗
    </a>
  );
}

function InternalLinkButton({
  view,
  children,
  onClose,
}: {
  view: "dashboard" | "cobros" | "upload" | "documents" | "errors" | "settings";
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <button
      type="button"
      className="btn btn-primary"
      style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 12 }}
      onClick={() => {
        onClose();
        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent("traza:navigate", { detail: { view } }),
          );
        }, 0);
      }}
    >
      {children} →
    </button>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Contenido de cada paso
// ──────────────────────────────────────────────────────────────────────
function StepContent({
  stepId,
  isCompleto,
  onManualToggle,
  onClose,
}: {
  stepId: WizardStepId;
  isCompleto: boolean;
  onManualToggle: () => void;
  onClose: () => void;
}) {
  switch (stepId) {
    // ────── PASO 1 ──────
    case "datos-fiscales":
      return (
        <>
          <p>
            Antes de tocar nada en ARCA, asegurate de tener completos tus datos fiscales en
            Trazá. Vamos a usarlos para emitir las facturas a tu nombre.
          </p>
          <CalloutInfo>
            <strong>Necesitamos:</strong>
            <ul style={{ margin: "8px 0 0 20px", padding: 0 }}>
              <li>CUIT (queda bloqueado una vez guardado, revisalo bien)</li>
              <li>Razón social (tu nombre completo si sos monotributista)</li>
              <li>Domicilio fiscal</li>
              <li>Condición frente al IVA (típicamente Monotributo)</li>
              <li>Punto de venta (lo creamos en el próximo paso si no existe)</li>
            </ul>
          </CalloutInfo>
          {isCompleto ? (
            <CalloutSuccess>
              <strong>✓ Datos fiscales completos.</strong> Podés avanzar al paso 2.
            </CalloutSuccess>
          ) : (
            <button type="button" className="btn btn-primary" style={{ marginTop: 12 }} onClick={onClose}>
              Volver a Cuenta fiscal
            </button>
          )}
        </>
      );

    // ────── PASO 2 ──────
    case "crear-pv-webservices":
      return (
        <>
          <p>
            Para emitir facturas vía webservices necesitás un Punto de Venta del{" "}
            <strong>tipo correcto</strong>. Este es el paso que más confunde, prestale atención.
          </p>
          <CalloutWarning>
            <strong>No alcanza con cualquier punto de venta.</strong>
            <p style={{ marginTop: 6, marginBottom: 0 }}>
              Si tenés un PV tipo <em>“Factura en Línea - Monotributo”</em>, ese{" "}
              <strong>no sirve</strong> para Trazá. Es solo para el portal web de ARCA. Tenés
              que crear uno nuevo del tipo{" "}
              <em>“Factura Electrónica - Monotributo - Web Services”</em>.
            </p>
          </CalloutWarning>
          <h4 style={{ marginTop: 18, marginBottom: 8 }}>Pasos en ARCA</h4>
          <ol style={{ paddingLeft: 20, lineHeight: 1.7, fontSize: 14 }}>
            <li>Ingresá al portal de ARCA con tu clave fiscal</li>
            <li>
              Buscá el servicio{" "}
              <strong>“Administración de puntos de venta y domicilios”</strong>
            </li>
            <li>Click en <strong>“Agregar”</strong></li>
            <li>
              Elegí el sistema:{" "}
              <strong>“Factura Electrónica - Monotributo - Web Services”</strong>
            </li>
            <li>Anotá el número de PV que te asigna ARCA</li>
            <li>Si el número difiere del que tenés en Trazá, actualizalo en Cuenta fiscal</li>
          </ol>
          <ExternalLinkButton href="https://serviciosweb.afip.gob.ar/genericos/comprobantes/cai.aspx">
            Abrir portal de ARCA
          </ExternalLinkButton>
          <ManualStepCheck
            stepId="crear-pv-webservices"
            label="Creé un PV tipo Web Services en ARCA"
            isCompleto={isCompleto}
            onChange={onManualToggle}
          />
        </>
      );

    // ────── PASO 3 ──────
    case "generar-csr":
      return (
        <>
          <p>
            Trazá necesita un par de claves criptográficas (privada y pública) para identificarse
            ante ARCA. Vamos a generarlas acá mismo.
          </p>
          <CalloutInfo>
            <strong>🔑 Qué va a pasar</strong>
            <ul style={{ margin: "8px 0 0 20px", padding: 0 }}>
              <li>
                Generamos una <strong>clave privada</strong> (queda guardada de forma segura en
                Trazá, nunca sale del servidor)
              </li>
              <li>
                Generamos un <strong>CSR</strong> (Certificate Signing Request): un pedido para
                que ARCA emita tu certificado
              </li>
              <li>
                Vas a copiar ese CSR (un bloque de texto largo) para pegarlo en ARCA en el paso 5
              </li>
            </ul>
          </CalloutInfo>
          <CalloutWarning>
            Si ya generaste un CSR antes y volvés a generarlo, Trazá te va a preguntar si querés
            sobrescribir la clave existente. Si vas a usar el certificado actual, no lo regeneres.
          </CalloutWarning>
          {isCompleto ? (
            <CalloutSuccess>
              <strong>✓ CSR generado.</strong> Si necesitás copiarlo de nuevo, podés hacerlo
              desde tu perfil.
            </CalloutSuccess>
          ) : null}
          <button type="button" className="btn btn-primary" style={{ marginTop: 12 }} onClick={onClose}>
            Volver a Certificado ARCA
          </button>
        </>
      );

    // ────── PASO 4 ──────
    case "entrar-portal-certs":
      return (
        <>
          <p>
            Vamos al portal de ARCA para crear el certificado a partir del CSR que acabás de
            generar.
          </p>
          <h4 style={{ marginTop: 18, marginBottom: 8 }}>Pasos en ARCA</h4>
          <ol style={{ paddingLeft: 20, lineHeight: 1.7, fontSize: 14 }}>
            <li>Ingresá al portal de ARCA con tu clave fiscal</li>
            <li>
              Buscá el servicio <strong>“Administración de Certificados Digitales”</strong>
            </li>
            <li>Si no aparece, usá el buscador del portal para encontrarlo</li>
          </ol>
          <CalloutWarning>
            <strong>No te confundas con WSASS.</strong>
            <p style={{ marginTop: 6, marginBottom: 0 }}>
              <code>WSASS</code> (wsass-homo.afip.gob.ar) es solo para ambiente de homologación.
              Para producción real, el servicio correcto es{" "}
              <strong>“Administración de Certificados Digitales”</strong>.
            </p>
          </CalloutWarning>
          <ExternalLinkButton href="https://auth.afip.gob.ar/contribuyente/">
            Ir al portal de ARCA
          </ExternalLinkButton>
          <ManualStepCheck
            stepId="entrar-portal-certs"
            label="Entré a Administración de Certificados Digitales"
            isCompleto={isCompleto}
            onChange={onManualToggle}
          />
        </>
      );

    // ────── PASO 5 ──────
    case "crear-certificado":
      return (
        <>
          <p>
            Dentro de “Administración de Certificados Digitales” vas a crear un nuevo certificado
            pegando el CSR que generaste en el paso 3.
          </p>
          <h4 style={{ marginTop: 18, marginBottom: 8 }}>Pasos en ARCA</h4>
          <ol style={{ paddingLeft: 20, lineHeight: 1.7, fontSize: 14 }}>
            <li>Click en <strong>“Agregar alias”</strong></li>
            <li>
              En “Alias”, poné un nombre identificable, por ejemplo{" "}
              <code>TrazaProd</code> o <code>Traza</code>
            </li>
            <li>
              Pegá el <strong>CSR completo</strong> que copiaste en el paso 3 (incluyendo las
              líneas <code>-----BEGIN CERTIFICATE REQUEST-----</code> y{" "}
              <code>-----END CERTIFICATE REQUEST-----</code>)
            </li>
            <li>Confirmá</li>
            <li>
              El certificado queda creado con estado <strong>VÁLIDO</strong>
            </li>
          </ol>
          <ManualStepCheck
            stepId="crear-certificado"
            label="Creé el certificado y pegué el CSR"
            isCompleto={isCompleto}
            onChange={onManualToggle}
          />
        </>
      );

    // ────── PASO 6 ──────
    case "adherir-servicios":
      return (
        <>
          <p>
            El certificado ya existe, pero todavía no puede hacer nada. Hay que darle permiso
            para usar dos servicios de ARCA: <strong>Facturación Electrónica</strong> y{" "}
            <strong>Consulta Padrón A13</strong>.
          </p>
          <div
            style={{
              background: cssTokens.warnSoft,
              border: `2px solid ${cssTokens.warn}`,
              borderRadius: 8,
              padding: 16,
              marginTop: 14,
            }}
          >
            <strong style={{ display: "block", marginBottom: 10, color: "#92400e", fontSize: 15 }}>
              🚨 Lo más importante de toda la configuración
            </strong>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 8 }}>
              <span style={{ color: cssTokens.error, fontWeight: 700 }}>✗</span>
              <div>
                <strong style={{ color: cssTokens.error }}>NO uses “Adherir Servicio”.</strong>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "#7c2d12" }}>
                  Genera el error <em>“El dador de la autorización no debe ser igual al
                  autorizado”</em> y te traba.
                </p>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <span style={{ color: cssTokens.accent, fontWeight: 700 }}>✓</span>
              <div>
                <strong style={{ color: cssTokens.accent }}>
                  Sí usá “Nueva Relación”
                </strong>{" "}
                <span style={{ fontSize: 13, color: "#7c2d12" }}>
                  en el Administrador de Relaciones de Clave Fiscal.
                </span>
              </div>
            </div>
          </div>
          <h4 style={{ marginTop: 18, marginBottom: 8 }}>Cómo hacerlo</h4>
          <ol style={{ paddingLeft: 20, lineHeight: 1.7, fontSize: 14 }}>
            <li>
              Volvé al <strong>“Administrador de Relaciones de Clave Fiscal”</strong>
            </li>
            <li>Click en <strong>“Nueva Relación”</strong></li>
            <li>
              En <strong>Servicio</strong> → Buscar → <strong>ARCA</strong> →{" "}
              <strong>WebServices</strong> → <strong>“Facturación Electrónica”</strong>
            </li>
            <li>
              En <strong>Representante</strong> → Buscar →{" "}
              <strong>“Computador Fiscal”</strong> → seleccionar el alias del certificado (ej:{" "}
              <code>TrazaProd</code>)
            </li>
            <li>Confirmar</li>
            <li>
              <strong>Repetir todo</strong> para el servicio{" "}
              <strong>“Servicio Consulta Padrón A13”</strong>
            </li>
          </ol>
          <ManualStepCheck
            stepId="adherir-servicios"
            label="Adherí Facturación Electrónica y Padrón A13 vía Nueva Relación"
            isCompleto={isCompleto}
            onChange={onManualToggle}
          />
        </>
      );

    // ────── PASO 7 ──────
    case "descargar-crt":
      return (
        <>
          <p>
            Casi terminamos del lado de ARCA. Solo falta descargar el archivo del certificado
            para subirlo a Trazá.
          </p>
          <h4 style={{ marginTop: 18, marginBottom: 8 }}>Pasos en ARCA</h4>
          <ol style={{ paddingLeft: 20, lineHeight: 1.7, fontSize: 14 }}>
            <li>
              Volvé a <strong>“Administración de Certificados Digitales”</strong>
            </li>
            <li>
              Click en el certificado que creaste (alias <em>TrazaProd</em> o el que hayas usado)
            </li>
            <li>
              Buscá el <strong>botón de descarga</strong> (ícono de flecha hacia abajo o disquete)
            </li>
            <li>
              Se descarga un archivo con extensión <code>.crt</code>
            </li>
            <li>Guardalo en un lugar fácil de encontrar, lo vas a usar ya</li>
          </ol>
          <ManualStepCheck
            stepId="descargar-crt"
            label="Descargué el archivo .crt"
            isCompleto={isCompleto}
            onChange={onManualToggle}
          />
        </>
      );

    // ────── PASO 8 ──────
    case "subir-crt":
      return (
        <>
          <p>
            Subí el archivo <code>.crt</code> que descargaste de ARCA. Trazá va a validar que
            coincida con la clave privada generada en el paso 3.
          </p>
          <CalloutInfo>
            <strong>📤 Cómo</strong>
            <ol style={{ margin: "8px 0 0 20px", padding: 0 }}>
              <li>Volvé a tu perfil → sección Certificado ARCA</li>
              <li>
                Click en <strong>“Subir certificado”</strong>
              </li>
              <li>Seleccioná el archivo .crt</li>
              <li>
                Trazá valida el <em>modulus</em> contra tu clave privada. Si todo OK, el badge
                cambia a <strong>“Listo para facturar”</strong>
              </li>
            </ol>
          </CalloutInfo>
          {isCompleto ? (
            <CalloutSuccess>
              <strong>✓ Certificado subido y validado.</strong>
            </CalloutSuccess>
          ) : (
            <CalloutWarning>
              Si la validación falla con <em>modulus no coincide</em>, regeneraste el CSR después
              de pedir el certificado. Volvé al paso 3 con un CSR fresco.
            </CalloutWarning>
          )}
          <button type="button" className="btn btn-primary" style={{ marginTop: 12 }} onClick={onClose}>
            Volver a Certificado ARCA
          </button>
        </>
      );

    // ────── PASO 9 ──────
    case "cambiar-ambiente-prod":
      return (
        <>
          <p>
            Hasta acá todo el setup se puede probar en homologación. Cuando estés seguro de que
            todo funciona, cambiá el ambiente a <strong>Producción</strong>.
          </p>
          <div
            style={{
              background: cssTokens.warnSoft,
              border: `2px solid ${cssTokens.warn}`,
              borderRadius: 8,
              padding: 16,
              marginTop: 14,
            }}
          >
            <strong style={{ display: "block", marginBottom: 6, color: "#92400e" }}>
              ⚠️ Esto es irreversible para la factura emitida
            </strong>
            <p style={{ margin: 0, fontSize: 14, color: "#7c2d12", lineHeight: 1.5 }}>
              Desde el momento que cambiás a producción, las facturas que emitas son{" "}
              <strong>reales</strong> y tienen validez fiscal ante ARCA. Si te equivocás, vas a
              tener que emitir una Nota de Crédito para anularla.
            </p>
          </div>
          <CalloutInfo>
            <strong>Antes de cambiar, asegurate de:</strong>
            <ul style={{ margin: "8px 0 0 20px", padding: 0 }}>
              <li>Haber probado al menos una emisión en homologación</li>
              <li>
                Tener un <strong>PV de producción</strong> configurado en Cuenta fiscal
              </li>
              <li>
                Que el certificado subido sea el <strong>de producción</strong>
              </li>
            </ul>
          </CalloutInfo>
          {isCompleto ? (
            <CalloutSuccess>
              <strong>✓ Estás en producción.</strong> Las facturas que emitas son reales y tienen
              validez fiscal.
            </CalloutSuccess>
          ) : (
            <button type="button" className="btn btn-primary" style={{ marginTop: 12 }} onClick={onClose}>
              Volver a Cuenta fiscal
            </button>
          )}
        </>
      );

    // ────── PASO 10 ──────
    case "factura-prueba":
      return (
        <>
          <p>
            Antes de emitir tu primera factura real a un paciente o a una obra social, te
            recomendamos hacer una <strong>prueba de monto mínimo</strong>.
          </p>
          <CalloutInfo>
            <strong>✨ Sugerencia</strong>
            <ul style={{ margin: "8px 0 0 20px", padding: 0 }}>
              <li>
                Emití una factura de <strong>$1</strong> a tu propio CUIT
              </li>
              <li>Verificá que la respuesta incluya un CAE de 14 dígitos</li>
              <li>Revisá el PDF: tiene que tener el QR fiscal correcto</li>
              <li>
                Si te equivocaste o querés revertir la prueba, vas a poder emitir una Nota de
                Crédito desde Trazá (próximamente)
              </li>
            </ul>
          </CalloutInfo>
          {isCompleto ? (
            <CalloutSuccess>
              <strong>🎉 Tenés al menos una factura emitida con CAE.</strong> Felicitaciones,
              ARCA está completamente operativo en Trazá.
            </CalloutSuccess>
          ) : (
            <>
              <InternalLinkButton view="documents" onClose={onClose}>
                Ir a emitir factura
              </InternalLinkButton>
              <p style={{ marginTop: 16, fontSize: 12, color: cssTokens.textMuted }}>
                Si ya hiciste una prueba por fuera del flujo normal, marcala manualmente:
              </p>
              <ManualStepCheck
                stepId="factura-prueba"
                label="Ya hice una factura de prueba y el CAE volvió correctamente"
                isCompleto={isCompleto}
                onChange={onManualToggle}
              />
            </>
          )}
        </>
      );

    default:
      return <p>Paso no encontrado.</p>;
  }
}

// ──────────────────────────────────────────────────────────────────────
// Shell principal
// ──────────────────────────────────────────────────────────────────────
export function WizardArcaSetup({
  open,
  onOpenChange,
  tieneFacturaEmitida,
}: WizardArcaSetupProps) {
  const [mounted, setMounted] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const progress = useWizardProgress({ tieneFacturaEmitida });
  const [activeStepId, setActiveStepId] = useState<WizardStepId>(progress.pasoActual);

  useEffect(() => {
    if (open) setActiveStepId(progress.pasoActual);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!mounted || !open) return null;

  const activeIndex = WIZARD_STEPS.findIndex((s) => s.id === activeStepId);
  const activeStep = WIZARD_STEPS[activeIndex];
  const canGoBack = activeIndex > 0;
  const canGoForward = activeIndex < WIZARD_STEPS.length - 1;

  const goPrev = () =>
    canGoBack && setActiveStepId(WIZARD_STEPS[activeIndex - 1].id);
  const goNext = () =>
    canGoForward && setActiveStepId(WIZARD_STEPS[activeIndex + 1].id);

  const handleManualToggle = () => {
    // Forzar refetch del profile en el siguiente render
    setRefreshKey((k) => k + 1);
    window.dispatchEvent(new Event("traza:fiscal-profile-updated"));
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={() => onOpenChange(false)}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0, 0, 0, 0.5)",
          backdropFilter: "blur(2px)",
        }}
      />

      <div
        style={{
          position: "relative",
          background: cssTokens.bgPanel,
          color: cssTokens.text,
          borderRadius: 12,
          width: "100%",
          maxWidth: 1100,
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
          border: `1px solid ${cssTokens.border}`,
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 24px",
            borderBottom: `1px solid ${cssTokens.border}`,
            gap: 16,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>
              Configuración guiada de ARCA
            </h2>
            <p style={{ margin: "2px 0 0", fontSize: 13, color: cssTokens.textMuted }}>
              Seguí los pasos para emitir facturas electrónicas desde Trazá.
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 12, color: cssTokens.textMuted, marginBottom: 4 }}>
                {progress.completados.size} de {WIZARD_STEPS.length} pasos
              </div>
              <div
                style={{
                  width: 140,
                  height: 6,
                  background: cssTokens.bgSunken,
                  borderRadius: 3,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${progress.porcentaje}%`,
                    height: "100%",
                    background: cssTokens.accent,
                    transition: "width 0.3s",
                  }}
                />
              </div>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              style={{
                background: "transparent",
                border: "none",
                fontSize: 24,
                cursor: "pointer",
                color: cssTokens.textMuted,
                width: 32,
                height: 32,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 6,
              }}
              aria-label="Cerrar"
            >
              ×
            </button>
          </div>
        </header>

        {progress.todoCompleto && (
          <div
            style={{
              background: cssTokens.accentSoft,
              borderBottom: `1px solid ${cssTokens.accent}`,
              padding: "10px 24px",
              fontSize: 14,
            }}
          >
            <strong>🎉 ¡Listo!</strong> Tenés ARCA configurado y estás emitiendo facturas en
            producción.
          </div>
        )}

        {/* Body: sidebar + content */}
        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
          {/* Sidebar */}
          <aside
            style={{
              width: 280,
              background: cssTokens.bgSunken,
              borderRight: `1px solid ${cssTokens.border}`,
              overflowY: "auto",
              padding: 8,
              flexShrink: 0,
            }}
          >
            {WIZARD_STEPS.map((step) => {
              const isCompleto = progress.isStepCompleto(step.id);
              const isActive = step.id === activeStepId;
              return (
                <button
                  key={step.id}
                  onClick={() => setActiveStepId(step.id)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 12px",
                    borderRadius: 8,
                    marginBottom: 4,
                    background: isActive ? cssTokens.bgPanel : "transparent",
                    border: isActive ? `1px solid ${cssTokens.border}` : "1px solid transparent",
                    cursor: "pointer",
                    display: "flex",
                    gap: 10,
                    alignItems: "flex-start",
                    boxShadow: isActive ? "0 1px 3px rgba(0,0,0,0.05)" : "none",
                  }}
                >
                  <span
                    style={{
                      flexShrink: 0,
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      background: isCompleto ? cssTokens.accent : "transparent",
                      border: isCompleto ? "none" : `2px solid ${cssTokens.border}`,
                      color: "white",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                      fontWeight: 700,
                      marginTop: 1,
                    }}
                  >
                    {isCompleto ? "✓" : ""}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 11,
                        color: cssTokens.textMuted,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                      }}
                    >
                      Paso {step.numero}
                      {step.critico && (
                        <span
                          style={{
                            marginLeft: 6,
                            color: cssTokens.warn,
                            fontSize: 10,
                          }}
                        >
                          ● CLAVE
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        marginTop: 2,
                        lineHeight: 1.3,
                        color: isCompleto && !isActive ? cssTokens.textMuted : cssTokens.text,
                        textDecoration: isCompleto && !isActive ? "line-through" : "none",
                      }}
                    >
                      {step.titulo}
                    </div>
                  </div>
                </button>
              );
            })}
          </aside>

          {/* Content */}
          <main style={{ flex: 1, overflowY: "auto", padding: "24px 32px" }}>
            <div style={{ maxWidth: 680 }}>
              <div style={{ marginBottom: 18 }}>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    marginBottom: 6,
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      color: cssTokens.textMuted,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                    }}
                  >
                    Paso {activeStep.numero} de {WIZARD_STEPS.length}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      padding: "2px 8px",
                      borderRadius: 4,
                      background: cssTokens.bgSunken,
                      border: `1px solid ${cssTokens.border}`,
                    }}
                  >
                    {activeStep.donde === "arca" ? "En el portal de ARCA" : "Dentro de Trazá"}
                  </span>
                  {progress.isStepCompleto(activeStep.id) && (
                    <span
                      style={{
                        fontSize: 11,
                        padding: "2px 8px",
                        borderRadius: 4,
                        background: cssTokens.accent,
                        color: "white",
                        fontWeight: 600,
                      }}
                    >
                      ✓ Completado
                    </span>
                  )}
                </div>
                <h3
                  style={{
                    margin: 0,
                    fontSize: "1.4rem",
                    fontWeight: 700,
                    lineHeight: 1.2,
                  }}
                >
                  {activeStep.titulo}
                </h3>
              </div>

              <div style={{ fontSize: 15, lineHeight: 1.6 }}>
                <StepContent
                  key={`${activeStep.id}-${refreshKey}`}
                  stepId={activeStep.id}
                  isCompleto={progress.isStepCompleto(activeStep.id)}
                  onManualToggle={handleManualToggle}
                  onClose={() => onOpenChange(false)}
                />
              </div>

              {/* Nav inferior */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginTop: 32,
                  paddingTop: 20,
                  borderTop: `1px solid ${cssTokens.border}`,
                }}
              >
                <button
                  className="btn btn-ghost"
                  onClick={goPrev}
                  disabled={!canGoBack}
                  style={{ opacity: canGoBack ? 1 : 0.4 }}
                >
                  ← Anterior
                </button>
                {canGoForward ? (
                  <button className="btn btn-primary" onClick={goNext}>
                    Siguiente →
                  </button>
                ) : (
                  <button className="btn btn-primary" onClick={() => onOpenChange(false)}>
                    Cerrar guía
                  </button>
                )}
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
