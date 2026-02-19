"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Account, Transaction, User, DashboardFilters, Category, CategoryGroup, TransactionType, Budget, BudgetTransaction } from '@/types';

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
  owner?: { name: string };
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
  slipImage?: string;
  tags?: string[];
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
  groups: CategoryGroup[];
  categories: Category[];
  isLoading: boolean;
  // User Management
  logout: () => Promise<void>;
  addUser: (user: User) => void;
  updateUser: (id: string, updates: Partial<User>) => void;
  removeUser: (id: string) => void;

  getAccountTransactions: (accountId: string) => Transaction[];
  addAccount: (account: Omit<Account, "id" | "balance" | "owner">) => void;
  updateAccount: (id: string, updates: Partial<Account>) => void;
  deleteAccount: (id: string) => void;
  addTransaction: (transaction: Omit<Transaction, "id">) => void;
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

  // Budget Features
  budgets: Budget[];
  addBudget: (budget: Omit<Budget, 'id'>) => void;
  updateBudget: (id: string, updates: Partial<Budget>) => void;
  deleteBudget: (id: string) => void;
  addBudgetTransaction: (budgetId: string, item: Omit<BudgetTransaction, 'id'>) => void;
  updateBudgetTransaction: (budgetId: string, itemId: string, updates: Partial<BudgetTransaction>) => void;
  deleteBudgetTransaction: (budgetId: string, itemId: string) => void;
  fetchAccounts: () => Promise<void>;
}

const FinanceContext = createContext<FinanceContextType | undefined>(undefined);

export function FinanceProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null); 
  const [isLoading, setIsLoading] = useState(true);
  
  // Category State
  const [groups, setGroups] = useState<CategoryGroup[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  // Fetch Data
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        // 1. Fetch Current User
        try {
            const userRes = await fetch('/api/auth/me');
            if (userRes.ok) {
                const userData = await userRes.json();
                setCurrentUser(userData);
            } else {
                // Not authenticated - redirect and stop fetching
                const isPublicRoute = window.location.pathname === '/login';
                if (!isPublicRoute) router.push('/login');
                setIsLoading(false);
                return;
            }
        } catch (error) {
            console.error("Auth check failed", error);
            setIsLoading(false);
            return;
        }

        // 2. Fetch Users (family members)
        const usersRes = await fetch('/api/users');
        if (usersRes.ok) {
          const usersData = await usersRes.json();
          setUsers(usersData);
        }

        // 3. Fetch Accounts
        const accountsRes = await fetch('/api/accounts');
        const accountsData = await accountsRes.json();
        const mappedAccounts = accountsData.map((acc: ApiAccount) => ({
            ...acc,
            owner: acc.owner?.name || 'Unknown',
            status: acc.status || 'active',
            balance: Number(acc.balance)
        }));
        setAccounts(mappedAccounts);

        // 4. Fetch Transactions
        const txRes = await fetch('/api/transactions');
        const txData = await txRes.json();
        // Map Prisma Transaction to Frontend Transaction
        const mappedTx = txData.map((tx: ApiTransaction) => ({
            ...tx,
            categoryGroup: tx.category?.group?.name || 'Unknown',
            categoryId: tx.categoryId || tx.category?.id || null,
            category: tx.category?.name || 'Unknown',
            amount: Number(tx.amount),
            tags: tx.tags || [],
        }));
        setTransactions(mappedTx);

        // 5. Fetch Categories & Groups
        const catRes = await fetch('/api/categories');
        const catData = await catRes.json();
        if (catData.groups) setGroups(catData.groups);
        if (catData.categories) setCategories(catData.categories);

      } catch (error) {
        console.error("Failed to fetch data", error);
      } finally {
        setIsLoading(false);
        }
    };

    fetchData();
  }, [router]);

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
          setUsers([...users, newUser]);
      }
  };

  const updateUser = async (id: string, updates: Partial<User>) => {
    try {
        // Optimistic Update
        setUsers(users.map(u => u.id === id ? { ...u, ...updates } : u));
        if (currentUser?.id === id) {
            setCurrentUser(prev => prev ? ({ ...prev, ...updates }) : null);
        }

        await fetch(`/api/users/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
        });
    } catch (error) {
        console.error("Failed to update user", error);
        // TODO: Revert on error
    }
  };

  const removeUser = async (id: string) => {
    try {
        setUsers(users.filter(u => u.id !== id));
        await fetch(`/api/users/${id}`, {
            method: 'DELETE'
        });
    } catch (error) {
        console.error("Failed to delete user", error);
    }
  };

  // Determine which accounts are visible to the current user
  // Parent see all? Or only "Family" + Own? 
  // User request: "Dashboard of parent has filter... Dashboard of child sees only own"
  // This implies Parent has ACCESS to all. Child has ACCESS to only own.
  
  // Actually, let's follow the strict "own only" for child as requested: "access account is own only".
  // BUT "Family" account usually implies shared.
  // Let's stick to: Parent sees ALL. Child sees Own.
  
  const accountsForUser = currentUser ? (currentUser.role === 'parent' ? accounts : accounts.filter(a => a.owner === currentUser.name)) : [];

  // Global Balance = Sum of accounts accessible to the user
  const globalBalance = accountsForUser.reduce((sum, acc) => sum + acc.balance, 0);

  const getAccountTransactions = (accountId: string) => {
    return transactions.filter((t) => t.accountId === accountId).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  const addAccount = async (accountData: Omit<Account, "id" | "balance" | "owner">) => {
    if (!currentUser) return;
    
    try {
        const res = await fetch('/api/accounts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...accountData,
                ownerId: currentUser.id, // API expects ownerId
                balance: 0
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
            setAccounts([...accounts, mappedAccount]);
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
        setAccounts(accounts.filter((acc) => acc.id !== id));
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
                status: acc.status || 'active'
            }));
            setAccounts(mappedAccounts);
        } catch (error) {
            console.error("Failed to fetch accounts", error);
        }
    };

  const addTransaction = async (txData: Omit<Transaction, "id">) => {
    if (!currentUser) return;
    try {
        // Resolve category name to categoryId
        const categoryObj = categories.find(c => c.name === txData.category);
        const categoryId = categoryObj?.id || null;

        const payload = {
            amount: Number(txData.amount),
            date: txData.date,
            type: txData.type,
            description: txData.note,
            accountId: txData.accountId,
            toAccountId: txData.toAccountId || null,
            categoryId: categoryId,
            createdById: currentUser.id,
            fee: txData.fee ? Number(txData.fee) : 0,
            tags: txData.tags || [],
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
                tags: savedTx.tags || []
            };
            
            setTransactions([newTx, ...transactions]);
            
            // Refresh accounts to get updated balances from backend
            await fetchAccounts();
        }
    } catch (error) {
        console.error("Failed to add transaction", error);
    }
  };


  const deleteTransaction = async (id: string) => {
      try {
          await fetch(`/api/transactions/${id}`, { method: 'DELETE' });
          setTransactions(transactions.filter(t => t.id !== id));
          
          // Refresh accounts to get updated balances from backend
          await fetchAccounts();
      } catch (error) {
          console.error("Failed to delete transaction", error);
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
       if (!account) return false;

       // Default: show only current user's account transactions
       // Parent can see others by explicitly selecting users in filter
       if (filters.users.length > 0) {
           if (!filters.users.includes(account.owner)) return false;
       } else {
           // No user filter = show only own transactions
           if (account.owner !== currentUser.name) return false;
       }
       
       // 2. Type Filter
       if (filters.types.length > 0 && !filters.types.includes(tx.type)) {
           return false;
       }

       // 3. Account Filter
       if (filters.accounts && filters.accounts.length > 0) {
           if (!filters.accounts.includes(tx.accountId)) return false;
       }

       // 4. Category Filter
       if (filters.categories && filters.categories.length > 0) {
           // We filter by Category ID stored in transaction
           // Note: Mock data might have Names, but new data has IDs. 
           // Let's assume strict ID matching. If Mock data uses Names, this might break mock data filtering 
           // if we filter by ID. 
           // However, categories passed in filter are likely IDs from the Category objects.
           // Let's handle both for now? Or just assume ID.
           // Given we refactored categories, we should trust IDs.
           if (!filters.categories.includes(tx.category)) return false;
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

  // Budget State
  const [budgets, setBudgets] = useState<Budget[]>([]);

  // Fetch Budgets on Load
  useEffect(() => {
      const fetchBudgets = async () => {
          try {
              const res = await fetch('/api/budgets');
              if (res.ok) {
                  const data = await res.json();
                  setBudgets(data);
              }
          } catch (error) {
              console.error("Failed to fetch budgets", error);
          }
      };
      fetchBudgets();
  }, []);

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
            setBudgets([...budgets, newBudget]);
        }
    } catch (error) {
        console.error("Failed to add budget", error);
    }
  };

  const updateBudget = async (id: string, updates: Partial<Budget>) => {
    try {
        setBudgets(budgets.map(b => b.id === id ? { ...b, ...updates } : b)); // Optimistic
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
        setBudgets(budgets.filter(b => b.id !== id)); // Optimistic
        
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
          date: item.date,
          type: item.type,
          categoryId: item.categoryId,
          budgetId: budgetId,
          status: 'planned',
          description: item.name,
          tags: item.tags || [],
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
                   tags: newTx.tags || []
               };

               setBudgets(budgets.map(b => b.id === budgetId ? { ...b, items: [...b.items, newItem] } : b));
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
              }));
              setTransactions(mappedTx);
          }

      } catch (e) { console.error("Update budget tx failed", e); }
  };

  const deleteBudgetTransaction = async (budgetId: string, itemId: string) => {
       await fetch(`/api/transactions/${itemId}`, { method: 'DELETE' });
       setBudgets(budgets.map(b => b.id === budgetId ? { ...b, items: b.items.filter(i => i.id !== itemId) } : b));
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

  return (
    <FinanceContext.Provider value={{
      accounts: accountsForUser, 
      allAccounts: accounts, // Full list for transfers
      transactions,
      globalBalance,
      currentUser,
      users,
      isLoading,
      logout,
      addUser,
      updateUser,
      removeUser,
      getAccountTransactions,
      addAccount,
      updateAccount,
      deleteAccount,
      addTransaction,
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

      // Budget
      budgets,
      addBudget,
      updateBudget,
      deleteBudget,
      addBudgetTransaction,
      updateBudgetTransaction,
      deleteBudgetTransaction,
      fetchAccounts,
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
