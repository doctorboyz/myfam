import { describe, it, expect } from 'vitest';
import { buildNewTransactionForm, validateTransactionForm } from './formDefaults';
import type { Account, Category, CategoryGroup } from '@/types';

/**
 * Causal test for the misfiling bug: /api/categories sorts categories by
 * name ascending, so "กาแฟ โกโก้" is the FIRST expense category. The add-new
 * form used to pre-pick firstCats[0], so every quick-add where the user
 * never opened the category dropdown was silently saved as กาแฟ โกโก้
 * (dozens of Lisha's rows: เติมเกม, หนัง, ข้าว, popcorn, …).
 */
const groups: CategoryGroup[] = [
  { id: 'grp-food', name: 'อาหารและเครื่องดื่ม', type: 'expense' },
  { id: 'grp-fun', name: 'ความบันเทิง', type: 'expense' },
];

// Ordered exactly as the API returns them (name ascending) — กาแฟ โกโก้ first.
const categories: Category[] = [
  { id: 'cat-coffee', name: 'กาแฟ โกโก้', groupId: 'grp-food' },
  { id: 'cat-rice', name: 'กินข้าว', groupId: 'grp-food' },
  { id: 'cat-game', name: 'เกม/เติมเกม', groupId: 'grp-fun' },
];

const accounts: Account[] = [
  { id: 'acc-lita', name: 'กระเป๋าลิต้า', type: 'cash', balance: 100, color: '#fff', owner: 'Lita', ownerId: 'u-lita', status: 'active' },
  { id: 'acc-mom', name: 'กระเป๋าแม่', type: 'cash', balance: 500, color: '#fff', owner: 'แม่', ownerId: 'u-mom', status: 'active' },
];

describe('buildNewTransactionForm', () => {
  it('does not silently pre-pick a category on add-new (กาแฟ โกโก้ misfiling root cause)', () => {
    const form = buildNewTransactionForm({
      groups,
      categories,
      type: 'expense',
      availableAccounts: accounts,
      currentUserId: 'u-lita',
      today: '2026-09-30',
    });
    // The user never touched the category dropdown — nothing may be
    // pre-selected, or the row files itself as กาแฟ โกโก้.
    expect(form.category).toBe('');
    expect(form.categoryGroup).toBe('');
  });

  it('defaults the account to the current member own account', () => {
    const form = buildNewTransactionForm({
      groups,
      categories,
      type: 'expense',
      availableAccounts: accounts,
      currentUserId: 'u-lita',
      today: '2026-09-30',
    });
    expect(form.accountId).toBe('acc-lita');
  });

  it('prefers the page-provided accountId over the own-account default', () => {
    const form = buildNewTransactionForm({
      groups,
      categories,
      type: 'expense',
      accountId: 'acc-mom',
      availableAccounts: accounts,
      currentUserId: 'u-lita',
      today: '2026-09-30',
    });
    expect(form.accountId).toBe('acc-mom');
  });
});

describe('validateTransactionForm', () => {
  it('blocks income/expense without a category', () => {
    expect(
      validateTransactionForm({ type: 'expense', accountId: 'acc-lita', toAccountId: '', category: '' }),
    ).toBe('กรุณาเลือกหมวดหมู่');
  });

  it('accepts income/expense with a category', () => {
    expect(
      validateTransactionForm({ type: 'expense', accountId: 'acc-lita', toAccountId: '', category: 'กินข้าว' }),
    ).toBeNull();
  });

  it('allows transfers without a category', () => {
    expect(
      validateTransactionForm({ type: 'transfer', accountId: 'acc-lita', toAccountId: 'acc-mom', category: '' }),
    ).toBeNull();
  });

  it('still enforces the transfer account rules', () => {
    expect(
      validateTransactionForm({ type: 'transfer', accountId: 'acc-lita', toAccountId: '', category: '' }),
    ).toBe('กรุณาเลือกบัญชีปลายทาง');
    expect(
      validateTransactionForm({ type: 'transfer', accountId: 'acc-lita', toAccountId: 'acc-lita', category: '' }),
    ).toBe('บัญชีต้นทางและปลายทางต้องไม่เหมือนกัน');
  });
});