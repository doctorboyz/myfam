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
import { Wallet, CreditCard, Building2, Utensils, PiggyBank, TrendingUp, ShoppingCart, Gamepad2, Gift, Home as HomeIcon, Car, Zap, Droplet, Heart, Music, Book, Map, DollarSign } from 'lucide-react';

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
  const { accounts, getAccountTransactions, updateAccount, currentUser, addTransaction, deleteTransaction, fetchAccounts } = useFinance();
  
  const [isReconcileOpen, setIsReconcileOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [reconciliations, setReconciliations] = useState<Reconciliation[]>([]);
  const [activeTab, setActiveTab] = useState<HistoryTab>('transactions');
  
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [initialType, setInitialType] = useState<TransactionType>('expense');

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
    fetchReconciliations();
  }, [fetchReconciliations]);

  if (!account) {
    return <div style={{ padding: 20 }}>Account not found or restricted.</div>;
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

  const tabStyle = (tab: HistoryTab): React.CSSProperties => ({
    flex: 1,
    padding: '10px 16px',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s',
    background: activeTab === tab ? 'var(--primary, #6C5CE7)' : 'transparent',
    color: activeTab === tab ? '#fff' : 'var(--text-secondary, #666)',
  });

  const AccountIcon = getIcon(account.icon, account.type);

  return (
    <div style={{ paddingBottom: '80px', paddingTop: '20px' }}>
      <BalanceCard
        title={account.name}
        icon={<AccountIcon size={24} />}
        balance={account.balance}
        onReconcile={() => setIsReconcileOpen(true)}
        onEdit={() => setIsEditOpen(true)}
      />

      {/* Tab Switcher */}
      <div style={{
        display: 'flex', gap: '4px', margin: '16px',
        background: 'var(--card-bg, #f0f0f0)', borderRadius: '10px', padding: '4px',
      }}>
        <button style={tabStyle('transactions')} onClick={() => setActiveTab('transactions')}>
          Transactions
        </button>
        <button style={tabStyle('reconcile')} onClick={() => setActiveTab('reconcile')}>
          Reconcile ({reconciliations.length})
        </button>
      </div>

      {/* Tab Content */}
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
        <div style={{ margin: '0 16px' }}>
          {reconciliations.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary, #999)' }}>
              No reconciliation history yet.
            </div>
          ) : (
            <div style={{ background: 'var(--card-bg, #fff)', borderRadius: '12px', overflow: 'hidden' }}>
              {reconciliations.map((r, i) => (
                <div key={r.id} style={{
                  padding: '14px 16px',
                  borderBottom: i < reconciliations.length - 1 ? '1px solid var(--border, #eee)' : 'none',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary, #1a1a2e)' }}>
                      {new Date(r.createdAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}
                      <span style={{ marginLeft: 8, fontSize: '12px', color: 'var(--text-tertiary, #999)' }}>
                        {new Date(r.createdAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-tertiary, #999)', marginTop: 4 }}>
                      <Money amount={r.previousBalance} /> → <Money amount={r.newBalance} />
                    </div>
                  </div>
                  <div style={{
                    fontSize: '15px', fontWeight: 700,
                    color: r.difference >= 0 ? 'var(--success, #34C759)' : 'var(--danger, #FF3B30)',
                  }}>
                    {r.difference >= 0 ? '+' : ''}<Money amount={r.difference} />
                  </div>
                </div>
              ))}
            </div>
          )}
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
        onSave={(txData) => {
           if (selectedTransaction) {
               deleteTransaction(selectedTransaction.id);
           }
           addTransaction(txData);
           setIsTxModalOpen(false);
        }}
        onDelete={deleteTransaction}
      />
    </div>
  );
}
