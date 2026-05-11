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
  lineLink?: { lineUserId: string } | null;
}

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  balance: number;
  color: string;
  icon?: string;
  owner: string;
  accountNo?: string;
  alias?: string;
  status: 'active' | 'archived';
  createdById?: string;
  updatedById?: string;
  deletedById?: string;
  deletedAt?: string | null;
}

export type TransactionType = 'income' | 'expense' | 'transfer';

export interface CategoryGroup {
  id: string;
  name: string;
  type: TransactionType;
  isCustom?: boolean;
  deletedById?: string;
  deletedAt?: string | null;
}

export interface Category {
  id: string;
  name: string;
  groupId: string;
  isCustom?: boolean;
  userId?: string | null;
  deletedById?: string;
  deletedAt?: string | null;
}

export type BudgetStatus = 'pending' | 'done' | 'cancelled';

export interface BudgetTransaction {
  id: string;
  name: string;
  plannedAmount: number;
  actualAmount?: number;
  date: string;
  status: BudgetStatus;
  type: TransactionType;
  categoryId: string;
  accountId?: string;
  toAccountId?: string;
  linkedTransactionId?: string;
  tags?: string[];
  tagIds?: string[];
  createdById?: string;
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
  createdById?: string;
  updatedById?: string;
  deletedById?: string;
  deletedAt?: string | null;
}

export interface Tag {
  id: string;
  name: string;
  userId: string;
  color?: string;
  familyId: string;
  deletedById?: string;
  deletedAt?: string | null;
}

export interface Transaction {
  id: string;
  accountId: string;
  toAccountId?: string;
  category: string;
  categoryId?: string;
  categoryGroup: string;
  date: string;
  amount: number;
  fee?: number;
  type: TransactionType;
  description?: string;
  slipImage?: string;
  tags?: string[];
  tagIds?: string[];
  createdById: string;
  updatedById?: string;
  deletedById?: string;
  deletedAt?: string | null;
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
