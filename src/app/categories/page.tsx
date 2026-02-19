"use client";

import { useState, useMemo } from "react";
import { useFinance } from "@/context/FinanceContext";
import { Transaction, DashboardFilters as FilterType, TransactionType } from "@/types";
import { ChevronDown, ChevronRight, ShoppingCart, Briefcase, ArrowRightLeft, CreditCard, Home, Utensils } from "lucide-react";
import DashboardFilter from "@/components/DashboardFilter/DashboardFilter";
import TransactionDetailModal from "@/components/TransactionDetailModal/TransactionDetailModal";
import ActionFab, { TransactionType as FabType } from "@/components/ActionFab/ActionFab";
import Money from "@/components/Money/Money";
import styles from "./history.module.css";

export default function HistoryPage() {
  const { transactions, currentUser, users, accounts, addTransaction, deleteTransaction, getFilteredTransactions } = useFinance();
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set(['expense', 'income', 'transfer']));
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [initialType, setInitialType] = useState<FabType>('expense');

  const [filters, setFilters] = useState<FilterType>(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
      users: [],
      dateRange: { start: startOfMonth, end: endOfMonth },
      types: [],
      categories: [],
      accounts: []
    };
  });

  const displayedTransactions = getFilteredTransactions(filters);

  const grouped = useMemo(() => {
    const groups: Record<TransactionType, Transaction[]> = {
      income: [],
      expense: [],
      transfer: [],
    };
    displayedTransactions.forEach(tx => {
      if (groups[tx.type]) {
        groups[tx.type].push(tx);
      }
    });
    return groups;
  }, [displayedTransactions]);

  const getTotal = (txs: Transaction[]) => txs.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

  const toggleType = (type: string) => {
    const next = new Set(expandedTypes);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    setExpandedTypes(next);
  };

  const getIcon = (categoryGroup: string) => {
    switch (categoryGroup.toLowerCase()) {
      case 'food': return Utensils;
      case 'income': return Briefcase;
      case 'transfer': return ArrowRightLeft;
      case 'shopping': return ShoppingCart;
      case 'housing': return Home;
      default: return CreditCard;
    }
  };

  const typeConfig: Record<string, { label: string; color: string; sign: string }> = {
    income: { label: 'Income', color: 'var(--success)', sign: '+' },
    expense: { label: 'Expense', color: 'var(--danger)', sign: '-' },
    transfer: { label: 'Transfer', color: 'var(--primary)', sign: '' },
  };

  if (!currentUser) return <div style={{ padding: 20 }}>Loading...</div>;

  return (
    <div className={styles.container}>
      <DashboardFilter
        users={users}
        currentUser={currentUser}
        filters={filters}
        onFilterChange={setFilters}
      />

      <div className={styles.content}>
        {(['income', 'expense', 'transfer'] as TransactionType[]).map(type => {
          const txs = grouped[type];
          const isExpanded = expandedTypes.has(type);
          const config = typeConfig[type];
          const total = getTotal(txs);

          return (
            <div key={type} className={styles.group}>
              <div className={styles.groupHeader} onClick={() => toggleType(type)}>
                <div className={styles.headerLeft}>
                  <div className={`${styles.dot}`} style={{ background: config.color }} />
                  <span className={styles.groupTitle}>{config.label}</span>
                  <span className={styles.groupCount}>{txs.length}</span>
                </div>
                <div className={styles.headerRight}>
                  <span className={styles.groupTotal} style={{ color: config.color }}>
                    {config.sign}<Money amount={total} colored={false} />
                  </span>
                  {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                </div>
              </div>

              {isExpanded && (
                <div className={styles.txList}>
                  {txs.length === 0 ? (
                    <div className={styles.empty}>No {type} transactions</div>
                  ) : (
                    txs.map(tx => {
                      const Icon = getIcon(tx.categoryGroup);
                      return (
                        <div
                          key={tx.id}
                          className={styles.txItem}
                          onClick={() => { setSelectedTransaction(tx); setIsTxModalOpen(true); }}
                        >
                          <div className={`${styles.iconBox} ${styles[type]}`}>
                            <Icon size={20} strokeWidth={2} />
                          </div>
                          <div className={styles.txDetails}>
                            <span className={styles.txCategory}>{tx.category}</span>
                            <span className={styles.txDate}>{tx.date}</span>
                          </div>
                          <div className={styles.txAmount} style={{ color: config.color }}>
                            {type === 'expense' ? <Money amount={-Math.abs(tx.amount)} /> :
                             type === 'income' ? <Money amount={Math.abs(tx.amount)} colored={false} /> :
                             <Money amount={Math.abs(tx.amount)} colored={false} />}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <ActionFab onTypeSelect={(type) => {
        setInitialType(type);
        setSelectedTransaction(null);
        setIsTxModalOpen(true);
      }} />

      <TransactionDetailModal
        isOpen={isTxModalOpen}
        onClose={() => setIsTxModalOpen(false)}
        transaction={selectedTransaction}
        initialType={initialType}
        accountId=""
        availableAccounts={accounts}
        isOwner={true}
        onSave={(txData) => {
          if (selectedTransaction) deleteTransaction(selectedTransaction.id);
          addTransaction(txData);
          setIsTxModalOpen(false);
        }}
        onDelete={deleteTransaction}
      />
    </div>
  );
}
