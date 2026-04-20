const TRAZA_STOPWORDS_ES = new Set([
  'de',
  'la',
  'el',
  'los',
  'las',
  'un',
  'una',
  'con',
  'sin',
  'por',
  'para',
  'en',
  'y',
  'o',
  'a',
  'al',
  'del',
  'que',
  'como',
  'se',
  'su',
  'sus',
  'lo',
  'operacion',
  'operación',
  'op',
  'incluye',
  'no',
  'si',
  'mas',
  'más',
]);

export function stripAccents(s: string) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function sigTokens(s: string): Set<string> {
  const n = stripAccents(String(s).toLowerCase())
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return new Set(n.split(' ').filter((t) => t.length >= 3 && !TRAZA_STOPWORDS_ES.has(t)));
}

/** Score 0..1 entre texto del documento y descripción del nomenclador. */
export function matchScore(docText: string, practiceDesc: string): number {
  const docTokens = sigTokens(docText);
  const pracTokens = sigTokens(practiceDesc);
  if (!pracTokens.size) return 0;
  let overlap = 0;
  for (const t of pracTokens) if (docTokens.has(t)) overlap++;
  return overlap / pracTokens.size;
}
