import { ShoppingCart, Briefcase, ArrowRightLeft, CreditCard, Home, Utensils } from 'lucide-react';
import styles from './TransactionList.module.css';
import { Transaction } from '@/types';

interface TransactionListProps {
  transactions: Transaction[];
  title?: string;
  onTransactionClick?: (transaction: Transaction) => void;
}

import Money from "@/components/Money/Money";

export default function TransactionList({ transactions, title = "Recent Transactions", onTransactionClick }: TransactionListProps) {
  
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

  if (transactions.length === 0) {
    return (
      <div className={styles.container}>
        <h3 className={styles.sectionTitle}>{title}</h3>
        <div className={styles.empty}>No transactions yet.</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      <div className={styles.list}>
        {transactions.map((tx) => {
          const Icon = getIcon(tx.categoryGroup);
          return (
            <div 
              key={tx.id} 
              className={styles.item} 
              onClick={() => onTransactionClick?.(tx)}
              style={{ cursor: onTransactionClick ? 'pointer' : 'default' }}
            >
              <div className={`${styles.iconBox} ${styles[tx.type]}`}>
                <Icon size={20} strokeWidth={2} />
              </div>


              <div className={styles.details}>
                <span className={styles.category}>{tx.category}</span>
                <span className={styles.date}>{tx.date}</span>
              </div>
              <div className={`${styles.amount} ${styles[tx.type + 'Text']}`}>
                {tx.type === 'expense' ? <Money amount={-Math.abs(tx.amount)} /> : 
                 tx.type === 'income' ? <Money amount={Math.abs(tx.amount)} colored={false} /> : 
                 <Money amount={-Math.abs(tx.amount)} colored={false} />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
