import type { Analysis, StructuredDoc } from './types';
import type { UserProfile } from './profile';

function stripAccents(s: string) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function sanitizeFilenamePart(raw: string) {
  // Windows forbidden: \ / : * ? " < > |  (also avoid newlines/tabs)
  const cleaned = (raw || '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return stripAccents(cleaned);
}

function lastNameFromDisplayName(displayName: string) {
  const dn = (displayName || '').trim().replace(/\s+/g, ' ');
  if (!dn) return 'Medico';
  const withoutTitle = dn.replace(/^(dr\.?|dra\.?)\s+/i, '').trim();
  const parts = withoutTitle.split(' ').filter(Boolean);
  return sanitizeFilenamePart(parts[parts.length - 1] || 'Medico') || 'Medico';
}

function formatDateYYYYMMDD(d: Date | null | undefined) {
  if (!d || Number.isNaN(d.getTime())) return null;
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function buildStandardParteFilename(args: {
  profile: UserProfile | null | undefined;
  analysis: Analysis | null | undefined;
  structured: StructuredDoc | null | undefined;
  extension?: string; // default "pdf"
}) {
  const doctorLastName = lastNameFromDisplayName(args.profile?.displayName || '');

  const interventionRaw =
    args.structured?.procedimientoDesc ||
    args.analysis?.detected?.procedureGuess?.desc ||
    args.analysis?.detected?.procedureGuess?.keyword ||
    (args.analysis?.detected?.codes?.[0] ? `Codigo ${args.analysis.detected.codes[0]}` : null) ||
    'Intervencion';
  const intervention = sanitizeFilenamePart(interventionRaw) || 'Intervencion';

  const date =
    formatDateYYYYMMDD(args.structured?.fechaPractica) ||
    (args.analysis?.detected?.fechas?.[0] ? sanitizeFilenamePart(args.analysis.detected.fechas[0]) : null) ||
    'SinFecha';

  const obraRaw = args.structured?.prepaga || args.analysis?.detected?.prepagas?.[0] || 'SinObra';
  const obra = sanitizeFilenamePart(obraRaw) || 'SinObra';

  const ext = (args.extension || 'pdf').replace(/^\./, '').toLowerCase() || 'pdf';
  return `Dra ${doctorLastName}_${intervention}-${date}-${obra}.${ext}`;
}

