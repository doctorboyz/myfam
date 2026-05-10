"use client";

import { useState } from 'react';
import { Plus } from 'lucide-react';
import TransactionTypeSheet from '@/components/TransactionTypeSheet/TransactionTypeSheet';
import styles from './ActionFab.module.css';

export type TransactionType = 'expense' | 'income' | 'transfer';

interface ActionFabProps {
  onTypeSelect?: (type: TransactionType) => void;
  onClick?: () => void;
}

export default function ActionFab({ onTypeSelect, onClick }: ActionFabProps) {
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const handleOpen = () => {
    if (onTypeSelect) {
      setIsSheetOpen(true);
    } else if (onClick) {
      onClick();
    }
  };

  const handleSelect = (type: TransactionType) => {
    onTypeSelect?.(type);
  };

  return (
    <>
      <button
        className={styles.fab}
        onClick={handleOpen}
        aria-label="เพิ่มรายการ"
      >
        <Plus size={28} strokeWidth={2.5} />
      </button>

      <TransactionTypeSheet
        isOpen={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
        onSelect={handleSelect}
      />
    </>
  );
}