"use client";

import { useEffect } from 'react';
import { ArrowUpRight, ArrowDownLeft, ArrowRightLeft, X } from 'lucide-react';
import type { TransactionType } from '@/components/ActionFab/ActionFab';
import styles from './TransactionTypeSheet.module.css';

interface TransactionTypeSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (type: TransactionType) => void;
}

const transactionTypes: { type: TransactionType; label: string; description: string; icon: typeof ArrowUpRight; colorVar: string; bgVar: string }[] = [
  { type: 'expense', label: 'รายจ่าย', description: 'เพิ่มค่าใช้จ่าย', icon: ArrowUpRight, colorVar: 'var(--danger)', bgVar: 'var(--danger-bg)' },
  { type: 'income', label: 'รายรับ', description: 'เพิ่มรายได้', icon: ArrowDownLeft, colorVar: 'var(--success)', bgVar: 'var(--success-bg)' },
  { type: 'transfer', label: 'โอนเงิน', description: 'โอนเงินระหว่างบัญชี', icon: ArrowRightLeft, colorVar: 'var(--transfer)', bgVar: 'var(--primary-bg)' },
];

export default function TransactionTypeSheet({ isOpen, onClose, onSelect }: TransactionTypeSheetProps) {
  // Prevent body scroll when sheet is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <div className={styles.handle} />
        <h3 className={styles.title}>เพิ่มรายการ</h3>
        <div className={styles.options}>
          {transactionTypes.map(({ type, label, description, icon: Icon, colorVar, bgVar }) => (
            <button
              key={type}
              className={styles.option}
              style={{ '--option-color': colorVar, '--option-bg': bgVar } as React.CSSProperties}
              onClick={() => {
                onSelect(type);
                onClose();
              }}
            >
              <div className={styles.optionIcon}>
                <Icon size={22} strokeWidth={2.5} />
              </div>
              <div className={styles.optionText}>
                <span className={styles.optionLabel}>{label}</span>
                <span className={styles.optionDesc}>{description}</span>
              </div>
            </button>
          ))}
        </div>
        <button className={styles.cancelBtn} onClick={onClose}>
          <X size={18} />
          ยกเลิก
        </button>
      </div>
    </div>
  );
}