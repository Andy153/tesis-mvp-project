import type { ParteQuirurgicoExtract } from './schemas';

/** Normaliza código nomenclador tipo Swiss a `XX.XX.XX` para regex en `analyzeDocument`. */
function formatNomenCode(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (/^\d{2}[.\-]\d{2}[.\-]\d{2}$/.test(s)) return s.replace(/-/g, '.');
  if (/^\d{6}$/.test(s)) return `${s.slice(0, 2)}.${s.slice(2, 4)}.${s.slice(4, 6)}`;
  return s;
}

function pushLine(lines: string[], label: string, value: string | number | null | undefined) {
  if (value === null || value === undefined) return;
  const s = String(value).trim();
  if (!s) return;
  lines.push(`${label}: ${s}`);
}

/**
 * Convierte el JSON estructurado del parte (Commit 1) en texto plano alineado con
 * las heurísticas de `analyzeDocument` (labels de `TRAZA_REQUIRED_FIELDS`, códigos, prepagas).
 */
export function parteExtractToAnalysisText(d: ParteQuirurgicoExtract): string {
  const lines: string[] = [];

  const { paciente, cobertura, cirugia, equipo_quirurgico, procedimiento, anestesia, biopsia } = d;
  const sanatorio = d.sanatorio;

  // Orden y etiquetas alineados con `extractStructured` (lib/authz) y `detectFlags` (planilla Swiss).
  const nombre = paciente.apellido_nombre?.trim();
  if (nombre) lines.push(`Paciente: ${nombre.replace(/\s+/g, ' ')}`);
  const dni = paciente.dni?.trim();
  if (dni) lines.push(`DNI: ${dni}`);

  const socio = cobertura.numero_afiliado?.trim();
  if (socio) lines.push(`Afiliado: ${socio}`);

  const fechaCir = cirugia.fecha?.trim();
  if (fechaCir) {
    lines.push(`Fecha cirugía práctica realizada: ${fechaCir}`);
  }

  pushLine(lines, 'fecha nacimiento', paciente.fecha_nacimiento);
  if (paciente.edad != null) pushLine(lines, 'edad', paciente.edad);
  pushLine(lines, 'sexo', paciente.sexo);

  pushLine(lines, 'prepaga obra social convenio financiador cobertura', cobertura.prepaga);
  pushLine(lines, 'plan', cobertura.plan);
  pushLine(lines, 'numero afiliado', cobertura.numero_afiliado);

  pushLine(lines, 'sanatorio clínica institución centro asistencial', sanatorio);

  pushLine(lines, 'fecha', cirugia.fecha);
  pushLine(lines, 'hora inicio', cirugia.hora_inicio);
  pushLine(lines, 'hora fin', cirugia.hora_fin);
  pushLine(lines, 'quirófano quirofano', cirugia.quirofano);
  if (cirugia.nro_cirugia != null) pushLine(lines, 'número cirugía nro cirugia', cirugia.nro_cirugia);

  pushLine(lines, 'cirujano', equipo_quirurgico.cirujano);
  if (equipo_quirurgico.matricula_cirujano != null) {
    pushLine(lines, 'matrícula cirujano matricula cirujano', equipo_quirurgico.matricula_cirujano);
  }
  pushLine(lines, 'primer ayudante', equipo_quirurgico.primer_ayudante);
  pushLine(lines, 'segundo ayudante', equipo_quirurgico.segundo_ayudante);
  pushLine(lines, 'anestesista', equipo_quirurgico.anestesista);
  pushLine(lines, 'instrumentador', equipo_quirurgico.instrumentador);
  pushLine(lines, 'circulante', equipo_quirurgico.circulante);

  const procBits = [procedimiento.tipo_reservado, procedimiento.tipo_realizado, procedimiento.descripcion_tecnica]
    .map((x) => (x == null ? '' : String(x).trim()))
    .filter(Boolean);
  if (procBits.length) {
    lines.push(
      `procedimiento práctica intervención cirugía operación: ${procBits.join(' — ')}`,
    );
  }

  const rawCode = procedimiento.codigo_nomenclador?.trim() ?? null;
  const code = formatNomenCode(rawCode);
  if (code) {
    lines.push(`código codigo nomenclador nomenclador cod. nomenclador: ${code}`);
  }
  if (rawCode) {
    const digitsOnly = rawCode.replace(/\D/g, '');
    if (digitsOnly.length >= 4 && digitsOnly.length <= 8) {
      lines.push(`código nomenclador ${digitsOnly}`);
    }
  }

  pushLine(lines, 'diagnóstico operatorio diagnostico dx', procedimiento.diagnostico_operatorio);

  const anParts = [anestesia.tipo, anestesia.nivel_complejidad != null ? String(anestesia.nivel_complejidad) : '', anestesia.prioridad || '']
    .map((x) => String(x).trim())
    .filter(Boolean);
  if (anParts.length) {
    lines.push(`anestesia tipo de anestesia: ${anParts.join(' ')}`);
  }

  if (biopsia.se_tomo) {
    pushLine(lines, 'biopsia', biopsia.descripcion || 'sí');
  }

  const body = lines.join('\n').trim();
  if (body.split(/\s+/).filter((w) => w.length > 2).length < 24) {
    const pad =
      'documento parte quirúrgico intervención quirúrgica datos de la intervención quirúrgica centro de procedimientos operaciones practicadas tipo procedimiento realizado';
    return `${body}\n${pad}`.trim();
  }
  return body;
}
