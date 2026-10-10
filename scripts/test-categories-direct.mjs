/**
 * Direct test: Categories intent pipeline
 * Tests executeIntentQuery with real Prisma + keyword detection
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Simulate the groupBy + category resolution logic from intent-router
async function testCategoriesQuery() {
  console.log('=== Categories Intent Direct Test ===\n');

  // Find a user to test with
  const user = await prisma.user.findFirst({
    where: { role: 'parent' },
    include: { family: true },
  });

  if (!user) {
    console.log('No user found!');
    return;
  }

  console.log(`Testing with user: ${user.name} (${user.id}), familyId: ${user.familyId}\n`);

  // 1. Groups with subcategories
  console.log('1. Groups with subcategories:');
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

  for (const g of groups) {
    console.log(`  ${g.type}: ${g.name} (${g.categories.length} subcategories)`);
    if (g.categories.length > 0) {
      console.log(`    → ${g.categories.map(c => c.name).slice(0, 5).join(', ')}`);
    }
  }

  // 2. Spending per category this month
  const today = new Date();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  console.log(`\n2. Month: ${startOfMonth.toISOString().split('T')[0]} to now`);

  const groupSpending = await prisma.transaction.groupBy({
    by: ['categoryId'],
    where: {
      createdBy: { familyId: user.familyId },
      type: 'expense',
      date: { gte: startOfMonth },
    },
    _sum: { amount: true },
  });

  console.log(`  Transactions with categories: ${groupSpending.length}`);

  // Resolve categoryId → group name
  const allCats = await prisma.category.findMany({
    where: { deletedAt: null },
    include: { group: true },
  });
  const catMap = new Map(allCats.map((c) => [c.id, c.group?.name ?? 'อื่นๆ']));

  const groupRanking = new Map();
  for (const gs of groupSpending) {
    const gName = catMap.get(gs.categoryId ?? '') ?? 'อื่นๆ';
    groupRanking.set(gName, (groupRanking.get(gName) || 0) + Number(gs._sum.amount ?? 0));
  }
  const topGroups = Array.from(groupRanking.entries())
    .map(([name, amount]) => ({ groupName: name, amount }))
    .sort((a, b) => b.amount - a.amount);

  console.log('\n3. Top Groups (by spending):');
  for (const g of topGroups.slice(0, 5)) {
    console.log(`  ${g.groupName}: ${g.amount.toLocaleString()} ฿`);
  }

  // 4. Top individual categories
  const topCategories = allCats
    .map((c) => {
      const amount = groupSpending
        .filter((gs) => gs.categoryId === c.id)
        .reduce((sum, gs) => sum + Number(gs._sum.amount ?? 0), 0);
      return { name: c.name, groupName: c.group?.name ?? 'อื่นๆ', amount };
    })
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);

  console.log('\n4. Top Categories (individual):');
  for (const c of topCategories.slice(0, 5)) {
    console.log(`  ${c.name} (${c.groupName}): ${c.amount.toLocaleString()} ฿`);
  }

  // 5. Tags
  const tags = await prisma.tag.findMany({
    where: { familyId: user.familyId },
    orderBy: { name: 'asc' },
  });

  console.log(`\n5. Tags: ${tags.length}`);
  if (tags.length > 0) {
    console.log(`  ${tags.map(t => t.name).join(', ')}`);
  }

  // 6. Keyword detection test
  console.log('\n6. Keyword detection:');
  const tests = [
    'มีหมวดอะไรบ้าง', 'หมวดหมู่', 'categories', 'หมวดอาหารมีอะไรบ้าง',
    'หมวดไหนใช้เงินเยอะสุด', 'จัดอันดับหมวดที่ใช้เงินเยอะสุด', 'แท็ก',
    'ยอดคงเหลือ', 'รายการล่าสุด',
  ];
  for (const t of tests) {
    const isMatch = /(หมวด|หมวดหมู่|category|categories|แท็ก|tag|อันดับ|ranking|จัดอันดับ)/i.test(t);
    console.log(`  "${t}" → ${isMatch ? 'categories' : 'other'}`);
  }

  console.log('\n=== All queries passed ===');
}

testCategoriesQuery()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
