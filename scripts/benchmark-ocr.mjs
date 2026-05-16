import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SLIP_DIR = path.resolve(__dirname, '../public/slip_test');
const OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';

const MODELS = ['glm-ocr:latest', 'deepseek-ocr:latest'];

const TEST_IMAGES = [
  'slip_scb.png',
  'slip_truemoney.png',
  'slip_7eleven.png',
];

const OCR_PROMPT = `Read all text visible in this Thai bank slip or receipt image.
Extract every word, number, and line exactly as it appears.

Respond with ONLY the extracted text. No explanations, no summaries.
If you cannot read the image clearly, respond with "UNREADABLE".`;

async function resizeImageToBase64(filePath, maxDim = 512) {
  const buffer = fs.readFileSync(filePath);
  const resized = await sharp(buffer)
    .resize(maxDim, maxDim, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
  return resized.toString('base64');
}

async function runOcr(model, imageBase64) {
  const body = {
    model,
    prompt: OCR_PROMPT,
    images: [imageBase64],
    stream: false,
    format: 'json',
    options: {
      temperature: 0.1,
      top_p: 0.6,
      repetition_penalty: 1.1,
    },
  };

  const start = Date.now();
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300_000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ollama error (${res.status}): ${err}`);
  }

  const data = await res.json();
  const elapsed = Date.now() - start;

  return {
    model: data.model || model,
    response: data.response || '',
    totalDuration: data.total_duration,
    evalCount: data.eval_count,
    elapsedMs: elapsed,
  };
}

function parseJsonSafe(raw) {
  let s = raw.trim();
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }
  try {
    return JSON.parse(s);
  } catch {
    return raw;
  }
}

async function main() {
  const results = [];

  for (const imageName of TEST_IMAGES) {
    const imagePath = path.join(SLIP_DIR, imageName);
    if (!fs.existsSync(imagePath)) {
      console.warn(`⚠️ ไม่พบรูป: ${imageName}`);
      continue;
    }

    console.log(`\n📷 ${imageName}`);
    const base64 = await resizeImageToBase64(imagePath, 512);

    for (const model of MODELS) {
      try {
        const { response, elapsedMs, evalCount } = await runOcr(model, base64);
        const parsed = parseJsonSafe(response);

        results.push({
          image: imageName,
          model,
          elapsedMs,
          evalCount,
          raw: response.slice(0, 500),
          parsed,
        });

        const preview = (parsed || response).toString().replace(/\n/g, ' ').slice(0, 80);
        console.log(`  ✅ ${model} — ${elapsedMs}ms | ${preview}`);
      } catch (err) {
        results.push({
          image: imageName,
          model,
          elapsedMs: 0,
          evalCount: 0,
          raw: '',
          error: err.message,
        });
        console.log(`  ❌ ${model} — ${err.message}`);
      }
    }
  }

  // Summary table
  console.log('\n========== สรุปผลการทดสอบ OCR ==========\n');

  const headers = ['รูป', 'Model', 'เวลา (ms)', 'Tokens', 'Text preview (first 50 chars)'];
  const colWidths = [22, 22, 12, 8, 55];

  function row(cells) {
    return cells.map((c, i) => String(c).padEnd(colWidths[i])).join(' | ');
  }

  console.log(row(headers));
  console.log(colWidths.map(w => '-'.repeat(w)).join('-+-'));

  for (const r of results) {
    const text = typeof r.parsed === 'string' ? r.parsed : JSON.stringify(r.parsed || {});
    console.log(row([
      r.image,
      r.model.replace(':latest', ''),
      r.error ? `ERROR` : r.elapsedMs,
      r.evalCount || '-',
      r.error ? r.error.slice(0, 50) : text.replace(/\n/g, ' ').slice(0, 50),
    ]));
  }

  // Write full results to file
  const outPath = path.resolve(__dirname, '../ocr-benchmark-results.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\n💾 บันทึกผลละเอียดทั้งหมดที่: ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
