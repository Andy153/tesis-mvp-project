import { createRequire } from 'module';

const require = createRequire(import.meta.url);

function parseArgentineAmount(raw: string): number | null {
  const normalized = raw.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(normalized);
  return Number.isFinite(n) && n > 0 ? n : null;
}

type PdfParseFn = (dataBuffer: Buffer) => Promise<{ text: string }>;

export async function extractMontoFromComprobante(pdfBuffer: Buffer): Promise<number | null> {
  try {
    // require (no bundle): pdf-parse@1.1.1 corre test/demo si `!module.parent` al empaquetarse.
    const pdfParse = require('pdf-parse') as PdfParseFn;
    const { text } = await pdfParse(pdfBuffer);
    const matches = [...text.matchAll(/Total\s*=\s*([\d.]+,\d{2})/g)];
    if (matches.length === 0) return null;

    const lastMatch = matches[matches.length - 1];
    return parseArgentineAmount(lastMatch[1]);
  } catch (error) {
    console.error('[ARCA] extractMontoFromComprobante error:', error);
    return null;
  }
}
