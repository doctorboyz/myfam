#!/usr/bin/env node
/**
 * One-time import — Lita's bank statement (12 Sep – 6 Oct 2569/2026),
 * 49 deduped rows transcribed from statement screenshots
 * (source: AI extraction session, deduped by date+time+amount).
 *
 * Design decisions (agreed with owner 2026-10-08):
 *  - owner: Lita, account: Butjet (her bank account this statement belongs to)
 *  - โอนเงินให้คนอื่น (แม่/พบพร/นรีรัตน์/สุรพันธุ์) → expense, category NULL
 *    (owner's choice: "เป็นรายจ่าย ไม่ระบุประเภท" — filter ไม่มีหมวดหมู่ can fix later)
 *  - โอนเงินให้ ลิชานันท์ (ตัวเอง) → transfer Butjet → ทรูมันนี่ (assumption: topping
 *    up her own wallet; re-point toAccountId if that's wrong)
 *  - monthly allowance (12 Sep, +1300.25) → NEW category รายได้ > ค่าขนม/เงินรายเดือน
 *    (matches the 12th-of-month pattern seen in Aug: +1542.25)
 *  - ad-hoc received (250/200/100/5) → ของขวัญ/เงินที่ได้รับ; +66 (MRT fare back) → เงินคืน
 *  - merchants per agreed mapping (เซเว่น→ขนม, MRT→ค่ารถสาธารณะ, Big C/TikTok Shop→ของใช้ส่วนตัว …)
 *  - balances adjusted exactly like createTransaction() in src/lib/transaction-mutations.ts
 *
 * Idempotent: skips rows whose exact timestamp+amount already exist for Lita.
 *
 * Usage:
 *   DATABASE_URL="$(grep -E '^DATABASE_URL' .env | cut -d= -f2-)" \
 *     node scripts/_import-lita-statement.cjs           # dry run
 *     node scripts/_import-lita-statement.cjs --apply   # backup + write
 */

const APPLY = process.argv.includes('--apply');

const LITA_USER_ID = 'eb0c6f63-4b65-4fb9-a5f6-3c910000ba21';
const BUTJET_ID = 'e61aba05-32a3-4e30-ab56-9c59a19f7d4b';
const TRUE_MONEY_ID = 'b103e720-257c-45b6-b4f8-be967a106926';

const ALLOWANCE = ['รายได้', 'ค่าขนม/เงินรายเดือน'];
const GIFT = ['รายได้', 'ของขวัญ/เงินที่ได้รับ'];
const CASHBACK = ['รายได้', 'เงินคืน'];
const SNACK = ['อาหารและเครื่องดื่ม', 'ขนม'];
const MEAL = ['อาหารและเครื่องดื่ม', 'กินข้าว'];
const TRANSIT = ['การเดินทาง', 'ค่ารถสาธารณะ/Taxi'];
const PERSONAL = ['ช้อปปิ้งและของใช้', 'ของใช้ส่วนตัว'];
const KID_ACT = ['ลูกและครอบครัว', 'กิจกรรมเด็ก'];

// [date, time, description, amount(positive), type, category]
const ROWS = [
  // ── income ──
  ['2026-09-12', '14:33', 'รับเงินจาก สุรางค์รัตน์ ภ*** (ค่าขนมรายเดือน)', 1300.25, 'income', ALLOWANCE],
  ['2026-09-12', '21:03', 'รับเงินจาก จรรยาภรณ์ จ***', 5, 'income', GIFT],
  ['2026-09-17', '15:26', 'รับเงินจาก สุรางค์รัตน์ ภ*** (คืนค่า MRT)', 66, 'income', CASHBACK],
  ['2026-09-17', '16:07', 'รับเงินจาก สุรางค์รัตน์ ภ***', 100, 'income', GIFT],
  ['2026-09-19', '10:16', 'รับเงินจาก สุรางค์รัตน์ ภ***', 200, 'income', GIFT],
  ['2026-09-30', '15:35', 'รับเงินจาก สุรางค์รัตน์ ภ***', 250, 'income', GIFT],

  // ── merchant purchases ──
  ['2026-09-12', '17:10', 'เซเว่น อีเลฟเว่น', 42, 'expense', SNACK],
  ['2026-09-13', '13:27', 'ติ๊กต็อก ช็อป เซอร์วิส', 178, 'expense', PERSONAL],
  ['2026-09-16', '17:17', 'เซเว่น อีเลฟเว่น', 72, 'expense', SNACK],
  ['2026-09-17', '15:47', 'เอ็มอาร์ที-รัชดาภิเษก', 66, 'expense', TRANSIT],
  ['2026-09-17', '16:23', 'BIGC RATCHADAPISEK', 156, 'expense', PERSONAL],
  ['2026-09-17', '16:27', 'MINOR DQ LIMITED', 49, 'expense', SNACK],
  ['2026-09-17', '16:31', 'Bling Bling Store Ratchada', 20, 'expense', PERSONAL],
  ['2026-09-17', '16:36', 'Amonwan', 30, 'expense', MEAL],
  ['2026-09-19', '10:19', 'เอ็มอาร์ที-ศูนย์วัฒนธรรม', 58, 'expense', TRANSIT],
  ['2026-09-19', '11:38', 'โปเตโต้ คอร์เนอร์-แฟชั่นไอส์แลนด์', 89, 'expense', SNACK],
  ['2026-09-19', '17:23', 'อินฟินิทฟัน', 60, 'expense', KID_ACT],
  ['2026-09-19', '19:40', 'เอ็มอาร์ที-พหลโยธิน', 54, 'expense', TRANSIT],
  ['2026-09-21', '17:56', 'เซเว่น อีเลฟเว่น', 15, 'expense', SNACK],
  ['2026-09-26', '18:27', 'วันเฮง กรุ๊ป', 49, 'expense', MEAL],
  ['2026-10-03', '14:36', 'เซเว่น อีเลฟเว่น', 35, 'expense', SNACK],
  ['2026-10-05', '15:26', 'เซเว่น อีเลฟเว่น', 40, 'expense', SNACK],

  // ── โอนให้คนอื่น: expense, ไม่ระบุหมวด (ตกลงกับเจ้าของ) ──
  ['2026-09-12', '16:50', 'โอนเงินให้ นางสาว พบพร ส***', 6, 'expense', null],
  ['2026-09-12', '17:34', 'โอนเงินให้ นางสาว นรีรัตน์ ส***', 17, 'expense', null],
  ['2026-09-13', '14:16', 'โอนเงินให้ สุรางค์รัตน์ ภ***', 40, 'expense', null],
  ['2026-09-14', '17:19', 'โอนเงินให้ สุรางค์รัตน์ ภ***', 30, 'expense', null],
  ['2026-09-14', '17:34', 'โอนเงินให้ นางสาว พบพร ส***', 35, 'expense', null],
  ['2026-09-14', '18:07', 'โอนเงินให้ นางสาว พบพร ส***', 10, 'expense', null],
  ['2026-09-16', '16:25', 'โอนเงินให้ สุรางค์รัตน์ ภ***', 35, 'expense', null],
  ['2026-09-16', '18:30', 'โอนเงินให้ นางสาว พบพร ส***', 37, 'expense', null],
  ['2026-09-20', '11:13', 'โอนเงินให้ สุรางค์รัตน์ ภ***', 20, 'expense', null],
  ['2026-09-23', '17:48', 'โอนเงินให้ สุรางค์รัตน์ ภ***', 20, 'expense', null],
  ['2026-09-25', '17:35', 'โอนเงินให้ นางสาว พบพร ส***', 17, 'expense', null],
  ['2026-09-26', '10:17', 'โอนเงินให้ สุรางค์รัตน์ ภ***', 50, 'expense', null],
  ['2026-09-27', '09:29', 'โอนเงินให้ สุรางค์รัตน์ ภ***', 15, 'expense', null],
  ['2026-09-27', '17:47', 'โอนเงินให้ นางสาว พบพร ส***', 34, 'expense', null],
  ['2026-09-28', '11:20', 'โอนเงินให้ สุรางค์รัตน์ ภ***', 17, 'expense', null],
  ['2026-09-28', '15:52', 'โอนเงินให้ นางสาว พบพร ส***', 17, 'expense', null],
  ['2026-09-28', '17:39', 'โอนเงินให้ นางสาว พบพร ส***', 12, 'expense', null],
  ['2026-09-29', '16:08', 'โอนเงินให้ นางสาว พบพร ส***', 17, 'expense', null],
  ['2026-09-30', '19:10', 'โอนเงินให้ นายสุรพันธุ์ โ***', 50, 'expense', null],
  ['2026-10-01', '16:18', 'โอนเงินให้ นางสาว พบพร ส***', 25, 'expense', null],
  ['2026-10-06', '13:41', 'โอนเงินให้ สุรางค์รัตน์ ภ***', 5, 'expense', null],
  ['2026-10-06', '13:49', 'โอนเงินให้ สุรางค์รัตน์ ภ***', 6, 'expense', null],

  // ── โอนให้ตัวเอง: transfer Butjet → ทรูมันนี่ ──
  ['2026-09-12', '16:35', 'โอนเงินให้ ลิชานันท์ ศ*** (เติมวอลเล็ต)', 100, 'transfer', null],
  ['2026-09-13', '11:57', 'โอนเงินให้ ด.ญ. ลิชานันท์ ศ*** (เติมวอลเล็ต)', 71, 'transfer', null],
  ['2026-09-19', '18:40', 'โอนเงินให้ ลิชานันท์ ศ*** (เติมวอลเล็ต)', 78, 'transfer', null],
  ['2026-09-30', '15:37', 'โอนเงินให้ ด.ญ. ลิชานันท์ ศ*** (เติมวอลเล็ต)', 40, 'transfer', null],
  ['2026-09-30', '15:42', 'โอนเงินให้ ด.ญ. ลิชานันท์ ศ*** (เติมวอลเล็ต)', 150, 'transfer', null],
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

  // ── Part A: ensure the allowance category exists ──
  const categories = await prisma.category.findMany({
    where: { deletedAt: null },
    include: { group: { select: { name: true } } },
  });
  const catId = (group, name) =>
    categories.find(c => c.group.name === group && c.name === name)?.id ?? null;

  let allowanceId = catId(ALLOWANCE[0], ALLOWANCE[1]);
  if (!allowanceId) {
    const group = await prisma.categoryGroup.findFirst({
      where: { name: ALLOWANCE[0], deletedAt: null },
    });
    if (!group) throw new Error('group รายได้ not found');
    if (APPLY) {
      const created = await prisma.category.create({
        data: { name: ALLOWANCE[1], groupId: group.id },
      });
      allowanceId = created.id;
    }
    console.log(`${APPLY ? 'created' : 'will create'} category: ${ALLOWANCE[0]} > ${ALLOWANCE[1]}`);
  }

  // ── resolve categories used by rows ──
  const plan = [];
  for (const [date, time, desc, amount, type, cat] of ROWS) {
    const at = new Date(`${date}T${time}:00+07:00`); // Bangkok wall time → instant
    if (Number.isNaN(at.getTime())) throw new Error(`bad date: ${date} ${time}`);
    const categoryId = type === 'income' && cat === ALLOWANCE
      ? allowanceId // may be a pending creation in dry-run (null)
      : cat ? catId(cat[0], cat[1]) : null;
    if (cat && !categoryId && cat !== ALLOWANCE) {
      throw new Error(`category not found: ${cat[0]} > ${cat[1]}`);
    }
    plan.push({ at, date, time, desc, amount, type, categoryId });
  }

  // ── dedup: skip rows that already exist (exact timestamp + amount + owner) ──
  const existing = await prisma.transaction.findMany({
    where: { createdById: LITA_USER_ID, deletedAt: null },
    select: { date: true, amount: true },
  });
  const seen = new Set(existing.map(t => `${t.date.getTime()}::${Number(t.amount)}`));
  const fresh = plan.filter(r => !seen.has(`${r.at.getTime()}::${r.amount}`));
  const skipped = plan.length - fresh.length;
  console.log(`rows: ${plan.length} planned, ${skipped} already exist, ${fresh.length} to insert\n`);

  for (const r of fresh) {
    const catLabel = r.categoryId
      ? categories.find(c => c.id === r.categoryId)?.name ?? '(new allowance cat)'
      : 'ไม่มีหมวดหมู่';
    console.log(`  [${r.date} ${r.time}] ${r.type.padEnd(8)} ${String(r.amount).padEnd(8)} ${r.desc}  → ${catLabel}`);
  }

  const sums = { income: 0, expense: 0, transfer: 0 };
  for (const r of fresh) sums[r.type] += r.amount;
  console.log(`\nsums: income ${sums.income} | expense ${sums.expense} | transfer ${sums.transfer}`);
  console.log(`net Butjet: ${sums.income - sums.expense - sums.transfer} (ยอดทรูมันนี่ไม่ปรับ — ปรับยอดจริงไปแล้ว 6 ต.ค.)`);

  if (!APPLY) {
    console.log('\ndry run only — re-run with --apply to write (a backup is written first)');
    await pool.end();
    return;
  }

  // ── backup ──
  const backupPath = path.join(__dirname, '..', 'backups',
    `import-lita-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(backupPath, JSON.stringify({
    note: 'rows inserted by _import-lita-statement.cjs — delete by id to roll back',
    rows: fresh.map(r => ({
      date: r.at.toISOString(), type: r.type, amount: r.amount,
      description: r.desc, accountId: BUTJET_ID, toAccountId: r.type === 'transfer' ? TRUE_MONEY_ID : null,
    })),
  }, null, 2));
  console.log(`\nbackup written: ${backupPath}`);

  // ── insert + adjust balances exactly like createTransaction() ──
  let inserted = 0;
  for (const r of fresh) {
    await prisma.transaction.create({
      data: {
        amount: r.amount,
        totalAmount: r.amount,
        date: r.at,
        type: r.type,
        status: 'completed',
        description: r.desc,
        accountId: r.type === 'income' ? BUTJET_ID : BUTJET_ID, // income/expense/transfer-source all on Butjet
        toAccountId: r.type === 'transfer' ? TRUE_MONEY_ID : null,
        categoryId: r.categoryId,
        createdById: LITA_USER_ID,
      },
    });
    inserted += 1;

    // Butjet: balance last touched 2026-09-12 11:44 BKK — before the statement
    // window, so applying the movements keeps it accurate (9991 → 9945.25).
    if (r.type === 'income') {
      await prisma.account.update({ where: { id: BUTJET_ID }, data: { balance: { increment: r.amount } } });
    } else {
      await prisma.account.update({ where: { id: BUTJET_ID }, data: { balance: { decrement: r.amount } } });
    }
    // NOTE: ทรูมันนี่ balance is intentionally NOT incremented (+439) — the wallet
    // was reconciled to its real balance on 2026-10-06 13:54 BKK (Reconciliation
    // row b103e720…: 194.52 → 109.77), which already includes these top-ups.
    // Adding +439 again would double-count.
  }
  console.log(`inserted ${inserted} rows; balances adjusted`);

  // ── verify against the statement's own math ──
  const net = sums.income - sums.expense - sums.transfer;
  console.log(`expected net from statement: -45.75 → imported net: ${net.toFixed(2)}`);
  if (Math.abs(net - -45.75) > 0.01) console.log('⚠️ net mismatch — check rows!');

  await pool.end();
})().catch(err => {
  console.error(err);
  process.exit(1);
});