"use client";

import { useState, useMemo } from "react";
import { useFinance } from "@/context/FinanceContext";
import { Transaction, DashboardFilters as FilterType, TransactionType } from "@/types";
import { ChevronDown, ChevronRight, ShoppingCart, Briefcase, ArrowRightLeft, CreditCard, Home, Utensils, Tags, Check, X } from "lucide-react";
import DashboardFilter from "@/components/DashboardFilter/DashboardFilter";
import TransactionDetailModal from "@/components/TransactionDetailModal/TransactionDetailModal";
import CategorySelector from "@/components/CategorySelector/CategorySelector";
import Modal from "@/components/Modal/Modal";
import ActionFab, { TransactionType as FabType } from "@/components/ActionFab/ActionFab";
import Money from "@/components/Money/Money";
import { getBangkokDate, formatBangkokShortDate, formatBangkokTime } from "@/lib/timezone";
import styles from "./page.module.css";
import { PageGate } from "@/components/PageLoadState";

export default function TransactionsPage() {
  const { currentUser, users, accounts, categories, groups, addTransaction, updateTransaction, deleteTransaction, getFilteredTransactions, bulkAssignCategory } = useFinance();
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set(['expense', 'income', 'transfer']));
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [initialType, setInitialType] = useState<FabType>('expense');

  // Bulk category-assign mode — the cleanup tool for rows without a
  // category (filter with "ไม่มีหมวดหมู่", select them, assign one).
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [bulkType, setBulkType] = useState<TransactionType>('expense');
  const [bulkCategoryName, setBulkCategoryName] = useState("");

  const [filters, setFilters] = useState<FilterType>(() => {
    const now = getBangkokDate();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
      users: [],
      dateRange: { start: startOfMonth, end: endOfMonth },
      types: [],
      categories: [],
      accounts: []
    };
  });

  const displayedTransactions = getFilteredTransactions(filters);

  const grouped = useMemo(() => {
    const groups: Record<TransactionType, Transaction[]> = {
      income: [],
      expense: [],
      transfer: [],
    };
    displayedTransactions.forEach(tx => {
      if (groups[tx.type]) {
        groups[tx.type].push(tx);
      }
    });
    return groups;
  }, [displayedTransactions]);

  const getTotal = (txs: Transaction[]) => txs.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

  const toggleType = (type: string) => {
    const next = new Set(expandedTypes);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    setExpandedTypes(next);
  };

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

  const typeConfig: Record<string, { label: string; color: string; sign: string }> = {
    income: { label: 'รายรับ', color: 'var(--success)', sign: '+' },
    expense: { label: 'รายจ่าย', color: 'var(--danger)', sign: '-' },
    transfer: { label: 'โอน', color: 'var(--primary)', sign: '' },
  };

  // ── Select mode helpers ──
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllDisplayed = () => {
    setSelectedIds(prev =>
      prev.size === displayedTransactions.length
        ? new Set()
        : new Set(displayedTransactions.map(tx => tx.id))
    );
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const applyBulkCategory = async () => {
    const chosenCat = categories.find(c => c.name === bulkCategoryName);
    if (!chosenCat) {
      alert('กรุณาเลือกหมวดหมู่');
      return;
    }
    // A category belongs to one type — only rows of that type can take it.
    const eligible = displayedTransactions.filter(
      tx => selectedIds.has(tx.id) && tx.type === bulkType
    );
    if (eligible.length === 0) {
      alert(`ไม่มีรายการ${typeConfig[bulkType].label}ที่เลือกอยู่`);
      return;
    }
    const updated = await bulkAssignCategory(eligible.map(tx => tx.id), chosenCat.id);
    alert(`จัดหมวดหมู่ "${chosenCat.name}" ให้ ${updated} รายการแล้ว`);
    setIsBulkOpen(false);
    setBulkCategoryName('');
    if (updated > 0) exitSelectMode();
  };

  if (!currentUser) return <PageGate />;

  // Parents manage the whole family's transactions; members their own.
  const isParent = currentUser.role === 'parent' || currentUser.isAdmin;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>รายการ</h1>
        <button
          className={`${styles.selectToggle} ${selectMode ? styles.selectToggleActive : ''}`}
          onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
        >
          <Tags size={16} /> {selectMode ? 'ออกจากโหมดเลือก' : 'จัดหมวดทีละหลายรายการ'}
        </button>
      </header>

      <DashboardFilter
        users={users}
        currentUser={currentUser}
        filters={filters}
        onFilterChange={setFilters}
      />

      <div className={styles.content}>
        {(['income', 'expense', 'transfer'] as TransactionType[]).map(type => {
          const txs = grouped[type];
          const isExpanded = expandedTypes.has(type);
          const config = typeConfig[type];
          const total = getTotal(txs);

          return (
            <div key={type} className={styles.group}>
              <div className={styles.groupHeader} onClick={() => toggleType(type)}>
                <div className={styles.headerLeft}>
                  <div className={`${styles.dot}`} style={{ background: config.color }} />
                  <span className={styles.groupTitle}>{config.label}</span>
                  <span className={styles.groupCount}>{txs.length}</span>
                </div>
                <div className={styles.headerRight}>
                  <span className={styles.groupTotal} style={{ color: config.color }}>
                    {config.sign}<Money amount={total} colored={false} />
                  </span>
                  {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                </div>
              </div>

              {isExpanded && (
                <div className={styles.txList}>
                  {txs.length === 0 ? (
                    <div className={styles.empty}>ไม่มีรายการ{type === 'income' ? 'รายรับ' : type === 'expense' ? 'รายจ่าย' : 'โอน'}</div>
                  ) : (
                    txs.map(tx => {
                      const Icon = getIcon(tx.categoryGroup);
                      const isSelected = selectedIds.has(tx.id);
                      return (
                        <div
                          key={tx.id}
                          className={`${styles.txItem} ${selectMode ? styles.txItemSelectable : ''}`}
                          onClick={() => {
                            if (selectMode) toggleSelect(tx.id);
                            else { setSelectedTransaction(tx); setIsTxModalOpen(true); }
                          }}
                        >
                          {selectMode && (
                            <span
                              className={`${styles.checkbox} ${isSelected ? styles.checkboxChecked : ''}`}
                              aria-label={isSelected ? 'ยกเลิกการเลือก' : 'เลือกรายการ'}
                            >
                              {isSelected && <Check size={14} strokeWidth={3} />}
                            </span>
                          )}
                          <div className={`${styles.iconBox} ${styles[type]}`}>
                            <Icon size={20} strokeWidth={2} />
                          </div>
                          <div className={styles.txDetails}>
                            <span className={styles.txCategory}>{tx.description || tx.category}</span>
                            <span className={styles.txDate}>{tx.category} · {formatBangkokShortDate(tx.date)} {formatBangkokTime(tx.date)}</span>
                          </div>
                          <div className={styles.txAmount} style={{ color: config.color }}>
                            {type === 'expense' ? <Money amount={-Math.abs(tx.amount)} /> :
                             type === 'income' ? <Money amount={Math.abs(tx.amount)} colored={false} /> :
                             <Money amount={Math.abs(tx.amount)} colored={false} />}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bulk-assign bar (select mode) */}
      {selectMode && (
        <div className={styles.bulkBar}>
          <span className={styles.bulkInfo}>เลือกแล้ว {selectedIds.size} รายการ</span>
          <div className={styles.bulkActions}>
            <button className={styles.bulkBtnGhost} onClick={selectAllDisplayed}>เลือกทั้งหมด</button>
            <button
              className={styles.bulkBtn}
              disabled={selectedIds.size === 0}
              onClick={() => setIsBulkOpen(true)}
            >
              จัดหมวดหมู่
            </button>
            <button className={styles.bulkBtnGhost} onClick={exitSelectMode} aria-label="ปิดโหมดเลือก">
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Category picker for the selected rows */}
      {isBulkOpen && (
        <Modal isOpen={isBulkOpen} onClose={() => setIsBulkOpen(false)} title="จัดหมวดหมู่ให้รายการที่เลือก">
          <div className={styles.bulkForm}>
            <div className={styles.bulkTypeRow}>
              {(['expense', 'income', 'transfer'] as TransactionType[]).map(type => (
                <button
                  key={type}
                  className={`${styles.bulkTypeBtn} ${bulkType === type ? styles.bulkTypeBtnActive : ''}`}
                  onClick={() => { setBulkType(type); setBulkCategoryName(''); }}
                >
                  {typeConfig[type].label}
                </button>
              ))}
            </div>
            <p className={styles.bulkHint}>
              จะจัดเฉพาะรายการประเภท{typeConfig[bulkType].label}ที่เลือกไว้ ({selectedIds.size} รายการที่เลือก)
            </p>
            <CategorySelector
              value={bulkCategoryName}
              onChange={setBulkCategoryName}
              onAddNew={() => {}}
              categories={categories}
              groups={groups}
              transactionType={bulkType}
            />
            <div className={styles.bulkFormActions}>
              <button className={styles.bulkBtnGhost} onClick={() => setIsBulkOpen(false)}>ยกเลิก</button>
              <button className={styles.bulkBtn} onClick={applyBulkCategory}>บันทึก</button>
            </div>
          </div>
        </Modal>
      )}

      {!selectMode && <ActionFab onTypeSelect={(type) => {
        setInitialType(type);
        setSelectedTransaction(null);
        setIsTxModalOpen(true);
      }} />}

      <TransactionDetailModal
        isOpen={isTxModalOpen}
        onClose={() => setIsTxModalOpen(false)}
        transaction={selectedTransaction}
        initialType={initialType}
        accountId=""
        availableAccounts={accounts}
        isOwner={isParent || !selectedTransaction || selectedTransaction.createdById === currentUser?.id}
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