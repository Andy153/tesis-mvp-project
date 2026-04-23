import { NextResponse } from 'next/server';
import path from 'path';
import { mkdir, readFile, writeFile } from 'fs/promises';
import crypto from 'crypto';
import { generateSwissCxFiles } from '@/lib/swissCxExport';
import type { SwissCxRow } from '@/lib/types';

type CreatePayload = {
  row: SwissCxRow;
  skipPlanilla?: boolean;
  skipReason?: string | null;
  meta: {
    parteFileName: string;
    permisoFileName?: string | null;
  };
};

function safeBaseName(s: string) {
  return (s || 'archivo')
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

export async function POST(req: Request) {
  const fd = await req.formData();
  const parte = fd.get('parte');
  const permiso = fd.get('permiso');
  const payloadRaw = fd.get('payload');

  if (!(parte instanceof File)) {
    return NextResponse.json({ error: 'Falta archivo parte.' }, { status: 400 });
  }
  if (!(payloadRaw instanceof File) && typeof payloadRaw !== 'string') {
    return NextResponse.json({ error: 'Falta payload.' }, { status: 400 });
  }

  let payload: CreatePayload;
  try {
    payload = JSON.parse(String(payloadRaw)) as CreatePayload;
  } catch {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 });
  }

  const id = crypto.randomBytes(10).toString('hex');
  const root = path.join(process.cwd(), 'data', 'interventions', id);
  const canPersistToDisk = !process.env.VERCEL;

  let permisoSaved = false;
  if (canPersistToDisk) {
    await mkdir(root, { recursive: true });

    const parteBuf = Buffer.from(await parte.arrayBuffer());
    await writeFile(path.join(root, 'parte.pdf'), parteBuf);

    if (permiso instanceof File) {
      const permisoBuf = Buffer.from(await permiso.arrayBuffer());
      await writeFile(path.join(root, 'permiso.pdf'), permisoBuf);
      permisoSaved = true;
    }
  }

  const base = safeBaseName(payload.meta?.parteFileName || parte.name);
  let xlsxFile: string | null = null;
  let csvFile: string | null = null;
  let xlsxBase64: string | undefined;
  let csvText: string | undefined;
  if (!payload.skipPlanilla) {
    const templatePath = path.join(process.cwd(), 'templates', 'planilla cx swiss.xlsx');
    const templateXlsx = await readFile(templatePath);
    const { xlsx, csv } = await generateSwissCxFiles({
      templateXlsx: templateXlsx.buffer.slice(templateXlsx.byteOffset, templateXlsx.byteOffset + templateXlsx.byteLength),
      row: payload.row,
    });
    xlsxFile = `${base}.xlsx`;
    csvFile = `${base}.csv`;

    // Always return the bytes inline so deployments (Vercel) can download without disk persistence.
    xlsxBase64 = Buffer.from(xlsx).toString('base64');
    csvText = csv;

    if (canPersistToDisk) {
      await writeFile(path.join(root, xlsxFile), Buffer.from(xlsx));
      await writeFile(path.join(root, csvFile), csv, 'utf8');
    }
  }

  if (canPersistToDisk) {
    await writeFile(
      path.join(root, 'meta.json'),
      JSON.stringify(
        {
          id,
          createdAt: new Date().toISOString(),
          base,
          row: payload.row,
          planilla: payload.skipPlanilla ? { generated: false, reason: payload.skipReason || null } : { generated: true },
          files: {
            parte: 'parte.pdf',
            permiso: permisoSaved ? 'permiso.pdf' : null,
            xlsx: xlsxFile,
            csv: csvFile,
          },
        },
        null,
        2,
      ),
      'utf8',
    );
  }

  const files = {
    interventionId: id,
    base,
    xlsxFileName: xlsxFile || undefined,
    csvFileName: csvFile || undefined,
    xlsxBase64,
    csvText,
    // Only available when persistence is enabled (local/dev environments)
    parteUrl: canPersistToDisk ? `/api/interventions/${id}/files/parte.pdf` : undefined,
    permisoUrl: canPersistToDisk && permisoSaved ? `/api/interventions/${id}/files/permiso.pdf` : undefined,
    xlsxUrl: canPersistToDisk && xlsxFile ? `/api/interventions/${id}/files/${encodeURIComponent(base)}.xlsx` : undefined,
    csvUrl: canPersistToDisk && csvFile ? `/api/interventions/${id}/files/${encodeURIComponent(base)}.csv` : undefined,
  };

  return NextResponse.json({ id, files });
}

