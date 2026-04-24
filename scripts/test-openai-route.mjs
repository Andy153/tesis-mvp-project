import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const SAMPLE_PATH = path.join(ROOT, 'public', 'test-assets', 'sample-parte.jpg');

function mimeFromPath(p) {
  const lower = p.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

async function fileToDataUrl(filePath) {
  const buf = await fs.readFile(filePath);
  const b64 = Buffer.from(buf).toString('base64');
  const mime = mimeFromPath(filePath);
  return `data:${mime};base64,${b64}`;
}

async function main() {
  try {
    await fs.access(SAMPLE_PATH);
  } catch {
    console.error(
      [
        'Smoke test failed: missing sample image.',
        `Expected file at: ${SAMPLE_PATH}`,
        'Please add your test image there (filename must be sample-parte.jpg) and re-run:',
        '  node scripts/test-openai-route.mjs',
      ].join('\n'),
    );
    process.exit(1);
  }

  const imageBase64 = await fileToDataUrl(SAMPLE_PATH);

  const resp = await fetch('http://localhost:3000/api/ai/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageBase64,
      documentType: 'parte_quirurgico',
    }),
  });

  const text = await resp.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    console.log('Non-JSON response:', text);
    process.exit(1);
  }

  console.log('Status:', resp.status);
  console.log(JSON.stringify(json, null, 2));
}

main().catch((e) => {
  console.error('Smoke test crashed:', e?.message || e);
  process.exit(1);
});
