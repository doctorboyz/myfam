/**
 * Pure form logic for TransactionDetailModal — extracted so the add-new
 * defaults and submit validation are testable without rendering the modal.
 *
 * The add-new defaults previously pre-picked the first category of the
 * first group (alphabetically "กาแฟ โกโก้" via /api/categories name-asc
 * ordering), silently filing every quick-add as that category when the
 * user never opened the category dropdown (causal test: formDefaults.test.ts).
 */

import type { Account, Category, CategoryGroup, TransactionType } from '@/types';

export interface NewTransactionFormValues {
  accountId: string;
  toAccountId: string;
  amount: number;
  fee: number;
  category: string;
  categoryGroup: string;
  date: string;
  type: TransactionType;
  description: string;
  slipImage: string;
  tagIds: string[];
}

export interface NewTransactionFormInput {
  groups: CategoryGroup[];
  categories: Category[];
  type: TransactionType;
  /** Pre-selects this account when non-empty (e.g. account detail page). */
  accountId?: string;
  availableAccounts: Account[];
  currentUserId?: string;
  /** YYYY-MM-DD — passed in so the function stays pure. */
  today: string;
}

/** Build the initial form state when adding a new transaction. */
export function buildNewTransactionForm(input: NewTransactionFormInput): NewTransactionFormValues {
  const groupsForType = input.groups.filter((g) => g.type === input.type && !g.deletedAt);
  const firstGroup = groupsForType[0];
  const firstCats = firstGroup
    ? input.categories.filter((c) => c.groupId === firstGroup.id && !c.deletedAt)
    : [];

  // Default to the current member's own account — the member selector
  // starts on the current user, so the first family account may belong
  // to someone else and would be hidden by the from-accounts filter.
  const ownAccount = input.availableAccounts.find((a) => a.ownerId === input.currentUserId);
  const defaultAccountId =
    input.accountId ||
    ownAccount?.id ||
    (input.availableAccounts.length > 0 ? input.availableAccounts[0].id : '');

  // No silent category pick: the category starts empty and the user must
  // choose one (validateTransactionForm enforces it for non-transfers).
  // An empty value renders the "เลือกหมวดหมู่" placeholder in CategorySelector.
  return {
    accountId: defaultAccountId,
    toAccountId: '',
    amount: 0,
    fee: 0,
    category: '',
    categoryGroup: '',
    date: input.today,
    type: input.type,
    description: '',
    slipImage: '',
    tagIds: [],
  };
}

export type TransactionFormValidationInput = Pick<
  NewTransactionFormValues,
  'type' | 'accountId' | 'toAccountId' | 'category'
>;

/**
 * Validate the form before saving. Returns a Thai error message for
 * alert(), or null when the form is submittable.
 *
 * Categories are the validation that makes reports trustworthy, so
 * income/expense rows require one. Transfers move money between the
 * user's own accounts and don't need a category.
 */
export function validateTransactionForm(
  formData: TransactionFormValidationInput,
): string | null {
  if (formData.type === 'transfer' && !formData.toAccountId) {
    return 'กรุณาเลือกบัญชีปลายทาง';
  }
  if (formData.type === 'transfer' && formData.accountId === formData.toAccountId) {
    return 'บัญชีต้นทางและปลายทางต้องไม่เหมือนกัน';
  }
  if (formData.type !== 'transfer' && !formData.category) {
    return 'กรุณาเลือกหมวดหมู่';
  }
  return null;
}