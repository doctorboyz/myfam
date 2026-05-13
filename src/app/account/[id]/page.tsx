"use client";

import React from "react";
import { use, useState, useEffect, useCallback } from "react";
import { useFinance } from "@/context/FinanceContext";
import BalanceCard from "@/components/BalanceCard/BalanceCard";
import TransactionList from "@/components/TransactionList/TransactionList";
import ReconcileModal from "@/components/ReconcileModal/ReconcileModal";
import AccountFormModal from "@/components/AccountFormModal/AccountFormModal";
import TransactionDetailModal from "@/components/TransactionDetailModal/TransactionDetailModal";
import { Transaction } from "@/types";
import ActionFab, { TransactionType } from "@/components/ActionFab/ActionFab";
import Money from "@/components/Money/Money";
import { formatBangkokShortDate, formatBangkokTime } from "@/lib/timezone";
import { Wallet, CreditCard, Building2, Utensils, PiggyBank, TrendingUp, ShoppingCart, Gamepad2, Gift, Home as HomeIcon, Car, Zap, Droplet, Heart, Music, Book, Map, DollarSign, Trash2 } from 'lucide-react';
import styles from "./accountDetail.module.css";

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

const getIcon = (iconName?: string, type?: string) => {
  if (iconName && ICON_MAP[iconName]) return ICON_MAP[iconName];
  switch (type) {
    case 'bank': return Building2;
    case 'cash': return Wallet;
    case 'credit': return CreditCard;
    default: return Utensils;
  }
};

interface Reconciliation {
  id: string;
  accountId: string;
  previousBalance: number;
  newBalance: number;
  difference: number;
  note?: string;
  performedById: string;
  createdAt: string;
}

type HistoryTab = 'transactions' | 'reconcile';

export default function AccountDetails({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const { id } = resolvedParams;
  const { accounts, getAccountTransactions, updateAccount, deleteAccount, currentUser, addTransaction, deleteTransaction, fetchAccounts } = useFinance();

  const [isReconcileOpen, setIsReconcileOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [reconciliations, setReconciliations] = useState<Reconciliation[]>([]);
  const [activeTab, setActiveTab] = useState<HistoryTab>('transactions');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('');

  const handleDeleteAccount = async () => {
    await deleteAccount(id);
    window.location.href = '/accounts';
  };

  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [initialType, setInitialType] = useState<TransactionType>('expense');
  const [selectedReconciliation, setSelectedReconciliation] = useState<Reconciliation | null>(null);
  const [isReconcileDetailOpen, setIsReconcileDetailOpen] = useState(false);

  const account = accounts.find((a) => a.id === id);
  const transactions = getAccountTransactions(id);

  const fetchReconciliations = useCallback(async () => {
    try {
      const res = await fetch(`/api/reconciliations?accountId=${id}`);
      if (res.ok) {
        const data = await res.json();
        setReconciliations(data.map((r: Record<string, unknown>) => ({
          ...r,
          previousBalance: Number(r.previousBalance),
          newBalance: Number(r.newBalance),
          difference: Number(r.difference),
        })));
      }
    } catch (err) {
      console.error('Failed to fetch reconciliations', err);
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchReconciliations();
  }, [fetchReconciliations]);

  if (!account) {
    return <div style={{ padding: 20 }}>ไม่พบบัญชี หรือไม่มีสิทธิ์เข้าถึง</div>;
  }

  const isOwner = currentUser?.name === account.owner || currentUser?.role === 'parent';

  const handleReconcile = async (newBalance: number) => {
    if (!currentUser) return;
    try {
      const res = await fetch('/api/reconciliations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: id,
          newBalance,
          performedById: currentUser.id,
        }),
      });
      if (res.ok) {
        await fetchAccounts();
        await fetchReconciliations();
      }
    } catch (err) {
      console.error('Failed to reconcile', err);
    }
  };

  return (
    <div className={styles.container}>
      <BalanceCard
        title={account.name}
        icon={React.createElement(getIcon(account.icon, account.type), { size: 24 })}
        balance={account.balance}
        onReconcile={isOwner ? () => setIsReconcileOpen(true) : undefined}
        onEdit={isOwner ? () => setIsEditOpen(true) : undefined}
      />

      <div className={styles.tabBar}>
        <button
          className={`${styles.tabBtn} ${activeTab === 'transactions' ? styles.active : ''}`}
          onClick={() => setActiveTab('transactions')}
        >
          รายการ
        </button>
        <button
          className={`${styles.tabBtn} ${activeTab === 'reconcile' ? styles.active : ''}`}
          onClick={() => setActiveTab('reconcile')}
        >
          กระทบยอด ({reconciliations.length})
        </button>
      </div>

      {activeTab === 'transactions' ? (
        <TransactionList
          transactions={transactions}
          title=""
          onTransactionClick={(tx) => {
            setSelectedTransaction(tx);
            setIsTxModalOpen(true);
          }}
        />
      ) : (
        <div className={styles.reconcileList}>
          {reconciliations.length === 0 ? (
            <div className={styles.emptyReconcile}>ยังไม่มีประวัติการกระทบยอด</div>
          ) : (
            <div className={styles.reconcileCard}>
              {reconciliations.map((r) => (
                <div
                  key={r.id}
                  className={styles.reconcileItem}
                  onClick={() => {
                    setSelectedReconciliation(r);
                    setIsReconcileDetailOpen(true);
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <div className={styles.reconcileInfo}>
                    <div className={styles.reconcileDate}>
                      {formatBangkokShortDate(r.createdAt)}
                      <span className={styles.reconcileTime}>{formatBangkokTime(r.createdAt)}</span>
                    </div>
                    <div className={styles.reconcileBalances}>
                      <Money amount={r.previousBalance} /> → <Money amount={r.newBalance} />
                    </div>
                  </div>
                  <div className={`${styles.reconcileDiff} ${r.difference >= 0 ? styles.positive : styles.negative}`}>
                    {r.difference >= 0 ? '+' : ''}<Money amount={r.difference} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {isOwner && (
        <button
          className={styles.deleteAccountBtn}
          onClick={() => setShowDeleteConfirm(true)}
        >
          <Trash2 size={16} /> ลบบัญชี
        </button>
      )}

      {showDeleteConfirm && (
        <div className={styles.overlay} onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmInput(''); }}>
          <div className={styles.confirmDialog} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.confirmTitle}>ลบบัญชี</h3>
            <p className={styles.confirmText}>
              คุณแน่ใจหรือไม่ที่จะลบบัญชี <strong>{account.name}</strong>?
            </p>
            <p className={styles.confirmWarning}>
              การดำเนินการนี้จะลบบัญชีและรายการธุรกรรมทั้งหมดถาวร ไม่สามารถกู้คืนได้
            </p>
            <p className={styles.confirmHint}>พิมพ์ <strong>ไม่ต้องการบริหารเงิน</strong> เพื่อยืนยัน</p>
            <input
              className={styles.confirmInput}
              type="text"
              value={deleteConfirmInput}
              onChange={(e) => setDeleteConfirmInput(e.target.value)}
              placeholder="ไม่ต้องการบริหารเงิน"
              autoFocus
            />
            <div className={styles.confirmActions}>
              <button className={styles.cancelBtn} onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmInput(''); }}>
                ยกเลิก
              </button>
              <button
                className={styles.dangerBtn}
                disabled={deleteConfirmInput !== 'ไม่ต้องการบริหารเงิน'}
                onClick={handleDeleteAccount}
              >
                ลบถาวร
              </button>
            </div>
          </div>
        </div>
      )}

      {isOwner && (
        <ActionFab onTypeSelect={(type) => {
          setInitialType(type);
          setSelectedTransaction(null);
          setIsTxModalOpen(true);
        }} />
      )}

      <ReconcileModal
        isOpen={isReconcileOpen}
        onClose={() => setIsReconcileOpen(false)}
        accountName={account.name}
        currentSystemBalance={account.balance}
        onConfirm={handleReconcile}
      />

      <AccountFormModal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        initialData={account}
        onSave={(updates) => {
          updateAccount(id, updates);
          setIsEditOpen(false);
        }}
      />

      <TransactionDetailModal
        isOpen={isTxModalOpen}
        onClose={() => setIsTxModalOpen(false)}
        transaction={selectedTransaction}
        initialType={initialType}
        accountId={id}
        availableAccounts={accounts}
        isOwner={isOwner}
        onSave={(txData, createdById) => {
           if (selectedTransaction) {
               deleteTransaction(selectedTransaction.id);
           }
           addTransaction(txData, createdById);
           setIsTxModalOpen(false);
        }}
        onDelete={deleteTransaction}
      />
      {isReconcileDetailOpen && selectedReconciliation && (
        <div className={styles.overlay} onClick={() => setIsReconcileDetailOpen(false)}>
          <div className={styles.confirmDialog} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.confirmTitle}>รายละเอียดการกระทบยอด</h3>
            <div className={styles.reconcileDetail}>
              <div className={styles.reconcileDetailRow}>
                <span className={styles.reconcileDetailLabel}>วันที่</span>
                <span className={styles.reconcileDetailValue}>
                  {formatBangkokShortDate(selectedReconciliation.createdAt)} {formatBangkokTime(selectedReconciliation.createdAt)}
                </span>
              </div>
              <div className={styles.reconcileDetailRow}>
                <span className={styles.reconcileDetailLabel}>ยอดก่อนกระทบ</span>
                <span className={styles.reconcileDetailValue}>
                  <Money amount={selectedReconciliation.previousBalance} />
                </span>
              </div>
              <div className={styles.reconcileDetailRow}>
                <span className={styles.reconcileDetailLabel}>ยอดใหม่</span>
                <span className={styles.reconcileDetailValue}>
                  <Money amount={selectedReconciliation.newBalance} />
                </span>
              </div>
              <div className={styles.reconcileDetailRow}>
                <span className={styles.reconcileDetailLabel}>ส่วนต่าง</span>
                <span className={`${styles.reconcileDetailValue} ${selectedReconciliation.difference >= 0 ? styles.positive : styles.negative}`}>
                  {selectedReconciliation.difference >= 0 ? '+' : ''}
                  <Money amount={selectedReconciliation.difference} />
                </span>
              </div>
              {selectedReconciliation.note && (
                <div className={styles.reconcileDetailRow}>
                  <span className={styles.reconcileDetailLabel}>หมายเหตุ</span>
                  <span className={styles.reconcileDetailValue}>{selectedReconciliation.note}</span>
                </div>
              )}
            </div>
            <div className={styles.confirmActions}>
              <button
                className={styles.cancelBtn}
                onClick={() => setIsReconcileDetailOpen(false)}
              >
                ปิด
              </button>
              {isOwner && (
                <button
                  className={styles.dangerBtn}
                  onClick={async () => {
                    if (confirm('ลบรายการกระทบยอดนี้?')) {
                      await fetch(`/api/reconciliations/${selectedReconciliation.id}`, { method: 'DELETE' });
                      setReconciliations(reconciliations.filter((rec) => rec.id !== selectedReconciliation.id));
                      setIsReconcileDetailOpen(false);
                      setSelectedReconciliation(null);
                    }
                  }}
                >
                  ลบ
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}