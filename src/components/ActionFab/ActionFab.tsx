"use client";

import { useState } from 'react';
import { Plus, X, ArrowUpRight, ArrowDownLeft, ArrowRightLeft } from 'lucide-react';
import styles from './ActionFab.module.css';

export type TransactionType = 'expense' | 'income' | 'transfer';

interface ActionFabProps {
  onTypeSelect?: (type: TransactionType) => void;
  onClick?: () => void; // Fallback for simple click if needed
}

export default function ActionFab({ onTypeSelect, onClick }: ActionFabProps) {
  const [isOpen, setIsOpen] = useState(false);

  const toggleOpen = () => {
      setIsOpen(!isOpen);
      if (onClick && !onTypeSelect) onClick();
  }

  const handleSelect = (type: TransactionType) => {
    if (onTypeSelect) {
        onTypeSelect(type);
    }
    setIsOpen(false);
  };

  return (
    <div className={`${styles.container} ${isOpen ? styles.open : ''}`}>
      {/* Backdrop for clicking outside */}
      {isOpen && <div className={styles.backdrop} onClick={() => setIsOpen(false)} />}
      
      {/* Sub Actions */}
      <div className={styles.actions}>
        <button 
            className={`${styles.actionBtn} ${styles.bgTransfer}`} 
            onClick={() => handleSelect('transfer')}
            aria-label="New Transfer"
        >
             <span className={styles.actionLabel}>Transfer</span>
             <ArrowRightLeft size={20} />
        </button>
        
        <button 
            className={`${styles.actionBtn} ${styles.bgIncome}`} 
            onClick={() => handleSelect('income')}
            aria-label="New Income"
        >
             <span className={styles.actionLabel}>Income</span>
             <ArrowDownLeft size={20} />
        </button>
        
        <button 
            className={`${styles.actionBtn} ${styles.bgExpense}`} 
            onClick={() => handleSelect('expense')}
            aria-label="New Expense"
        >
             <span className={styles.actionLabel}>Expense</span>
             <ArrowUpRight size={20} />
        </button>
      </div>

      {/* Main Trigger */}
      <button 
        className={`${styles.fab} ${isOpen ? styles.fabOpen : ''}`} 
        aria-label="Add Transaction" 
        onClick={toggleOpen}
      >
        {isOpen ? <X size={28} strokeWidth={2.5} /> : <Plus size={28} strokeWidth={2.5} />}
      </button>
    </div>
  );
}
