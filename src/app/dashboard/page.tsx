"use client";

import { useFinance } from "@/context/FinanceContext";
import styles from "./dashboard.module.css";
import ActionFab, { TransactionType } from "@/components/ActionFab/ActionFab";
import TransactionDetailModal from "@/components/TransactionDetailModal/TransactionDetailModal";
import DashboardFilter from "@/components/DashboardFilter/DashboardFilter";
import { useState, useMemo, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Transaction, DashboardFilters as FilterType } from "@/types";
import { getBangkokHour, formatBangkokDate, getBangkokDate } from "@/lib/timezone";

import VisualizationView from "@/components/VisualizationView/VisualizationView";

import Money from "@/components/Money/Money";

function DashboardContent() {
  const { globalBalance, currentUser, addTransaction, deleteTransaction, accounts, users, getFilteredTransactions } = useFinance();
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [initialType, setInitialType] = useState<TransactionType>('expense');
  const searchParams = useSearchParams();

  // Handle ?action=add from Rich Menu links — auto-open the add modal
  useEffect(() => {
    const action = searchParams.get('action');
    if (action === 'add') {
      setInitialType('expense');
      setSelectedTransaction(null);
      setIsTxModalOpen(true);
    }
  }, [searchParams]);

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

  if (!currentUser) return <div className={styles.loading}>กำลังโหลด...</div>;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.greeting}>{getGreeting()}</div>
        <h1 className={styles.title}>{currentUser.name} <span style={{fontSize: 12, opacity: 0.7}}>({currentUser.role})</span></h1>
        <div className={styles.date}>{formatBangkokDate(new Date())}</div>
      </header>

      <DashboardFilter
        users={users}
        currentUser={currentUser}
        filters={filters}
        onFilterChange={setFilters}
      />



      <div className={styles.balanceCard}>
        <div className={styles.label}>ยอดคงเหลือ</div>
        <div className={styles.amount}>
            <Money amount={dashboardBalance} />
        </div>
      </div>

      <div className={styles.section}>
        <VisualizationView transactions={displayedTransactions} />
      </div>

      <ActionFab onTypeSelect={handleTypeSelect} />

      <TransactionDetailModal
        isOpen={isTxModalOpen}
        onClose={() => setIsTxModalOpen(false)}
        transaction={selectedTransaction}
        initialType={initialType}
        accountId=""
        availableAccounts={accounts}
        isOwner={true}
        onSave={(txData, createdById) => {
           if (selectedTransaction) {
               deleteTransaction(selectedTransaction.id);
           }
           addTransaction(txData, createdById);
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