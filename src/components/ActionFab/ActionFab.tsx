"use client";

import { useState } from 'react';
import { Plus, X, ArrowUpRight, ArrowDownLeft, ArrowRightLeft } from 'lucide-react';
import styles from './ActionFab.module.css';

export type TransactionType = 'expense' | 'income' | 'transfer';

const actionLabels: Record<TransactionType, string> = {
  expense: 'รายจ่าย',
  income: 'รายรับ',
  transfer: 'โอน',
};

interface ActionFabProps {
  onTypeSelect?: (type: TransactionType) => void;
  onClick?: () => void;
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
      {isOpen && <div className={styles.backdrop} onClick={() => setIsOpen(false)} />}

      <div className={styles.actions}>
        <button
            className={`${styles.actionBtn} ${styles.bgTransfer}`}
            onClick={() => handleSelect('transfer')}
            aria-label="เพิ่มการโอน"
        >
             <span className={styles.actionLabel}>{actionLabels.transfer}</span>
             <ArrowRightLeft size={20} />
        </button>

        <button
            className={`${styles.actionBtn} ${styles.bgIncome}`}
            onClick={() => handleSelect('income')}
            aria-label="เพิ่มรายรับ"
        >
             <span className={styles.actionLabel}>{actionLabels.income}</span>
             <ArrowDownLeft size={20} />
        </button>

        <button
            className={`${styles.actionBtn} ${styles.bgExpense}`}
            onClick={() => handleSelect('expense')}
            aria-label="เพิ่มรายจ่าย"
        >
             <span className={styles.actionLabel}>{actionLabels.expense}</span>
             <ArrowUpRight size={20} />
        </button>
      </div>

      <button
        className={`${styles.fab} ${isOpen ? styles.fabOpen : ''}`}
        aria-label="เพิ่มรายการ"
        onClick={toggleOpen}
      >
        {isOpen ? <X size={28} strokeWidth={2.5} /> : <Plus size={28} strokeWidth={2.5} />}
      </button>
    </div>
  );
}
