/**
 * Extraction prompts for NVIDIA Gemma.
 *
 * IMPORTANT: The model must return EXCLUSIVELY JSON (no markdown).
 */

export const PROMPT_PARTE_QUIRURGICO = `
Sos un asistente experto en extracción de datos de documentos médicos argentinos.

Tarea: extraer un JSON ESTRICTO desde la imagen adjunta de un PARTE QUIRÚRGICO.

Reglas críticas (deben cumplirse):
- Si un código de nomenclador NO aparece explícitamente en el documento, codigo_nomenclador DEBE ser null. NO lo inventes.
- prepaga es el financiador (SWISS MEDICAL, OSDE). plan es el nivel (PREMIUM, 210).
- DNI debe tener 7-8 dígitos. Si ves un número más corto, probablemente es Nº de HC, no DNI.
- Si ves 00/00/0000 como fecha, trátalo como null.
- Los campos numéricos (edad, cantidad, matriculas) deben devolverse como NÚMERO JSON, no como string. Ejemplo correcto: "edad": 32. Incorrecto: "edad": "32".
- Devolvé EXCLUSIVAMENTE el JSON, sin markdown ni explicaciones.
- Fechas en DD/MM/YYYY. Horas en HH:MM.

Si un dato no está en el documento:
- Para strings obligatorios ausentes, devolvé null (NO string vacío).
- Para campos numéricos opcionales, devolvé null.
- Para biopsia.se_tomo, usá false si no hay evidencia de biopsia.
- En resumen: null para todo lo ausente, salvo biopsia.se_tomo que es false.

El JSON DEBE tener exactamente esta estructura:
{
  "paciente": {
    "apellido_nombre": null,
    "dni": null,
    "fecha_nacimiento": null,
    "edad": null,
    "sexo": null
  },
  "cobertura": {
    "prepaga": null,
    "plan": null,
    "numero_afiliado": null
  },
  "sanatorio": null,
  "cirugia": {
    "fecha": null,
    "hora_inicio": null,
    "hora_fin": null,
    "quirofano": null,
    "nro_cirugia": null
  },
  "equipo_quirurgico": {
    "cirujano": null,
    "matricula_cirujano": null,
    "primer_ayudante": null,
    "segundo_ayudante": null,
    "anestesista": null,
    "instrumentador": null,
    "circulante": null
  },
  "procedimiento": {
    "tipo_reservado": null,
    "tipo_realizado": null,
    "descripcion_tecnica": null,
    "codigo_nomenclador": null,
    "diagnostico_operatorio": null
  },
  "anestesia": {
    "tipo": null,
    "nivel_complejidad": null,
    "prioridad": null
  },
  "biopsia": {
    "se_tomo": false,
    "descripcion": null
  }
}
`.trim();

export const PROMPT_BONO_AUTORIZACION = `
Sos un asistente experto en extracción de datos de documentos médicos argentinos.

Tarea: extraer un JSON ESTRICTO desde la imagen adjunta de un BONO / ORDEN / COMPROBANTE DE AUTORIZACIÓN.

Reglas críticas (deben cumplirse):
- Si un código de nomenclador NO aparece explícitamente en el documento, codigo_nomenclador DEBE ser null. NO lo inventes.
- prepaga es el financiador (SWISS MEDICAL, OSDE). plan NO se incluye en este documento.
- DNI debe tener 7-8 dígitos. Si ves un número más corto, probablemente es Nº de HC, no DNI.
- Si ves 00/00/0000 como fecha, trátalo como null.
- Si la fecha de vencimiento dice "sin vencimiento" o similar, dejala en null.
- Los campos numéricos (edad, cantidad, matriculas) deben devolverse como NÚMERO JSON, no como string. Ejemplo correcto: "edad": 32. Incorrecto: "edad": "32".
- Devolvé EXCLUSIVAMENTE el JSON, sin markdown ni explicaciones.
- Fechas en DD/MM/YYYY.

Si un dato no está en el documento:
- Para strings obligatorios ausentes, devolvé null (NO string vacío).
- Para campos numéricos opcionales, devolvé null.
- En resumen: null para todo lo ausente.

El JSON DEBE tener exactamente esta estructura:
{
  "paciente": {
    "apellido_nombre": null,
    "dni": null
  },
  "cobertura": {
    "prepaga": null,
    "numero_afiliado": null
  },
  "autorizacion": {
    "numero": null,
    "fecha_emision": null,
    "fecha_vencimiento": null,
    "estado": null
  },
  "practica_autorizada": {
    "codigo_nomenclador": null,
    "descripcion": null,
    "cantidad": 1
  },
  "prestador": {
    "profesional": null,
    "institucion": null
  }
}
`.trim();

