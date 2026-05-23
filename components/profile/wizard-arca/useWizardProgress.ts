// components/profile/wizard-arca/useWizardProgress.ts
"use client";

import { useMemo } from "react";
import { useFiscalProfile } from "@/lib/use-fiscal-profile";
import {
  WIZARD_STEPS,
  type WizardProgress,
  type WizardStepId,
} from "./types";

interface UseWizardProgressOptions {
  tieneFacturaEmitida?: boolean;
}

/**
 * Auto-detecta qué pasos del wizard ARCA están completos en base al estado real
 * del perfil fiscal del médico, y combina con los checks manuales persistidos
 * en profiles.arca_wizard_manual_steps (jsonb).
 */
export function useWizardProgress(
  options: UseWizardProgressOptions = {},
): WizardProgress & {
  isStepCompleto: (id: WizardStepId) => boolean;
  isLoading: boolean;
} {
  const { tieneFacturaEmitida = false } = options;
  const fiscal = useFiscalProfile();

  return useMemo(() => {
    const profile = fiscal.profile as any;
    const certStatus = fiscal.certStatus as any;

    const manuales: Record<string, boolean> =
      (profile?.arca_wizard_manual_steps as Record<string, boolean>) ?? {};

    const completados = new Set<WizardStepId>();

    // Paso 1: datos fiscales
    const datosFiscalesOk = Boolean(
      profile?.cuit &&
        profile?.razon_social &&
        profile?.punto_venta &&
        profile?.condicion_iva,
    );
    if (datosFiscalesOk) completados.add("datos-fiscales");

    // Paso 2: PV Webservices (manual)
    if (manuales["crear-pv-webservices"]) {
      completados.add("crear-pv-webservices");
    }

    // Paso 3: CSR generado (auto)
    if (certStatus?.hasKey) {
      completados.add("generar-csr");
    }

    // Pasos 4, 5, 6, 7: manuales
    if (manuales["entrar-portal-certs"]) completados.add("entrar-portal-certs");
    if (manuales["crear-certificado"]) completados.add("crear-certificado");
    if (manuales["adherir-servicios"]) completados.add("adherir-servicios");
    if (manuales["descargar-crt"]) completados.add("descargar-crt");

    // Paso 8: .crt subido (auto) — la API ya valida el modulus internamente
    if (certStatus?.hasCert) {
      completados.add("subir-crt");
    }

    // Paso 9: ambiente en producción (auto)
    if (profile?.afip_ambiente === "produccion") {
      completados.add("cambiar-ambiente-prod");
    }

    // Paso 10: factura de prueba (auto o manual)
    if (tieneFacturaEmitida || manuales["factura-prueba"]) {
      completados.add("factura-prueba");
    }

    const pasoActual: WizardStepId =
      WIZARD_STEPS.find((s) => !completados.has(s.id))?.id ??
      WIZARD_STEPS[WIZARD_STEPS.length - 1].id;

    const porcentaje = Math.round(
      (completados.size / WIZARD_STEPS.length) * 100,
    );
    const todoCompleto = completados.size === WIZARD_STEPS.length;

    return {
      completados,
      manuales,
      pasoActual,
      todoCompleto,
      porcentaje,
      isStepCompleto: (id: WizardStepId) => completados.has(id),
      isLoading: (fiscal as any).loading ?? (fiscal as any).isLoading ?? false,
    };
  }, [fiscal, tieneFacturaEmitida]);
}
