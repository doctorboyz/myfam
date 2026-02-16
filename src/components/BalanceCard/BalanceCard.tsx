import styles from './BalanceCard.module.css';
import { Settings2 } from 'lucide-react';
import Money from "@/components/Money/Money";

interface BalanceCardProps {
  title?: string;
  balance: number;
  onReconcile?: () => void;
  onEdit?: () => void;
}

export default function BalanceCard({ title = "Total Balance", balance, onReconcile, onEdit }: BalanceCardProps) {
  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <span className={styles.label}>{title}</span>
        {onEdit && (
          <button onClick={onEdit} className={styles.editBtn} aria-label="Edit Account">
            <Settings2 size={16} />
          </button>
        )}
      </div>
      <div className={styles.amount}>
        <Money amount={balance} />
      </div>
      {onReconcile && (
        <button className={styles.reconcileBtn} onClick={onReconcile}>
          Reconcile
        </button>
      )}
    </div>
  );
}
