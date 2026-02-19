"use client";

import { useFinance } from "@/context/FinanceContext";
import styles from "./dashboard.module.css";
import ActionFab, { TransactionType } from "@/components/ActionFab/ActionFab";
import TransactionDetailModal from "@/components/TransactionDetailModal/TransactionDetailModal";
import DashboardFilter from "@/components/DashboardFilter/DashboardFilter";
import { useState, useMemo } from "react";
import { Transaction, DashboardFilters as FilterType } from "@/types";

import VisualizationView from "@/components/VisualizationView/VisualizationView";

import Money from "@/components/Money/Money";

export default function Dashboard() {
  const { globalBalance, transactions, currentUser, addTransaction, deleteTransaction, accounts, users, getFilteredTransactions } = useFinance();
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [initialType, setInitialType] = useState<TransactionType>('expense');
  // Initial filters with Default Date Range (This Month)
  const [filters, setFilters] = useState<FilterType>(() => {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      
      // Fix: DateRange type expects Date | null, but we were passing strings.
      // However, the previous code initialized with null.
      // Let's check FilterType definition in types/index.ts.
      // It says: dateRange: { start: Date | null, end: Date | null }
      
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
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  const handleTypeSelect = (type: TransactionType) => {
      setInitialType(type);
      setSelectedTransaction(null);
      setIsTxModalOpen(true);
  };

  // Removed User Switcher


  if (!currentUser) return <div className={styles.loading}>Loading...</div>;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.greeting}>{getGreeting()}</div>
        <h1 className={styles.title}>{currentUser.name} <span style={{fontSize: 12, opacity: 0.7}}>({currentUser.role})</span></h1>
        <div className={styles.date}>{new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      </header>

      <DashboardFilter 
        users={users} 
        currentUser={currentUser} 
        filters={filters} 
        onFilterChange={setFilters} 
      />



      <div className={styles.balanceCard}>
        <div className={styles.label}>Total Balance</div>
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
        availableAccounts={accounts} // accounts is already filtered by context for availability
        isOwner={true} // Allow edits for now if visible
        onSave={(txData) => {
           if (selectedTransaction) {
               deleteTransaction(selectedTransaction.id);
           }
           addTransaction(txData);
           setIsTxModalOpen(false);
        }}
        onDelete={deleteTransaction}
      />
    </div>
  );
}
