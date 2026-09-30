/**
 * Command detection from Thai/English text.
 * Ported from the LINE bot's detectCommand (08a2eba) — LIFF/jars/onboarding
 * removed, /start /link added for Telegram.
 */

export type CommandType =
  | 'start'
  | 'link'
  | 'unlink'
  | 'help'
  | 'balance'
  | 'recent'
  | 'summary'
  | 'budget'
  | 'confirm_expense'
  | 'confirm_income'
  | 'confirm'
  | 'cancel'
  | 'delete_last'
  | 'select_group'
  | 'select_subcategory'
  | 'select_account'
  | 'skip_group'
  | 'skip_subcategory'
  | 'money_in'
  | 'money_out'
  | 'change_category'
  | 'edit'
  | 'edit_description'
  | 'edit_amount'
  | 'edit_category'
  | 'reconcile'
  | 'confirm_reconcile'
  | 'cancel_reconcile'
  | 'none';

export function detectCommand(text: string): CommandType {
  const q = text.trim();

  // Telegram bot commands
  if (/^\/start\b/i.test(q)) return 'start';
  if (/^\/link\b/i.test(q)) return 'link';
  if (/^\/unlink\b/i.test(q) || /^ยกเลิกลิงก์/i.test(q) || /unlink/i.test(q)) return 'unlink';
  if (/^\/help\b/i.test(q)) return 'help';
  if (/^\/balance\b/i.test(q)) return 'balance';
  if (/^\/summary\b/i.test(q)) return 'summary';

  // Exact match for keyboard button texts
  if (q === 'ยืนยันรายจ่าย') return 'confirm_expense';
  if (q === 'ยืนยันรายรับ') return 'confirm_income';
  if (q === 'ยืนยัน') return 'confirm';
  if (q === 'ยกเลิก') return 'cancel';
  if (q === 'เปลี่ยนหมวด') return 'change_category';
  if (q === 'เปลี่ยนแปลง') return 'edit';
  // Edit-field buttons — exact matches sit above the reconcile fuzzy regex,
  // so bare "แก้ยอด" is the edit button, not a balance-adjustment request.
  if (q === 'แก้รายละเอียด') return 'edit_description';
  if (q === 'แก้ยอด') return 'edit_amount';
  if (q === 'แก้หมวดหมู่') return 'edit_category';
  if (q === 'ยืนยันปรับยอด') return 'confirm_reconcile';
  if (q === 'ยกเลิกปรับยอด') return 'cancel_reconcile';
  if (q.startsWith('เลือกหมวด:')) return 'select_group';
  if (q.startsWith('เลือกประเภท:')) return 'select_subcategory';
  if (q.startsWith('เลือกบัญชี:')) return 'select_account';
  if (q === 'ข้ามหมวด') return 'skip_group';
  if (q === 'ข้ามประเภท') return 'skip_subcategory';
  if (q === 'เงินเข้า') return 'money_in';
  if (q === 'เงินออก') return 'money_out';

  // Fuzzy match for user-typed commands
  if (/ดูยอด|ยอดคงเหลือ|ยอดเงิน|เงินเหลือ|เหลือเท่าไหร่|ยอดปัจจุบัน|balance/i.test(q)) return 'balance';
  // delete_last before recent — "ลบรายการล่าสุด" contains "รายการล่าสุด"
  if (/ลบรายการล่าสุด|ลบล่าสุด|ลบรายการ/i.test(q)) return 'delete_last';
  if (/รายการล่าสุด|ล่าสุด|รายการวันนี้|recent/i.test(q)) return 'recent';
  if (/สรุปยอด|รวมรายจ่าย|รวมรายรับ|สรุป|summary/i.test(q)) return 'summary';
  if (/ช่วยเหลือ|ใช้ยังไง|ทำอะไรได้|help|บอททำอะไร/i.test(q)) return 'help';
  if (/^งบ$|งบประมาณ|budget/i.test(q)) return 'budget';
  if (/ปรับยอด|กระทบยอด|reconcile|adjust balance|แก้ยอด|แก้ไขยอด/i.test(q)) return 'reconcile';
  if (/^ลิงก์|^link$/i.test(q)) return 'link';

  return 'none';
}

/** Parse the invite code from "/start <code>" */
export function parseStartCode(text: string): string | null {
  const m = text.trim().match(/^\/start\s+([A-Za-z0-9-]{4,12})$/);
  return m ? m[1].toUpperCase() : null;
}