import { OSDE_NOMENCLADOR, type NomencladorRow } from '@/data/osde-nomenclador-seed';

export type TipoAtencion = 'Amb' | 'Int';

export const OSDE_PLANES = [
  '2 210,6 030,FLUX,8 260',
  '2 310,8 360',
  '2 410,8 430',
  '2 450',
  '2 510',
] as const;

export type PlanOsde = (typeof OSDE_PLANES)[number];

export type OsdeDesglose = Pick<
  NomencladorRow,
  | 'honorarios_especialista'
  | 'cnt_ayudantes'
  | 'honorarios_ayudantes'
  | 'honorarios_anestesista'
  | 'honorarios_inst'
  | 'gastos'
  | 'total'
>;

export type OsdePreciosPorCodigo = {
  codigo: string;
  descripcion: string;
  vigencia: string;
  precios: Record<string, Partial<Record<TipoAtencion, OsdeDesglose>>>;
};

export const OSDE_PRECIOS: Record<string, OsdePreciosPorCodigo> = (() => {
  const index: Record<string, OsdePreciosPorCodigo> = {};

  for (const row of OSDE_NOMENCLADOR) {
    const key = row.codigo;

    if (!index[key]) {
      index[key] = {
        codigo: row.codigo,
        descripcion: row.descripcion,
        vigencia: row.vigencia,
        precios: {},
      };
    }

    // Si en el seed viniera el mismo código con distinta descripción o vigencia,
    // nos quedamos con la última (más nueva) sin romper.
    index[key].descripcion = row.descripcion;
    index[key].vigencia = row.vigencia;

    if (!index[key].precios[row.plan]) {
      index[key].precios[row.plan] = {};
    }

    index[key].precios[row.plan][row.tipo] = {
      honorarios_especialista: row.honorarios_especialista,
      cnt_ayudantes: row.cnt_ayudantes,
      honorarios_ayudantes: row.honorarios_ayudantes,
      honorarios_anestesista: row.honorarios_anestesista,
      honorarios_inst: row.honorarios_inst,
      gastos: row.gastos,
      total: row.total,
    };
  }

  return index;
})();

