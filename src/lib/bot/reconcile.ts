/**
 * Reconcile (ปรับยอด) flow — ported from the LINE bot state machine,
 * rewritten against the DB-backed session store.
 *
 * extractReconcile is regex-primary (deterministic, testable) with an
 * AI fallback for phrasings the regexes don't cover.
 */

import { prisma } from '@/lib/prisma';
import { aiChat, AI_INTENT_MODEL } from '@/lib/ai-client';
import {
  FMT_AMOUNT,
  formatErrorMessage,
} from './format';
import { matchAccountByText } from './match';
import {
  clearSession,
  getSession,
  incrementFailure,
  resetFailures,
  setSession,
  type ReconcileSessionPayload,
} from './session';
import {
  menuKeyboard,
  reconcileConfirmKeyboard,
} from './keyboards';
import type { BotUser } from './record';
import type { BotSender } from '@/lib/telegram/types';

export interface ExtractedReconcile {
  mode: 'set' | 'adjust';
  amount: number;
  adjustSign: number; // +1 / -1 for adjust mode
  accountNameRaw: string | null;
  note: string | null;
  confidence: number;
}

/**
 * Parse Thai reconcile commands.
 *   "ปรับ 1688 เป็น 5000"          → set 5000, account unresolved
 *   "ปรับ make เป็น 5000"          → set 5000, account "make"
 *   "ปรับ make เพิ่ม 1000"         → adjust +1000, account "make"
 *   "ปรับ make ลด 500"             → adjust -500, account "make"
 *   "ปรับยอด 5000"                 → set 5000
 */
export function parseReconcileRegex(text: string): ExtractedReconcile | null {
  const q = text.trim();

  // adjust: ปรับ <account> เพิ่ม/ลด <amount>
  let m = q.match(/^(?:ปรับยอด|ปรับ|กระทบยอด|แก้ยอด)\s+(.+?)\s*(เพิ่ม|ลด|\+)\s*([\d,]+(?:\.\d+)?)\s*(?:บาท)?\s*(?:หมายเหตุ[:\s]+(.*))?$/i);
  if (m) {
    const account = m[1].replace(/^(?:บัญชี)\s*/i, '').trim();
    const amount = parseFloat(m[3].replace(/,/g, ''));
    if (amount > 0) {
      return {
        mode: 'adjust',
        amount,
        adjustSign: m[2] === 'ลด' ? -1 : 1,
        accountNameRaw: account || null,
        note: m[4]?.trim() || null,
        confidence: 0.9,
      };
    }
  }

  // set: ปรับ [account] เป็น <amount>
  m = q.match(/^(?:ปรับยอด|ปรับ|กระทบยอด|แก้ยอด)\s*(.*?)\s*(?:เป็น|ให้เป็น|=)\s*([\d,]+(?:\.\d+)?)\s*(?:บาท)?\s*(?:หมายเหตุ[:\s]+(.*))?$/i);
  if (m) {
    const account = m[1].replace(/^(?:บัญชี)\s*/i, '').trim();
    const amount = parseFloat(m[2].replace(/,/g, ''));
    if (amount > 0 || amount === 0) {
      return {
        mode: 'set',
        amount,
        adjustSign: 0,
        accountNameRaw: account || null,
        note: m[3]?.trim() || null,
        confidence: account ? 0.9 : 0.7,
      };
    }
  }

  // bare: ปรับยอด <amount>
  m = q.match(/^(?:ปรับยอด|ปรับ|กระทบยอด|แก้ยอด)\s*([\d,]+(?:\.\d+)?)\s*(?:บาท)?\s*$/i);
  if (m) {
    const amount = parseFloat(m[1].replace(/,/g, ''));
    if (amount >= 0) {
      return { mode: 'set', amount, adjustSign: 0, accountNameRaw: null, note: null, confidence: 0.6 };
    }
  }

  return null;
}

/** AI fallback when the regexes miss (e.g. "จริงๆ มีอยู่ 5000 ในกสิกร"). */
export async function extractReconcile(text: string): Promise<ExtractedReconcile> {
  const regexResult = parseReconcileRegex(text);
  if (regexResult) return regexResult;

  try {
    const result = await aiChat({
      model: AI_INTENT_MODEL,
      messages: [
        {
          role: 'user',
          content: `สกัดข้อมูลการปรับยอดบัญชีจากข้อความภาษาไทย: "${text}"

ตอบเป็น JSON เท่านั้น:
{"mode":"setหรือadjust","amount":จำนวนเงิน,"adjustSign":1หรือ-1,"accountNameRaw":"ชื่อบัญชีหรือnull","note":"หมายเหตุหรือnull","confidence":0ถึง1}

- mode "set" = ตั้งยอดใหม่เป็น amount (เช่น "ปรับเป็น 5000")
- mode "adjust" = เพิ่ม/ลดยอด (adjustSign 1=เพิ่ม, -1=ลด)
- ถ้าไม่พบจำนวนเงิน ให้ amount=0 และ confidence ต่ำกว่า 0.4`,
        },
      ],
      format: 'json',
      temperature: 0,
      topP: 0.3,
    });

    const parsed = JSON.parse(result.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, ''));
    const mode = parsed.mode === 'adjust' ? 'adjust' : 'set';
    const amount = Number(parsed.amount) || 0;
    if (amount === 0) {
      return { mode: 'set', amount: 0, adjustSign: 0, accountNameRaw: null, note: null, confidence: 0.2 };
    }
    return {
      mode,
      amount,
      adjustSign: mode === 'adjust' ? (Number(parsed.adjustSign) >= 0 ? 1 : -1) : 0,
      accountNameRaw: parsed.accountNameRaw ? String(parsed.accountNameRaw) : null,
      note: parsed.note ? String(parsed.note) : null,
      confidence: Number(parsed.confidence) || 0.5,
    };
  } catch {
    return { mode: 'set', amount: 0, adjustSign: 0, accountNameRaw: null, note: null, confidence: 0.2 };
  }
}

/** Show the reconciliation confirmation prompt and store the session. */
export async function showReconcileConfirmation(
  user: BotUser,
  sender: BotSender,
  account: { id: string; name: string; alias?: string | null; balance: number },
  extracted: ExtractedReconcile,
  setSession: (step: string, payload: Record<string, unknown>) => Promise<void>,
): Promise<void> {
  const currentBalance = Number(account.balance);

  const newBalance =
    extracted.mode === 'set' ? extracted.amount : currentBalance + extracted.amount * extracted.adjustSign;
  const difference = newBalance - currentBalance;

  const diffText = difference >= 0 ? `+${FMT_AMOUNT.format(difference)}` : FMT_AMOUNT.format(difference);
  const note = extracted.note || `ปรับยอดจาก Telegram`;

  await setSession('awaiting_reconcile_confirm', {
    accountId: account.id,
    accountName: account.name,
    accountNameRaw: extracted.accountNameRaw,
    amount: extracted.amount,
    mode: extracted.mode,
    adjustSign: extracted.adjustSign,
    note: extracted.note,
    confidence: extracted.confidence,
    currentBalance,
    newBalance,
    difference,
  });

  const modeText =
    extracted.mode === 'set'
      ? `ปรับเป็น ${FMT_AMOUNT.format(extracted.amount)}`
      : extracted.adjustSign === 1
        ? `เพิ่ม ${FMT_AMOUNT.format(extracted.amount)}`
        : `ลด ${FMT_AMOUNT.format(extracted.amount)}`;

  const newBalanceWarn = newBalance < 0 ? '\n⚠️ ยอดใหม่ติดลบ' : '';

  await sender(
    `🔧 ยืนยันการปรับยอด\n\n💳 บัญชี: ${account.name}\n📊 ยอดปัจจุบัน: ${FMT_AMOUNT.format(currentBalance)} บาท\n🔄 ${modeText} (${diffText})\n📊 ยอดใหม่: ${FMT_AMOUNT.format(newBalance)} บาท${newBalanceWarn}\n📝 หมายเหตุ: ${note}\n\nกดยืนยันเพื่อดำเนินการ:`,
    reconcileConfirmKeyboard(),
  );
}

/** Execute a confirmed reconciliation (Reconciliation row + balance update). */
export async function executeReconcile(
  userId: string,
  data: {
    accountId: string;
    accountName: string;
    currentBalance: number;
    newBalance: number;
    difference: number;
    note: string | null;
    mode: string;
    amount: number;
    adjustSign: number;
  },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.reconciliation.create({
      data: {
        accountId: data.accountId,
        previousBalance: data.currentBalance,
        newBalance: data.newBalance,
        difference: data.difference,
        note: data.note || `ปรับยอดจาก Telegram (${data.mode === 'set' ? 'set' : `adjust ${data.adjustSign > 0 ? '+' : '-'}${data.amount}`})`,
        performedById: userId,
      },
    });

    await tx.account.update({
      where: { id: data.accountId },
      data: { balance: data.newBalance },
    });
  });
}

/** List the user's accounts as a text menu (when the account can't be resolved). */
export async function listAccountsForReconcile(
  userId: string,
  mode: 'set' | 'adjust',
  amount: number,
): Promise<string | null> {
  const accounts = await prisma.account.findMany({
    where: { ownerId: userId, status: 'active' },
    orderBy: { createdAt: 'asc' },
  });
  if (accounts.length === 0) return null;

  const lines = accounts.map((a) => {
    const bal = Number(a.balance);
    const prefix = bal < 0 ? '⚠️ ' : '💳 ';
    return `${prefix}${a.name}: ${FMT_AMOUNT.format(bal)} บาท${a.alias ? ` (${a.alias})` : ''}`;
  });

  const modeText =
    mode === 'set' ? `ปรับยอดเป็น ${FMT_AMOUNT.format(amount)} บาท` : `ปรับ${amount >= 0 ? 'เพิ่ม' : 'ลด'} ${FMT_AMOUNT.format(Math.abs(amount))} บาท`;

  return `🔧 ปรับยอด: ${modeText}\n\nกรุณาพิมพ์ชื่อบัญชีที่ต้องการปรับ:\n${lines.join('\n')}`;
}

// ── Flow handlers ─────────────────────────────────────────────────

const RECONCILE_USAGE = `🤔 ไม่สามารถอ่านข้อมูลการปรับยอดได้

ตัวอย่างการพิมพ์:
📝 "ปรับ 1688 เป็น 5000" — ปรับยอดให้เป็น 5000
📝 "ปรับ make เพิ่ม 1000" — เพิ่มยอด 1000
📝 "ปรับ make ลด 500" — ลดยอด 500`;

/** Entry point for the "ปรับยอด" command. */
export async function handleReconcileCommand(
  user: BotUser,
  sender: BotSender,
  text: string,
): Promise<void> {
  const extracted = await extractReconcile(text);

  if (extracted.amount === 0 && extracted.confidence < 0.4) {
    const failHint = await incrementFailure(user.id);
    await sender(RECONCILE_USAGE + failHint, menuKeyboard());
    return;
  }

  if (extracted.amount === 0) {
    await sender('กรุณาระบุจำนวนเงินที่ต้องการปรับ\n\nตัวอย่าง: "ปรับ 1688 เป็น 5000"', menuKeyboard());
    return;
  }

  const account = extracted.accountNameRaw
    ? await matchAccountByText(extracted.accountNameRaw, user.id)
    : null;

  if (!account) {
    const menu = await listAccountsForReconcile(user.id, extracted.mode, extracted.amount);
    if (menu === null) {
      await sender('ยังไม่มีบัญชี กรุณาสร้างบัญชีในแอป MyFam ก่อน', menuKeyboard());
      return;
    }

    await setSession(user.id, 'reconcile', 'awaiting_reconcile_account', {
      accountNameRaw: extracted.accountNameRaw,
      amount: extracted.amount,
      mode: extracted.mode,
      adjustSign: extracted.adjustSign,
      note: extracted.note,
      confidence: extracted.confidence,
    });
    await sender(menu, menuKeyboard());
    return;
  }

  await showReconcileConfirmation(
    user,
    sender,
    { id: account.id, name: account.name, alias: account.alias, balance: Number(account.balance) },
    extracted,
    (step, payload) => setSession(user.id, 'reconcile', step, payload),
  );
}

/** "ยืนยันปรับยอด" — execute the stored reconciliation. */
export async function handleConfirmReconcile(
  user: BotUser,
  sender: BotSender,
): Promise<void> {
  const session = await getSession<ReconcileSessionPayload>(user.id, 'reconcile');
  if (!session || session.step !== 'awaiting_reconcile_confirm') {
    await sender('ไม่พบรายการปรับยอดที่รอการยืนยัน', menuKeyboard());
    return;
  }

  const data = session.payload;
  await clearSession(user.id, 'reconcile');
  await resetFailures(user.id);

  try {
    await executeReconcile(user.id, {
      accountId: data.accountId!,
      accountName: data.accountName!,
      currentBalance: data.currentBalance!,
      newBalance: data.newBalance!,
      difference: data.difference!,
      note: data.note ?? null,
      mode: data.mode!,
      amount: data.amount!,
      adjustSign: data.adjustSign ?? 0,
    });

    const diffText =
      data.difference! >= 0 ? `+${FMT_AMOUNT.format(data.difference!)}` : FMT_AMOUNT.format(data.difference!);
    await sender(
      `✅ ปรับยอดในบัญชี "${data.accountName}" เรียบร้อยแล้ว!\n📊 ${FMT_AMOUNT.format(data.currentBalance!)} → ${FMT_AMOUNT.format(data.newBalance!)} (${diffText})`,
      menuKeyboard(),
    );
  } catch (error) {
    console.error('[Reconcile] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    await sender(formatErrorMessage(message), menuKeyboard());
  }
}