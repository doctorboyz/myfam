/**
 * AI Model Testing API — verifies the Ollama Cloud connection with mock data.
 *
 * POST { intent, model, text }
 * → generates mock data, calls aiChat, returns response + timing.
 */

import { NextRequest, NextResponse } from 'next/server';
import { aiChat } from '@/lib/ai-client';
import { getAuthUser } from '@/lib/api';

// ── Mock Data ──────────────────────────────────────────────────────

function mockData(intent: string) {
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

    case 'recent':
      return {
        count: 3,
        transactions: [
          { type: 'expense', description: 'ข้าวผัดปู', amount: 120, categoryGroup: 'อาหาร', accountName: 'เงินสด', date: '2026-05-16' },
          { type: 'income', description: 'เงินค่าขนม', amount: 500, categoryGroup: 'เงินเดือน', accountName: 'กรุงไทย', date: '2026-05-15' },
          { type: 'transfer', description: 'โอนเข้ากสิกร', amount: 2000, categoryGroup: 'การเงิน', accountName: 'กรุงไทย', date: '2026-05-14' },
        ],
      };

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

    case 'budget':
      return {
        budgets: [
          { title: 'ค่ากิน', used: 5200, limit: 8000, percent: 65 },
          { title: 'ค่าเดินทาง', used: 1800, limit: 3000, percent: 60 },
          { title: 'ช้อปปิ้ง', used: 4200, limit: 4000, percent: 105 },
        ],
      };

    case 'categories':
      return {
        groups: [
          { name: 'อาหาร', type: 'expense', subcategories: ['ข้าว', 'น้ำ', 'ขนม', 'ผลไม้', 'อาหารจานเดียว'] },
          { name: 'เดินทาง', type: 'expense', subcategories: ['ค่าน้ำมัน', 'ค่าแท็กซี่', 'ค่าBTS/MRT'] },
          { name: 'การเงิน', type: 'expense', subcategories: ['ค่าโทรศัพท์', 'ค่าห้อง', 'ค่าบัตรเครดิต'] },
          { name: 'รายรับ', type: 'income', subcategories: ['เงินเดือน', 'โบนัส', 'รายได้เสริม'] },
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
        ],
        tags: [{ name: 'จำเป็น' }, { name: 'ฟุ่มเฟือย' }],
      };

    default:
      return {};
  }
}

// ── GET: Available intents + models ────────────────────────────────

export async function GET() {
  const currentUser = await getAuthUser();
  if (!currentUser?.isAdmin) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  return NextResponse.json({
    intents: ['balance', 'recent', 'summary', 'budget', 'categories', 'help'],
    models: [
      { label: 'Qwen3 32B (Ollama Cloud)', value: 'ollama:qwen3:32b' },
      { label: 'Qwen3 8B (Ollama Cloud)', value: 'ollama:qwen3:8b' },
      { label: 'Llama 3.2 3B (Ollama Cloud)', value: 'ollama:llama3.2:3b' },
      { label: 'Gemma 3 4B (Ollama Cloud)', value: 'ollama:gemma3:4b' },
      { label: 'Typhoon 2 3B (Ollama Cloud)', value: 'ollama:scb10x/llama3.2-typhoon2-3b-instruct' },
    ],
  });
}

// ── POST: Run prompt against Ollama Cloud ──────────────────────────

export async function POST(request: NextRequest) {
  const currentUser = await getAuthUser();
  if (!currentUser?.isAdmin) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const { intent, model, text } = await request.json();

  if (!intent || !model || !text) {
    return NextResponse.json({ error: 'Missing intent, model, or text' }, { status: 400 });
  }

  const startTime = Date.now();

  try {
    const data = mockData(intent);

    const prompt = `คุณคือ Fammee Oracle ผู้ช่วยการเงินครอบครัว MyFam

## ข้อมูลจากฐานข้อมูล (query แล้ว)
\`\`\`json
${JSON.stringify(data, null, 2)}
\`\`\`

## ข้อความล่าสุดจากผู้ใช้
"${text}"

วิเคราะห์ข้อมูลจากฐานข้อมูล และตอบกลับเป็นภาษาไทย
ให้เป็นธรรมชาติ อ่านง่าย และเป็นมิตร
ถ้าข้อมูลมีจำนวนเงิน ให้ใช้เครื่องหมายคอมม่าคั่นหลักพัน
ใช้ emoji ให้เหมาะสมกับบริบท`;

    const response = await aiChat({
      model,
      messages: [{ role: 'user', content: prompt }],
      format: 'text',
      temperature: 0.3,
      topP: 0.7,
    });

    const timeMs = Date.now() - startTime;

    return NextResponse.json({
      response,
      timeMs,
      intent,
      model,
      data,
    });
  } catch (error) {
    const timeMs = Date.now() - startTime;
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
      timeMs,
      intent,
      model,
    }, { status: 500 });
  }
}
