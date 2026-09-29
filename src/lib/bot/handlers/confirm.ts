/**
 * Transaction session-state handlers: confirm, account selection,
 * category change, direction, corrections, delete-last.
 * All state lives in the DB-backed BotSession store.
 */

import { prisma } from '@/lib/prisma';
import { softDeleteTransaction } from '@/lib/transaction-mutations';
import type { BotSender } from '@/lib/telegram/types';
import type { ExtractedTransaction } from '../extract';
import {
  FMT_AMOUNT,
  formatAmountLine,
  formatConfirmationMessage,
  formatConfirmationPrompt,
  formatErrorMessage,
  truncateMessage,
} from '../format';
import {
  accountKeyboard,
  categoryGroupKeyboard,
  confirmKeyboard,
  directionKeyboard,
  menuKeyboard,
  subcategoryKeyboard,
} from '../keyboards';
import { accountDisplay, findAccountByDisplay, matchAccountByName } from '../match';
import {
  BOT_TAG,
  createBotTransaction,
  findSimilarTransactions,
  getCategoriesForFamily,
  getCategoryContext,
  getDataScope,
  getUserAccounts,
  type BotUser,
} from '../record';
import {
  clearSession,
  getSession,
  resetFailures,
  setSession,
  type TxSessionPayload,
} from '../session';

function toExtracted(raw: unknown): ExtractedTransaction {
  return raw as ExtractedTransaction;
}

/** Create the transaction, reply with confirmation, clear state. */
async function createAndReply(
  user: BotUser,
  sender: BotSender,
  extracted: ExtractedTransaction,
  options: { accountId: string; toAccountId?: string | null; slip?: { imageBase64?: string | null; imageHash?: string | null } },
): Promise<void> {
  const transaction = await createBotTransaction(extracted, user, {
    accountId: options.accountId,
    toAccountId: options.toAccountId ?? null,
    imageBase64: options.slip?.imageBase64 ?? null,
    imageHash: options.slip?.imageHash ?? null,
  });

  await clearSession(user.id, 'transaction');
  await resetFailures(user.id);
  await sender(formatConfirmationMessage(transaction, extracted), menuKeyboard());
}

/**
 * Resolve which account to use — create immediately when unambiguous,
 * otherwise ask via keyboard and store the pending state.
 */
export async function promptAccountSelection(
  user: BotUser,
  sender: BotSender,
  extracted: ExtractedTransaction,
  slip?: { imageBase64?: string | null; imageHash?: string | null },
): Promise<void> {
  const accounts = await getUserAccounts(user.id);

  if (accounts.length === 0) {
    await clearSession(user.id, 'transaction');
    await sender('ยังไม่มีบัญชี กรุณาสร้างบัญชีในแอป MyFam ก่อน', menuKeyboard());
    return;
  }

  const matchedAccount = extracted.accountName ? matchAccountByName(accounts, extracted.accountName) : null;

  const persist = (step: string, payload: Partial<TxSessionPayload> = {}) =>
    setSession(user.id, 'transaction', step, {
      extracted: extracted as unknown as Record<string, unknown>,
      imageBase64: slip?.imageBase64 ?? null,
      imageHash: slip?.imageHash ?? null,
      ...payload,
    });

  // ── Transfer ──
  if (extracted.type === 'transfer') {
    if (matchedAccount && accounts.length < 2) {
      // One account only — external party on the other side, ask direction
      await persist('awaiting_direction', { singleAccountId: matchedAccount.id });
      await sender(
        `📝 ${extracted.description}\n${formatAmountLine(extracted)}\n\nระบุเป็นธุรกรรมโอน แต่มีบัญชีเดียวในระบบ\nนี่คือเงินเข้าหรือเงินออก?`,
        directionKeyboard(),
      );
      return;
    }

    if (matchedAccount) {
      // Source known from text — ask destination
      await persist('select_dest', { sourceAccountId: matchedAccount.id });
      const destAccounts = accounts.filter((a) => a.id !== matchedAccount.id);
      await sender(
        `📝 ${extracted.description}\n${formatAmountLine(extracted)}\n\nเลือกบัญชีปลายทาง (จาก ${matchedAccount.name}):`,
        accountKeyboard(destAccounts.map(accountDisplay)),
      );
      return;
    }

    if (accounts.length === 1) {
      await persist('awaiting_direction', { singleAccountId: accounts[0].id });
      await sender(
        `📝 ${extracted.description}\n${formatAmountLine(extracted)}\n\nระบุเป็นธุรกรรมโอน แต่มีบัญชีเดียวในระบบ\nนี่คือเงินเข้าหรือเงินออก?`,
        directionKeyboard(),
      );
      return;
    }

    // Multiple accounts, source unknown — pick source first
    await persist('select_source');
    await sender(
      `📝 ${extracted.description}\n${formatAmountLine(extracted)}\n\nเลือกบัญชีต้นทาง:`,
      accountKeyboard(accounts.map(accountDisplay)),
    );
    return;
  }

  // ── Income / expense with a text-matched account ──
  if (matchedAccount) {
    await createAndReply(user, sender, extracted, {
      accountId: matchedAccount.id,
      slip,
    });
    return;
  }

  // ── Single account — use it ──
  if (accounts.length === 1) {
    await createAndReply(user, sender, extracted, {
      accountId: accounts[0].id,
      slip,
    });
    return;
  }

  // ── Multiple accounts — ask ──
  await persist('awaiting_account');
  const promptText =
    extracted.type === 'income'
      ? `📝 ${extracted.description}\n${formatAmountLine(extracted)}\n\nเลือกบัญชีที่รับเงิน:`
      : `📝 ${extracted.description}\n${formatAmountLine(extracted)}\n\nเลือกบัญชีที่จ่าย:`;
  await sender(promptText, accountKeyboard(accounts.map(accountDisplay)));
}

/** "ยืนยัน" — move an awaiting_confirm session into account selection. */
export async function handleConfirmExtraction(user: BotUser, sender: BotSender): Promise<void> {
  const session = await getSession<TxSessionPayload>(user.id, 'transaction');
  if (!session || session.step !== 'awaiting_confirm') {
    await sender('ไม่มีรายการรอยืนยัน', menuKeyboard());
    return;
  }

  const extracted = toExtracted(session.payload.extracted);
  await promptAccountSelection(user, sender, extracted, {
    imageBase64: session.payload.imageBase64,
    imageHash: session.payload.imageHash,
  });
}

/** "ยืนยันรายจ่าย/รายรับ" — resolve an uncertain type, then continue. */
export async function handleConfirmType(
  user: BotUser,
  sender: BotSender,
  confirmedType: 'income' | 'expense',
): Promise<void> {
  const session = await getSession<TxSessionPayload>(user.id, 'transaction');
  if (!session || session.step !== 'awaiting_confirm') {
    await sender('ไม่มีรายการรอยืนยัน', menuKeyboard());
    return;
  }

  const extracted: ExtractedTransaction = {
    ...toExtracted(session.payload.extracted),
    type: confirmedType,
    needsConfirmation: false,
    confidence: 1,
  };

  await promptAccountSelection(user, sender, extracted, {
    imageBase64: session.payload.imageBase64,
    imageHash: session.payload.imageHash,
  });
}

/** "เงินเข้า/เงินออก" — single-account transfer direction. */
export async function handleDirection(
  user: BotUser,
  sender: BotSender,
  direction: 'money_in' | 'money_out',
): Promise<void> {
  const session = await getSession<TxSessionPayload>(user.id, 'transaction');
  if (!session || session.step !== 'awaiting_direction' || !session.payload.singleAccountId) {
    await sender('ไม่มีรายการรอยืนยันทิศทาง', menuKeyboard());
    return;
  }

  const extracted: ExtractedTransaction = {
    ...toExtracted(session.payload.extracted),
    type: direction === 'money_in' ? 'income' : 'expense',
    needsConfirmation: false,
  };

  await createAndReply(user, sender, extracted, {
    accountId: session.payload.singleAccountId,
    slip: { imageBase64: session.payload.imageBase64, imageHash: session.payload.imageHash },
  });
}

/** "เลือกบัญชี:<display>" — resolve the account step (or transfer legs). */
export async function handleSelectAccount(
  user: BotUser,
  sender: BotSender,
  display: string,
): Promise<void> {
  const session = await getSession<TxSessionPayload>(user.id, 'transaction');
  if (!session) {
    await sender('ไม่มีรายการที่รอการเลือกบัญชี', menuKeyboard());
    return;
  }

  if (session.step === 'awaiting_direction') {
    await sender('กรุณาเลือก เงินเข้า หรือ เงินออก', directionKeyboard());
    return;
  }

  const account = await findAccountByDisplay(display, user.id);
  if (!account) {
    await sender('ไม่พบบัญชีที่เลือก', menuKeyboard());
    return;
  }

  const extracted = toExtracted(session.payload.extracted);
  const slip = { imageBase64: session.payload.imageBase64, imageHash: session.payload.imageHash };

  // Transfer: second leg (destination)
  if (extracted.type === 'transfer' && session.step === 'select_dest' && session.payload.sourceAccountId) {
    await createAndReply(user, sender, extracted, {
      accountId: session.payload.sourceAccountId,
      toAccountId: account.id,
      slip,
    });
    return;
  }

  // Transfer: first leg (source) — then ask destination
  if (extracted.type === 'transfer' && session.step === 'select_source') {
    const destAccounts = (await getUserAccounts(user.id)).filter((a) => a.id !== account.id);
    if (destAccounts.length === 0) {
      await clearSession(user.id, 'transaction');
      await sender('ไม่มีบัญชีอื่นสำหรับโอนเงิน กรุณาสร้างบัญชีเพิ่มในแอป MyFam', menuKeyboard());
      return;
    }
    await setSession(user.id, 'transaction', 'select_dest', {
      ...session.payload,
      extracted: extracted as unknown as Record<string, unknown>,
      sourceAccountId: account.id,
    });
    await sender(
      `📝 ${extracted.description}\n${formatAmountLine(extracted)}\n\nเลือกบัญชีปลายทาง:`,
      accountKeyboard(destAccounts.map(accountDisplay)),
    );
    return;
  }

  // Single account for income/expense
  await createAndReply(user, sender, extracted, { accountId: account.id, slip });
}

/** "เปลี่ยนหมวด" — show category groups filtered by type. */
export async function handleChangeCategory(user: BotUser, sender: BotSender): Promise<void> {
  const session = await getSession<TxSessionPayload>(user.id, 'transaction');
  if (!session || (session.step !== 'awaiting_confirm' && session.step !== 'awaiting_category')) {
    await sender('ไม่มีรายการที่รอการแก้ไขหมวดหมู่', menuKeyboard());
    return;
  }

  const extracted = toExtracted(session.payload.extracted);
  const categories = await getCategoriesForFamily(user.familyId);
  const groupNames = [
    ...new Set(
      getCategoryContext(categories)
        .filter((c) => c.groupType === extracted.type)
        .map((c) => c.groupName),
    ),
  ];

  if (groupNames.length === 0) {
    await sender('ไม่พบหมวดหมู่ที่ตรงกับประเภทรายการนี้', confirmKeyboard());
    return;
  }

  await setSession(user.id, 'transaction', 'awaiting_category', {
    ...session.payload,
    extracted: extracted as unknown as Record<string, unknown>,
  });
  await sender('📂 เลือกหมวดหมู่:', categoryGroupKeyboard(groupNames));
}

/** "เลือกหมวด:<group>" — group picked in the category flow. */
export async function handleCategorySelected(
  user: BotUser,
  sender: BotSender,
  groupName: string,
): Promise<void> {
  const session = await getSession<TxSessionPayload>(user.id, 'transaction');
  if (!session || session.step !== 'awaiting_category') {
    await sender('ไม่มีรายการที่รอการเลือกหมวดหมู่', menuKeyboard());
    return;
  }

  const categories = getCategoryContext(await getCategoriesForFamily(user.familyId));
  const group = categories.find((c) => c.groupName === groupName);
  if (!group) {
    await sender('ไม่พบหมวดหมู่ที่เลือก', confirmKeyboard());
    return;
  }

  const extracted = toExtracted(session.payload.extracted);
  const subcats = categories.filter((c) => c.groupName === groupName);

  const updated: ExtractedTransaction = {
    ...extracted,
    categoryGroupName: groupName,
    categoryId: subcats.length === 1 ? subcats[0].id : null,
  };

  if (subcats.length > 1) {
    await setSession(user.id, 'transaction', 'awaiting_confirm', {
      ...session.payload,
      extracted: updated as unknown as Record<string, unknown>,
    });
    await sender(
      `📂 ${groupName} — เลือกหมวดหมู่ย่อย:`,
      subcategoryKeyboard(subcats.map((c) => c.name)),
    );
    return;
  }

  await showUpdatedConfirmation(user, sender, updated, session.payload);
}

/** "เลือกประเภท:<category>" — subcategory picked (or typed) in confirm flow. */
export async function handleSubcategorySelected(
  user: BotUser,
  sender: BotSender,
  categoryName: string,
): Promise<void> {
  const session = await getSession<TxSessionPayload>(user.id, 'transaction');
  if (!session || session.step !== 'awaiting_confirm') {
    await sender('ไม่มีรายการที่รอยืนยัน', menuKeyboard());
    return;
  }

  const categories = getCategoryContext(await getCategoriesForFamily(user.familyId));
  const cat = categories.find((c) => c.name === categoryName || c.id === categoryName);
  if (!cat) {
    await sender('ไม่พบหมวดหมู่', confirmKeyboard());
    return;
  }

  const updated: ExtractedTransaction = {
    ...toExtracted(session.payload.extracted),
    categoryId: cat.id,
    categoryGroupName: cat.groupName,
  };

  await showUpdatedConfirmation(user, sender, updated, session.payload);
}

/** Re-show the confirmation prompt with an updated extraction. */
async function showUpdatedConfirmation(
  user: BotUser,
  sender: BotSender,
  extracted: ExtractedTransaction,
  payload: TxSessionPayload,
): Promise<void> {
  const scope = getDataScope(user);
  const similar = await findSimilarTransactions(extracted, scope);

  const matchedCat = extracted.categoryId
    ? (await getCategoryContext(await getCategoriesForFamily(user.familyId))).find((c) => c.id === extracted.categoryId)
    : null;
  const catInfo = extracted.categoryGroupName
    ? { groupName: extracted.categoryGroupName, subcategoryName: matchedCat?.name }
    : null;

  await setSession(user.id, 'transaction', 'awaiting_confirm', {
    ...payload,
    extracted: extracted as unknown as Record<string, unknown>,
  });
  await sender(formatConfirmationPrompt(extracted, similar.length, catInfo), confirmKeyboard());
}

/** Free-text correction while awaiting confirmation ("เปลี่ยนเป็นค่ากินข้าว 200"). */
export async function handleCorrection(
  user: BotUser,
  sender: BotSender,
  text: string,
): Promise<void> {
  const session = await getSession<TxSessionPayload>(user.id, 'transaction');
  if (!session || session.step !== 'awaiting_confirm') return;

  const categories = getCategoryContext(await getCategoriesForFamily(user.familyId));
  const pending = toExtracted(session.payload.extracted);
  const reExtracted = await (await import('../extract')).extractFromText(text, categories);

  if (reExtracted.confidence < 0.3 && reExtracted.amount === 0) {
    await sender('ไม่เข้าใจการแก้ไข กรุณาลองใหม่ เช่น "เปลี่ยนเป็นค่ากินข้าว 200"', confirmKeyboard());
    return;
  }

  // Merge only non-zero/non-empty fields from the re-extraction
  const merged: ExtractedTransaction = {
    ...pending,
    amount: reExtracted.amount > 0 ? reExtracted.amount : pending.amount,
    fee: reExtracted.fee || pending.fee || 0,
    description: reExtracted.description || pending.description,
    type: reExtracted.confidence > 0.5 ? reExtracted.type : pending.type,
    categoryGroupName: reExtracted.categoryGroupName || pending.categoryGroupName,
    categoryId: reExtracted.categoryId || pending.categoryId,
    merchantName: reExtracted.merchantName || pending.merchantName,
  };

  await showUpdatedConfirmation(user, sender, merged, session.payload);
  await sender(`✅ อัปเดตรายการแล้ว`);
}

/** "ยกเลิก" — drop the pending transaction session. */
export async function handleCancel(user: BotUser, sender: BotSender): Promise<void> {
  const session = await getSession<TxSessionPayload>(user.id, 'transaction');
  if (!session) {
    await sender('ไม่มีรายการที่รอยืนยัน', menuKeyboard());
    return;
  }

  await clearSession(user.id, 'transaction');
  const extracted = session.payload.extracted ? toExtracted(session.payload.extracted) : null;
  await sender(
    extracted
      ? `❌ ยกเลิกรายการแล้ว\n📝 ${extracted.description || 'ไม่ระบุ'} ${FMT_AMOUNT.format(extracted.amount)} บาท`
      : '❌ ยกเลิกแล้ว',
    menuKeyboard(),
  );
}

/** "ลบล่าสุด" — soft-delete the latest bot transaction (reverts balance). */
export async function handleDeleteLast(user: BotUser, sender: BotSender): Promise<void> {
  const lastTransaction = await prisma.transaction.findFirst({
    where: {
      ...getDataScope(user),
      deletedAt: null,
      tagRecords: { some: { tag: { name: BOT_TAG } } },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!lastTransaction) {
    await sender('ไม่พบรายการที่สร้างผ่าน Telegram', menuKeyboard());
    return;
  }

  try {
    const deleted = await softDeleteTransaction(lastTransaction.id, user.id);
    if (!deleted) {
      await sender('ไม่พบรายการที่สร้างผ่าน Telegram', menuKeyboard());
      return;
    }
    await sender(
      `🗑️ ลบรายการแล้ว\n${deleted.description || '-'} ${FMT_AMOUNT.format(Number(deleted.amount))} บาท`,
      menuKeyboard(),
    );
  } catch (error) {
    console.error('[DeleteLast] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    await sender(formatErrorMessage(message), menuKeyboard());
  }
}

/** Exported for the photo handler: store extraction + show confirmation. */
export async function storePendingExtraction(
  user: BotUser,
  sender: BotSender,
  extracted: ExtractedTransaction,
  similarCount: number,
  slip: { imageBase64: string; imageHash: string },
): Promise<void> {
  const matchedCat = extracted.categoryId
    ? (await getCategoryContext(await getCategoriesForFamily(user.familyId))).find((c) => c.id === extracted.categoryId)
    : null;
  const catInfo = extracted.categoryGroupName
    ? { groupName: extracted.categoryGroupName, subcategoryName: matchedCat?.name }
    : null;

  await setSession(user.id, 'transaction', 'awaiting_confirm', {
    extracted: extracted as unknown as Record<string, unknown>,
    imageBase64: slip.imageBase64,
    imageHash: slip.imageHash,
  });

  await sender(truncateMessage(formatConfirmationPrompt(extracted, similarCount, catInfo)), confirmKeyboard());
}