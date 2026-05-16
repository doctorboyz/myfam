/**
 * Intent Router — routes detected intents through example-driven query + response pipeline.
 *
 * Flow: load intent/<intent>.md → execute Prisma query → ollamaGenerate formats response
 * Uses Session Memory (last 5 cycles) to maintain conversation context.
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { prisma } from '@/lib/prisma';
import { ollamaGenerate, OLLAMA_TEXT_MODEL, type UserIntent } from '@/lib/ollama';
import { getSessionMemory, addCycle, formatSessionContext, type ChatCycle } from '@/lib/session-memory';

// ── Intent example cache ──────────────────────────────────────────

const exampleCache = new Map<UserIntent, string>();

async function loadIntentExample(intent: UserIntent): Promise<string> {
  const cached = exampleCache.get(intent);
  if (cached) return cached;

  const filePath = join(process.cwd(), 'src/intent', `${intent}.md`);
  const content = await readFile(filePath, 'utf-8');
  exampleCache.set(intent, content);
  return content;
}

// ── Query Execution ───────────────────────────────────────────────

interface UserContext {
  id: string;
  name: string;
  role: string;
  familyId: string;
}

function getDataScope(user: UserContext) {
  if (user.role === 'parent') {
    return { createdBy: { familyId: user.familyId } };
  }
  return { createdById: user.id };
}

async function executeIntentQuery(intent: UserIntent, user: UserContext): Promise<Record<string, unknown>> {
  switch (intent) {
    case 'balance': {
      const accounts = await prisma.account.findMany({
        where: { ownerId: user.id, status: 'active' },
        orderBy: { createdAt: 'asc' },
      });
      const totalBalance = accounts.reduce((sum, a) => sum + Number(a.balance), 0);
      return {
        accounts: accounts.map((a) => ({ name: a.name, balance: Number(a.balance) })),
        totalBalance,
      };
    }

    case 'recent': {
      const scope = getDataScope(user);
      const transactions = await prisma.transaction.findMany({
        where: scope,
        include: { category: { include: { group: true } }, account: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });
      return {
        count: transactions.length,
        transactions: transactions.map((t) => ({
          type: t.type,
          description: t.description,
          amount: Number(t.amount),
          categoryGroup: t.category?.group?.name ?? '-',
          accountName: t.account?.name ?? '-',
          date: t.date.toISOString().split('T')[0],
        })),
      };
    }

    case 'summary': {
      const scope = getDataScope(user);
      const today = new Date();
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const monthName = today.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });

      const [income, expense, topTx] = await Promise.all([
        prisma.transaction.aggregate({
          where: { ...scope, type: 'income', date: { gte: startOfMonth } },
          _sum: { amount: true },
        }),
        prisma.transaction.aggregate({
          where: { ...scope, type: 'expense', date: { gte: startOfMonth } },
          _sum: { amount: true },
        }),
        prisma.transaction.findMany({
          where: { ...scope, type: 'expense', date: { gte: startOfMonth } },
          include: { category: { include: { group: true } } },
          orderBy: { amount: 'desc' },
          take: 10,
        }),
      ]);

      const totalIncome = Number(income._sum.amount ?? 0);
      const totalExpense = Number(expense._sum.amount ?? 0);

      const catMap = new Map<string, number>();
      for (const tx of topTx) {
        const name = tx.category?.group?.name || tx.category?.name || 'อื่นๆ';
        catMap.set(name, (catMap.get(name) || 0) + Number(tx.amount));
      }
      const topCategories = Array.from(catMap.entries())
        .map(([name, amount]) => ({ name, amount }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 3);

      return { monthName, totalIncome, totalExpense, balance: totalIncome - totalExpense, topCategories };
    }

    case 'budget': {
      const budgets = await prisma.budget.findMany({
        where: { createdBy: { familyId: user.familyId } },
        include: { transactions: { where: { status: 'completed' } } },
      });
      return {
        budgets: budgets.map((b) => {
          const used = b.transactions.reduce((sum, t) => sum + Number(t.amount), 0);
          const limit = Number(b.limit);
          const percent = limit > 0 ? Math.round((used / limit) * 100) : 0;
          return { title: b.title, used, limit, percent };
        }),
      };
    }

    case 'categories': {
      const scope = getDataScope(user);
      const today = new Date();
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

      // Groups with subcategories
      const groups = await prisma.categoryGroup.findMany({
        where: { deletedAt: null },
        include: {
          categories: {
            where: { deletedAt: null },
            orderBy: { name: 'asc' },
          },
        },
        orderBy: { type: 'asc' },
      });

      // Spending per group this month (ranking)
      const groupSpending = await prisma.transaction.groupBy({
        by: ['categoryId'],
        where: { ...scope, type: 'expense', date: { gte: startOfMonth } },
        _sum: { amount: true },
      });

      // Resolve categoryId → group name
      const allCats = await prisma.category.findMany({
        where: { deletedAt: null },
        include: { group: true },
      });
      const catMap = new Map(allCats.map((c) => [c.id, c.group?.name ?? 'อื่นๆ']));

      const groupRanking = new Map<string, number>();
      for (const gs of groupSpending) {
        const gName = catMap.get(gs.categoryId ?? '') ?? 'อื่นๆ';
        groupRanking.set(gName, (groupRanking.get(gName) || 0) + Number(gs._sum.amount ?? 0));
      }
      const topGroups = Array.from(groupRanking.entries())
        .map(([name, amount]) => ({ groupName: name, amount }))
        .sort((a, b) => b.amount - a.amount);

      // Top categories (individual, not grouped)
      const topCategories = allCats
        .map((c) => {
          const amount = groupSpending
            .filter((gs) => gs.categoryId === c.id)
            .reduce((sum, gs) => sum + Number(gs._sum.amount ?? 0), 0);
          return { name: c.name, groupName: c.group.name, amount };
        })
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 10);

      // Tags
      const tags = await prisma.tag.findMany({
        where: { familyId: user.familyId },
        orderBy: { name: 'asc' },
      });

      return {
        groups: groups.map((g) => ({
          name: g.name,
          type: g.type,
          subcategories: g.categories.map((c) => c.name),
        })),
        topGroups,
        topCategories,
        tags: tags.map((t) => ({ name: t.name })),
      };
    }

    default:
      return {};
  }
}

// ── Main Handler ──────────────────────────────────────────────────

export async function handleIntent(
  intent: UserIntent,
  text: string,
  lineUserId: string,
  user: UserContext,
): Promise<string> {
  const [intentExample, data] = await Promise.all([
    loadIntentExample(intent),
    executeIntentQuery(intent, user),
  ]);

  const sessionContext = formatSessionContext(lineUserId);

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

  const response = await ollamaGenerate({
    model: OLLAMA_TEXT_MODEL,
    prompt,
    format: 'text',
    temperature: 0.3,
    topP: 0.7,
  });

  addCycle(lineUserId, {
    userText: text,
    intent,
    response,
    timestamp: Date.now(),
  });

  return response;
}
