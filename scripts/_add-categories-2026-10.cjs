#!/usr/bin/env node
/**
 * 2026-10 category expansion — data-driven from real usage gaps
 * (analysis session 2026-10-08: uncategorized rows + "ขายของ" dumping ground).
 *
 * Part A — new categories:
 *   การเงินและหนี้สิน > ให้ยืมเงิน            ("ให้เกลยืม" 300฿ had no home)
 *   รายได้ > เก็บหนี้คืน                      (pairs with ให้ยืมเงิน: เกลคืนเงิน 300฿)
 *   รายได้ > ของขวัญ/เงินที่ได้รับ             (birthday/gift money misfiled as ขายของ)
 *   รายได้ > เงินฝาก                          ("แม่อิ้งฝาก" — not real income)
 *   ช้อปปิ้งและของใช้ > ค่าส่ง/พัสดุ          (TikTok Shop era)
 *   ที่อยู่อาศัย > ค่าโทรศัพท์มือถือ
 *   ที่อยู่อาศัย > ซักแห้ง/ซักรีด
 *   สัตว์เลี้ยง (new group): อาหารสัตว์เลี้ยง, ค่ารักษา/วัคซีน, อุปกรณ์/ของเล่น
 *   (ค่าเทอม already exists under ลูกและครอบครัว — skipped, no duplicate)
 *
 * Part B — rename:
 *   Subscription → สมัครสมาชิก (YouTube/Netflix/เกม)   (was 0-use; AI never matched it)
 *
 * Part C — remap misfiled rows (first match wins; from=null means ไม่มีหมวดหมู่):
 *   see REMAP_RULES below. Left alone on purpose: m gen, การงาน, นะฆัง,
 *   คืนเงินแม่อิ้ง…, ค่าน้ำ (10฿ is drinking water, not a bill), ช้อกบอล,
 *   and rows with empty descriptions.
 *
 * Usage:
 *   DATABASE_URL="$(grep -E '^DATABASE_URL' .env | cut -d= -f2-)" \
 *     node scripts/_add-categories-2026-10.cjs           # dry run
 *     node scripts/_add-categories-2026-10.cjs --apply   # backup + write
 */

const APPLY = process.argv.includes('--apply');

// [group, name]
const NEW_CATEGORIES = [
  ['การเงินและหนี้สิน', 'ให้ยืมเงิน'],
  ['รายได้', 'เก็บหนี้คืน'],
  ['รายได้', 'ของขวัญ/เงินที่ได้รับ'],
  ['รายได้', 'เงินฝาก'],
  ['ช้อปปิ้งและของใช้', 'ค่าส่ง/พัสดุ'],
  ['ที่อยู่อาศัย', 'ค่าโทรศัพท์มือถือ'],
  ['ที่อยู่อาศัย', 'ซักแห้ง/ซักรีด'],
];

const NEW_GROUPS = [
  { name: 'สัตว์เลี้ยง', type: 'expense', categories: ['อาหารสัตว์เลี้ยง', 'ค่ารักษา/วัคซีน', 'อุปกรณ์/ของเล่น'] },
];

const RENAMES = [
  ['ความบันเทิง', 'Subscription', 'สมัครสมาชิก (YouTube/Netflix/เกม)'],
];

// { type, match, from: currentCategoryName|null, to: [group, name] }
const REMAP_RULES = [
  // income misfiled under ขายของ — gifts, deposits, reimbursements
  { type: 'income', match: /ป้าหย.?ิให้|ป้าหผยิงให้/, from: 'ขายของ', to: ['รายได้', 'ของขวัญ/เงินที่ได้รับ'] },
  { type: 'income', match: /วันเกิด|ก้งันเกิด/, from: 'ขายของ', to: ['รายได้', 'ของขวัญ/เงินที่ได้รับ'] },
  { type: 'income', match: /ฝาก/, from: 'ขายของ', to: ['รายได้', 'เงินฝาก'] },
  { type: 'income', match: /เพื่อนโอน/, from: 'ขายของ', to: ['รายได้', 'เงินคืน'] },

  // loans out and back
  { type: 'expense', match: /ยืม/, from: null, to: ['การเงินและหนี้สิน', 'ให้ยืมเงิน'] },
  { type: 'income', match: /คืนเงิน|คืน$/, from: 'เงินคืน', to: ['รายได้', 'เก็บหนี้คืน'] },

  // temple donations that never matched ทำบุญ
  { type: 'expense', match: /ระฆัง/, from: null, to: ['สังคมและความสัมพันธ์', 'ทำบุญ'] },

  // subscriptions that fell into ดูหนัง/ฟังเพลง or nowhere
  { type: 'expense', match: /yt pre|youtube premium/i, to: ['ความบันเทิง', 'สมัครสมาชิก (YouTube/Netflix/เกม)'] },

  // เติมเกม misfiled as ดูหนัง/ฟังเพลง (6 rows)
  { type: 'expense', match: /เติมเกม/, from: 'ดูหนัง/ฟังเพลง', to: ['ความบันเทิง', 'เกม/เติมเกม'] },

  // mall trips with no home
  { type: 'expense', match: /ไปเดอะ/, from: null, to: ['ความบันเทิง', 'กิจกรรมพักผ่อน'] },
];

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  console.log(`mode: ${APPLY ? 'APPLY (backup first)' : 'DRY RUN'}\n`);

  // ── look up groups & existing categories ──
  const groups = await prisma.categoryGroup.findMany({ where: { deletedAt: null } });
  const groupByName = new Map(groups.map(g => [g.name, g]));
  const categories = await prisma.category.findMany({
    where: { deletedAt: null },
    include: { group: { select: { name: true } } },
  });
  const catByGroupAndName = new Map(categories.map(c => [`${c.group.name}::${c.name}`, c]));

  // targets resolvable after Part A/B: planned creations + rename targets
  const planned = new Map(); // `${group}::${name}` -> true (will exist after apply)
  const renameTargets = new Set(); // `${group}::${newName}` after renames
  for (const [g, name] of NEW_CATEGORIES) planned.set(`${g}::${name}`, true);
  for (const g of NEW_GROUPS) for (const name of g.categories) planned.set(`${g.name}::${name}`, true);
  for (const [g, , to] of RENAMES) renameTargets.add(`${g}::${to}`);

  const targetExists = (g, name) => planned.has(`${g}::${name}`)
    || catByGroupAndName.has(`${g}::${name}`)
    || renameTargets.has(`${g}::${name}`);

  // ── Part A plan ──
  console.log('── Part A: new categories ──');
  const toCreate = [];
  for (const [groupName, catName] of NEW_CATEGORIES) {
    if (catByGroupAndName.has(`${groupName}::${catName}`)) {
      console.log(`  skip (exists): ${groupName} > ${catName}`);
      continue;
    }
    if (!groupByName.has(groupName)) throw new Error(`group not found: ${groupName}`);
    toCreate.push({ groupName, catName });
    console.log(`  create: ${groupName} > ${catName}`);
  }
  for (const g of NEW_GROUPS) {
    const group = groupByName.get(g.name);
    console.log(`  group ${group ? 'exists' : 'CREATE'}: ${g.name} (${g.type})`);
    for (const catName of g.categories) {
      if (catByGroupAndName.has(`${g.name}::${catName}`)) {
        console.log(`  skip (exists): ${g.name} > ${catName}`);
      } else {
        toCreate.push({ groupName: g.name, catName });
        console.log(`  create: ${g.name} > ${catName}`);
      }
    }
  }

  // ── Part B plan ──
  console.log('\n── Part B: renames ──');
  for (const [groupName, from, to] of RENAMES) {
    const cat = catByGroupAndName.get(`${groupName}::${from}`);
    console.log(cat ? `  rename: ${groupName} > ${from} → ${to}` : `  skip (missing): ${groupName} > ${from}`);
  }

  // ── Part C plan (names only — ids resolved at apply time) ──
  const allTx = await prisma.transaction.findMany({
    where: { deletedAt: null },
    include: { category: { select: { name: true } } },
  });
  const plan = [];
  for (const tx of allTx) {
    const desc = (tx.description || '').trim();
    for (const rule of REMAP_RULES) {
      if (rule.type !== tx.type) continue;
      if (!rule.match.test(desc)) continue;
      if (rule.from === null && tx.categoryId !== null) continue; // only uncategorized rows
      if (rule.from && tx.category?.name !== rule.from) continue;
      if (!targetExists(rule.to[0], rule.to[1])) throw new Error(`target missing: ${rule.to[0]} > ${rule.to[1]}`);
      plan.push({ tx, rule });
      break; // first match wins
    }
  }
  console.log('\n── Part C: remap ──');
  for (const { tx, rule } of plan) {
    console.log(`  [${tx.date.toISOString().slice(0, 10)}] ${tx.type} ${tx.amount} ` +
      `"${(tx.description || '').slice(0, 30)}" (${tx.category?.name ?? 'ไม่มีหมวดหมู่'}) → ${rule.to[1]}`);
  }
  console.log(`  total: ${plan.length} rows`);

  if (!APPLY) {
    console.log('\ndry run only — re-run with --apply to write (a backup is written first)');
    await pool.end();
    return;
  }

  // ── backup before touching anything ──
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(__dirname, '..', 'backups', `add-categories-${stamp}.json`);
  fs.writeFileSync(backupPath, JSON.stringify({
    note: 'before 2026-10 category expansion + remap — restore categoryId values to roll back',
    remappedRows: plan.map(({ tx }) => ({
      id: tx.id, date: tx.date.toISOString(), type: tx.type, amount: tx.amount,
      description: tx.description, categoryId: tx.categoryId,
    })),
  }, null, 2));
  console.log(`\nbackup written: ${backupPath}`);

  // ── apply Part A ──
  let createdGroupIds = new Map();
  for (const { groupName, catName } of toCreate) {
    let groupId = groupByName.get(groupName)?.id ?? createdGroupIds.get(groupName);
    if (!groupId) {
      const g = NEW_GROUPS.find(x => x.name === groupName);
      const newGroup = await prisma.categoryGroup.create({ data: { name: groupName, type: g.type, isCustom: false } });
      createdGroupIds.set(groupName, newGroup.id);
      groupId = newGroup.id;
      console.log(`created group: ${groupName}`);
    }
    await prisma.category.create({ data: { name: catName, groupId } });
    console.log(`created category: ${groupName} > ${catName}`);
  }

  // ── apply Part B ──
  for (const [groupName, from, to] of RENAMES) {
    const cat = catByGroupAndName.get(`${groupName}::${from}`);
    if (!cat) continue;
    await prisma.category.update({ where: { id: cat.id }, data: { name: to } });
    console.log(`renamed: ${from} → ${to}`);
  }

  // ── apply Part C — re-resolve ids now that new categories exist ──
  const freshCategories = await prisma.category.findMany({
    where: { deletedAt: null },
    include: { group: { select: { name: true } } },
  });
  const freshByGroupAndName = new Map(freshCategories.map(c => [`${c.group.name}::${c.name}`, c]));
  const byTarget = new Map();
  for (const { tx, rule } of plan) {
    const target = freshByGroupAndName.get(`${rule.to[0]}::${rule.to[1]}`);
    if (!target) throw new Error(`target not found after apply: ${rule.to[0]} > ${rule.to[1]}`);
    const ids = byTarget.get(target.id) || [];
    ids.push(tx.id);
    byTarget.set(target.id, ids);
  }
  let total = 0;
  for (const [targetId, ids] of byTarget) {
    const r = await prisma.transaction.updateMany({ where: { id: { in: ids } }, data: { categoryId: targetId } });
    total += r.count;
    console.log(`remapped ${r.count} rows → ${freshByGroupAndName.get([...freshByGroupAndName.entries()].find(([, c]) => c.id === targetId)?.[0] ?? targetId)}`);
  }
  console.log(`\napplied: ${toCreate.length} categories created, ${RENAMES.length} renames, ${total} rows remapped`);

  await pool.end();
})().catch(err => {
  console.error(err);
  process.exit(1);
});