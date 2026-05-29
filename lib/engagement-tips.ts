export type EngagementTip = {
  titulo: string;
  mensaje: string;
  navigate_to: string;
};

/** Orden fijo de rotación (mensaje 1 → 8, luego vuelve al 1). */
export const ENGAGEMENT_TIPS: readonly EngagementTip[] = [
  {
    titulo: 'Revisá tu Centro de Cobros',
    mensaje: 'Entrá a ver cómo viene tu mes y si tenés cobros pendientes.',
    navigate_to: 'cobros',
  },
  {
    titulo: '¿Sabías?',
    mensaje:
      'Antes de Trazá, el 100% de los médicos no tenía visibilidad de sus cobros. Ahora podés ver todo desde un solo lugar.',
    navigate_to: 'dashboard',
  },
  {
    titulo: 'No dejes procesos por la mitad',
    mensaje: 'Si empezaste un cobro, completalo para no perder plazos. Revisá tus pendientes.',
    navigate_to: 'documents',
  },
  {
    titulo: 'Mantené tus datos de ARCA al día',
    mensaje: 'Tener tu perfil fiscal actualizado evita rechazos al emitir facturas.',
    navigate_to: 'profile',
  },
  {
    titulo: 'Tu mes en un vistazo',
    mensaje: 'Entrá al Resumen General para ver tus documentos, envíos y cobros del mes.',
    navigate_to: 'dashboard',
  },
  {
    titulo: '¿Ya cargaste tus partes de este mes?',
    mensaje: 'Cuanto antes cargues tus documentos, más tranquilo vas a estar al cierre.',
    navigate_to: 'upload',
  },
  {
    titulo: 'Trazá trabaja para vos',
    mensaje:
      'Mientras seguís con tus pacientes, Trazá controla plazos y te avisa si algo necesita tu atención.',
    navigate_to: 'alerts',
  },
  {
    titulo: 'Un consejo',
    mensaje:
      "Revisá la pestaña 'Qué conviene revisar' para asegurarte de que todo esté listo antes del envío.",
    navigate_to: 'errors',
  },
] as const;

export const ENGAGEMENT_TIP_COUNT = ENGAGEMENT_TIPS.length;

/** Mínimo entre envíos consecutivos de engagement tips. */
export const ENGAGEMENT_TIP_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000;
