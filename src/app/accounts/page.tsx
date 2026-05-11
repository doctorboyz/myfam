"use client";

import { useFinance } from "@/context/FinanceContext";
import styles from "./accounts.module.css";
import Link from "next/link";
import { Wallet, CreditCard, Building2, Utensils, PiggyBank, TrendingUp, ShoppingCart, Gamepad2, Gift, Home as HomeIcon, Car, Zap, Droplet, Heart, Music, Book, Map, DollarSign, RotateCcw, Trash2 } from 'lucide-react';
import { useState } from "react";
import AccountFormModal from "@/components/AccountFormModal/AccountFormModal";
import ActionFab, { TransactionType } from "@/components/ActionFab/ActionFab";
import TransactionDetailModal from "@/components/TransactionDetailModal/TransactionDetailModal";
import Money from "@/components/Money/Money";
import { Plus } from "lucide-react";

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  bank: 'บัญชีธนาคาร',
  cash: 'เงินสด',
  credit: 'บัตรเครดิต',
  wallet: 'กระเป๋าเงิน',
  loan: 'เงินกู้',
  invest: 'การลงทุน',
};

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>> = {
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

type Tab = 'accounts' | 'trash';

export default function AccountsPage() {
  const { accounts, addAccount, addTransaction, deleteTransaction, currentUser,
    trashedAccounts, fetchTrashedAccounts, restoreAccount, permanentDeleteAccount } = useFinance();
  const [isAddAccountOpen, setIsAddAccountOpen] = useState(false);
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [initialType, setInitialType] = useState<TransactionType>('expense');
  const [tab, setTab] = useState<Tab>('accounts');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmInput, setConfirmInput] = useState('');

  const myAccounts = accounts.filter(a => a.owner === currentUser?.name);

  const getIcon = (iconName?: string, type?: string) => {
    if (iconName && ICON_MAP[iconName]) return ICON_MAP[iconName];
    switch (type) {
      case 'bank': return Building2;
      case 'cash': return Wallet;
      case 'credit': return CreditCard;
      default: return Wallet;
    }
  };

  const handleTypeSelect = (type: TransactionType) => {
    setInitialType(type);
    setIsTxModalOpen(true);
  };

  const handleTabChange = (newTab: Tab) => {
    setTab(newTab);
    if (newTab === 'trash') fetchTrashedAccounts();
  };

  const myTrashedAccounts = trashedAccounts.filter(a => a.owner === currentUser?.name);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>บัญชี</h1>
        {tab === 'accounts' && (
          <button onClick={() => setIsAddAccountOpen(true)} className={styles.addBtn}>
            <Plus size={18} />
            สร้างใหม่
          </button>
        )}
      </div>

      {/* Tab Bar */}
      <div className={styles.tabBar}>
        <button
          className={`${styles.tab} ${tab === 'accounts' ? styles.tabActive : ''}`}
          onClick={() => handleTabChange('accounts')}
        >
          บัญชี
        </button>
        <button
          className={`${styles.tab} ${tab === 'trash' ? styles.tabActive : ''}`}
          onClick={() => handleTabChange('trash')}
        >
          ถังขยะ
        </button>
      </div>

      {tab === 'accounts' ? (
        <div className={styles.grid}>
          {myAccounts.length === 0 ? (
            <div className={styles.empty}>ยังไม่มีบัญชี กด &quot;สร้างใหม่&quot; เพื่อเพิ่ม</div>
          ) : (
            myAccounts.map((account) => {
              const Icon = getIcon(account.icon, account.type);
              return (
                <Link href={`/account/${account.id}`} key={account.id} className={styles.card} style={{ borderLeftColor: account.color }}>
                  <div className={styles.iconBox} style={{ backgroundColor: account.color }}>
                    <Icon size={24} color="white" />
                  </div>
                  <div className={styles.info}>
                    <div className={styles.name}>{account.name}</div>
                    <div className={styles.typeLabel}>{ACCOUNT_TYPE_LABELS[account.type] || account.type}</div>
                    <div className={styles.balance}>
                      <Money amount={account.balance} />
                    </div>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      ) : (
        <div className={styles.grid}>
          {myTrashedAccounts.length === 0 ? (
            <div className={styles.empty}>ถังขยะว่างเปล่า</div>
          ) : (
            myTrashedAccounts.map((account) => {
              const Icon = getIcon(account.icon, account.type);
              return (
                <div key={account.id} className={styles.card} style={{ borderLeftColor: account.color, opacity: 0.7 }}>
                  <div className={styles.iconBox} style={{ backgroundColor: account.color }}>
                    <Icon size={24} color="white" />
                  </div>
                  <div className={styles.info}>
                    <div className={styles.name}>{account.name}</div>
                    <div className={styles.typeLabel}>{ACCOUNT_TYPE_LABELS[account.type] || account.type}</div>
                    <div className={styles.balance}>
                      <Money amount={account.balance} />
                    </div>
                  </div>
                  <div className={styles.trashActions}>
                    <button className={styles.restoreBtn} onClick={() => restoreAccount(account.id)} aria-label="กู้คืน">
                      <RotateCcw size={16} />
                    </button>
                    <button className={styles.permDeleteBtn} onClick={() => setConfirmDelete(account.id)} aria-label="ลบถาวร">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Permanent Delete Confirmation */}
      {confirmDelete && (() => {
        const account = myTrashedAccounts.find(a => a.id === confirmDelete);
        if (!account) return null;
        return (
          <div className={styles.overlay} onClick={() => { setConfirmDelete(null); setConfirmInput(''); }}>
            <div className={styles.confirmDialog} onClick={(e) => e.stopPropagation()}>
              <h3 className={styles.confirmTitle}>ลบถาวร</h3>
              <p className={styles.confirmText}>
                คุณแน่ใจหรือไม่ที่จะลบ <strong>{account.name}</strong> ถาวร?
              </p>
              <p className={styles.confirmWarning}>
                การดำเนินการนี้ไม่สามารถกู้คืนได้
              </p>
              <p className={styles.confirmHint}>พิมพ์ <strong>ลบ</strong> เพื่อยืนยัน</p>
              <input
                className={styles.confirmInput}
                type="text"
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder="ลบ"
                autoFocus
              />
              <div className={styles.confirmActions}>
                <button className={styles.cancelBtnOverlay} onClick={() => { setConfirmDelete(null); setConfirmInput(''); }}>
                  ยกเลิก
                </button>
                <button
                  className={styles.dangerBtnOverlay}
                  disabled={confirmInput !== 'ลบ'}
                  onClick={async () => {
                    await permanentDeleteAccount(confirmDelete);
                    setConfirmDelete(null);
                    setConfirmInput('');
                  }}
                >
                  ลบถาวร
                </button>
              </div>
            </div>
          </div>
        );
      })()}

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
        transaction={null}
        initialType={initialType}
        accountId=""
        availableAccounts={myAccounts}
        isOwner={true}
        onSave={(txData, createdById) => {
          addTransaction(txData, createdById);
          setIsTxModalOpen(false);
        }}
        onDelete={deleteTransaction}
      />
    </div>
  );
}