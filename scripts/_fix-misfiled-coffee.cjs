#!/usr/bin/env node
/**
 * 6c data fix — repair transactions misfiled as "กาแฟ โกโก้" by the old
 * add-new form bug (it silently pre-picked the first alphabetical category).
 *
 * Rules:
 *  - Dry-run by default; only --apply writes.
 *  --apply first writes a full JSON backup of every affected row to backups/.
 *  - Descriptions map to a category via the ordered rule list below;
 *    everything else (empty or ambiguous) is set to categoryId NULL —
 *    "ไม่มีหมวดหมู่" — which is truthful and fixable later with the
 *    bulk-assign UI + ไม่มีหมวดหมู่ filter.
 *
 * Usage:
 *   DATABASE_URL="$(grep -E '^DATABASE_URL' .env | cut -d= -f2-)" \
 *     node scripts/_fix-misfiled-coffee.cjs           # dry run
 *     node scripts/_fix-misfiled-coffee.cjs --apply   # backup + write
 */

const MISFILED_CATEGORY_ID = 'd3f04a7d-f31a-4770-a94f-a83aff0d80b1'; // กาแฟ โกโก้

// Ordered rules — first match wins. Thai typos included on purpose
// (หมุแเง, ข้าส, หมูแดบ … are real rows from the kids' quick adds).
const RULES = [
  // income rows first — an expense leaf can never be right for them
  { type: 'income', match: /ต้าคืน/, target: { name: 'เงินคืน', id: '046569f1-fd84-4f48-be36-e77ffe8b9529' } },

  // food+snack combos are a meal, not a snack
  { match: /ขนมอาหาร|ค่าขนมกับข้าว|ขนม\+อาหาร/, target: { name: 'กินข้าว', id: 'c95fe373-2244-4d32-b50e-ac7cf5e44403' } },

  // games / entertainment
  { match: /เติมเกม|บอร์ดเกม|บอดเกม/, target: { name: 'เกม/เติมเกม', id: 'c1852b54-a5fc-44f3-accf-8462154b3c29' } },
  { match: /หนัง/, target: { name: 'ดูหนัง/ฟังเพลง', id: 'a1f41301-f2f6-4b76-bc81-a4faaaa65590' } },

  // snacks & fruit
  { match: /popcorn/, target: { name: 'ขนม', id: '99283fee-782e-4db5-ba79-3806c0cd8abb' } },
  { match: /มะม่วง/, target: { name: 'ผลไม้', id: 'aea42d22-b4a9-4502-801f-e4764c4fab79' } },
  { match: /สกุชชี่|yoguruto|ขนมเครป|คุกกี้|เคี้ยวชีส|กินขนม|ค่าขนม|^ขนม$/, target: { name: 'ขนม', id: '99283fee-782e-4db5-ba79-3806c0cd8abb' } },

  // transport — motorcycle-taxi fares
  { match: /ค่ามอไซ|วินมอไซ|^มอไซ$/, target: { name: 'ค่ารถสาธารณะ/Taxi', id: 'fdc5d1a1-a48c-4866-9efe-96d5b4becfce' } },

  // school / personal care / shopping
  { match: /สายคล้องบัตรนักเรียน/, target: { name: 'อุปกรณ์การเรียน', id: 'dcc9f3c5-ab0b-4dfe-b881-19c928b75ad0' } },
  { match: /สกินแคร์/, target: { name: 'เครื่องสำอาง', id: 'd60d74d7-efca-4604-a120-0fb6a5f57f35' } },
  { match: /ค่าอนามัย|ขอวใช้|พวงกุญแจ|ซื้อของร้านยี่สิบบาท/, target: { name: 'ของใช้ส่วนตัว', id: 'b9c05b27-07c9-41b0-b8b4-41f42ff65477' } },

  // meals — catch-all last so specific snacks above win first
  { match: /ข้าว|อาหาร|กินข้าว|ค่าอาหาร|ข้าส|หมี่ไก่|บะหมี่|หมุ|หมูแด|เส้น|แคปหมุ/, target: { name: 'กินข้าว', id: 'c95fe373-2244-4d32-b50e-ac7cf5e44403' } },
];

const AMBIGUOUS = [
  // intentionally unmapped — NULL + review with the bulk-assign UI
  'yt pre', 'm gen', 'การงาน', 'ไปเดอะ', 'ไปเดอะอีกแล้ว',
  'ให้เกลยืม', 'คืนเงินแม่อิ้งเพราะอิ้งใช้ไม่หมเ', 'ระฆัง', 'นะฆัง', 'ค่าน้ำ',
];

function resolveTarget(tx) {
  const desc = (tx.description || '').trim();
  for (const rule of RULES) {
    if (rule.type && rule.type !== tx.type) continue;
    if (rule.match.test(desc)) return rule.target;
  }
  return null; // ไม่มีหมวดหมู่ — safer than a guess
}

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const APPLY = process.argv.includes('--apply');

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  const rows = await prisma.transaction.findMany({
    where: { categoryId: MISFILED_CATEGORY_ID, deletedAt: null },
    include: { createdBy: { select: { name: true } } },
    orderBy: { date: 'asc' },
  });
  console.log(`found ${rows.length} rows misfiled as กาแฟ โกโก้`);
  console.log(`mode: ${APPLY ? 'APPLY (backup first)' : 'DRY RUN'}\n`);

  const plan = rows.map(tx => ({ tx, target: resolveTarget(tx) }));

  // ── print the plan ──
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`${pad('date', 12)}${pad('who', 8)}${pad('amount', 10)}${pad('description', 30)} → target`);
  for (const { tx, target } of plan) {
    const line = `${pad(tx.date.toISOString().slice(0, 10), 12)}${pad(tx.createdBy.name, 8)}${pad(tx.amount, 10)}${pad(JSON.stringify(tx.description || ''), 30)}`;
    console.log(`${line} → ${target ? target.name : 'ไม่มีหมวดหมู่ (NULL)'}`);
  }

  const byTarget = new Map();
  for (const { tx, target } of plan) {
    const key = target ? target.name : 'ไม่มีหมวดหมู่ (NULL)';
    byTarget.set(key, (byTarget.get(key) || 0) + 1);
  }
  console.log('\nsummary:');
  for (const [name, count] of [...byTarget.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${pad(name, 30)} ${count} rows`);
  }

  const unmapped = plan.filter(({ tx, target }) => !target)
    .map(({ tx }) => (tx.description || '').trim())
    .filter((d, i, arr) => d && arr.indexOf(d) === i);
  if (unmapped.length) {
    console.log(`\nleft uncategorized on purpose (fix with bulk-assign UI): ${unmapped.join(', ')}`);
  }

  if (!APPLY) {
    console.log('\ndry run only — re-run with --apply to write (a backup is written first)');
    await pool.end();
    return;
  }

  // ── backup before touching anything ──
  const backupPath = path.join(__dirname, '..', 'backups', `fix-misfiled-coffee-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(backupPath, JSON.stringify({
    note: 'rows misfiled as กาแฟ โกโก้ before 6c data fix — restore categoryId to d3f04a7d-f31a-4770-a94f-a83aff0d80b1 to roll back',
    rows: rows.map(tx => ({
      id: tx.id, date: tx.date.toISOString(), type: tx.type, amount: tx.amount,
      description: tx.description, categoryId: tx.categoryId, createdById: tx.createdById,
    })),
  }, null, 2));
  console.log(`\nbackup written: ${backupPath}`);

  // ── apply: one updateMany per target group ──
  const groups = new Map(); // target id (or null) -> tx ids
  for (const { tx, target } of plan) {
    const key = target ? target.id : null;
    const ids = groups.get(key) || [];
    ids.push(tx.id);
    groups.set(key, ids);
  }
  let total = 0;
  for (const [targetId, ids] of groups) {
    const result = await prisma.transaction.updateMany({
      where: { id: { in: ids } },
      data: { categoryId: targetId },
    });
    total += result.count;
    console.log(`  ${targetId ? targetId : 'NULL'}: ${result.count} rows`);
  }
  console.log(`applied ${total} updates`);

  await pool.end();
})().catch(err => {
  console.error(err);
  process.exit(1);
});