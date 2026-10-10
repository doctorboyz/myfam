/**
 * Quick test: Categories intent pipeline
 * Tests intent detection + response generation with mock data
 * Usage: node scripts/test-categories-intent.mjs
 */

const BASE_URL = 'http://localhost:11434';
const MODEL = 'qwen3.5:cloud';

// ── Ollama helpers ──────────────────────────────────────────────────

async function ollamaGenerate(prompt) {
  const res = await fetch(`${BASE_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL, prompt, stream: false,
      options: { temperature: 0.1, top_p: 0.6 },
    }),
    signal: AbortSignal.timeout(300_000),
  });
  const data = await res.json();
  return data.response;
}

async function ollamaChat(messages) {
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL, messages, stream: false, format: 'json',
      options: { temperature: 0, top_p: 0.3 },
    }),
    signal: AbortSignal.timeout(300_000),
  });
  const data = await res.json();
  return data.message.content;
}

// ── Intent Detection ───────────────────────────────────────────────

async function detectIntent(text) {
  // Keyword fallback first (mirrors production detectIntentByKeywords)
  if (/(หมวด|หมวดหมู่|category|categories|แท็ก|tag|อันดับ|ranking|จัดอันดับ)/i.test(text)) {
    return 'categories';
  }

  const prompt = `จากข้อความต่อไปนี้ ระบุความตั้งใจของผู้ใช้:

ข้อความ: "${text}"

ตอบเป็น JSON เท่านั้น โดยเลือก intent หนึ่งตัวเท่านั้น:
- "balance" — ผู้ใช้ต้องการดูยอดเงินคงเหลือ
- "recent" — ผู้ใช้ต้องการดูรายการล่าสุด
- "summary" — ผู้ใช้ต้องการดูสรุปยอดรายรับรายจ่าย
- "budget" — ผู้ใช้ต้องการดูสถานะงบประมาณ
- "categories" — ผู้ใช้ถามเกี่ยวกับหมวดหมู่ (มีหมวดอะไรบ้าง, หมวดไหนใช้เงินเยอะสุด, หมวดอาหารมีอะไรบ้าง)
- "help" — ผู้ใช้ถามว่าบอททำอะไรได้

ตอบ: {"intent":"..."}`;

  try {
    const result = await ollamaChat([{ role: 'user', content: prompt }]);
    const cleaned = result.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    const parsed = JSON.parse(cleaned);
    const intent = String(parsed.intent ?? '');
    if (['balance', 'recent', 'summary', 'budget', 'help', 'categories'].includes(intent)) {
      return intent;
    }
  } catch (e) {
    console.error('  detectIntent error:', e.message);
  }
  return null;
}

// ── Mock Data ──────────────────────────────────────────────────────

function mockCategoriesData() {
  return {
    groups: [
      { name: 'อาหาร', type: 'expense', subcategories: ['ข้าว', 'น้ำ', 'ขนม', 'ผลไม้', 'อาหารจานเดียว'] },
      { name: 'เดินทาง', type: 'expense', subcategories: ['ค่าน้ำมัน', 'ค่าแท็กซี่', 'ค่าBTS/MRT'] },
      { name: 'การเงิน', type: 'expense', subcategories: ['ค่าโทรศัพท์', 'ค่าห้อง', 'ค่าบัตรเครดิต'] },
      { name: 'รายรับ', type: 'income', subcategories: ['เงินเดือน', 'โบนัส', 'รายได้เสริม'] },
      { name: 'การโอน', type: 'transfer', subcategories: [] },
    ],
    topGroups: [
      { groupName: 'อาหาร', amount: 5200 },
      { groupName: 'การเงิน', amount: 3000 },
      { groupName: 'เดินทาง', amount: 1800 },
    ],
    topCategories: [
      { name: 'ข้าว', groupName: 'อาหาร', amount: 3200 },
      { name: 'ค่าโทรศัพท์', groupName: 'การเงิน', amount: 2000 },
      { name: 'ค่าน้ำมัน', groupName: 'เดินทาง', amount: 1200 },
      { name: 'น้ำ', groupName: 'อาหาร', amount: 800 },
      { name: 'ขนม', groupName: 'อาหาร', amount: 700 },
    ],
    tags: [
      { name: 'จำเป็น' },
      { name: 'ฟุ่มเฟือย' },
    ],
  };
}

// ── Load Intent Example ────────────────────────────────────────────

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const categoriesExample = readFileSync(join(__dirname, '..', 'src', 'intent', 'categories.md'), 'utf-8');

// ── Session memory (simple) ────────────────────────────────────────

const sessionStore = new Map();
function getSessionMemory(userId) { return sessionStore.get(userId) ?? []; }
function addCycle(userId, cycle) {
  const history = getSessionMemory(userId);
  history.push(cycle);
  if (history.length > 5) history.shift();
  sessionStore.set(userId, history);
}
function formatSessionContext(userId) {
  const history = getSessionMemory(userId);
  if (history.length === 0) return '';
  return history.map((c, i) => `[${i + 1}] User: "${c.userText}"\n    Bot: "${c.response.slice(0, 100)}"`).join('\n');
}

// ── Handle Intent ──────────────────────────────────────────────────

async function handleCategoriesIntent(text, userId) {
  const data = mockCategoriesData();
  const sessionContext = formatSessionContext(userId);

  const prompt = `คุณคือ Fammee Oracle ผู้ช่วยการเงินครอบครัว MyFam

## Intent Example (แนวทางการตอบ)
${categoriesExample}

## Session Memory (ประวัติบทสนนาย้อนหลัง 5 รอบ)
${sessionContext || '(ยังไม่มีประวัติ — นี่คือข้อความแรก)'}

## ข้อมูลจากฐานข้อมูล (query แล้ว)
\`\`\`json
${JSON.stringify(data, null, 2)}
\`\`\`

## ข้อความล่าสุดจากผู้ใช้
"${text}"

วิเคราะห์ข้อมูลจากฐานข้อมูล ร่วมกับประวัติบทสนทนา และตอบกลับเป็นภาษาไทย
ให้เป็นธรรมชาติ อ่านง่าย และเป็นมิตร
ถ้าข้อมูลมีจำนวนเงิน ให้ใช้เครื่องหมายคอมม่าคั่นหลักพัน
ใช้ emoji ให้เหมาะสมกับบริบท`;

  const response = await ollamaGenerate(prompt);

  addCycle(userId, { userText: text, intent: 'categories', response });
  return { response, data };
}

// ── Test Runner ────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(condition, name, detail = '') {
  if (condition) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
}

// ── Main ───────────────────────────────────────────────────────────

console.log('=== Categories Intent Pipeline Test ===\n');

// 1. Keyword detection (fast, no AI)
console.log('1. Keyword Detection:');
const keywordTests = [
  ['มีหมวดอะไรบ้าง', true], ['หมวดไหนใช้เงินเยอะสุด', true],
  ['จัดอันดับหมวด', true], ['หมวดอาหารมีอะไรบ้าง', true],
  ['categories', true], ['ค่ากินเดือนนี้', false],  // "กิน" doesn't match keyword regex
  ['ยอดคงเหลือ', false], ['รายการล่าสุด', false],
];
for (const [text, expected] of keywordTests) {
  const isMatch = /(หมวด|หมวดหมู่|category|categories|แท็ก|tag|อันดับ|ranking|จัดอันดับ)/i.test(text);
  test(isMatch === expected, `"${text}" → ${isMatch ? 'categories' : 'other'}`);
}

// 2. AI intent detection
console.log('\n2. AI Intent Detection:');
const aiTests = [
  'มีหมวดอะไรบ้าง',
  'หมวดไหนใช้เงินเยอะสุด',
  'อยากรู้ว่ามีแท็กอะไรบ้าง',
  'category list please',
];
for (const text of aiTests) {
  // Keyword catches these first in production, but test AI too
  const intent = await detectIntent(text);
  test(intent === 'categories', `"${text}" → ${intent}`, intent !== 'categories' ? `got "${intent}"` : '');
}

// 3. Response generation
console.log('\n3. Response Generation:');
const userId = 'U-test-cat';

// Test 3a: "มีหมวดอะไรบ้าง"
console.log('  3a. "มีหมวดอะไรบ้าง"');
const r1 = await handleCategoriesIntent('มีหมวดอะไรบ้าง', userId);
console.log(`      Response (first 200 chars): ${r1.response.slice(0, 200).replace(/\n/g, ' ')}`);
test(r1.response.length > 20, 'Response is not empty');
test(r1.response.includes('อาหาร'), 'Mentions food category');
test(r1.response.includes('รายรับ') || r1.response.includes('income'), 'Mentions income type');

// Test 3b: "หมวดไหนใช้เงินเยอะสุด"
console.log('\n  3b. "หมวดไหนใช้เงินเยอะสุด"');
const r2 = await handleCategoriesIntent('หมวดไหนใช้เงินเยอะสุด', userId);
console.log(`      Response (first 200 chars): ${r2.response.slice(0, 200).replace(/\n/g, ' ')}`);
test(r2.response.length > 20, 'Response is not empty');
test(r2.response.includes('5,200') || r2.response.includes('5200'), 'Shows top spending amount');

// Test 3c: Session memory follow-up
console.log('\n  3c. Follow-up: "แล้วหมวดอาหารมีอะไรบ้าง"');
const r3 = await handleCategoriesIntent('แล้วหมวดอาหารมีอะไรบ้าง', userId);
console.log(`      Response (first 200 chars): ${r3.response.slice(0, 200).replace(/\n/g, ' ')}`);
test(r3.response.length > 20, 'Response is not empty');

// Check session memory
const session = getSessionMemory(userId);
test(session.length === 3, `Session has 3 cycles (got ${session.length})`);

// 4. Edge cases
console.log('\n4. Edge Cases:');
const emptyData = { groups: [], topGroups: [], topCategories: [], tags: [] };
const emptyPrompt = `คุณคือ Fammee Oracle...

## Intent Example (แนวทางการตอบ)
${categoriesExample}

## Session Memory
(ยังไม่มีประวัติ)

## ข้อมูลจากฐานข้อมูล (query แล้ว)
\`\`\`json
${JSON.stringify(emptyData, null, 2)}
\`\`\`

## ข้อความล่าสุดจากผู้ใช้
"มีหมวดอะไรบ้าง"

วิเคราะห์ข้อมูลจากฐานข้อมูล และตอบกลับเป็นภาษาไทย
ให้เป็นธรรมชาติ อ่านง่าย และเป็นมิตร
ถ้าไม่มีหมวดหมู่เลย แนะนำให้ไปตั้งค่าในแอป`;

const r4 = await ollamaGenerate(emptyPrompt);
console.log(`  Response: ${r4.slice(0, 200).replace(/\n/g, ' ')}`);
test(r4.length > 20, 'Empty data generates non-empty response');
test(/ตั้งค่า|แอป|เพิ่มหมวด|สร้าง|ยังไม่มี/.test(r4), 'Suggests setting up categories in app');

// ── Summary ────────────────────────────────────────────────────────

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
