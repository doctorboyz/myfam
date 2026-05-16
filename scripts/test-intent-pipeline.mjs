/**
 * Intent Pipeline Test Script
 *
 * Tests each intent type through the full pipeline:
 * detectIntent → handleIntent → ollamaGenerate → session memory
 *
 * Usage: node scripts/test-intent-pipeline.mjs
 *
 * Requires: Ollama running, database accessible
 */

const BASE_URL = 'http://localhost:11434';
const MODEL = 'qwen3.5:cloud';

// ── Helpers ────────────────────────────────────────────────────────

async function ollamaGenerate(prompt, format = 'text') {
  const res = await fetch(`${BASE_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      prompt,
      stream: false,
      format,
      options: { temperature: 0.1, top_p: 0.6 },
    }),
    signal: AbortSignal.timeout(300_000),
  });
  const data = await res.json();
  return data.response;
}

async function ollamaChat(messages, format = 'json') {
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages,
      stream: false,
      format,
      options: { temperature: 0, top_p: 0.3 },
    }),
    signal: AbortSignal.timeout(300_000),
  });
  const data = await res.json();
  return data.message.content;
}

// ── Intent Detection ───────────────────────────────────────────────

async function detectIntent(text) {
  const prompt = `จากข้อความต่อไปนี้ ระบุความตั้งใจของผู้ใช้:

ข้อความ: "${text}"

ตอบเป็น JSON เท่านั้น โดยเลือก intent หนึ่งตัวเท่านั้น:
- "balance" — ผู้ใช้ต้องการดูยอดเงินคงเหลือ
- "recent" — ผู้ใช้ต้องการดูรายการล่าสุด
- "summary" — ผู้ใช้ต้องการดูสรุปยอดรายรับรายจ่าย
- "budget" — ผู้ใช้ต้องการดูสถานะงบประมาณ
- "help" — ผู้ใช้ถามว่าบอททำอะไรได้

ตอบ: {"intent":"..."}`;

  try {
    const result = await ollamaChat([{ role: 'user', content: prompt }], 'json');
    const parsed = JSON.parse(result.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, ''));
    const intent = String(parsed.intent ?? '');
    if (['balance', 'recent', 'summary', 'budget', 'help'].includes(intent)) {
      return intent;
    }
  } catch (e) {
    console.error('  detectIntent error:', e.message);
  }
  return null;
}

// ── Mock Data ──────────────────────────────────────────────────────

function mockData(intent) {
  switch (intent) {
    case 'balance':
      return {
        accounts: [
          { name: 'กรุงไทย', balance: 15420.50 },
          { name: 'กสิกร', balance: 3200 },
          { name: 'เงินสด', balance: 850 },
        ],
        totalBalance: 19470.50,
      };
    case 'balance_empty':
      return { accounts: [], totalBalance: 0 };
    case 'balance_single':
      return { accounts: [{ name: 'กรุงไทย', balance: 5000 }], totalBalance: 5000 };

    case 'recent':
      return {
        count: 3,
        transactions: [
          { type: 'expense', description: 'ข้าวผัดปู', amount: 120, categoryGroup: 'อาหาร', accountName: 'เงินสด', date: '2026-05-16' },
          { type: 'income', description: 'เงินค่าขนม', amount: 500, categoryGroup: 'เงินเดือน', accountName: 'กรุงไทย', date: '2026-05-15' },
          { type: 'transfer', description: 'โอนเข้ากสิกร', amount: 2000, categoryGroup: 'การเงิน', accountName: 'กรุงไทย', date: '2026-05-14' },
        ],
      };
    case 'recent_empty':
      return { count: 0, transactions: [] };

    case 'summary':
      return {
        monthName: 'พฤษภาคม 2026',
        totalIncome: 45000,
        totalExpense: 12350,
        balance: 32650,
        topCategories: [
          { name: 'อาหาร', amount: 5200 },
          { name: 'การเงิน', amount: 3000 },
          { name: 'เดินทาง', amount: 1800 },
        ],
      };
    case 'summary_zero':
      return {
        monthName: 'พฤษภาคม 2026',
        totalIncome: 0,
        totalExpense: 0,
        balance: 0,
        topCategories: [],
      };

    case 'budget':
      return {
        budgets: [
          { title: 'ค่ากิน', used: 5200, limit: 8000, percent: 65 },
          { title: 'ค่าเดินทาง', used: 1800, limit: 3000, percent: 60 },
          { title: 'ช้อปปิ้ง', used: 4200, limit: 4000, percent: 105 },
        ],
      };
    case 'budget_empty':
      return { budgets: [] };

    default:
      return {};
  }
}

// ── Session Memory (in-memory for testing) ─────────────────────────

const sessionStore = new Map();

function getSessionMemory(userId) {
  return sessionStore.get(userId) ?? [];
}

function addCycle(userId, cycle) {
  const history = getSessionMemory(userId);
  history.push(cycle);
  if (history.length > 5) history.shift();
  sessionStore.set(userId, history);
}

function formatSessionContext(userId) {
  const history = getSessionMemory(userId);
  if (history.length === 0) return '';
  return history
    .map((c, i) => `[${i + 1}] User: "${c.userText}"\n    Bot: "${c.response}"`)
    .join('\n');
}

// ── Intent Example Loading ─────────────────────────────────────────

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const intentDir = join(__dirname, '..', 'src', 'intent');
const exampleCache = new Map();

function loadIntentExample(intent) {
  if (exampleCache.has(intent)) return exampleCache.get(intent);
  const content = readFileSync(join(intentDir, `${intent}.md`), 'utf-8');
  exampleCache.set(intent, content);
  return content;
}

// ── Intent Handler ─────────────────────────────────────────────────

async function handleIntent(intent, text, userId) {
  const intentExample = loadIntentExample(intent);
  const sessionContext = formatSessionContext(userId);
  const dataKey = intent === 'help' ? intent : `${intent}`;
  const data = mockData(dataKey);

  const prompt = `คุณคือ Fammee Oracle ผู้ช่วยการเงินครอบครัว MyFam

## Intent Example (แนวทางการตอบ)
${intentExample}

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

  const response = await ollamaGenerate(prompt, 'text');

  addCycle(userId, {
    userText: text,
    intent,
    response,
  });

  return { response, data };
}

// ── Test Runner ────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const results = [];

function assert(condition, name, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
  }
  results.push({ name, ok: condition, detail });
}

function checkResponseContains(response, keywords) {
  const missing = keywords.filter(k => !response.includes(k));
  return missing.length === 0 ? [] : missing;
}

async function testIntentDetection() {
  console.log('\n═══ Intent Detection ═══');

  const cases = [
    { text: 'เหลือเงินเท่าไหร่', expected: 'balance' },
    { text: 'ดูยอดหน่อย', expected: 'balance' },
    { text: 'บัญชีกรุงไทยเหลือเท่าไหร่', expected: 'balance' },
    { text: 'รายการล่าสุด', expected: 'recent' },
    { text: 'วันนี้ใช้เงินไปเท่าไหร่', expected: 'summary' },
    { text: 'สรุปยอดเดือนนี้', expected: 'summary' },
    { text: 'งบประมาณ', expected: 'budget' },
    { text: 'ช่วยเหลือ', expected: 'help' },
    { text: 'บอททำอะไรได้บ้าง', expected: 'help' },
  ];

  for (const { text, expected } of cases) {
    const intent = await detectIntent(text);
    assert(intent === expected, `"${text}" → ${expected}`, intent ? `got: ${intent}` : 'no intent');
  }
}

async function testBalance() {
  console.log('\n═══ Intent: balance ═══');
  const userId = 'test-balance-user';

  // Normal: 3 accounts
  const r1 = await handleIntent('balance', 'เหลือเงินเท่าไหร่', userId);
  assert(r1.response.length > 20, 'ตอบมีเนื้อหา (3 accounts)');
  assert(r1.response.includes('กรุงไทย'), 'กล่าวถึง กรุงไทย');
  assert(r1.response.includes('กสิกร'), 'กล่าวถึง กสิกร');
  assert(r1.response.includes('เงินสด'), 'กล่าวถึง เงินสด');

  // Edge: no accounts
  const r2 = await handleIntent('balance', 'ดูยอดหน่อย', 'test-balance-empty');
  // override data
  const intentExample = loadIntentExample('balance');
  const prompt2 = `คุณคือ Fammee Oracle

## Intent Example (แนวทางการตอบ)
${intentExample}

## Session Memory
(ยังไม่มีประวัติ)

## ข้อมูลจากฐานข้อมูล
\`\`\`json
${JSON.stringify(mockData('balance_empty'), null, 2)}
\`\`\`

## ข้อความล่าสุดจากผู้ใช้
"ดูยอดหน่อย"

ตอบกลับเป็นภาษาไทย`;

  const r2resp = await ollamaGenerate(prompt2, 'text');
  assert(r2resp.length > 10, 'ตอบมีเนื้อหา (0 accounts)');
  const noAccountKeywords = ['ไม่มี', 'บัญชี', 'สร้าง'];
  const missingNoAcct = noAccountKeywords.filter(k => !r2resp.includes(k));
  assert(missingNoAcct.length < 3, `แนะนำให้สร้างบัญชีเมื่อไม่มี`, missingNoAcct.join(', '));

  // Follow-up: ask about specific account from context
  const r3 = await handleIntent('balance', 'แล้วกรุงไทยล่ะ', userId);
  assert(r3.response.includes('กรุงไทย'), 'Follow-up: กล่าวถึง กรุงไทย จาก session memory');
}

async function testRecent() {
  console.log('\n═══ Intent: recent ═══');
  const userId = 'test-recent-user';

  const r1 = await handleIntent('recent', 'รายการล่าสุด', userId);
  assert(r1.response.length > 20, 'ตอบมีเนื้อหา');
  assert(r1.response.includes('ข้าวผัดปู'), 'กล่าวถึงรายการล่าสุด');

  // Edge: no transactions
  const intentExample = loadIntentExample('recent');
  const prompt2 = `คุณคือ Fammee Oracle

## Intent Example
${intentExample}

## Session Memory
(ยังไม่มีประวัติ)

## ข้อมูลจากฐานข้อมูล
\`\`\`json
${JSON.stringify(mockData('recent_empty'), null, 2)}
\`\`\`

## ข้อความล่าสุดจากผู้ใช้
"รายการล่าสุด"

ตอบกลับเป็นภาษาไทย`;

  const r2resp = await ollamaGenerate(prompt2, 'text');
  assert(r2resp.length > 5, 'ตอบมีเนื้อหา (0 transactions)');
  assert(
    r2resp.includes('ไม่มี') || r2resp.includes('ยังไม่'),
    `บอกว่าไม่มีรายการ — got: "${r2resp.slice(0, 80)}..."`,
  );
}

async function testSummary() {
  console.log('\n═══ Intent: summary ═══');
  const userId = 'test-summary-user';

  const r1 = await handleIntent('summary', 'สรุปยอดเดือนนี้', userId);
  assert(r1.response.length > 20, 'ตอบมีเนื้อหา');
  assert(r1.response.includes('45,000') || r1.response.includes('45000'), 'แสดงยอดรายรับ');

  // Edge: zero activity
  const intentExample = loadIntentExample('summary');
  const prompt2 = `คุณคือ Fammee Oracle

## Intent Example
${intentExample}

## Session Memory
(ยังไม่มีประวัติ)

## ข้อมูลจากฐานข้อมูล
\`\`\`json
${JSON.stringify(mockData('summary_zero'), null, 2)}
\`\`\`

## ข้อความล่าสุดจากผู้ใช้
"สรุปยอดหน่อย"

ตอบกลับเป็นภาษาไทย`;

  const r2resp = await ollamaGenerate(prompt2, 'text');
  assert(r2resp.length > 5, 'ตอบมีเนื้อหา (zero activity)');
  assert(
    r2resp.includes('0') || r2resp.includes('ไม่มี') || r2resp.includes('ยัง'),
    `จัดการกรณีไม่มีรายการ — got: "${r2resp.slice(0, 80)}..."`,
  );
}

async function testBudget() {
  console.log('\n═══ Intent: budget ═══');
  const userId = 'test-budget-user';

  const r1 = await handleIntent('budget', 'งบเป็นไงบ้าง', userId);
  assert(r1.response.length > 20, 'ตอบมีเนื้อหา');
  assert(r1.response.includes('ค่ากิน') || r1.response.includes('ช้อป'), 'กล่าวถึงชื่องบประมาณ');
  assert(r1.response.includes('105') || r1.response.includes('เกิน'), 'เตือนงบที่เกิน 100%');

  // Edge: no budgets
  const intentExample = loadIntentExample('budget');
  const prompt2 = `คุณคือ Fammee Oracle

## Intent Example
${intentExample}

## Session Memory
(ยังไม่มีประวัติ)

## ข้อมูลจากฐานข้อมูล
\`\`\`json
${JSON.stringify(mockData('budget_empty'), null, 2)}
\`\`\`

## ข้อความล่าสุดจากผู้ใช้
"ดูงบหน่อย"

ตอบกลับเป็นภาษาไทย`;

  const r2resp = await ollamaGenerate(prompt2, 'text');
  assert(r2resp.length > 5, 'ตอบมีเนื้อหา (0 budgets)');
}

async function testHelp() {
  console.log('\n═══ Intent: help ═══');
  const userId = 'test-help-user';

  const r1 = await handleIntent('help', 'ช่วยด้วย', userId);
  assert(r1.response.length > 20, 'ตอบมีเนื้อหา');
}

async function testSessionMemory() {
  console.log('\n═══ Session Memory (Multi-turn) ═══');
  const userId = 'test-session-user';

  // Clear session
  sessionStore.delete(userId);

  // Turn 1
  await handleIntent('balance', 'เหลือเงินเท่าไหร่', userId);
  const ctx1 = getSessionMemory(userId);
  assert(ctx1.length === 1, 'Cycle 1: 1 entry in memory');

  // Turn 2 — follow-up question
  await handleIntent('balance', 'แล้วกรุงไทยมีเท่าไหร่', userId);
  const ctx2 = getSessionMemory(userId);
  assert(ctx2.length === 2, 'Cycle 2: 2 entries in memory');

  // Turn 3 — change topic
  await handleIntent('summary', 'สรุปเดือนนี้หน่อย', userId);
  const ctx3 = getSessionMemory(userId);
  assert(ctx3.length === 3, 'Cycle 3: 3 entries in memory');

  // Turn 4 — context from turn 3
  await handleIntent('summary', 'แล้วหมวดอาหารเท่าไหร่', userId);
  const ctx4 = getSessionMemory(userId);
  assert(ctx4.length === 4, 'Cycle 4: 4 entries');

  // Turn 5
  await handleIntent('recent', 'รายการล่าสุด', userId);
  const ctx5 = getSessionMemory(userId);
  assert(ctx5.length === 5, 'Cycle 5: 5 entries');

  // Turn 6 — sliding window, first entry should be evicted
  await handleIntent('budget', 'งบ', userId);
  const ctx6 = getSessionMemory(userId);
  assert(ctx6.length === 5, 'Cycle 6: still 5 entries (sliding window)');
  assert(ctx6[0].userText === 'แล้วกรุงไทยมีเท่าไหร่', 'Oldest is now cycle 2 (cycle 1 evicted)');

  // Verify session context is formatted correctly
  const formatted = formatSessionContext(userId);
  assert(formatted.includes('[1]'), 'Session context has index [1]');
  assert(formatted.includes('[5]'), 'Session context has index [5]');
  assert(!formatted.includes('[6]'), 'No index [6] in 5-entry window');
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log('🧪 Intent Pipeline Tests');
  console.log(`   Model: ${MODEL}`);
  console.log(`   Started: ${new Date().toISOString()}`);

  const start = Date.now();

  try {
    await testIntentDetection();
    await testBalance();
    await testRecent();
    await testSummary();
    await testBudget();
    await testHelp();
    await testSessionMemory();
  } catch (e) {
    console.error('\n💥 Test crashed:', e.message);
    console.error(e.stack);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n═══ Results ═══`);
  console.log(`  ✅ ${passed} passed`);
  console.log(`  ❌ ${failed} failed`);
  console.log(`  ⏱  ${elapsed}s`);

  if (failed > 0) {
    console.log('\nFailed tests:');
    for (const r of results.filter(r => !r.ok)) {
      console.log(`  ❌ ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
    }
  }

  process.exit(failed > 0 ? 1 : 0);
}

main();
