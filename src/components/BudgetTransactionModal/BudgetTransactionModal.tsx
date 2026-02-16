"use client";

import { useState, useEffect, useMemo } from "react";
import { useFinance } from "@/context/FinanceContext";
import styles from "./BudgetTransactionModal.module.css";
import { BudgetTransaction, TransactionType, BudgetStatus } from "@/types";
import { Trash2, Ban, CheckCircle } from "lucide-react";
import TagSelector from "../TagSelector";

interface BudgetTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  budgetId: string;
  itemToEdit?: BudgetTransaction | null;
}

export default function BudgetTransactionModal({ isOpen, onClose, budgetId, itemToEdit }: BudgetTransactionModalProps) {
  const { addBudgetTransaction, updateBudgetTransaction, deleteBudgetTransaction, categories, getGroupsByType, accounts, allAccounts, currentUser, transactions } = useFinance();
  
  const [name, setName] = useState("");
  const [plannedAmount, setPlannedAmount] = useState("");
  const [actualAmount, setActualAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [type, setType] = useState<TransactionType>("expense");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [isCancelled, setIsCancelled] = useState(false);
  const [tags, setTags] = useState<string[]>([]);

  // Compute available tags from all transactions
  const availableTags = useMemo(() => {
    const uniqueTags = new Set<string>();
    transactions.forEach(tx => {
      tx.tags?.forEach(tag => uniqueTags.add(tag));
    });
    return Array.from(uniqueTags).sort();
  }, [transactions]);

  useEffect(() => {
    if (isOpen) {
      if (itemToEdit) {
        // ... (same logic)
      } else {
        // ...
      }
    }
  }, [isOpen, itemToEdit]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Determine status
    let status: BudgetStatus = 'pending';
    if (isCancelled) {
        status = 'cancelled';
    } else if (actualAmount && parseFloat(actualAmount) > 0) {
        status = 'done';
    }

    // Validation for Done status
    if (status === 'done') {
        if (!accountId) {
            alert("Please select an account.");
            return;
        }
        if (type === 'transfer' && !toAccountId) {
            alert("Please select a destination account.");
            return;
        }
    }

    const payload = {
        name,
        plannedAmount: parseFloat(plannedAmount),
        actualAmount: status === 'done' ? parseFloat(actualAmount) : undefined,
        date,
        type,
        categoryId,
        accountId: status === 'done' ? accountId : undefined,
        toAccountId: (status === 'done' && type === 'transfer') ? toAccountId : undefined,
        status,
        tags
    };

    if (itemToEdit) {
        updateBudgetTransaction(budgetId, itemToEdit.id, payload);
    } else {
        addBudgetTransaction(budgetId, payload);
    }
    onClose();
  };

  const handleDelete = () => {
    if (itemToEdit && confirm("Are you sure you want to delete this item?")) {
        deleteBudgetTransaction(budgetId, itemToEdit.id);
        onClose();
    }
  };

  const handleCancelItem = () => {
      if (confirm("Mark this item as Cancelled?")) {
          // We can either save immediately or just set state and let user save
          // User said "cancelled just trigger by click button" which sounds like an action.
          // Let's treat it as a state change that requires saving, or immediate save?
          // "trigger by click button" often means "Apply action".
          // But to consistent with form, let's set state and auto-submit?
          // Or toggle state.
          setIsCancelled(true);
      }
  };
  
  const handleReactivate = () => {
      setIsCancelled(false);
  };

  if (!isOpen) return null;

  // Filter categories by type
  const currentGroups = getGroupsByType(type);


  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
            <h2 className={styles.title}>{itemToEdit ? "Edit Plan Item" : "New Plan Item"}</h2>
        </div>
        
        {isCancelled && (
            <div className={styles.restrictedNotice}>
                <Ban size={16} className="text-red-500" />
                <span>This item is voided. Reactivate it to make changes.</span>
            </div>
        )}
        
        <form onSubmit={handleSubmit}>
          
          <div className={styles.formGroup}>
            <label className={styles.label}>Name</label>
            <input
              type="text"
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Flight Ticket"
              required
              disabled={isCancelled}
            />
          </div>

          <div className={styles.formGroup}>
             <label className={styles.label}>Type</label>
             <select 
                className={styles.select} 
                value={type} 
                onChange={(e) => {
                    setType(e.target.value as TransactionType);
                    setCategoryId(""); 
                }}
                disabled={isCancelled}
             >
                 <option value="expense">Expense</option>
                 <option value="income">Income</option>
                 <option value="transfer">Transfer</option>
             </select>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Category</label>
            <select
                className={styles.select}
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                required
                disabled={isCancelled}
            >
                <option value="" disabled>Select Category</option>
                {currentGroups.map(group => (
                    <optgroup key={group.id} label={group.name}>
                        {categories.filter(c => c.groupId === group.id).map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </optgroup>
                ))}
            </select>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Target Date</label>
            <input
              type="date"
              className={styles.input}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              disabled={isCancelled}
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Planned Amount</label>
            <input
              type="number"
              className={styles.input}
              value={plannedAmount}
              onChange={(e) => setPlannedAmount(e.target.value)}
              placeholder="0.00"
              step="0.01"
              required
              disabled={isCancelled}
            />
          </div>
          
          {/* Tag Selector */}
          <div className={styles.formGroup}>
             <TagSelector 
                 selectedTags={tags}
                 onChange={setTags}
                 availableTags={availableTags}
             />
          </div>
          
          {/* Actual Amount Section - Only if not cancelled */}
          {!isCancelled && (
            <div className={styles.actualSection}>
                <div className={styles.formGroup}>
                    <label className={styles.label}>Actual Amount <span className={styles.hint}>(Fill to Complete)</span></label>
                    <input
                    type="number"
                    className={styles.input}
                    value={actualAmount}
                    onChange={(e) => setActualAmount(e.target.value)}
                    placeholder="Enter amount to mark as Done"
                    step="0.01"
                    />
                </div>

                {/* Account Selection - Visible if actual amount entered */}
                {actualAmount && parseFloat(actualAmount) > 0 && (
                    <div className={styles.accountSelection}>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>{type === 'income' ? 'To Account' : 'Paid From'}</label>
                            <select
                                className={styles.select}
                                value={accountId}
                                onChange={(e) => setAccountId(e.target.value)}
                                required
                            >
                                <option value="" disabled>Select Account</option>
                                {accounts
                                .filter(a => (a.status === 'active' || a.id === accountId) && a.owner === currentUser?.name)
                                .map(acc => (
                                    <option key={acc.id} value={acc.id}>{acc.name} - {acc.owner}</option>
                                ))}
                            </select>
                        </div>

                        {type === 'transfer' && (
                            <div className={styles.formGroup}>
                                <label className={styles.label}>To Account</label>
                                <select
                                    className={styles.select}
                                    value={toAccountId}
                                    onChange={(e) => setToAccountId(e.target.value)}
                                    required
                                >
                                    <option value="" disabled>Select Account</option>
                                    {allAccounts
                                    .filter(a => (a.status === 'active' || a.id === toAccountId) && a.id !== accountId)
                                    .map(acc => (
                                        <option key={acc.id} value={acc.id}>{acc.name} - {acc.owner}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>
                )}
            </div>
          )}

          <div className={styles.actions}>
            {!isCancelled ? (
                 <button type="button" className={styles.cancelItemBtn} onClick={handleCancelItem}>
                   <Ban size={16} /> Void Item
                 </button>
            ) : (
                <button type="button" className={styles.reactivateBtn} onClick={handleReactivate}>
                   <CheckCircle size={16} /> Reactivate
                 </button>
            )}
            
            <div className={styles.rightActions}>
                <button type="button" className={styles.cancelBtn} onClick={onClose}>
                Close
                </button>
                <button type="submit" className={styles.submitBtn}>
                Save
                </button>
            </div>
          </div>
          
          {itemToEdit && (
              <div className={styles.deleteContainer}>
                   <button type="button" className={styles.deleteTextBtn} onClick={handleDelete}>
                       <Trash2 size={16} /> Delete Permanently
                   </button>
              </div>
          )}

        </form>
      </div>
    </div>
  );
}
