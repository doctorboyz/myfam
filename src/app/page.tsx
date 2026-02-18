"use client";

import { useFinance } from "@/context/FinanceContext";
import styles from "./page.module.css";
import Link from "next/link";
import { Wallet, CreditCard, Building2, Utensils, PiggyBank, TrendingUp, ShoppingCart, Gamepad2, Gift, Home as HomeIcon, Car, Zap, Droplet, Heart, Music, Book, Map, DollarSign } from 'lucide-react';
import { useState } from "react";
import AccountFormModal from "@/components/AccountFormModal/AccountFormModal";
import ActionFab, { TransactionType } from "@/components/ActionFab/ActionFab";

import TransactionDetailModal from "@/components/TransactionDetailModal/TransactionDetailModal";
import Money from "@/components/Money/Money";

// Icon mapping
const ICON_MAP: Record<string, React.ComponentType<any>> = {
  'Wallet': Wallet,
  'CreditCard': CreditCard,
  'PiggyBank': PiggyBank,
  'TrendingUp': TrendingUp,
  'UtensilsCrossed': Utensils,
  'Dumbbell': Building2,
  'ShoppingCart': ShoppingCart,
  'Gamepad2': Gamepad2,
  'Gift': Gift,
  'Home': HomeIcon,
  'Car': Car,
  'Zap': Zap,
  'Droplet': Droplet,
  'Heart': Heart,
  'Music': Music,
  'Book': Book,
  'Map': Map,
  'DollarSign': DollarSign,
};

export default function Home() {
  const { accounts, addAccount, addTransaction, deleteTransaction, currentUser } = useFinance();
  const [isAddAccountOpen, setIsAddAccountOpen] = useState(false);

  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [initialType, setInitialType] = useState<TransactionType>('expense');

  // Filter accounts for the current user
  const myAccounts = accounts.filter(a => a.owner === currentUser?.name);

  const getIcon = (iconName?: string, type?: string) => {
    // Use account's icon if available
    if (iconName && ICON_MAP[iconName]) {
      return ICON_MAP[iconName];
    }
    // Fall back to type-based icon
    switch (type) {
      case 'bank': return Building2;
      case 'cash': return Wallet;
      case 'credit': return CreditCard;
      default: return Utensils;
    }
  };

  const handleTypeSelect = (type: TransactionType) => {
      setInitialType(type);
      setIsTxModalOpen(true);
  };

  return (
    <div className={styles.container}>
      
      <div className={styles.grid}>
        {myAccounts.map((account) => {
          const Icon = getIcon(account.icon, account.type);
          return (
            <Link href={`/account/${account.id}`} key={account.id} className={styles.card} style={{ borderLeftColor: account.color }}>
              <div className={styles.iconBox} style={{ backgroundColor: account.color }}>
                 <Icon size={24} color="white" />
              </div>
              <div className={styles.info}>
                <div className={styles.name}>{account.name}</div>
                <div className={styles.balance}>
                  <Money amount={account.balance} />
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      <ActionFab onTypeSelect={handleTypeSelect} />

      <AccountFormModal 
        isOpen={isAddAccountOpen}
        onClose={() => setIsAddAccountOpen(false)}
        onSave={(data) => {
          addAccount(data);
          setIsAddAccountOpen(false);
        }}
      />

      <TransactionDetailModal 
        isOpen={isTxModalOpen}
        onClose={() => setIsTxModalOpen(false)}
        transaction={null} // Always adding new
        initialType={initialType}
        accountId="" 
        availableAccounts={myAccounts}
        isOwner={true} 
        onSave={(txData) => {
           addTransaction(txData);
           setIsTxModalOpen(false);
        }}
        onDelete={deleteTransaction}
      />
    </div>
  );
}
