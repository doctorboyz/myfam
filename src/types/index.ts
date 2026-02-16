export type AccountType = 'bank' | 'cash' | 'credit' | 'wallet' | 'loan' | 'invest';

export type UserRole = 'parent' | 'child';

export interface User {
  id: string;
  name: string;
  role: UserRole;
  isAdmin?: boolean;
  avatar?: string;
  color: string;
  familyId: string;
}

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  balance: number;
  color: string;
  owner: string; // User.name
  accountNo?: string;
  alias?: string;
  status: 'active' | 'archived';
}

export type TransactionType = 'income' | 'expense' | 'transfer';

export interface CategoryGroup {
  id: string;
  name: string;
  type: TransactionType;
  isCustom?: boolean; // User defined group?
}

export interface Category {
  id: string;
  name: string;
  groupId: string;
  isCustom?: boolean; // User defined category
  userId?: string | null; // Null for system categories
}

export type BudgetStatus = 'pending' | 'done' | 'cancelled';

export interface BudgetTransaction {
  id: string;
  name: string;
  plannedAmount: number;
  actualAmount?: number;
  date: string; // Target date or Completion date
  status: BudgetStatus;
  type: TransactionType;
  categoryId: string;
  accountId?: string; // Account used for actual payment
  toAccountId?: string; // For transfers
  linkedTransactionId?: string; // ID of the real transaction when status is done
  tags?: string[];
}

export interface Budget {
  id: string;
  title: string;
  description?: string;
  period: 'monthly' | 'one_time';
  limit: number;
  imageUrl?: string;
  startDate: string;
  endDate?: string;
  items: BudgetTransaction[];
  createdById?: string; // Creator
}

export interface Transaction {
  id: string;
  accountId: string;
  toAccountId?: string; // For transfers
  category: string;
  categoryId?: string;
  categoryGroup: string;
  date: string; // ISO String
  amount: number;
  fee?: number;
  type: TransactionType;
  note?: string;
  slipImage?: string;
  tags?: string[];
}

export interface DateRange {
  start: Date | null;
  end: Date | null;
}

export interface DashboardFilters {
  users: string[]; // User names
  dateRange: DateRange;
  types: TransactionType[];
  categories: string[]; // Category IDs
  accounts: string[];
}
