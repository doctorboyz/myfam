/**
 * Message formatting helpers — Thai, deterministic, no AI in output.
 */

import type { ExtractedTransaction } from './extract';

export const FMT_AMOUNT = new Intl.NumberFormat('th-TH');

export const TELEGRAM_MAX_LEN = 4096;

/** Clamp a message to Telegram's 4096-character limit. */
export function truncateMessage(text: string): string {
  if (text.length <= TELEGRAM_MAX_LEN) return text;
  return text.slice(0, TELEGRAM_MAX_LEN - 1) + '…';
}

export function formatAmountLine(extracted: ExtractedTransaction): string {
  const fee = extracted.fee || 0;
  const total = extracted.amount + fee;
  return fee > 0
    ? `💰 ${FMT_AMOUNT.format(extracted.amount)} + ค่าธรรมเนียม ${FMT_AMOUNT.format(fee)} = ${FMT_AMOUNT.format(total)} บาท`
    : `💰 ${FMT_AMOUNT.format(extracted.amount)} บาท`;
}

/** Confirmation after a transaction is saved. */
export function formatConfirmationMessage(
  transaction: { amount: number | { toString(): string }; type: string; description: string | null; date: string | Date },
  extracted: ExtractedTransaction,
): string {
  const typeLabel = extracted.type === 'income' ? 'รายรับ' : extracted.type === 'transfer' ? 'โอน' : 'รายจ่าย';
  const amount = FMT_AMOUNT.format(Number(transaction.amount));

  let msg = `✅ บันทึก${typeLabel}แล้ว!\n`;
  msg += `📝 ${transaction.description || extracted.description}\n`;
  msg += `💰 ${amount} บาท\n`;

  if (extracted.categoryGroupName) {
    msg += `📂 หมวด: ${extracted.categoryGroupName}\n`;
  }
  if (extracted.merchantName) {
    msg += `🏪 ร้าน: ${extracted.merchantName}\n`;
  }
  if (extracted.needsConfirmation) {
    msg += `\n❓ ไม่แน่ใจว่าเป็นรายรับหรือรายจ่าย — กรุณาตรวจสอบ`;
  } else if (extracted.confidence < 0.7) {
    msg += `\n⚠️ ความมั่นใจ: ${Math.round(extracted.confidence * 100)}% — กรุณาตรวจสอบความถูกต้อง`;
  }

  return msg;
}

export interface ConfirmationPromptInfo {
  groupName?: string;
  subcategoryName?: string;
}

/** Pre-save confirmation prompt (awaiting_confirm step). */
export function formatConfirmationPrompt(
  extracted: ExtractedTransaction,
  similarCount: number,
  catInfo?: ConfirmationPromptInfo | null,
): string {
  const typeLabel = extracted.type === 'income' ? 'รายรับ' : extracted.type === 'transfer' ? 'โอน' : 'รายจ่าย';

  let msg = `🤖 ตรวจสอบรายการก่อนบันทึก\n\n`;
  msg += `📝 ${extracted.description}\n`;
  msg += `${formatAmountLine(extracted)}\n`;
  msg += `📊 ประเภท: ${typeLabel}\n`;
  if (extracted.date) msg += `📅 ${extracted.date}\n`;
  if (catInfo) {
    msg += `📂 หมวด: ${catInfo.groupName}`;
    if (catInfo.subcategoryName) msg += ` › ${catInfo.subcategoryName}`;
    msg += `\n`;
  }
  if (extracted.merchantName) msg += `🏪 ร้าน: ${extracted.merchantName}\n`;
  if (similarCount > 0) {
    msg += `\n⚠️ พบรายการคล้ายกัน ${similarCount} รายการในวันเดียวกัน — กดยืนยันเฉพาะเมื่อไม่ใช่รายการซ้ำ`;
  }
  msg += `\nกด "ยืนยัน" เพื่อบันทึก หรือ "เปลี่ยนหมวด" เพื่อแก้ไข`;
  return msg;
}

const ERROR_MAP: Record<string, string> = {
  'AI returned invalid JSON': 'ขออภัย ระบบไม่สามารถอ่านข้อมูลได้ กรุณาลองใหม่',
  'Ollama chat error': 'ขออภัย ระบบ AI ไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง',
  'OLLAMA_API_KEY not configured': 'ขออภัย ระบบ AI ไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง',
  'User has no active account': 'ยังไม่มีบัญชี กรุณาสร้างบัญชีในแอป MyFam ก่อน',
  'User not linked': 'ยังไม่ได้เชื่อมบัญชี กรุณาพิมพ์ /link เพื่อดูวิธีเชื่อมต่อ',
  'slip reading is disabled': 'ขออภัย ระบบอ่านสลิปยังไม่เปิดใช้งาน กรุณาพิมพ์รายละเอียดรายการแทน',
};

export function formatErrorMessage(error: string): string {
  for (const [key, value] of Object.entries(ERROR_MAP)) {
    if (error.includes(key)) return value;
  }
  return 'ขออภัย เกิดข้อผิดพลาด กรุณาลองใหม่';
}

export const HELP_TEXT = `🤖 MyFam Bot — ผู้ช่วยจัดการเงินครอบครัว

พิมพ์หรือส่งได้เลย:
📝 บันทึกรายการ — "ซื้อข้าวผัด 85 บาท"
📸 ส่งรูปสลิป — บันทึกอัตโนมัติ
📊 ดูยอด — ยอดคงเหลือทุกบัญชี
📋 รายการล่าสุด
📈 สรุปวันนี้ / สรุปสัปดาห์นี้ / สรุปเดือนนี้
💰 งบ — ดูงบประมาณ
🔧 ปรับยอด — "ปรับ 1688 เป็น 5000"
🗑️ ลบล่าสุด — ลบรายการที่บันทึกผ่านบอทล่าสุด
❓ ช่วยเหลือ`;