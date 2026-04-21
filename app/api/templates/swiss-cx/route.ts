import { NextResponse } from 'next/server';
import path from 'path';
import { readFile } from 'fs/promises';

export async function GET() {
  const templatePath = path.join(process.cwd(), 'templates', 'planilla cx swiss.xlsx');
  const buf = await readFile(templatePath);
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'inline; filename="planilla cx swiss.xlsx"',
      'Cache-Control': 'no-store',
    },
  });
}

