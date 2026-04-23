import { NextResponse } from 'next/server';
import path from 'path';
import { readFile, writeFile } from 'fs/promises';
import { generateSwissCxFiles } from '@/lib/swissCxExport';
import type { SwissCxRow } from '@/lib/types';

type UpdatePayload = {
  row: SwissCxRow;
  base?: string;
};

export async function PUT(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const safeId = String(id || '').replace(/[^a-z0-9]/gi, '');
  if (!safeId) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let payload: UpdatePayload;
  try {
    payload = (await _req.json()) as UpdatePayload;
  } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 });
  }

  const canPersistToDisk = !process.env.VERCEL;
  const root = path.join(process.cwd(), 'data', 'interventions', safeId);
  const metaPath = path.join(root, 'meta.json');
  try {
    const baseFromDisk = canPersistToDisk ? (JSON.parse(await readFile(metaPath, 'utf8')) as { base: string }).base : undefined;
    const base = String(payload.base || baseFromDisk || 'planilla').replace(/[^a-z0-9_]+/gi, '_').slice(0, 60);

    const templatePath = path.join(process.cwd(), 'templates', 'planilla cx swiss.xlsx');
    const templateXlsx = await readFile(templatePath);
    const { xlsx, csv } = await generateSwissCxFiles({
      templateXlsx: templateXlsx.buffer.slice(templateXlsx.byteOffset, templateXlsx.byteOffset + templateXlsx.byteLength),
      row: payload.row,
    });

    const xlsxBase64 = Buffer.from(xlsx).toString('base64');
    const xlsxFileName = `${base}.xlsx`;
    const csvFileName = `${base}.csv`;

    if (canPersistToDisk) {
      await writeFile(path.join(root, xlsxFileName), Buffer.from(xlsx));
      await writeFile(path.join(root, csvFileName), csv, 'utf8');

      const meta = JSON.parse(await readFile(metaPath, 'utf8')) as any;
      await writeFile(
        metaPath,
        JSON.stringify({ ...(meta as any), updatedAt: new Date().toISOString(), row: payload.row }, null, 2),
        'utf8',
      );
    }

    return NextResponse.json({
      ok: true,
      files: {
        interventionId: safeId,
        base,
        xlsxFileName,
        csvFileName,
        xlsxBase64,
        csvText: csv,
        xlsxUrl: canPersistToDisk ? `/api/interventions/${safeId}/files/${encodeURIComponent(base)}.xlsx` : undefined,
        csvUrl: canPersistToDisk ? `/api/interventions/${safeId}/files/${encodeURIComponent(base)}.csv` : undefined,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}

