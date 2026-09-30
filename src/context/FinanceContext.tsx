"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Account, Transaction, User, DashboardFilters, Category, CategoryGroup, TransactionType, Budget, BudgetTransaction, Tag, UNCATEGORIZED_FILTER } from '@/types';

// API response types (before mapping to frontend types)
interface ApiAccount {
  id: string;
  name: string;
  type: string;
  balance: string | number;
  color: string;
  accountNo?: string;
  ownerId: string;
  status?: string;
  owner?: { id: string; name: string };
}

interface ApiTransaction {
  id: string;
  amount: string | number;
  date: string;
  type: string;
  description?: string;
  accountId?: string;
  toAccountId?: string;
  categoryId?: string;
  category?: { id: string; name: string; group?: { name: string } };
  fee?: string | number;
  totalAmount?: string | number;
  slipImage?: string;
  tags?: string[];
  tagIds?: string[];
  createdById?: string;
}

// ... (Existing MOCK_USERS, INITIAL_ACCOUNTS, INITIAL_TRANSACTIONS remain unchanged) ...
// Instead of modifying existing mock data variables, we keep them as is.

// Mock Data Removed

interface FinanceContextType {
  accounts: Account[];
  allAccounts: Account[]; // ALL accounts (for transfer targets)
  transactions: Transaction[];
  globalBalance: number;
  currentUser: User | null;
  users: User[];
  getUserLabel: (userId: string, fallbackName: string) => string;
  groups: CategoryGroup[];
  categories: Category[];
  isLoading: boolean;
  loadError: string | null;
  /** Full refetch of all finance data (user, accounts, transactions, categories, tags, budgets). */
  refreshData: () => Promise<void>;
  // User Management
  logout: () => Promise<void>;
  addUser: (user: User) => void;
  updateUser: (id: string, updates: Partial<User>) => void;
  removeUser: (id: string) => void;
  refreshUsers: () => Promise<void>;

  getAccountTransactions: (accountId: string) => Transaction[];
  addAccount: (account: Omit<Account, "id" | "balance" | "owner">) => void;
  updateAccount: (id: string, updates: Partial<Account>) => void;
  deleteAccount: (id: string) => void;
  addTransaction: (transaction: Omit<Transaction, "id">, createdById?: string) => void;
  updateTransaction: (id: string, txData: Partial<Transaction>) => void;
  /** Assign one category to many transactions at once; returns rows updated. */
  bulkAssignCategory: (ids: string[], categoryId: string) => Promise<number>;
  deleteTransaction: (id: string) => void;
  getFilteredTransactions: (filters: DashboardFilters) => Transaction[];
  
  // Category Features
  addCategory: (category: Omit<Category, 'id'>) => void;
  updateCategory: (id: string, updates: Partial<Category>) => void;
  deleteCategory: (id: string) => Promise<boolean>;
  addGroup: (group: { name: string; type: TransactionType }) => void;
  updateGroup: (id: string, updates: Partial<CategoryGroup>) => void;
  deleteGroup: (id: string) => void;
  getGroupsByType: (type: TransactionType) => CategoryGroup[];
  getCategoriesByGroup: (groupId: string) => Category[];

  // Tags
  tags: Tag[];
  addTag: (name: string, color?: string) => Promise<Tag | null>;
  updateTag: (id: string, updates: { name?: string; color?: string | null }) => Promise<void>;
  deleteTag: (id: string) => void;

  // Budget Features
  budgets: Budget[];
  addBudget: (budget: Omit<Budget, 'id'>) => void;
  updateBudget: (id: string, updates: Partial<Budget>) => void;
  deleteBudget: (id: string) => void;
  addBudgetTransaction: (budgetId: string, item: Omit<BudgetTransaction, 'id'>) => void;
  updateBudgetTransaction: (budgetId: string, itemId: string, updates: Partial<BudgetTransaction>) => void;
  deleteBudgetTransaction: (budgetId: string, itemId: string) => void;
  fetchAccounts: () => Promise<void>;

  // Soft Delete & Trash
  trashedAccounts: Account[];
  trashedTransactions: Transaction[];
  trashedBudgets: Budget[];
  trashedTags: Tag[];
  fetchTrashedAccounts: () => Promise<void>;
  fetchTrashedTransactions: () => Promise<void>;
  fetchTrashedBudgets: () => Promise<void>;
  fetchTrashedTags: () => Promise<void>;
  restoreAccount: (id: string) => Promise<void>;
  restoreTransaction: (id: string) => Promise<void>;
  restoreBudget: (id: string) => Promise<void>;
  restoreTag: (id: string) => Promise<void>;
  permanentDeleteAccount: (id: string) => Promise<void>;
  permanentDeleteTransaction: (id: string) => Promise<void>;
  permanentDeleteBudget: (id: string) => Promise<void>;
  permanentDeleteTag: (id: string) => Promise<void>;
}

const FinanceContext = createContext<FinanceContextType | undefined>(undefined);

export function FinanceProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [aliases, setAliases] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  
  // Category & Tag State
  const [groups, setGroups] = useState<CategoryGroup[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);

  // Fetch Data
  // - AbortController: a slow fetch must not write stale state after a
  //   re-run or unmount (previous cause of "โหลดไม่เสถียร").
  // - Exposed as refreshData so pages (e.g. /login) can trigger a full
  //   reload after the session changes — the provider survives client-side
  //   navigation, so the mount-only effect never re-ran after login.
  // - loadError: a fetch failure now surfaces as UI state with a retry
  //   instead of an empty page that looks like "no data".
  const abortRef = useRef<AbortController | null>(null);

  const refreshData = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setLoadError(null);

    try {
      // 1. Fetch Current User
      try {
        const userRes = await fetch('/api/auth/me', { signal: controller.signal });
        if (userRes.ok) {
          const userData = await userRes.json();
          setCurrentUser(userData);
        } else {
          // Not authenticated - redirect and stop fetching
          const isPublicRoute = window.location.pathname === '/login';
          if (!isPublicRoute) router.push('/login');
          return;
        }
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        console.error("Auth check failed", error);
        setLoadError('ตรวจสอบสิทธิ์ไม่สำเร็จ');
        return;
      }

      // 2. Fetch Users (family members)
      const usersRes = await fetch('/api/users', { signal: controller.signal });
      if (!usersRes.ok) throw new Error('โหลดรายชื่อสมาชิกไม่สำเร็จ');
      setUsers(await usersRes.json());

      // 2.5. Fetch Aliases for current user (non-critical)
      try {
        const aliasRes = await fetch('/api/users/alias', { signal: controller.signal });
        if (aliasRes.ok) {
          const aliasData = await aliasRes.json();
          if (aliasData.success && aliasData.aliases) {
            const map: Record<string, string> = {};
            aliasData.aliases.forEach((a: { targetId: string; alias: string }) => {
              map[a.targetId] = a.alias;
            });
            setAliases(map);
          }
        }
      } catch (_) { /* non-critical */ }

      // 3. Fetch Accounts
      const accountsRes = await fetch('/api/accounts', { signal: controller.signal });
      if (!accountsRes.ok) throw new Error('โหลดบัญชีไม่สำเร็จ');
      const accountsData = await accountsRes.json();
      const mappedAccounts = accountsData.map((acc: ApiAccount) => ({
          ...acc,
          owner: acc.owner?.name || 'Unknown',
          ownerId: acc.owner?.id || acc.ownerId,
          status: acc.status || 'active',
          balance: Number(acc.balance)
      }));
      setAccounts(mappedAccounts);

      // 4. Fetch Transactions
      const txRes = await fetch('/api/transactions', { signal: controller.signal });
      if (!txRes.ok) throw new Error('โหลดรายการไม่สำเร็จ');
      const txData = await txRes.json();
      // Map Prisma Transaction to Frontend Transaction
      const mappedTx = txData.map((tx: ApiTransaction) => ({
          ...tx,
          categoryGroup: tx.category?.group?.name || 'Unknown',
          categoryId: tx.categoryId || tx.category?.id || null,
          category: tx.category?.name || 'Unknown',
          amount: Number(tx.amount),
          fee: tx.fee ? Number(tx.fee) : 0,
          totalAmount: tx.totalAmount ? Number(tx.totalAmount) : (Number(tx.amount) + Number(tx.fee || 0)),
          tags: tx.tags || [],
          tagIds: tx.tagIds || [],
      }));
      setTransactions(mappedTx);

      // 5. Fetch Categories & Groups
      const catRes = await fetch('/api/categories', { signal: controller.signal });
      if (catRes.ok) {
        const catData = await catRes.json();
        if (catData.groups) setGroups(catData.groups);
        if (catData.categories) setCategories(catData.categories);
      }

      // 6. Fetch Tags
      const tagsRes = await fetch('/api/tags', { signal: controller.signal });
      if (tagsRes.ok) {
        setTags(await tagsRes.json());
      }

      // 7. Fetch Budgets (was a separate mount-only effect that fetched
      //    before auth was known and silently swallowed the 401)
      const budgetRes = await fetch('/api/budgets', { signal: controller.signal });
      if (budgetRes.ok) {
        setBudgets(await budgetRes.json());
      }

    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      console.error("Failed to fetch data", error);
      setLoadError(error instanceof Error ? error.message : 'โหลดข้อมูลไม่สำเร็จ');
    } finally {
      if (abortRef.current === controller) {
        setIsLoading(false);
      }
    }
  }, [router]);

  useEffect(() => {
    refreshData();
    return () => abortRef.current?.abort();
  }, [refreshData]);

  // User CRUD - TODO: Implement API Calls
  const addUser = async (user: User) => {
      // Mock implementation for now to update UI, but should call POST /api/users
      const res = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(user)
      });
      if (res.ok) {
          const newUser = await res.json();
          setUsers(prev => [...prev, newUser]);
      }
  };

  const updateUser = async (id: string, updates: Partial<User>) => {
    // Snapshot for rollback so a failed PATCH never leaves UI and DB out of sync.
    const usersBefore = users;
    const meBefore = currentUser;
    try {
        // Optimistic Update
        setUsers(prev => prev.map(u => u.id === id ? { ...u, ...updates } : u));
        if (currentUser?.id === id) {
            setCurrentUser(prev => prev ? ({ ...prev, ...updates }) : null);
        }

        const res = await fetch(`/api/users/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
        });
        if (!res.ok) throw new Error(`update failed (${res.status})`);
    } catch (error) {
        console.error("Failed to update user", error);
        setUsers(usersBefore);
        if (meBefore) setCurrentUser(meBefore);
    }
  };

  const removeUser = async (id: string) => {
    try {
        setUsers(prev => prev.filter(u => u.id !== id));
        await fetch(`/api/users/${id}`, {
            method: 'DELETE'
        });
    } catch (error) {
        console.error("Failed to delete user", error);
    }
  };

  const refreshUsers = async () => {
    try {
      const res = await fetch('/api/users');
      if (res.ok) setUsers(await res.json());
    } catch (error) {
      console.error("Failed to refresh users", error);
    }
  };

  // Determine which accounts are visible to the current user
  // Parent see all? Or only "Family" + Own? 
  // User request: "Dashboard of parent has filter... Dashboard of child sees only own"
  // This implies Parent has ACCESS to all. Child has ACCESS to only own.
  
  // Actually, let's follow the strict "own only" for child as requested: "access account is own only".
  // BUT "Family" account usually implies shared.
  // Let's stick to: Parent sees ALL. Child sees Own.
  
  const accountsForUser = currentUser ? (currentUser.role === 'parent' ? accounts : accounts.filter(a => a.ownerId === currentUser.id)) : [];

  // Global Balance = Sum of accounts accessible to the user
  const globalBalance = accountsForUser.reduce((sum, acc) => sum + acc.balance, 0);

  const getAccountTransactions = (accountId: string) => {
    return transactions.filter((t) => t.accountId === accountId).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  const addAccount = async (accountData: Omit<Account, "id" | "balance" | "owner">) => {
    if (!currentUser) return;
    
    try {
        const initialBalance = (accountData as any).balance ?? 0;
        const res = await fetch('/api/accounts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...accountData,
                ownerId: currentUser.id, // API expects ownerId
                balance: initialBalance
            })
        });

        if (res.ok) {
            const savedAccount = await res.json();
             // Map back for state
            const mappedAccount: Account = {
                ...savedAccount,
                owner: currentUser.name,
                status: savedAccount.status || 'active'
            };
            setAccounts(prev => [...prev, mappedAccount]);
        }
    } catch (error) {
        console.error("Failed to add account", error);
    }
  };

  const updateAccount = async (id: string, updates: Partial<Account>) => {
    try {
        // Optimistic update
        setAccounts(prev => prev.map((acc) => (acc.id === id ? { ...acc, ...updates } : acc)));

        await fetch(`/api/accounts/${id}`, { // Need to implement this route!
             method: 'PATCH', // or PUT
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify(updates)
        });
    } catch (error) {
        console.error("Failed to update account", error);
        // Revert?
    }
  };

  const deleteAccount = async (id: string) => {
    try {
        await fetch(`/api/accounts/${id}`, { method: 'DELETE' });
        setAccounts(prev => prev.filter((acc) => acc.id !== id));
    } catch (error) {
        console.error("Failed to delete account", error);
    }
  };

    // Helper to refresh accounts
    const fetchAccounts = async () => {
        try {
            const accountsRes = await fetch('/api/accounts');
            const accountsData = await accountsRes.json();
            const mappedAccounts = accountsData.map((acc: ApiAccount) => ({
                ...acc,
                owner: acc.owner?.name || 'Unknown',
                ownerId: acc.owner?.id || acc.ownerId,
                status: acc.status || 'active',
                balance: Number(acc.balance)
            }));
            setAccounts(mappedAccounts);
        } catch (error) {
            console.error("Failed to fetch accounts", error);
        }
    };

  const addTransaction = async (txData: Omit<Transaction, "id">, createdById?: string) => {
    if (!currentUser) return;
    try {
        // Resolve category name to categoryId
        const categoryObj = categories.find(c => c.name === txData.category);
        const categoryId = categoryObj?.id || null;

        const payload = {
            amount: Number(txData.amount),
            date: txData.date,
            type: txData.type,
            description: txData.description,
            accountId: txData.accountId,
            toAccountId: txData.toAccountId || null,
            categoryId: categoryId,
            createdById: createdById || currentUser.id,
            fee: txData.fee ? Number(txData.fee) : 0,
            totalAmount: (Number(txData.amount || 0) + Number(txData.fee || 0)),
            tagIds: txData.tagIds || [],
            slipImage: txData.slipImage || null,
        };

        const res = await fetch('/api/transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            const savedTx = await res.json();
            const newTx: Transaction = {
                ...savedTx,
                category: txData.category,
                categoryGroup: savedTx.category?.group?.name || txData.categoryGroup || 'Unknown',
                amount: Number(savedTx.amount),
                fee: savedTx.fee ? Number(savedTx.fee) : 0,
                totalAmount: savedTx.totalAmount ? Number(savedTx.totalAmount) : (Number(savedTx.amount) + Number(savedTx.fee || 0)),
                tags: savedTx.tags || [],
                tagIds: savedTx.tagIds || [],
            };
            
            setTransactions(prev => [newTx, ...prev]);
            
            // Refresh accounts to get updated balances from backend
            await fetchAccounts();
        }
    } catch (error) {
        console.error("Failed to add transaction", error);
    }
  };


  const deleteTransaction = async (id: string) => {
      try {
          const res = await fetch(`/api/transactions/${id}`, { method: 'DELETE' });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            alert(data.error || 'ไม่สามารถลบรายการนี้ได้');
            return;
          }
          setTransactions(prev => prev.filter(t => t.id !== id));

          // Refresh accounts to get updated balances from backend
          await fetchAccounts();
      } catch (error) {
          console.error("Failed to delete transaction", error);
      }
  };

  const updateTransaction = async (id: string, txData: Partial<Transaction>) => {
    if (!currentUser) return;
    try {
        const categoryObj = txData.category ? categories.find(c => c.name === txData.category) : null;
        const categoryId = categoryObj?.id || null;

        const payload: Record<string, unknown> = {};
        if (txData.amount !== undefined) payload.amount = Number(txData.amount);
        if (txData.date !== undefined) payload.date = txData.date;
        if (txData.type !== undefined) payload.type = txData.type;
        if (txData.description !== undefined) payload.description = txData.description;
        if (txData.accountId !== undefined) payload.accountId = txData.accountId;
        if (txData.toAccountId !== undefined) payload.toAccountId = txData.toAccountId || null;
        if (categoryId !== null && txData.category !== undefined) payload.categoryId = categoryId;
        if (txData.fee !== undefined) payload.fee = Number(txData.fee);
        if (txData.totalAmount !== undefined) payload.totalAmount = Number(txData.totalAmount);
        if (txData.tagIds !== undefined) payload.tagIds = txData.tagIds;
        if (txData.slipImage !== undefined) payload.slipImage = txData.slipImage;

        const res = await fetch(`/api/transactions/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            const updatedTx = await res.json();
            setTransactions(prev => prev.map(t =>
                t.id === id ? {
                    ...t,
                    ...updatedTx,
                    category: txData.category || t.category,
                    categoryGroup: updatedTx.category?.group?.name || t.categoryGroup,
                    amount: Number(updatedTx.amount),
                    fee: updatedTx.fee ? Number(updatedTx.fee) : 0,
                    totalAmount: updatedTx.totalAmount ? Number(updatedTx.totalAmount) : (Number(updatedTx.amount) + Number(updatedTx.fee || 0)),
                } : t
            ));
            await fetchAccounts();
        }
    } catch (error) {
        console.error("Failed to update transaction", error);
    }
  };

  /**
   * Bulk-assign a category via /api/transactions/bulk-category (server
   * enforces family scope + creator-or-parent). Category changes carry no
   * balance effect, so a local state patch is enough — no account refetch.
   */
  const bulkAssignCategory = async (ids: string[], categoryId: string): Promise<number> => {
    if (ids.length === 0) return 0;
    try {
        const res = await fetch('/api/transactions/bulk-category', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids, categoryId })
        });
        if (res.ok) {
            const { updated } = await res.json();
            const cat = categories.find(c => c.id === categoryId);
            const group = cat ? groups.find(g => g.id === cat.groupId) : undefined;
            if (cat) {
                setTransactions(prev => prev.map(t =>
                    ids.includes(t.id)
                        ? {
                            ...t,
                            categoryId: cat.id,
                            category: cat.name,
                            categoryGroup: group?.name || t.categoryGroup,
                        }
                        : t
                ));
            }
            return updated ?? 0;
        }
        return 0;
    } catch (error) {
        console.error("Failed to bulk assign category", error);
        return 0;
    }
  };

  const addGroup = async (group: { name: string; type: TransactionType }) => {
    try {
        const res = await fetch('/api/groups', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(group)
        });
        if (res.ok) {
            const newGroup = await res.json();
            setGroups([...groups, newGroup]);
        }
    } catch (error) {
        console.error("Failed to add group", error);
    }
  };

  const updateGroup = async (id: string, updates: Partial<CategoryGroup>) => {
      try {
          const res = await fetch(`/api/groups/${id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(updates)
          });
          if (res.ok) {
              const updated = await res.json();
              setGroups(groups.map(g => g.id === id ? updated : g));
          }
      } catch (error) {
          console.error("Failed to update group", error);
      }
  };

  const deleteGroup = async (id: string) => {
      try {
          const res = await fetch(`/api/groups/${id}`, { method: 'DELETE' });
          if (res.ok) {
              setGroups(groups.filter(g => g.id !== id));
              // Also remove categories locally to reflect change immediately
              setCategories(categories.filter(c => c.groupId !== id));
          }
      } catch (error) {
           console.error("Failed to delete group", error);
      }
  };

  const getFilteredTransactions = (filters: DashboardFilters) => {
    return transactions.filter(tx => {
       if (!currentUser) return false;
       const account = accounts.find(a => a.id === tx.accountId);
       // Transactions without an account (e.g. planned budget items) stay
       // visible — attribute them to whoever recorded them.
       const ownerId = account ? (account.ownerId || '') : (tx.createdById || '');

       // Parent default = whole family (matching globalBalance); members
       // see their own. Selecting specific users narrows for anyone.
       if (filters.users.length > 0) {
           if (!ownerId || !filters.users.includes(ownerId)) return false;
       } else if (!(currentUser.role === 'parent' || currentUser.isAdmin) && ownerId !== currentUser.id) {
           // No user filter = members see only their own
           return false;
       }
       
       // 2. Type Filter
       if (filters.types.length > 0 && !filters.types.includes(tx.type)) {
           return false;
       }

       // 3. Account Filter
       if (filters.accounts && filters.accounts.length > 0) {
           if (!filters.accounts.includes(tx.accountId)) return false;
       }

       // 4. Category Filter — the filter passes category IDs (see
       // DashboardFilter), so match on categoryId; fall back to the name
       // for rows that predate categoryId on the client shape.
       // UNCATEGORIZED_FILTER is the "ไม่มีหมวดหมู่" pseudo-option.
       if (filters.categories && filters.categories.length > 0) {
           const wantsUncategorized = filters.categories.includes(UNCATEGORIZED_FILTER);
           const hasCategory = !!(tx.categoryId || tx.category);
           if (wantsUncategorized && !hasCategory) {
               // passes — the row is uncategorized and that's what was asked for
           } else if (
               !filters.categories.includes(tx.categoryId || '') &&
               !filters.categories.includes(tx.category)
           ) return false;
       }

       // 4. Date Range
       if (filters.dateRange.start || filters.dateRange.end) {
           const txDate = new Date(tx.date);
           if (filters.dateRange.start && txDate < filters.dateRange.start) return false;
           // End date should be inclusive, set to end of day? 
           // Input type date returns YYYY-MM-DD. 
           // Let's assume simple string comparison or set hours.
           // For simplicity:
            if (filters.dateRange.end) {
                const endDate = new Date(filters.dateRange.end);
                endDate.setHours(23, 59, 59, 999);
                if (txDate > endDate) return false;
            }
            if (filters.dateRange.start) {
                const startDate = new Date(filters.dateRange.start);
                startDate.setHours(0,0,0,0);
                if (txDate < startDate) return false;
            }
       }

       return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  const addCategory = async (category: Omit<Category, 'id'>) => {
    try {
        const res = await fetch('/api/categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...category,
                // If not provided in arg, default logic happens in Modal
                // But modal calls this. So modal should pass userId or we append from currentUser?
                // Modal will decide: 
                // Admin -> can pass null or own id.
                // User -> passes own id.
                // We trust the arg "category" has correct userId property if needed.
                // Type Omit<Category, 'id'> includes userId? 
                // Category interface has userId optional.
            })
        });
        if (res.ok) {
            const newCat = await res.json();
            setCategories([...categories, newCat]);
        }
    } catch (error) {
        console.error("Failed to add category", error);
    }
  };

  const updateCategory = async (id: string, updates: Partial<Category>) => {
      try {
          const res = await fetch(`/api/categories/${id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(updates)
          });
          if (res.ok) {
              const updated = await res.json();
              setCategories(categories.map(c => c.id === id ? updated : c));
          }
      } catch (error) {
          console.error("Failed to update category", error);
      }
  };

  const deleteCategory = async (id: string): Promise<boolean> => {
    try {
        const res = await fetch(`/api/categories/${id}`, { method: 'DELETE' });
        if (res.ok) {
            setCategories(categories.filter(c => c.id !== id));
            return true;
        } else {
            const data = await res.json();
            alert(data.error || 'Failed to delete category');
            return false;
        }
    } catch (error) {
        console.error("Failed to delete category", error);
        return false;
    }
  };

  const getGroupsByType = (type: TransactionType) => {
    return groups.filter(g => g.type === type);
  };

  const getCategoriesByGroup = (groupId: string) => {
    return categories.filter(c => c.groupId === groupId);
  };

  // Tag CRUD
  const addTag = async (name: string, color?: string): Promise<Tag | null> => {
    try {
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color: color || undefined }),
      });
      if (res.ok) {
        const newTag = await res.json();
        setTags(prev => [...prev, newTag]);
        return newTag;
      }
      return null;
    } catch (error) {
      console.error("Failed to add tag", error);
      return null;
    }
  };

  const deleteTag = async (id: string) => {
    try {
      await fetch(`/api/tags/${id}`, { method: 'DELETE' });
      setTags(prev => prev.filter(t => t.id !== id));
    } catch (error) {
      console.error("Failed to delete tag", error);
    }
  };

  const updateTag = async (id: string, updates: { name?: string; color?: string | null }) => {
    try {
      const res = await fetch(`/api/tags/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const updated = await res.json();
        setTags(prev => prev.map(t => t.id === id ? { ...t, ...updated } : t));
      }
    } catch (error) {
      console.error("Failed to update tag", error);
    }
  };

  // Budget State
  const [budgets, setBudgets] = useState<Budget[]>([]);
  // Budgets are fetched inside refreshData (post-auth) — the old separate
  // mount-only effect fired before the session was known and silently
  // swallowed its own 401.

  const addBudget = async (budget: Omit<Budget, 'id'>) => {
    if (!currentUser) return;
    try {
        const payload = { ...budget, createdById: currentUser.id };
        const res = await fetch('/api/budgets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (res.ok) {
          const newBudget = await res.json();
          setBudgets(prev => [...prev, newBudget]);
        }
    } catch (error) {
        console.error("Failed to add budget", error);
    }
  };

  const updateBudget = async (id: string, updates: Partial<Budget>) => {
    try {
        setBudgets(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b)); // Optimistic
        await fetch(`/api/budgets/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
        });
    } catch (error) {
        console.error("Failed to update budget", error);
    }
  };

  const deleteBudget = async (id: string) => {
    try {
        setBudgets(prev => prev.filter(b => b.id !== id)); // Optimistic
        
        // Use API to delete (which handles Archive + Void Pending)
        // If we just remove from state, fine. But we want to persist.
        // Wait, UI expects delete? The requirement is "delete budget". API does "Update to archived". 
        // So optimistic update should probably remove it from the list because GET filters out archived.
        // Yes, filter out is correct.
        
        await fetch(`/api/budgets/${id}`, {
            method: 'DELETE'
        });
    } catch (error) {
        console.error("Failed to delete budget", error);
    }
  };

  // TODO: Implement addBudgetTransaction / update / delete to use API? 
  // Currently they modify local state and `Budget` JSON?
  // Our Schema has `Budget` -> `Transactions`.
  // The API `GET /api/budgets` includes transactions.
  // The backend `Transaction` model has `budgetId`.
  // So adding a budget transaction is actually adding a Transaction with `budgetId`.
  // We need to update `addBudgetTransaction` to call `POST /api/transactions` with `budgetId`.
  // Or create specific endpoints? 
  // `TransactionDetailModal` uses `addTransaction`. 
  // `BudgetTransactionModal` uses `addBudgetTransaction`.
  // Let's make `addBudgetTransaction` call `POST /api/transactions`? 
  // The `BudgetTransaction` type in frontend matches `Transaction` somewhat but has `plannedAmount`.
  // Schema `Transaction` has `planAmount`, `budgetId`.
  // So yes, we should stick to using `Transaction` API but maybe with special handling?
  // Actually, I'll keep the local manipulation for now if I didn't verify that part, BUT user wants "create plan".
  // Plan = Transaction with status='planned'.
  
  // Let's quick-fix `addBudgetTransaction` to use `addTransaction` logic or a new API?
  // `addTransaction` uses `POST /api/transactions`.
  // Let's modify `addBudgetTransaction` to use that.
  
  const addBudgetTransaction = async (budgetId: string, item: Omit<BudgetTransaction, 'id'>) => {
      if (!currentUser) return;

      const payload = {
          amount: item.plannedAmount,
          planAmount: item.plannedAmount,
          date: item.date,
          type: item.type,
          categoryId: item.categoryId,
          budgetId: budgetId,
          status: 'planned',
          description: item.name,
          tagIds: item.tagIds || [],
          createdById: currentUser.id,
      };

      try {
           const res = await fetch('/api/transactions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
           });
           if (res.ok) {
               const newTx = await res.json();
               const newItem: BudgetTransaction = {
                   id: newTx.id,
                   name: newTx.description || '',
                   plannedAmount: Number(newTx.planAmount || newTx.amount),
                   actualAmount: 0,
                   date: newTx.date,
                   status: 'pending',
                   type: newTx.type,
                   categoryId: newTx.categoryId || '',
                   tags: newTx.tags || [],
                   createdById: currentUser.id,
               };

               setBudgets(prev => prev.map(b => b.id === budgetId ? { ...b, items: [...b.items, newItem] } : b));
           }
      } catch (e) {
          console.error("Add budget tx failed", e);
      }
  };

  const updateBudgetTransaction = async (budgetId: string, itemId: string, updates: Partial<BudgetTransaction>) => {
      try {
          const payload: Record<string, string | number | undefined> = {};
          if (updates.name) payload.description = updates.name;
          if (updates.plannedAmount) payload.planAmount = updates.plannedAmount;
          if (updates.date) payload.date = updates.date;

          if (updates.status === 'done') {
              payload.status = 'completed';
              payload.amount = updates.actualAmount;
              payload.accountId = updates.accountId;
              payload.toAccountId = updates.toAccountId;
          } else if (updates.status === 'pending') {
              payload.status = 'planned';
          } else if (updates.status === 'cancelled') {
              payload.status = 'void';
          }

          await fetch(`/api/transactions/${itemId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
          });

          // Refresh both budgets and accounts to reflect balance changes
          const [budgetRes] = await Promise.all([
              fetch('/api/budgets'),
              fetchAccounts(),
          ]);
          if (budgetRes.ok) setBudgets(await budgetRes.json());

          // Also refresh transactions so dashboard stays in sync
          const txRes = await fetch('/api/transactions');
          if (txRes.ok) {
              const txData = await txRes.json();
              const mappedTx = txData.map((tx: ApiTransaction) => ({
                  ...tx,
                  categoryGroup: tx.category?.group?.name || 'Unknown',
                  categoryId: tx.categoryId || tx.category?.id || null,
                  category: tx.category?.name || 'Unknown',
                  amount: Number(tx.amount),
                  tags: tx.tags || [],
                  tagIds: tx.tagIds || [],
              }));
              setTransactions(mappedTx);
          }

      } catch (e) { console.error("Update budget tx failed", e); }
  };

  const deleteBudgetTransaction = async (budgetId: string, itemId: string) => {
       await fetch(`/api/transactions/${itemId}`, { method: 'DELETE' });
       setBudgets(prev => prev.map(b => b.id === budgetId ? { ...b, items: b.items.filter(i => i.id !== itemId) } : b));
  };

  const logout = async () => {
    try {
        await fetch('/api/auth/logout', { method: 'POST' });
        setCurrentUser(null);
        router.push('/login');
    } catch (error) {
        console.error("Logout failed", error);
    }
  };

  // Trash state
  const [trashedAccounts, setTrashedAccounts] = useState<Account[]>([]);
  const [trashedTransactions, setTrashedTransactions] = useState<Transaction[]>([]);
  const [trashedBudgets, setTrashedBudgets] = useState<Budget[]>([]);
  const [trashedTags, setTrashedTags] = useState<Tag[]>([]);

  const fetchTrashedAccounts = async () => {
    try {
      const res = await fetch('/api/accounts/trash');
      if (res.ok) {
        const data = await res.json();
        setTrashedAccounts(data.map((acc: ApiAccount) => ({
          ...acc,
          owner: acc.owner?.name || 'Unknown',
          ownerId: acc.owner?.id || acc.ownerId,
          status: acc.status || 'active',
          balance: Number(acc.balance),
        })));
      }
    } catch (error) { console.error('Failed to fetch trashed accounts', error); }
  };

  const fetchTrashedTransactions = async () => {
    try {
      const res = await fetch('/api/transactions/trash');
      if (res.ok) {
        const data = await res.json();
        setTrashedTransactions(data.map((tx: ApiTransaction) => ({
          ...tx,
          categoryGroup: tx.category?.group?.name || 'Unknown',
          categoryId: tx.categoryId || tx.category?.id || null,
          category: tx.category?.name || 'Unknown',
          amount: Number(tx.amount),
          tags: tx.tags || [],
          tagIds: tx.tagIds || [],
        })));
      }
    } catch (error) { console.error('Failed to fetch trashed transactions', error); }
  };

  const fetchTrashedBudgets = async () => {
    try {
      const res = await fetch('/api/budgets/trash');
      if (res.ok) setTrashedBudgets(await res.json());
    } catch (error) { console.error('Failed to fetch trashed budgets', error); }
  };

  const fetchTrashedTags = async () => {
    try {
      const res = await fetch('/api/tags/trash');
      if (res.ok) setTrashedTags(await res.json());
    } catch (error) { console.error('Failed to fetch trashed tags', error); }
  };

  const restoreAccount = async (id: string) => {
    await fetch(`/api/accounts/${id}/restore`, { method: 'PATCH' });
    setTrashedAccounts(prev => prev.filter(a => a.id !== id));
    await fetchAccounts();
  };

  const restoreTransaction = async (id: string) => {
    await fetch(`/api/transactions/${id}/restore`, { method: 'PATCH' });
    setTrashedTransactions(prev => prev.filter(t => t.id !== id));
    const txRes = await fetch('/api/transactions');
    if (txRes.ok) {
      const txData = await txRes.json();
      setTransactions(txData.map((tx: ApiTransaction) => ({
        ...tx,
        categoryGroup: tx.category?.group?.name || 'Unknown',
        categoryId: tx.categoryId || tx.category?.id || null,
        category: tx.category?.name || 'Unknown',
        amount: Number(tx.amount),
        tags: tx.tags || [],
        tagIds: tx.tagIds || [],
      })));
    }
    await fetchAccounts();
  };

  const restoreBudget = async (id: string) => {
    await fetch(`/api/budgets/${id}/restore`, { method: 'PATCH' });
    setTrashedBudgets(prev => prev.filter(b => b.id !== id));
    const res = await fetch('/api/budgets');
    if (res.ok) setBudgets(await res.json());
  };

  const restoreTag = async (id: string) => {
    await fetch(`/api/tags/${id}/restore`, { method: 'PATCH' });
    setTrashedTags(prev => prev.filter(t => t.id !== id));
    const res = await fetch('/api/tags');
    if (res.ok) setTags(await res.json());
  };

  const permanentDeleteAccount = async (id: string) => {
    await fetch(`/api/accounts/${id}/permanent`, { method: 'DELETE' });
    setTrashedAccounts(prev => prev.filter(a => a.id !== id));
  };

  const permanentDeleteTransaction = async (id: string) => {
    await fetch(`/api/transactions/${id}/permanent`, { method: 'DELETE' });
    setTrashedTransactions(prev => prev.filter(t => t.id !== id));
  };

  const permanentDeleteBudget = async (id: string) => {
    await fetch(`/api/budgets/${id}/permanent`, { method: 'DELETE' });
    setTrashedBudgets(prev => prev.filter(b => b.id !== id));
  };

  const permanentDeleteTag = async (id: string) => {
    await fetch(`/api/tags/${id}/permanent`, { method: 'DELETE' });
    setTrashedTags(prev => prev.filter(t => t.id !== id));
  };

  const getUserLabel = (userId: string, fallbackName: string): string => {
    // 1. Check alias set by current user
    if (aliases[userId]) return aliases[userId];
    // 2. Check target user's displayName
    const targetUser = users.find(u => u.id === userId);
    if (targetUser?.displayName) return targetUser.displayName;
    // 3. Fallback to provided name
    return fallbackName;
  };

  return (
    <FinanceContext.Provider value={{
      accounts: accountsForUser, 
      allAccounts: accounts, // Full list for transfers
      transactions,
      globalBalance,
      currentUser,
      users,
      getUserLabel,
      isLoading,
      loadError,
      refreshData,
      logout,
      addUser,
      updateUser,
      removeUser,
      refreshUsers,
      getAccountTransactions,
      addAccount,
      updateAccount,
      deleteAccount,
      addTransaction,
      updateTransaction,
      bulkAssignCategory,
      deleteTransaction,
      getFilteredTransactions,
      
      groups,
      categories,
      addCategory,
      updateCategory,
      deleteCategory,
      addGroup,
      updateGroup,
      deleteGroup,
      getGroupsByType,
      getCategoriesByGroup,

      // Tags
      tags,
      addTag,
      updateTag,
      deleteTag,

      // Budget
      budgets,
      addBudget,
      updateBudget,
      deleteBudget,
      addBudgetTransaction,
      updateBudgetTransaction,
      deleteBudgetTransaction,
      fetchAccounts,

      // Soft Delete & Trash
      trashedAccounts,
      trashedTransactions,
      trashedBudgets,
      trashedTags,
      fetchTrashedAccounts,
      fetchTrashedTransactions,
      fetchTrashedBudgets,
      fetchTrashedTags,
      restoreAccount,
      restoreTransaction,
      restoreBudget,
      restoreTag,
      permanentDeleteAccount,
      permanentDeleteTransaction,
      permanentDeleteBudget,
      permanentDeleteTag,
    }}>
      {children}
    </FinanceContext.Provider>
  );
}

export function useFinance() {
  const context = useContext(FinanceContext);
  if (context === undefined) {
    throw new Error('useFinance must be used within a FinanceProvider');
  }
  return context;
}
