import { NextResponse } from 'next/server';
import path from 'path';
import { readFile } from 'fs/promises';

function contentTypeFor(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.csv')) return 'text/csv; charset=utf-8';
  if (lower.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  return 'application/octet-stream';
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; file: string }> },
) {
  const { id, file } = await params;
  const safeId = String(id || '').replace(/[^a-z0-9]/gi, '');
  const safeFile = path.basename(String(file || ''));
  if (!safeId || !safeFile) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const p = path.join(process.cwd(), 'data', 'interventions', safeId, safeFile);
  try {
    const buf = await readFile(p);
    return new NextResponse(buf, {
      headers: {
        'Content-Type': contentTypeFor(safeFile),
        'Cache-Control': 'no-store',
        'Content-Disposition': `inline; filename="${safeFile}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}

