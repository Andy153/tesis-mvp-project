/**
 * Plazos de pago de obras sociales (en dias desde la presentacion de la liquidacion).
 *
 * Estos valores deberian poder editarse desde la UI mas adelante, pero por ahora son constantes.
 * Cuando llegue el momento, mover este objeto a un store editable (ej: localStorage o backend).
 */

export type PlazoObraSocial = {
  diasPagoPostLiquidacion: number;
  notas?: string;
};

export const OBRAS_SOCIALES_PLAZOS: Record<string, PlazoObraSocial> = {
  OSDE: {
    diasPagoPostLiquidacion: 20,
    notas: 'Tiene dia de corte estricto: si no se factura a tiempo, no se cobra ese mes.',
  },
  'Swiss Medical': {
    diasPagoPostLiquidacion: 30,
    notas:
      'En enero 2025 redujeron de 60 a 30 dias tras acuerdo con asociaciones medicas, condicionado a no cobrar adicionales al afiliado. En convenios viejos puede seguir siendo 60.',
  },
};
