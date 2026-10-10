// Benchmark candidate vision models for AI_EXTRACT_SLIP_MODEL using the
// bot's real extraction prompt. Compares JSON validity, amount, type, latency.
// Usage: set -a; source .env; set +a; node scripts/_benchmark-slip-models.mjs
import fs from 'fs';
import sharp from 'sharp';

const API_KEY = process.env.OLLAMA_API_KEY;
const BASE = 'https://api.ollama.com/api/chat';
const MODELS = ['glm-5.3-flash', 'kimi-k3', 'gemma4:31b', 'deepseek-v4.1-flash'];
const SLIPS = [
  'slip_scb.png',
  'slip_truemoney.png',
  'slip_7eleven.png',
  'real/488942_0.jpg',
  'real/489180_0.jpg',
  'real/489185_0.jpg',
];

const CATS = 'อาหาร(expense), เดินทาง(expense), รายรับ(income), ออม(expense), ค่าเช่าบ้าน(expense), อื่นๆ(expense)';
const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);

const prompt = `อ่านสลิป/ใบเสร็จ/QR payment นี้แล้วสกัดข้อมูลธุรกรรม
วันนี้: ${today}
กลุ่มหมวด: ${CATS}

สำคัญ: พิจารณา type จากสลิปอย่างรอบคอบ:
- expense (เราจ่ายออก): เห็นชื่อเราเป็น "ผู้โอน" หรือ "จากบ/ช", มีคำว่า "โอนเงิน", "จ่าย", "ชำระ", PromptPay ที่เราแสกนจ่าย
- income (เรารับเข้า): เห็นชื่อเราเป็น "ผู้รับโอน" หรือ "เข้าบ/ช", มีคำว่า "รับโอน", "รับเงิน", "CREDIT", สลิปที่คนอื่นส่งมา
- transfer: โอนระหว่างบัญชีตัวเอง
- ถ้าไม่แน่ใจว่า expense หรือ income ให้ใส่ needsConfirmation=true

สำคัญมาก: ค่า type ต้องเป็นภาษาอังกฤษเท่านั้น ได้แก่ "expense" หรือ "income" หรือ "transfer" ห้ามใช้ภาษาอื่น

ตอบเป็น JSON เท่านั้น:
{"amount":จำนวนเงิน,"date":"YYYY-MM-DD","description":"ชื่อร้านหรือรายการ","type":"expenseหรือincomeหรือtransfer","categoryGroupName":"ชื่อกลุ่มหมวดจากด้านบน","merchantName":"ชื่อร้าน","accountName":"ชื่อบัญชีหรือnull","confidence":0ถึง1,"needsConfirmation":trueหรือfalse}
ถ้าอ่านจำนวนเงินไม่ได้ให้ใส่ amount=0
accountName: ถ้าสลิประบุบัญชี (เช่น "จากบัญชี xxx", "เข้าบัญชี xxx", "xxx ไทยพาณิชย์") ให้สกัดชื่อบัญชี ถ้าไม่ระบุให้ใส่ null
เลือก categoryGroupName ที่ตรงกับรายการมากที่สุดจากกลุ่มหมวดด้านบน`;

async function toB64(path, maxDim = 512) {
  const buf = await sharp(path).resize(maxDim, maxDim, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 }).toBuffer();
  return buf.toString('base64');
}

for (const model of MODELS) {
  console.log(`\n══ ${model} ══`);
  for (const slip of SLIPS) {
    const img = await toB64(`public/slip_test/${slip}`);
    const t0 = Date.now();
    try {
      const res = await fetch(BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt, images: [img] }],
          stream: false,
          format: 'json',
          options: { temperature: 0.1, top_p: 0.6, repetition_penalty: 1.1 },
        }),
        signal: AbortSignal.timeout(120000),
      });
      const json = await res.json();
      const sec = ((Date.now() - t0) / 1000).toFixed(1);
      if (json.error) { console.log(`  ✗ ${slip}: ${JSON.stringify(json.error).slice(0, 80)} (${sec}s)`); continue; }
      try {
        // Mirror the bot's parseExtractedTransaction: strip markdown fences
        const raw = String(json.message.content).replace(/```(json)?\s*/g, '').replace(/```$/g, '').trim();
        const ex = JSON.parse(raw);
        console.log(`  ✓ ${slip}: ${ex.amount} ฿ ${ex.type} "${(ex.description ?? '').slice(0, 30)}" date=${ex.date} conf=${ex.confidence} (${sec}s)`);
      } catch {
        console.log(`  ✗ ${slip}: BAD JSON after fence-strip (${sec}s): ${String(json.message.content).slice(0, 60)}`);
      }
    } catch (e) {
      console.log(`  ✗ ${slip}: ${e.message} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    }
  }
}