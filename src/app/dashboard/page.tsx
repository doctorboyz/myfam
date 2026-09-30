"use client";

import { useFinance } from "@/context/FinanceContext";
import styles from "./dashboard.module.css";
import ActionFab, { TransactionType } from "@/components/ActionFab/ActionFab";
import TransactionDetailModal from "@/components/TransactionDetailModal/TransactionDetailModal";
import DashboardFilter from "@/components/DashboardFilter/DashboardFilter";
import { useState, useMemo, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Transaction, DashboardFilters as FilterType, Budget } from "@/types";
import { getBangkokHour, formatBangkokDate, formatBangkokShortDate, getBangkokDate } from "@/lib/timezone";
import { ShoppingCart, Briefcase, ArrowRightLeft, CreditCard, Home, Utensils } from "lucide-react";

import VisualizationView from "@/components/VisualizationView/VisualizationView";

import Money from "@/components/Money/Money";
import { PageGate } from "@/components/PageLoadState";

function DashboardContent() {
  const { globalBalance, currentUser, addTransaction, updateTransaction, deleteTransaction, accounts, users, getFilteredTransactions, budgets } = useFinance();
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [initialType, setInitialType] = useState<TransactionType>('expense');
  const searchParams = useSearchParams();
const router = useRouter();

  // Handle ?action=add from Rich Menu links — auto-open the add modal,
  // then strip the param so back-nav doesn't re-open the modal.
  useEffect(() => {
    const action = searchParams.get('action');
    if (action === 'add') {
      setInitialType('expense');
      setSelectedTransaction(null);
      setIsTxModalOpen(true);
      router.replace('/dashboard', { scroll: false });
    }
  }, [searchParams, router]);

  // Initial filters with Default Date Range (This Month) in Bangkok timezone
  const [filters, setFilters] = useState<FilterType>(() => {
      const now = getBangkokDate();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      return {
        users: [],
        dateRange: {
            start: startOfMonth,
            end: endOfMonth
        },
        types: [],
        categories: [],
        accounts: []
      };
  });


  const displayedTransactions = getFilteredTransactions(filters);

  // Calculate specific balance for the filtered view
  const dashboardBalance = useMemo(() => {
     if (filters.users.length > 0) {
         return accounts
            .filter(a => filters.users.includes(a.owner))
            .reduce((sum, acc) => sum + acc.balance, 0);
     }
     return globalBalance;
  }, [accounts, filters.users, globalBalance]);

  // Recent transactions (latest 6) — newest first by date
  const recentTransactions = useMemo(() => {
    return [...displayedTransactions]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 6);
  }, [displayedTransactions]);

  // Active budgets with progress (spending budgets: sum actualAmount / limit)
  const activeBudgets = useMemo(() => {
    return budgets
      .filter((b: Budget) => b.status === 'active')
      .slice(0, 4)
      .map((b: Budget) => {
        const spent = b.items.reduce((sum, it) => sum + (it.actualAmount ?? it.plannedAmount), 0);
        const pct = b.limit > 0 ? Math.min(100, (spent / b.limit) * 100) : 0;
        const over = b.limit > 0 && spent > b.limit;
        return { budget: b, spent, pct, over };
      });
  }, [budgets]);

  const getIcon = (categoryGroup: string) => {
    switch ((categoryGroup || '').toLowerCase()) {
      case 'food': return Utensils;
      case 'income': return Briefcase;
      case 'transfer': return ArrowRightLeft;
      case 'shopping': return ShoppingCart;
      case 'housing': return Home;
      default: return CreditCard;
    }
  };

  const getGreeting = () => {
    const hour = getBangkokHour();
    if (hour < 12) return "สวัสดีตอนเช้า";
    if (hour < 18) return "สวัสดีตอนบ่าย";
    return "สวัสดีตอนเย็น";
  };

  const handleTypeSelect = (type: TransactionType) => {
      setInitialType(type);
      setSelectedTransaction(null);
      setIsTxModalOpen(true);
  };

  if (!currentUser) return <PageGate variant="dashboard" />;

  // Parents manage the whole family's transactions; members their own.
  const isParent = currentUser.role === 'parent' || currentUser.isAdmin;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div className={styles.greeting}>{getGreeting()}</div>
            <h1 className={styles.title}>{currentUser.displayName ?? currentUser.name} <span style={{fontSize: 'var(--font-header)', opacity: 0.7}}>({currentUser.role})</span></h1>
            <div className={styles.date}>{formatBangkokDate(new Date())}</div>
          </div>
        </div>
      </header>

      <DashboardFilter
        users={users}
        currentUser={currentUser}
        filters={filters}
        onFilterChange={setFilters}
      />



      <Link href="/accounts" className={styles.balanceCard} style={{ display: 'block' }}>
        <div className={styles.label}>ยอดคงเหลือ</div>
        <div className={styles.amount}>
            <Money amount={dashboardBalance} />
        </div>
      </Link>

      <div className={styles.section}>
        <VisualizationView transactions={displayedTransactions} />
      </div>

      {/* Active budgets */}
      {activeBudgets.length > 0 && (
        <div className={styles.sectionBlock}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>งบประมาณ</h2>
            <Link href="/budget">ดูทั้งหมด</Link>
          </div>
          <div className={styles.budgetList}>
            {activeBudgets.map(({ budget, spent, pct, over }) => (
              <div key={budget.id} className={styles.budgetCard}>
                <div className={styles.budgetRow}>
                  <span className={styles.budgetTitle}>{budget.title}</span>
                  <span className={styles.budgetAmounts}>
                    <Money amount={spent} colored={false} /> / <Money amount={budget.limit} colored={false} />
                  </span>
                </div>
                <div className={styles.budgetBar}>
                  <div
                    className={`${styles.budgetFill} ${over ? styles.budgetFillOver : ''}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent transactions */}
      <div className={styles.sectionBlock}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>รายการล่าสุด</h2>
          <Link href="/transactions">ดูทั้งหมด</Link>
        </div>
        {recentTransactions.length === 0 ? (
          <div className={styles.emptyHint}>ยังไม่มีรายการในช่วงเวลานี้</div>
        ) : (
          <div className={styles.recentList}>
            {recentTransactions.map(tx => {
              const Icon = getIcon(tx.categoryGroup);
              const iconClass =
                tx.type === 'expense' ? styles.recentIconExpense :
                tx.type === 'income' ? styles.recentIconIncome :
                styles.recentIconTransfer;
              const color =
                tx.type === 'expense' ? 'var(--danger)' :
                tx.type === 'income' ? 'var(--success)' :
                'var(--primary)';
              return (
                <div
                  key={tx.id}
                  className={styles.recentItem}
                  onClick={() => { setSelectedTransaction(tx); setIsTxModalOpen(true); }}
                >
                  <div className={`${styles.recentIcon} ${iconClass}`}>
                    <Icon size={18} strokeWidth={2} />
                  </div>
                  <div className={styles.recentInfo}>
                    <div className={styles.recentCategory}>{tx.description || tx.category}</div>
                    <div className={styles.recentDate}>{formatBangkokShortDate(tx.date)}</div>
                  </div>
                  <div className={styles.recentAmount} style={{ color }}>
                    {tx.type === 'expense' ? <Money amount={-Math.abs(tx.amount)} /> :
                     <Money amount={Math.abs(tx.amount)} colored={false} />}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ActionFab onTypeSelect={handleTypeSelect} />

      <TransactionDetailModal
        isOpen={isTxModalOpen}
        onClose={() => setIsTxModalOpen(false)}
        transaction={selectedTransaction}
        initialType={initialType}
        accountId=""
        availableAccounts={accounts}
        isOwner={isParent || !selectedTransaction || selectedTransaction.createdById === currentUser?.id}
        onSave={(txData, createdById) => {
           if (txData.id) {
               updateTransaction(txData.id, txData);
           } else {
               addTransaction(txData, createdById);
           }
           setIsTxModalOpen(false);
        }}
        onDelete={deleteTransaction}
      />
    </div>
  );
}

export default function Dashboard() {
  return (
    <Suspense fallback={<div className={styles.loading}>กำลังโหลด...</div>}>
      <DashboardContent />
    </Suspense>
  );
}