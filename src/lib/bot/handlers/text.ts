/**
 * Text message dispatcher: commands, reconcile-flow state,
 * pending-transaction state, then the AI extract flow.
 */

import type { BotSender } from '@/lib/telegram/types';
import { detectCommand, type CommandType } from '../commands';
import { extractFromText, validateExtracted, type ExtractedTransaction } from '../extract';
import {
  formatConfirmationPrompt,
  formatErrorMessage,
  truncateMessage,
  HELP_TEXT,
} from '../format';
import { confirmKeyboard, menuKeyboard } from '../keyboards';
import {
  handleConfirmReconcile,
  handleReconcileCommand,
  showReconcileConfirmation,
} from '../reconcile';
import { matchAccountByText } from '../match';
import {
  findSimilarTransactions,
  getCategoriesForFamily,
  getCategoryContext,
  getDataScope,
  type BotUser,
} from '../record';
import {
  handleBalanceQuery,
  handleBudgetQuery,
  handleRecentQuery,
  handleSummaryQuery,
  resolveSummaryRange,
} from '../queries';
import {
  getSession,
  incrementFailure,
  setSession,
  clearSession,
  type ReconcileSessionPayload,
  type TxSessionPayload,
} from '../session';
import {
  handleCancel,
  handleCategorySelected,
  handleChangeCategory,
  handleConfirmExtraction,
  handleConfirmType,
  handleCorrection,
  handleDeleteLast,
  handleDirection,
  handleSelectAccount,
  handleSubcategorySelected,
} from './confirm';

/** Strip the "เลือกบัญชี:"/"เลือกหมวด:"/"เลือกประเภท:" prefix. */
function selectionArg(text: string): string {
  return text.replace(/^เลือก(?:บัญชี|หมวด|ประเภท):/, '').trim();
}

async function dispatchCommand(
  command: CommandType,
  text: string,
  user: BotUser,
  sender: BotSender,
): Promise<boolean> {
  switch (command) {
    case 'help':
      await sender(truncateMessage(HELP_TEXT), menuKeyboard());
      return true;
    case 'balance':
      await sender(truncateMessage(await handleBalanceQuery(user)), menuKeyboard());
      return true;
    case 'recent':
      await sender(truncateMessage(await handleRecentQuery(user)), menuKeyboard());
      return true;
    case 'summary':
      await sender(
        truncateMessage(await handleSummaryQuery(user, resolveSummaryRange(text))),
        menuKeyboard(),
      );
      return true;
    case 'budget':
      await sender(truncateMessage(await handleBudgetQuery(user)), menuKeyboard());
      return true;
    case 'delete_last':
      await handleDeleteLast(user, sender);
      return true;
    case 'confirm':
      await handleConfirmExtraction(user, sender);
      return true;
    case 'confirm_expense':
      await handleConfirmType(user, sender, 'expense');
      return true;
    case 'confirm_income':
      await handleConfirmType(user, sender, 'income');
      return true;
    case 'cancel':
      await handleCancel(user, sender);
      return true;
    case 'select_account':
      await handleSelectAccount(user, sender, selectionArg(text));
      return true;
    case 'money_in':
      await handleDirection(user, sender, 'money_in');
      return true;
    case 'money_out':
      await handleDirection(user, sender, 'money_out');
      return true;
    case 'change_category':
      await handleChangeCategory(user, sender);
      return true;
    case 'select_group':
      await handleCategorySelected(user, sender, selectionArg(text));
      return true;
    case 'select_subcategory':
      await handleSubcategorySelected(user, sender, selectionArg(text));
      return true;
    case 'skip_group':
    case 'skip_subcategory':
      await handleSkipCategory(user, sender);
      return true;
    case 'confirm_reconcile':
      await handleConfirmReconcile(user, sender);
      return true;
    case 'cancel_reconcile':
      await clearSession(user.id, 'reconcile');
      await sender('❌ ยกเลิกการปรับยอดแล้ว', menuKeyboard());
      return true;
    case 'reconcile':
      await handleReconcileCommand(user, sender, text);
      return true;
    default:
      return false;
  }
}

/** "ข้ามหมวด/ข้ามประเภท" — clear the category and re-confirm. */
async function handleSkipCategory(user: BotUser, sender: BotSender): Promise<void> {
  const session = await getSession<TxSessionPayload>(user.id, 'transaction');
  if (!session) {
    await sender('ไม่มีรายการที่รอยืนยัน', menuKeyboard());
    return;
  }

  const extracted = { ...(session.payload.extracted as unknown as ExtractedTransaction) };
  delete (extracted as Partial<ExtractedTransaction>).categoryId;
  delete (extracted as Partial<ExtractedTransaction>).categoryGroupName;
  // Explicit skip: the confirm flow lets ยืนยัน through without a category.
  extracted.categorySkipped = true;

  await setSession(user.id, 'transaction', 'awaiting_confirm', {
    ...session.payload,
    extracted: extracted as unknown as Record<string, unknown>,
  });
  await sender(truncateMessage(formatConfirmationPrompt(extracted, 0, null)), confirmKeyboard());
}

/** Reconcile flow: user typed an account name when asked. */
async function tryReconcileAccountInput(
  user: BotUser,
  sender: BotSender,
  text: string,
): Promise<boolean> {
  const session = await getSession<ReconcileSessionPayload>(user.id, 'reconcile');
  if (!session || session.step !== 'awaiting_reconcile_account') return false;

  const account = await matchAccountByText(text, user.id);
  if (!account) {
    const failHint = await incrementFailure(user.id);
    await sender(`ไม่พบบัญชี "${text}" — ลองพิมพ์ชื่อบัญชีอีกครั้ง${failHint}`);
    return true;
  }

  await showReconcileConfirmation(
    user,
    sender,
    { id: account.id, name: account.name, alias: account.alias, balance: Number(account.balance) },
    {
      mode: session.payload.mode === 'adjust' ? 'adjust' : 'set',
      amount: session.payload.amount ?? 0,
      adjustSign: session.payload.adjustSign ?? 0,
      accountNameRaw: text,
      note: session.payload.note ?? null,
      confidence: session.payload.confidence ?? 0.8,
    },
    (step, payload) => setSession(user.id, 'reconcile', step, payload),
  );
  return true;
}

/** Entry point for every text message from a linked user. */
export async function handleTextMessage(
  user: BotUser,
  sender: BotSender,
  text: string,
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;

  // 1. Commands (keyboard buttons and slash commands)
  const command = detectCommand(trimmed);
  if (command !== 'none' && command !== 'start' && command !== 'link' && command !== 'unlink') {
    if (await dispatchCommand(command, trimmed, user, sender)) return;
  }

  // 2. Reconcile flow — pending account input
  if (await tryReconcileAccountInput(user, sender, trimmed)) return;

  // 3. Correction while awaiting confirmation ("เปลี่ยนเป็น...")
  const txSession = await getSession(user.id, 'transaction');
  if (txSession && txSession.step === 'awaiting_confirm' && /^(เปลี่ยน|แก้)/.test(trimmed)) {
    await handleCorrection(user, sender, trimmed);
    return;
  }

  // 4. AI extraction flow
  try {
    const categories = getCategoryContext(await getCategoriesForFamily(user.familyId));
    const extracted = await extractFromText(trimmed, categories);

    const validation = validateExtracted(extracted);
    if (!validation.valid) {
      const failHint = await incrementFailure(user.id);
      await sender(`${validation.message}${failHint}`, menuKeyboard());
      return;
    }

    const similar = await findSimilarTransactions(extracted, getDataScope(user));
    const matchedCat = extracted.categoryId
      ? categories.find((c) => c.id === extracted.categoryId)
      : null;
    const catInfo = extracted.categoryGroupName
      ? { groupName: extracted.categoryGroupName, subcategoryName: matchedCat?.name }
      : null;

    await setSession(user.id, 'transaction', 'awaiting_confirm', {
      extracted: extracted as unknown as Record<string, unknown>,
      imageBase64: null,
      imageHash: null,
    });
    await sender(
      truncateMessage(formatConfirmationPrompt(extracted, similar.length, catInfo)),
      confirmKeyboard(),
    );
  } catch (error) {
    console.error('[TextHandler] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    const failHint = await incrementFailure(user.id);
    await sender(formatErrorMessage(message) + failHint, menuKeyboard());
  }
}