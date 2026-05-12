import type { Analysis, CrossCheckFinding, StructuredDoc } from './types';
import { TRAZA_PREPAGAS } from './traza-constants';

export const TRAZA_CIRUGIA_PREFIXES = [
  '03',
  '04',
  '05',
  '06',
  '08',
  '10',
  '11',
  '20',
  '50',
  '60',
  '80',
];

export function requiresAuthorization(analysis: Analysis | undefined): {
  required: boolean;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
} {
  const codes = analysis?.detected?.codes || [];
  const procedureGuess = analysis?.detected?.procedureGuess;

  for (const code of codes) {
    for (const prefix of TRAZA_CIRUGIA_PREFIXES) {
      if (code.startsWith(prefix)) {
        return {
          required: true,
          confidence: 'high',
          reason: `El código ${code} corresponde a una cirugía. Las cirugías siempre requieren autorización previa de la prepaga.`,
        };
      }
    }
  }

  if (procedureGuess) {
    const suggestedCode = procedureGuess.code;
    for (const prefix of TRAZA_CIRUGIA_PREFIXES) {
      if (suggestedCode.startsWith(prefix)) {
        return {
          required: true,
          confidence: 'medium',
          reason: `El documento describe "${procedureGuess.keyword}", que es una cirugía. Las cirugías requieren autorización previa.`,
        };
      }
    }
  }

  const text = (analysis?.fileName || '').toLowerCase();
  const looksLikeSurgery = [
    'parte quirurgico',
    'parte quirúrgico',
    'quirofano',
    'quirófano',
    'cirugia',
    'cirugía',
    'operacion',
    'operación',
  ].some((k) => text.includes(k));
  if (looksLikeSurgery) {
    return {
      required: true,
      confidence: 'low',
      reason: 'El documento parece ser un parte quirúrgico. Por regla general, las cirugías requieren autorización previa.',
    };
  }

  return {
    required: false,
    confidence: 'medium',
    reason: 'No se identificó un procedimiento quirúrgico que requiera autorización.',
  };
}

export function extractStructured(
  text: string,
  nomenclador: Record<string, { entries?: Array<{ desc: string }> }>,
): StructuredDoc {
  const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const stripAccents = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const normalizePaciente = (raw: string | null): string | null => {
    if (!raw) return null;
    let s = raw.trim().replace(/\s+/g, ' ');
    // Some scans put "Pariente:" in the same slot we interpret as paciente.
    s = s.replace(/^\s*pariente\s*[:\-–—]\s*/i, '').trim();
    s = s.replace(/^\s*familiar\s*[:\-–—]\s*/i, '').trim();
    if (!s) return null;

    // If we captured "APELLIDO," and the name is on the next line, merge it.
    if (/,\s*$/.test(s) || (s.includes(',') && s.split(',').pop()?.trim() === '')) {
      try {
        const re = new RegExp(`${escapeRegExp(s)}\\s*(?:\\r?\\n)+\\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ]{2,}(?:\\s+[A-ZÁÉÍÓÚÑa-záéíóúñ]{2,}){0,2})\\b`, 'm');
        const m = text.match(re);
        if (m && m[1]) {
          const next = m[1].trim().replace(/\s+/g, ' ');
          if (next && !s.toLowerCase().includes(next.toLowerCase())) s = `${s} ${next}`.replace(/\s+/g, ' ').trim();
        }
      } catch {
        // ignore
      }
    }

    // If no comma but looks like "APELLIDO NOMBRE", add comma after first token.
    if (!s.includes(',')) {
      const parts = s.split(' ').filter(Boolean);
      if (parts.length >= 2 && parts.length <= 5) s = `${parts[0]}, ${parts.slice(1).join(' ')}`;
    }

    // Final clean: drop lingering role-like prefixes that OCR sometimes prepends without colon.
    const first = stripAccents(s.split(/[,\s]+/)[0]?.toLowerCase() || '');
    if (first === 'pariente' || first === 'familiar') {
      s = s.replace(/^(pariente|familiar)\s+/i, '').trim();
    }

    // Drop common OCR noise tokens at the end (e.g. "io", "os").
    // Keep tokens that look name-like (>=3 letters) and preserve comma.
    {
      const keepToken = (tok: string) => {
        const t = tok.trim();
        if (!t) return false;
        if (t === ',') return true;
        const letters = stripAccents(t).replace(/[^a-zA-ZÁÉÍÓÚÜÑáéíóúüñ]/g, '');
        if (letters.length < 3) return false;
        return true;
      };
      const rawTokens = s
        .replace(/,/g, ' , ')
        .split(/\s+/)
        .filter(Boolean);
      // Trim only the tail noise; don't over-clean the whole string.
      let end = rawTokens.length;
      while (end > 0 && !keepToken(rawTokens[end - 1])) end--;
      const trimmed = rawTokens.slice(0, end).join(' ').replace(/\s+,/g, ',').replace(/,\s+/g, ', ').trim();
      if (trimmed) s = trimmed;
    }

    return s || null;
  };

  const result: StructuredDoc = {
    dni: null,
    afiliado: null,
    paciente: null,
    fechaPractica: null,
    fechaAutorizacion: null,
    fechaVencimiento: null,
    nroAutorizacion: null,
    prepaga: null,
    codigo: null,
    procedimientoDesc: null,
  };

  const dniMatch = text.match(/DNI[:\s]*(\d{7,8})/i);
  if (dniMatch) result.dni = dniMatch[1];

  // Regla práctica Swiss Medical: el N° de credencial suele ser un número de 18-19 dígitos
  // (puede venir con espacios cada 4) cerca de las etiquetas "Credencial", "N° de Credencial",
  // "Número" o debajo del campo "Plan" / "Prepaga".
  const swissCredencialMatch =
    text.match(/(?:n[°º]\s*(?:de\s*)?)?credencial[:\s\u00ba\u00b0Nn\.]*((?:\d[\s\-]?){18,19})/i) ||
    text.match(/n[°º]\s*credencial[:\s]*((?:\d[\s\-]?){18,19})/i);
  if (swissCredencialMatch) {
    const cleaned = swissCredencialMatch[1].replace(/[\s\-]/g, '');
    if (cleaned.length >= 18 && cleaned.length <= 19) {
      result.afiliado = cleaned;
    }
  }
  if (!result.afiliado) {
    const afiliadoMatch = text.match(/af[ií]liado[:\s\u00ba\u00b0Nn\.]*([0-9]{6,20})/i);
    if (afiliadoMatch) result.afiliado = afiliadoMatch[1];
  }
  // Fallback: si la prepaga es Swiss y todavía no tenemos número, buscar cualquier número
  // de 18-19 dígitos en el documento (es muy específico y poco propenso a falsos positivos).
  if (!result.afiliado) {
    const swissBulk = text.match(/\b((?:\d[\s\-]?){18,19})\b/);
    if (swissBulk) {
      const cleaned = swissBulk[1].replace(/[\s\-]/g, '');
      if (cleaned.length >= 18 && cleaned.length <= 19) {
        result.afiliado = cleaned;
      }
    }
  }

  // Lookahead amplio: formularios suelen tener Afiliado/HC antes del DNI, o "D.N.I." en vez de "DNI".
  const pacienteMatch = text.match(
    /Paciente[:\s]*([A-ZÁÉÍÓÚÑa-záéíóúñ0-9,\.\-\s]{3,120}?)(?=\s*(?:DNI|D\.?\s*N\.?\s*I\.?|Fecha|Edad|Sexo|Convenio|N[°º]|Afiliado|afiliado|Historia|HC\b|Documento|CUIL|\n|$))/i,
  );
  if (pacienteMatch) result.paciente = pacienteMatch[1].trim().replace(/\s+/g, ' ');
  if (!result.paciente) {
    const alt = text.match(/\bpaciente\s+apellido\s+nombre\s*:\s*([^\n]+)/i);
    if (alt) result.paciente = alt[1].trim().replace(/\s+/g, ' ');
  }
  if (!result.paciente) {
    const ay = text.match(/\b(?:Apellido\s+y\s+nombre|Apellidos?\s*,\s*nombres?)\s*[:\s-–—]\s*([^\n\r]{3,200})/i);
    if (ay) result.paciente = ay[1].trim().replace(/\s+/g, ' ');
  }
  if (!result.paciente) {
    const lineP = text.match(/\bPaciente\s*[:\s\-–—]\s*([^\n\r]+)/i);
    if (lineP) {
      let s = lineP[1].trim().replace(/\s+/g, ' ');
      s = s.replace(/\s+D\.?\s*N\.?\s*I\.?\s*:?\s*\d[\d.\s]{5,14}\s*$/i, '').trim();
      if (s.length >= 3 && s.length <= 120) result.paciente = s;
    }
  }
  result.paciente = normalizePaciente(result.paciente);

  const fechaRegex = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/g;
  const fechas: Array<{ str: string; date: Date; context: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = fechaRegex.exec(text)) !== null) {
    const [, d, mo, yRaw] = m;
    let y = parseInt(yRaw, 10);
    if (y < 100) y += 2000;
    fechas.push({
      str: m[0],
      date: new Date(y, parseInt(mo, 10) - 1, parseInt(d, 10)),
      context: text.substring(Math.max(0, m.index - 40), m.index).toLowerCase(),
    });
  }

  for (const f of fechas) {
    const ctx = f.context.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (ctx.match(/vencimient|venc(?!ed)|valido|vigente|hasta/)) {
      if (!result.fechaVencimiento) result.fechaVencimiento = f.date;
    } else if (ctx.match(/autoriz|emision|emitid/)) {
      if (!result.fechaAutorizacion) result.fechaAutorizacion = f.date;
    } else if (ctx.match(/cirugia|practica|realizado|realizacion|ingreso|inicio|fin/)) {
      if (!result.fechaPractica) result.fechaPractica = f.date;
    }
  }
  if (!result.fechaPractica && fechas.length > 0) {
    const ctxNac = /nacim|edad|fn\b|fecha\s*nac|cumplea/i;
    const ctxPract = /cirugia|practica|realizado|realizacion|ingreso|inicio|fin|quirurg|operaci|intervenc|procedim/;
    const notBirth = fechas.filter((f) => !ctxNac.test(f.context));
    const withPract = notBirth.find((f) => ctxPract.test(f.context));
    result.fechaPractica = withPract?.date ?? notBirth[0]?.date ?? fechas[fechas.length - 1]?.date ?? fechas[0].date;
  }

  const nroAuthMatch =
    text.match(/(?:N[°º]|Nro\.?|Numero|Número)\s*(?:de\s+)?autoriz\w*[:\s]*(\w{4,20})/i) ||
    text.match(/autoriz\w*\s*(?:N[°º]|Nro\.?|Numero|Número)[:\s]*(\w{4,20})/i);
  if (nroAuthMatch) result.nroAutorizacion = nroAuthMatch[1];

  for (const p of TRAZA_PREPAGAS) {
    const norm = p.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const textNorm = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (textNorm.includes(norm)) {
      result.prepaga = p;
      break;
    }
  }

  const codeRegex = /\b(\d{4,8})\b/g;
  const codes = [...new Set([...text.matchAll(codeRegex)].map((x) => x[1]))];
  for (const c of codes) {
    if (nomenclador[c]) {
      result.codigo = c;
      break;
    }
  }

  return result;
}

export function crossCheck(parte: StructuredDoc, bono: StructuredDoc): CrossCheckFinding[] {
  const findings: CrossCheckFinding[] = [];

  if (parte.dni && bono.dni) {
    if (parte.dni === bono.dni) {
      findings.push({ severity: 'ok', title: 'DNI coincide', body: `DNI ${parte.dni} presente en ambos documentos.` });
    } else {
      findings.push({
        severity: 'error',
        title: 'DNI no coincide',
        body: `Parte: ${parte.dni} · Bono: ${bono.dni}. La prepaga rechaza la liquidación si el DNI no matchea.`,
        action: 'Verificar que el bono corresponda al mismo paciente.',
      });
    }
  } else if (!bono.dni) {
    findings.push({
      severity: 'warn',
      title: 'DNI no detectado en el bono',
      body: 'No se pudo leer el DNI en el bono de autorización. Verificar manualmente.',
    });
  }

  if (parte.afiliado && bono.afiliado) {
    if (parte.afiliado === bono.afiliado) {
      findings.push({
        severity: 'ok',
        title: 'N° de afiliado coincide',
        body: `N° ${parte.afiliado} presente en ambos documentos.`,
      });
    } else {
      findings.push({
        severity: 'error',
        title: 'N° de afiliado no coincide',
        body: `Parte: ${parte.afiliado} · Bono: ${bono.afiliado}.`,
        action: 'Confirmar que el bono sea de esta prestación.',
      });
    }
  }

  if (parte.prepaga && bono.prepaga) {
    if (parte.prepaga === bono.prepaga) {
      findings.push({ severity: 'ok', title: 'Prepaga coincide', body: `${parte.prepaga} en ambos documentos.` });
    } else {
      findings.push({
        severity: 'error',
        title: 'Prepagas distintas',
        body: `Parte menciona ${parte.prepaga} pero el bono es de ${bono.prepaga}. No corresponden a la misma cobertura.`,
      });
    }
  }

  if (parte.codigo && bono.codigo) {
    if (parte.codigo === bono.codigo) {
      findings.push({
        severity: 'ok',
        title: 'Código de práctica coincide',
        body: `Código ${parte.codigo} autorizado en el bono.`,
      });
    } else {
      findings.push({
        severity: 'error',
        title: 'Código autorizado ≠ código facturado',
        body: `Parte: ${parte.codigo} · Bono autoriza: ${bono.codigo}. La prepaga rechaza: "no se autorizó esta práctica".`,
        action: 'Tramitar nueva autorización para el código correcto o corregir el código facturado.',
      });
    }
  } else if (parte.codigo && !bono.codigo) {
    findings.push({
      severity: 'warn',
      title: 'Código no detectado en bono',
      body: 'El bono no muestra claramente el código autorizado. Verificar manualmente que corresponda al código del parte.',
    });
  }

  if (bono.fechaAutorizacion && parte.fechaPractica) {
    const diff = (parte.fechaPractica.getTime() - bono.fechaAutorizacion.getTime()) / 86400000;
    if (diff >= 0) {
      findings.push({
        severity: 'ok',
        title: 'Autorización previa a la práctica',
        body: `La autorización fue emitida ${Math.floor(diff)} día${Math.floor(diff) === 1 ? '' : 's'} antes de la práctica.`,
      });
    } else {
      findings.push({
        severity: 'error',
        title: 'Autorización posterior a la práctica',
        body: `La autorización es de ${bono.fechaAutorizacion.toLocaleDateString('es-AR')} pero la práctica se realizó el ${parte.fechaPractica.toLocaleDateString('es-AR')}.`,
        action: 'La prepaga solo autoriza prestaciones futuras. Este bono no es válido para esta práctica.',
      });
    }
  }

  if (bono.fechaVencimiento && parte.fechaPractica) {
    if (parte.fechaPractica <= bono.fechaVencimiento) {
      findings.push({
        severity: 'ok',
        title: 'Autorización vigente al momento de la práctica',
        body: `Vencía el ${bono.fechaVencimiento.toLocaleDateString('es-AR')}, la práctica fue el ${parte.fechaPractica.toLocaleDateString('es-AR')}.`,
      });
    } else {
      const diasVencida = Math.floor((parte.fechaPractica.getTime() - bono.fechaVencimiento.getTime()) / 86400000);
      findings.push({
        severity: 'error',
        title: 'Autorización vencida al realizar la práctica',
        body: `La autorización venció el ${bono.fechaVencimiento.toLocaleDateString('es-AR')} y la práctica se realizó ${diasVencida} día${diasVencida === 1 ? '' : 's'} después.`,
        action: 'Tramitar una nueva autorización antes de presentar la liquidación.',
      });
    }
  }

  if (parte.paciente && bono.paciente) {
    const stripNorm = (s: string) =>
      s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z\s]/g, '')
        .trim()
        .split(/\s+/)
        .sort()
        .join(' ');
    if (stripNorm(parte.paciente) === stripNorm(bono.paciente)) {
      findings.push({
        severity: 'ok',
        title: 'Nombre del paciente coincide',
        body: `${parte.paciente} en ambos documentos.`,
      });
    } else {
      findings.push({
        severity: 'warn',
        title: 'Nombre del paciente no coincide exactamente',
        body: `Parte: ${parte.paciente} · Bono: ${bono.paciente}. Puede ser una variación (abreviaciones, orden) — verificar.`,
      });
    }
  }

  return findings;
}
