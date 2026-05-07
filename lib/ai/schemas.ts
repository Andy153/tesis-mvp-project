import { z } from 'zod';

const coerceNullableInt = z.preprocess(
  (v) => {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return v;
    if (typeof v === 'string') {
      const n = parseInt(v, 10);
      return Number.isNaN(n) ? null : n;
    }
    return null;
  },
  z.number().int().nullable().optional()
);

const coerceInt = z.preprocess(
  (v) => {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') {
      const n = parseInt(v, 10);
      return Number.isNaN(n) ? v : n;
    }
    return v;
  },
  z.number().int()
);

/**
 * Zod schemas to validate Gemma extraction output.
 *
 * Notes:
 * - Required fields are strings (can be empty).
 * - Some fields may come back as `null` depending on prompt rules; we allow
 *   `.nullable().optional()` for those to avoid breaking when the model
 *   follows the "treat as null" instruction.
 */

export const ParteQuirurgicoSchema = z.object({
  paciente: z.object({
    apellido_nombre: z.string().nullable(),
    dni: z.union([z.string(), z.number()]).transform((v) => String(v)).nullable(),
    fecha_nacimiento: z.string().nullable(),
    edad: coerceNullableInt,
    sexo: z.string().nullable(),
  }),
  cobertura: z.object({
    prepaga: z.string().nullable(),
    plan: z.string().nullable(),
    numero_afiliado: z.string().nullable(),
  }),
  sanatorio: z.string().nullable(),
  cirugia: z.object({
    fecha: z.string().nullable(),
    hora_inicio: z.string().nullable(),
    hora_fin: z.string().nullable(),
    quirofano: z.string().nullable(),
    nro_cirugia: coerceNullableInt,
  }),
  equipo_quirurgico: z.object({
    cirujano: z.string().nullable(),
    matricula_cirujano: coerceNullableInt,
    primer_ayudante: z.string().nullable().optional(),
    segundo_ayudante: z.string().nullable().optional(),
    anestesista: z.string().nullable().optional(),
    instrumentador: z.string().nullable().optional(),
    circulante: z.string().nullable().optional(),
  }),
  procedimiento: z.object({
    tipo_reservado: z.string().nullable(),
    tipo_realizado: z.string().nullable(),
    descripcion_tecnica: z.string().nullable(),
    codigo_nomenclador: z.string().nullable().optional(),
    diagnostico_operatorio: z.string().nullable().optional(),
  }),
  anestesia: z.object({
    tipo: z.string().nullable(),
    nivel_complejidad: coerceNullableInt,
    prioridad: z.string().nullable().optional(),
  }),
  biopsia: z.object({
    se_tomo: z.boolean(),
    descripcion: z.string().nullable().optional(),
  }),
});

export type ParteQuirurgicoExtract = z.infer<typeof ParteQuirurgicoSchema>;

export const BonoAutorizacionSchema = z.object({
  paciente: z.object({
    apellido_nombre: z.string().nullable(),
    dni: z.string().nullable(),
  }),
  cobertura: z.object({
    prepaga: z.string().nullable(),
    numero_afiliado: z.string().nullable(),
  }),
  autorizacion: z.object({
    numero: z.string().nullable(),
    fecha_emision: z.string().nullable(),
    fecha_vencimiento: z.string().nullable(),
    estado: z.string().nullable(),
  }),
  practica_autorizada: z.object({
    codigo_nomenclador: z.string().nullable(),
    descripcion: z.string().nullable(),
    cantidad: coerceInt,
  }),
  prestador: z.object({
    profesional: z.string().nullable(),
    institucion: z.string().nullable(),
  }),
});

export type BonoAutorizacionExtract = z.infer<typeof BonoAutorizacionSchema>;

