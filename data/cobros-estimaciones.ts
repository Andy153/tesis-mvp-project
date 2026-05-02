/**
 * Estimaciones de monto y fecha de cobro para Traza.
 *
 * Las funciones leen del nomenclador OSDE (datos del PDF oficial) y de los plazos
 * configurados por obra social. No tocan estado de la app: solo calculan.
 */

import { addDays, lastDayOfMonth } from 'date-fns';
import {
  OSDE_PRECIOS,
  OSDE_PLANES,
  type OsdeDesglose,
  type TipoAtencion,
} from '@/data/osde-precios';
import { OBRAS_SOCIALES_PLAZOS } from '@/data/obras-sociales-plazos';

export type ResultadoDesgloseOSDE = {
  desglose: OsdeDesglose | null;
  planUsado: string;
  tipoUsado: TipoAtencion;
  esEstimado: boolean;
  motivo?: string;
};

export type ResultadoMonto = {
  /** Monto estimado, o null si no se pudo calcular. */
  monto: number | null;
  /** True si hubo fallback de plan o si la vigencia es anterior a la fecha de la practica. */
  esEstimado: boolean;
  /** Mensaje para mostrar en la UI cuando monto es null o esEstimado es true. */
  motivo?: string;
};

function resolverDesgloseOSDE(params: {
  codigo: string;
  obraSocial: string;
  plan: string;
  tipo: TipoAtencion;
  fechaPractica: Date;
}): ResultadoDesgloseOSDE {
  const { codigo, obraSocial, plan, tipo, fechaPractica } = params;

  // Solo OSDE tiene nomenclador cargado por ahora
  if (obraSocial !== 'OSDE') {
    return {
      desglose: null,
      planUsado: plan,
      tipoUsado: tipo,
      esEstimado: true,
      motivo: `Sin nomenclador cargado para ${obraSocial}`,
    };
  }

  const entrada = OSDE_PRECIOS[codigo];
  if (!entrada) {
    return {
      desglose: null,
      planUsado: plan,
      tipoUsado: tipo,
      esEstimado: false,
      motivo: 'Codigo no encontrado en nomenclador OSDE',
    };
  }

  // Match de plan: exacto o fallback al plan mas bajo
  let planUsado = plan;
  let tipoUsado: TipoAtencion = tipo;
  let esEstimado = false;

  if (!entrada.precios[plan]) {
    console.warn(
      `[resolverDesgloseOSDE] Plan "${plan}" no encontrado para codigo ${codigo}. Fallback a "${OSDE_PLANES[0]}".`,
    );
    planUsado = OSDE_PLANES[0];
    esEstimado = true;
    if (!entrada.precios[planUsado]) {
      return {
        desglose: null,
        planUsado,
        tipoUsado,
        esEstimado: true,
        motivo: `Plan "${plan}" no disponible y fallback fallido`,
      };
    }
  }

  // Match de tipo: exacto o fallback a la otra variante si solo hay una
  const preciosPlan = entrada.precios[planUsado];
  let desglose = preciosPlan[tipo];
  if (!desglose) {
    const otroTipo: TipoAtencion = tipo === 'Amb' ? 'Int' : 'Amb';
    desglose = preciosPlan[otroTipo];
    if (desglose) {
      esEstimado = true;
      tipoUsado = otroTipo;
    } else {
      return {
        desglose: null,
        planUsado,
        tipoUsado,
        esEstimado: false,
        motivo: `Tipo ${tipo} no disponible para esta practica`,
      };
    }
  }

  // Si total es null, hay desglose pero el total requiere confirmación.
  if (desglose.total === null) {
    return {
      desglose,
      planUsado,
      tipoUsado,
      esEstimado: false,
      motivo: 'Monto a confirmar',
    };
  }

  // Verificar si la vigencia es valida para la fecha de la practica
  const vigenciaDate = new Date(entrada.vigencia);
  if (vigenciaDate > fechaPractica) {
    esEstimado = true;
  }

  return { desglose, planUsado, tipoUsado, esEstimado };
}

/**
 * Estima el monto que va a cobrar la prestadora por una practica.
 *
 * Comportamiento:
 *  - Si la obra social no es OSDE, devuelve monto:null con motivo "Sin nomenclador cargado".
 *  - Si el codigo no existe en el nomenclador OSDE, devuelve monto:null.
 *  - Si el plan no matchea exactamente, hace fallback al plan mas bajo y marca esEstimado:true.
 *  - Si el tipo (Amb/Int) no existe pero la otra variante si, devuelve la otra con esEstimado:true.
 *  - Si total es null en el nomenclador (ej: modulos de DIU), devuelve monto:null con motivo "Monto a confirmar".
 */
export function estimarMontoCobro(params: {
  codigo: string;
  obraSocial: string;
  plan: string;
  tipo: TipoAtencion;
  fechaPractica: Date;
}): ResultadoMonto {
  const res = resolverDesgloseOSDE(params);
  if (!res.desglose || res.desglose.total === null) {
    return { monto: null, esEstimado: res.esEstimado, motivo: res.motivo };
  }
  return {
    monto: res.desglose.total,
    esEstimado: res.esEstimado,
    motivo: res.motivo,
  };
}

export function obtenerDesglosePrecio(params: {
  codigo: string;
  obraSocial: string;
  plan: string;
  tipo: TipoAtencion;
  fechaPractica: Date;
}): ResultadoDesgloseOSDE {
  return resolverDesgloseOSDE(params);
}

/**
 * Estima la fecha en que la prestadora va a cobrar.
 * Devuelve null si la obra social no esta configurada en OBRAS_SOCIALES_PLAZOS.
 */
export function estimarFechaCobro(
  fechaFacturacion: Date,
  obraSocial: string
): Date | null {
  const plazo = OBRAS_SOCIALES_PLAZOS[obraSocial];
  if (!plazo) {
    console.warn(`[estimarFechaCobro] Obra social "${obraSocial}" sin plazo configurado.`);
    return null;
  }
  return addDays(fechaFacturacion, plazo.diasPagoPostLiquidacion);
}

/**
 * Estima cuando se va a facturar una practica que todavia no fue facturada.
 * Asume el ultimo dia del mes en que se realizo la practica.
 *
 * En el futuro, esta logica podria considerar el dia de corte de cada obra social
 * (ej: OSDE tiene corte estricto, Swiss Medical es mas flexible).
 */
export function proximaFechaFacturacion(fechaPractica: Date): Date {
  return lastDayOfMonth(fechaPractica);
}
