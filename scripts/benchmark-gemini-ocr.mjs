import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SLIP_DIR = path.resolve(__dirname, '../public/slip_test');
const API_KEY = process.env.GEMINI_API_KEY;
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

const MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
];

const TEST_IMAGES = [
  'slip_scb.png',
  'slip_truemoney.png',
  'slip_7eleven.png',
];

// Step 1: Pure OCR — just extract text
const OCR_PROMPT = `Read all text visible in this Thai bank slip or receipt image.
Extract every word, number, and line exactly as it appears.
Respond with ONLY the extracted text. No explanations.`;

// Step 2: Structured extraction from text
const EXTRACT_PROMPT = (text) => `Extract transaction details from this Thai slip text.

Determine type:
- "expense" if money went OUT
- "income" if money came IN
- "transfer" if between own accounts

Respond ONLY with valid JSON:
{"amount":number,"date":"YYYY-MM-DD","description":"string","type":"expense|income|transfer","fee":number,"merchant":"string","confidence":0.0-1.0}

Text:
${text}`;

function base64Image(filePath) {
  const buffer = fs.readFileSync(filePath);
  return {
    inlineData: {
      mimeType: filePath.endsWith('.png') ? 'image/png' : 'image/jpeg',
      data: buffer.toString('base64'),
    },
  };
}

async function geminiGenerate(model, promptParts, timeoutMs = 120000) {
  const url = `${BASE_URL}/models/${model}:generateContent?key=${API_KEY}`;
  const body = {
    contents: [{ role: 'user', parts: promptParts }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 1024,
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const start = Date.now();
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const data = await res.json();
    const elapsedMs = Date.now() - start;

    if (!res.ok) {
      throw new Error(`Gemini error (${res.status}): ${JSON.stringify(data)}`);
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const usage = data.usageMetadata || {};
    return {
      text,
      elapsedMs,
      promptTokens: usage.promptTokenCount || 0,
      candidatesTokens: usage.candidatesTokenCount || 0,
      totalTokens: usage.totalTokenCount || 0,
    };
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

function parseJson(text) {
  let s = text.trim();
  s = s.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  try { return JSON.parse(s); } catch { return null; }
}

async function main() {
  console.log('🔍 Gemini Flash OCR Benchmark\n');
  const results = [];

  for (const imageName of TEST_IMAGES) {
    const imagePath = path.join(SLIP_DIR, imageName);
    if (!fs.existsSync(imagePath)) {
      console.warn(`⚠️  ไม่พบรูป: ${imageName}`);
      continue;
    }

    const imgPart = base64Image(imagePath);

    for (const model of MODELS) {
      console.log(`\n📷 ${imageName} — ${model}`);

      // Step 1: OCR — extract raw text
      try {
        const ocr = await geminiGenerate(model, [
          { text: OCR_PROMPT },
          imgPart,
        ]);
        console.log(`  OCR: ${ocr.elapsedMs}ms (${ocr.totalTokens} tokens)`);
        console.log(`  Raw: ${ocr.text.slice(0, 200).replace(/\n/g, ' | ')}`);

        // Step 2: Structured extraction
        const extract = await geminiGenerate(model, [
          { text: EXTRACT_PROMPT(ocr.text) },
        ]);
        const parsed = parseJson(extract.text);
        console.log(`  Extract: ${extract.elapsedMs}ms | amount=${parsed?.amount} type=${parsed?.type} fee=${parsed?.fee}`);

        results.push({
          image: imageName,
          model,
          ocrElapsed: ocr.elapsedMs,
          ocrTokens: ocr.totalTokens,
          extractElapsed: extract.elapsedMs,
          extractTokens: extract.totalTokens,
          totalElapsed: ocr.elapsedMs + extract.elapsedMs,
          rawText: ocr.text.slice(0, 500),
          parsed,
        });

        // If model works, skip other model variants
        if (ocr.text && !ocr.text.includes('UNREADABLE')) break;
      } catch (err) {
        console.log(`  ❌ ${err.message}`);
        results.push({
          image: imageName,
          model,
          error: err.message.slice(0, 200),
        });
      }
    }
  }

  // ── Summary table ──
  console.log('\n========== สรุปผล Gemini Flash OCR ==========\n');
  console.log('รูป              | Model             | OCR (ms) | Extract (ms) | รวม (ms) | amount   | type    | fee  | confidence');
  console.log('-'.repeat(110));

  for (const r of results) {
    if (r.error) {
      console.log(`${r.image.padEnd(16)} | ${r.model.padEnd(17)} | ERROR: ${r.error}`);
      continue;
    }
    const p = r.parsed || {};
    console.log(
      `${r.image.padEnd(16)} | ${r.model.padEnd(17)} | ${String(r.ocrElapsed).padEnd(8)} | ${String(r.extractElapsed).padEnd(12)} | ${String(r.totalElapsed).padEnd(8)} | ${String(p.amount ?? '-').padEnd(8)} | ${String(p.type ?? '-').padEnd(6)} | ${String(p.fee ?? '-').padEnd(4)} | ${p.confidence != null ? (p.confidence * 100).toFixed(0) + '%' : '-'}`,
    );
  }

  // Write full results
  const outPath = path.resolve(__dirname, '../gemini-ocr-results.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\n💾 บันทึกผลที่: ${outPath}`);

  // ── Comparison with glm-ocr ──
  console.log('\n========== เทียบกับ glm-ocr ==========\n');
  console.log('Metric          | Gemini Flash      | glm-ocr');
  console.log('-'.repeat(55));

  const geminiAvg = results.filter(r => !r.error).reduce((s, r) => s + r.totalElapsed, 0) / (results.filter(r => !r.error).length || 1);
  console.log(`เวลาต่อรูป      | ${Math.round(geminiAvg)}ms              | ~25000ms`);
  console.log(`อ่าน Thai text  | ต้องดูผล           | บางส่วน (เพี้ยน)`);
  console.log(`อ่านตัวเลข      | ต้องดูผล           | แม่น`);
  console.log(`Structured      | 2-step             | 1-shot (unreliable)`);
}

main().catch(e => { console.error(e); process.exit(1); });
