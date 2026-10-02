"use client";

import { useFinance } from "@/context/FinanceContext";
import styles from "./accounts.module.css";
import Link from "next/link";
import { Wallet, CreditCard, Building2, Utensils, PiggyBank, TrendingUp, ShoppingCart, Gamepad2, Gift, Home as HomeIcon, Car, Zap, Droplet, Heart, Music, Book, Map, DollarSign, RotateCcw, Trash2, Plus, Inbox } from 'lucide-react';
import { useState } from "react";
import AccountFormModal from "@/components/AccountFormModal/AccountFormModal";
import ActionFab, { TransactionType } from "@/components/ActionFab/ActionFab";
import TransactionDetailModal from "@/components/TransactionDetailModal/TransactionDetailModal";
import Money from "@/components/Money/Money";
import { PageGate } from "@/components/PageLoadState";
import type { Account, User } from "@/types";
import { EmptyState } from "@/components/EmptyState/EmptyState";
import { hapticImpact, hapticNotification, hapticSelection } from "@/lib/haptics";

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
  const { accounts, addAccount, addTransaction, updateTransaction, deleteTransaction, currentUser, users, getUserLabel,
    trashedAccounts, fetchTrashedAccounts, restoreAccount, permanentDeleteAccount } = useFinance();
  const [isAddAccountOpen, setIsAddAccountOpen] = useState(false);
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [initialType, setInitialType] = useState<TransactionType>('expense');
  const [tab, setTab] = useState<Tab>('accounts');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmInput, setConfirmInput] = useState('');

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
    hapticImpact('light');
    setInitialType(type);
    setIsTxModalOpen(true);
  };

  const handleTabChange = (newTab: Tab) => {
    hapticSelection();
    setTab(newTab);
    if (newTab === 'trash') fetchTrashedAccounts();
  };

  const myAccounts = accounts.filter(a => a.ownerId === currentUser?.id);
  const myTrashedAccounts = trashedAccounts.filter(a => a.ownerId === currentUser?.id);

  if (!currentUser) return <PageGate />;

  const isParent = currentUser.role === 'parent' || currentUser.isAdmin;

  // ดูบัญชีลูก: parents see the whole family grouped by person.
  const accountGroups: Array<{ user: User; accounts: Account[] }> = isParent
    ? users
      .map(u => ({ user: u, accounts: accounts.filter(a => a.ownerId === u.id) }))
      .filter(g => g.accounts.length > 0)
    : [];

  const renderAccountCard = (account: Account, trashed = false, pressable = false) => {
    const Icon = getIcon(account.icon, account.type);
    const style = {
      '--accent-color': account.color,
    } as React.CSSProperties;
    const card = (
      <>
        <div className={styles.iconBox}>
          <Icon size={22} color="white" strokeWidth={2} />
        </div>
        <div className={styles.info}>
          <div className={styles.name}>{account.name}</div>
          <div className={styles.typeLabel}>{ACCOUNT_TYPE_LABELS[account.type] || account.type}</div>
          <div className={styles.balance}>
            <Money amount={account.balance} />
          </div>
        </div>
      </>
    );
    if (trashed) {
      return (
        <div key={account.id} className={`${styles.card} ${pressable ? 'animPressScale' : ''}`} style={{ ...style, opacity: 0.7 }}>
          {card}
          <div className={styles.trashActions}>
            <button className={`${styles.restoreBtn} animPressScale`} onClick={() => { hapticImpact('light'); restoreAccount(account.id); }} aria-label="กู้คืน">
              <RotateCcw size={18} />
            </button>
            <button className={`${styles.permDeleteBtn} animPressScale`} onClick={() => { hapticImpact('medium'); setConfirmDelete(account.id); }} aria-label="ลบถาวร">
              <Trash2 size={18} />
            </button>
          </div>
        </div>
      );
    }
    return (
      <Link href={`/account/${account.id}`} key={account.id} className={`${styles.card} ${pressable ? 'animPressScale' : ''}`} style={style}>
        {card}
      </Link>
    );
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>บัญชี</h1>
        {tab === 'accounts' && (
          <button onClick={() => { hapticImpact('light'); setIsAddAccountOpen(true); }} className={`${styles.addBtn} animPressScale`}>
            <Plus size={18} />
            สร้างใหม่
          </button>
        )}
      </div>

      {/* Tab Bar */}
      <div className={styles.tabBar}>
        <button
          className={`${styles.tab} ${tab === 'accounts' ? styles.tabActive : ''} animPressScale`}
          onClick={() => handleTabChange('accounts')}
        >
          บัญชี
        </button>
        <button
          className={`${styles.tab} ${tab === 'trash' ? styles.tabActive : ''} animPressScale`}
          onClick={() => handleTabChange('trash')}
        >
          ถังขยะ
        </button>
      </div>

      {tab === 'accounts' ? (
        isParent ? (
          /* ดูบัญชีลูก: family accounts grouped by person */
          accountGroups.length === 0 ? (
            <div className={styles.grid}>
              <EmptyState
                icon={<Inbox size={24} />}
                title="ยังไม่มีบัญชี"
                description="กดสร้างใหม่เพื่อเพิ่มบัญชีแรก"
              />
            </div>
          ) : (
            accountGroups.map(({ user, accounts: memberAccounts }, groupIndex) => {
              const memberTotal = memberAccounts.reduce((sum, a) => sum + a.balance, 0);
              return (
                <div key={user.id} className={`${styles.personSection} animFadeInUp`} style={{ animationDelay: `${groupIndex * 80}ms` }}>
                  <div className={styles.personHeader}>
                    <span className={styles.personName}>{getUserLabel(user.id, user.name)}</span>
                    <span className={styles.personMeta}>
                      {memberAccounts.length} บัญชี · <Money amount={memberTotal} colored={false} />
                    </span>
                  </div>
                  <div className={styles.grid}>
                    {memberAccounts.map(a => renderAccountCard(a, false, true))}
                  </div>
                </div>
              );
            })
          )
        ) : (
          <div className={styles.grid}>
            {myAccounts.length === 0 ? (
              <EmptyState
                icon={<Inbox size={24} />}
                title="ยังไม่มีบัญชี"
                description="กดสร้างใหม่เพื่อเพิ่มบัญชีแรก"
              />
            ) : (
              myAccounts.map(account => renderAccountCard(account, false, true))
            )}
          </div>
        )
      ) : (
        <div className={styles.grid}>
          {myTrashedAccounts.length === 0 ? (
            <EmptyState
              icon={<Inbox size={24} />}
              title="ถังขยะว่างเปล่า"
              description="บัญชีที่ถูกลบจะปรากฏที่นี่"
            />
          ) : (
            myTrashedAccounts.map(account => renderAccountCard(account, true, true))
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
              <p className={styles.confirmHint}>พิมพ์ <strong>ไม่ต้องการบริหารเงิน</strong> เพื่อยืนยัน</p>
              <input
                className={styles.confirmInput}
                type="text"
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder="ไม่ต้องการบริหารเงิน"
                autoFocus
              />
              <div className={styles.confirmActions}>
                <button className={styles.cancelBtnOverlay} onClick={() => { setConfirmDelete(null); setConfirmInput(''); }}>
                  ยกเลิก
                </button>
                <button
                  className={styles.dangerBtnOverlay}
                  disabled={confirmInput !== 'ไม่ต้องการบริหารเงิน'}
                  onClick={async () => {
                    hapticNotification('warning');
                    await permanentDeleteAccount(confirmDelete);
                    hapticNotification('success');
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
          hapticNotification('success');
          setIsAddAccountOpen(false);
        }}
      />

      <TransactionDetailModal
        isOpen={isTxModalOpen}
        onClose={() => setIsTxModalOpen(false)}
        transaction={null}
        initialType={initialType}
        accountId=""
        availableAccounts={accounts}
        isOwner={true}
        onSave={(txData, createdById) => {
          if (txData.id) {
            updateTransaction(txData.id, txData);
          } else {
            addTransaction(txData, createdById);
          }
          setIsTxModalOpen(false);
        }}
        onDelete={deleteTransaction}
      />
    </div>
  );
}
