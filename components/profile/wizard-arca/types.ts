// components/profile/wizard-arca/types.ts

export type WizardStepId =
  | "datos-fiscales"
  | "crear-pv-webservices"
  | "generar-csr"
  | "entrar-portal-certs"
  | "crear-certificado"
  | "adherir-servicios"
  | "descargar-crt"
  | "subir-crt"
  | "cambiar-ambiente-prod"
  | "factura-prueba";

export interface WizardStep {
  id: WizardStepId;
  numero: number;
  titulo: string;
  /** Si el paso se completa con una acción dentro de Trazá (auto-detectado) o requiere checkbox manual */
  tipo: "auto" | "manual" | "mixto";
  /** Dónde se hace el trabajo */
  donde: "traza" | "arca";
  /** Si está marcado como crítico (warning prominente) */
  critico?: boolean;
}

export interface WizardProgress {
  /** Pasos completados (auto-detectados desde el estado real) */
  completados: Set<WizardStepId>;
  /** Pasos marcados manualmente por el médico */
  manuales: Record<string, boolean>;
  /** Paso "actual" sugerido = primer paso no completado */
  pasoActual: WizardStepId;
  /** Si el setup está 100% completo */
  todoCompleto: boolean;
  /** % de progreso (0-100) */
  porcentaje: number;
}

/**
 * Definición canónica del orden y metadatos de los pasos.
 * Cambiar acá si se reordenan.
 */
export const WIZARD_STEPS: WizardStep[] = [
  {
    id: "datos-fiscales",
    numero: 1,
    titulo: "Completá tus datos fiscales",
    tipo: "auto",
    donde: "traza",
  },
  {
    id: "crear-pv-webservices",
    numero: 2,
    titulo: "Creá un Punto de Venta tipo Webservices en ARCA",
    tipo: "manual",
    donde: "arca",
    critico: true,
  },
  {
    id: "generar-csr",
    numero: 3,
    titulo: "Generá el CSR desde Trazá",
    tipo: "auto",
    donde: "traza",
  },
  {
    id: "entrar-portal-certs",
    numero: 4,
    titulo: "Entrá al portal de Administración de Certificados Digitales",
    tipo: "manual",
    donde: "arca",
  },
  {
    id: "crear-certificado",
    numero: 5,
    titulo: "Creá un nuevo certificado pegando el CSR",
    tipo: "manual",
    donde: "arca",
  },
  {
    id: "adherir-servicios",
    numero: 6,
    titulo: "Adherí los servicios al certificado",
    tipo: "manual",
    donde: "arca",
    critico: true,
  },
  {
    id: "descargar-crt",
    numero: 7,
    titulo: "Descargá el archivo .crt",
    tipo: "manual",
    donde: "arca",
  },
  {
    id: "subir-crt",
    numero: 8,
    titulo: "Subí el certificado en Trazá",
    tipo: "auto",
    donde: "traza",
  },
  {
    id: "cambiar-ambiente-prod",
    numero: 9,
    titulo: "Cambiá el ambiente a Producción",
    tipo: "auto",
    donde: "traza",
    critico: true,
  },
  {
    id: "factura-prueba",
    numero: 10,
    titulo: "Probá con una factura de monto mínimo (recomendado)",
    tipo: "auto",
    donde: "traza",
  },
];
