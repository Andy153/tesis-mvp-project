import { NextResponse } from 'next/server';
import path from 'path';
import { readFile, writeFile } from 'fs/promises';
import { generateSwissCxFiles } from '@/lib/swissCxExport';
import type { SwissCxRow } from '@/lib/types';

type UpdatePayload = { row: SwissCxRow };

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

  const root = path.join(process.cwd(), 'data', 'interventions', safeId);
  const metaPath = path.join(root, 'meta.json');
  try {
    const meta = JSON.parse(await readFile(metaPath, 'utf8')) as { base: string };
    const base = meta.base;

    const templatePath = path.join(process.cwd(), 'templates', 'planilla cx swiss.xlsx');
    const templateXlsx = await readFile(templatePath);
    const { xlsx, csv } = await generateSwissCxFiles({
      templateXlsx: templateXlsx.buffer.slice(templateXlsx.byteOffset, templateXlsx.byteOffset + templateXlsx.byteLength),
      row: payload.row,
    });

    await writeFile(path.join(root, `${base}.xlsx`), Buffer.from(xlsx));
    await writeFile(path.join(root, `${base}.csv`), csv, 'utf8');

    await writeFile(
      metaPath,
      JSON.stringify({ ...(meta as any), updatedAt: new Date().toISOString(), row: payload.row }, null, 2),
      'utf8',
    );

    return NextResponse.json({
      ok: true,
      files: {
        interventionId: safeId,
        xlsxUrl: `/api/interventions/${safeId}/files/${encodeURIComponent(base)}.xlsx`,
        csvUrl: `/api/interventions/${safeId}/files/${encodeURIComponent(base)}.csv`,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}

