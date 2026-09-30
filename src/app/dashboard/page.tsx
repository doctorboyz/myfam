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

  // Month navigation — shift the date range a month at a time
  const THAI_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  const monthBase =
    filters.dateRange.start && !isNaN(filters.dateRange.start.getTime())
      ? filters.dateRange.start
      : getBangkokDate();
  const shiftMonth = (delta: number) => {
    const start = new Date(monthBase.getFullYear(), monthBase.getMonth() + delta, 1);
    const end = new Date(monthBase.getFullYear(), monthBase.getMonth() + delta + 1, 0);
    setFilters(f => ({ ...f, dateRange: { start, end } }));
  };
  const resetToThisMonth = () => {
    const now = getBangkokDate();
    setFilters(f => ({
      ...f,
      dateRange: {
        start: new Date(now.getFullYear(), now.getMonth(), 1),
        end: new Date(now.getFullYear(), now.getMonth() + 1, 0),
      },
    }));
  };
  const monthLabel = `${THAI_MONTHS[monthBase.getMonth()]} ${monthBase.getFullYear() + 543}`;

  // Period summary — income / expense / net over the filtered range
  const summary = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const tx of displayedTransactions) {
      if (tx.type === 'income') income += Math.abs(tx.amount);
      else if (tx.type === 'expense') expense += Math.abs(tx.amount);
    }
    return { income, expense, net: income - expense };
  }, [displayedTransactions]);

  // Top expense categories in the filtered range
  const topCategories = useMemo(() => {
    const byCat = new Map<string, number>();
    for (const tx of displayedTransactions) {
      if (tx.type !== 'expense') continue;
      const name = tx.category || 'ไม่มีหมวดหมู่';
      byCat.set(name, (byCat.get(name) || 0) + Math.abs(tx.amount));
    }
    return [...byCat.entries()]
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }, [displayedTransactions]);

  // Per-person breakdown (parents) — same attribution as the transaction filter:
  // the owning account, or whoever recorded an accountless planned item.
  const perPerson = useMemo(() => {
    if (!(currentUser?.role === 'parent' || currentUser?.isAdmin)) return [];
    const by = new Map<string, { label: string; income: number; expense: number }>();
    for (const tx of displayedTransactions) {
      const account = accounts.find(a => a.id === tx.accountId);
      const ownerId = account?.ownerId || tx.createdById;
      if (!ownerId) continue;
      if (!by.has(ownerId)) {
        by.set(ownerId, { label: users.find(u => u.id === ownerId)?.name || 'ไม่ทราบชื่อ', income: 0, expense: 0 });
      }
      const sums = by.get(ownerId)!;
      if (tx.type === 'income') sums.income += Math.abs(tx.amount);
      else if (tx.type === 'expense') sums.expense += Math.abs(tx.amount);
    }
    return [...by.values()].sort((a, b) => b.expense - a.expense);
  }, [displayedTransactions, accounts, users, currentUser]);

  // Rows missing a category — the report validation the family cares about
  const uncategorizedCount = useMemo(
    () => displayedTransactions.filter(tx => !tx.categoryId).length,
    [displayedTransactions]
  );

  // Calculate specific balance for the filtered view
  const dashboardBalance = useMemo(() => {
     if (filters.users.length > 0) {
         return accounts
            .filter(a => filters.users.includes(a.ownerId || ''))
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

  // Active budgets with progress — spending counts only completed items
  // (planned-but-not-done items are intention, not spend), most urgent first
  const activeBudgets = useMemo(() => {
    return budgets
      .filter((b: Budget) => b.status === 'active')
      .map((b: Budget) => {
        const spent = b.items
          .filter((it) => it.status === 'done')
          .reduce((sum, it) => sum + (it.actualAmount || 0), 0);
        const pct = b.limit > 0 ? Math.min(100, (spent / b.limit) * 100) : 0;
        const over = b.limit > 0 && spent > b.limit;
        return { budget: b, spent, pct, over };
      })
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 4);
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

      {/* Month selector */}
      <div className={styles.monthNav}>
        <button className={styles.monthBtn} onClick={() => shiftMonth(-1)} aria-label="เดือนก่อนหน้า">‹</button>
        <span className={styles.monthLabel}>{monthLabel}</span>
        <button className={styles.monthBtn} onClick={() => shiftMonth(1)} aria-label="เดือนถัดไป">›</button>
        <button className={styles.monthNow} onClick={resetToThisMonth}>เดือนนี้</button>
      </div>

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

      {/* Period summary */}
      <div className={styles.summaryTiles}>
        <div className={`${styles.tile} ${styles.tileIncome}`}>
          <div className={styles.tileLabel}>รายรับ</div>
          <div className={styles.tileAmount}><Money amount={summary.income} colored={false} /></div>
        </div>
        <div className={`${styles.tile} ${styles.tileExpense}`}>
          <div className={styles.tileLabel}>รายจ่าย</div>
          <div className={styles.tileAmount}><Money amount={summary.expense} colored={false} /></div>
        </div>
        <div className={styles.tile}>
          <div className={styles.tileLabel}>สุทธิ</div>
          <div className={styles.tileAmount}>
            <Money amount={summary.net} />
          </div>
        </div>
      </div>

      {uncategorizedCount > 0 && (
        <Link href="/transactions" className={styles.uncategorizedChip}>
          ⚠️ {uncategorizedCount} รายการยังไม่มีหมวดหมู่ — แตะเพื่อจัดการ
        </Link>
      )}

      <div className={styles.section}>
        <VisualizationView transactions={displayedTransactions} />
      </div>

      {/* Top expense categories */}
      {topCategories.length > 0 && (
        <div className={styles.sectionBlock}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>หมวดหมู่ที่ใช้มากสุด</h2>
          </div>
          <div className={styles.topCatList}>
            {topCategories.map((cat, i) => {
              const pct = summary.expense > 0 ? (cat.amount / summary.expense) * 100 : 0;
              return (
                <div key={cat.name} className={styles.topCatItem}>
                  <span className={styles.topCatRank}>{i + 1}</span>
                  <span className={styles.topCatName}>{cat.name}</span>
                  <div className={styles.topCatBar}>
                    <div className={styles.topCatFill} style={{ width: `${pct}%` }} />
                  </div>
                  <span className={styles.topCatAmount}><Money amount={cat.amount} colored={false} /></span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Per-person breakdown (parents) */}
      {perPerson.length > 0 && (
        <div className={styles.sectionBlock}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>รายได้–จ่ายแยกตามคน</h2>
          </div>
          <div className={styles.personList}>
            {perPerson.map(p => (
              <div key={p.label} className={styles.personRow}>
                <span className={styles.personName}>{p.label}</span>
                <span className={`${styles.personIn} `}>+<Money amount={p.income} colored={false} /></span>
                <span className={styles.personOut}>-<Money amount={p.expense} colored={false} /></span>
                <span className={styles.personNet}>
                  สุทธิ <Money amount={p.income - p.expense} colored={false} />
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

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