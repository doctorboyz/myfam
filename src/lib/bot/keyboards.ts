/**
 * Reply keyboards — Telegram reply_markup with buttons that send
 * plain text back to the bot. Button texts MUST be recognizable by
 * detectCommand (exact match or regex) — no decorative prefixes on
 * action buttons.
 */

import type { ReplyMarkup, ReplyKeyboard } from '@/lib/telegram/types';

function keyboard(rows: string[][]): ReplyKeyboard {
  return { keyboard: rows, resize_keyboard: true, one_time_keyboard: true };
}

/** Main menu shown after most replies. */
export function menuKeyboard(): ReplyMarkup {
  return keyboard([['📊 ดูยอด', '📋 รายการล่าสุด'], ['📈 สรุปเดือนนี้', '❓ ช่วยเหลือ']]);
}

/** Confirm / edit / cancel for the awaiting_confirm step. */
export function confirmKeyboard(): ReplyMarkup {
  return keyboard([['ยืนยัน', 'เปลี่ยนแปลง', 'ยกเลิก']]);
}

/** Field picker shown after เปลี่ยนแปลง — which part to edit. */
export function editKeyboard(): ReplyMarkup {
  return keyboard([['แก้รายละเอียด', 'แก้ยอด'], ['แก้หมวดหมู่'], ['ยกเลิก']]);
}

/** Expense vs income confirmation. */
export function confirmTypeKeyboard(): ReplyMarkup {
  return keyboard([['ยืนยันรายจ่าย', 'ยืนยันรายรับ'], ['ยกเลิก']]);
}

/** Money direction for single-account transfers. */
export function directionKeyboard(): ReplyMarkup {
  return keyboard([['เงินเข้า', 'เงินออก'], ['ยกเลิก']]);
}

/** Account selection — buttons send "เลือกบัญชี:<display>". */
export function accountKeyboard(displayNames: string[]): ReplyMarkup {
  const rows: string[][] = [];
  for (let i = 0; i < displayNames.length; i += 2) {
    rows.push(displayNames.slice(i, i + 2).map((n) => `เลือกบัญชี:${n}`));
  }
  rows.push(['ยกเลิก']);
  return keyboard(rows);
}

/** Category group selection filtered by transaction type. */
export function categoryGroupKeyboard(groupNames: string[]): ReplyMarkup {
  const rows: string[][] = [];
  for (let i = 0; i < groupNames.length; i += 2) {
    rows.push(groupNames.slice(i, i + 2).map((n) => `เลือกหมวด:${n}`));
  }
  rows.push(['ข้ามหมวด']);
  return keyboard(rows);
}

/** Subcategory selection within a group. */
export function subcategoryKeyboard(categoryNames: string[]): ReplyMarkup {
  const rows: string[][] = [];
  for (let i = 0; i < categoryNames.length; i += 2) {
    rows.push(categoryNames.slice(i, i + 2).map((n) => `เลือกประเภท:${n}`));
  }
  rows.push(['ข้ามประเภท']);
  return keyboard(rows);
}

/** Reconcile confirmation. */
export function reconcileConfirmKeyboard(): ReplyMarkup {
  return keyboard([['ยืนยันปรับยอด', 'ยกเลิกปรับยอด']]);
}

/** Clear the reply keyboard (after flows finish). */
export function removeKeyboard(): ReplyMarkup {
  return { remove_keyboard: true };
}