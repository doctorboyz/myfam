"use client";

import { useState, useEffect, useMemo } from "react";
import { useFinance } from "@/context/FinanceContext";
import styles from "./BudgetTransactionModal.module.css";
import { BudgetTransaction, TransactionType, BudgetStatus } from "@/types";
import { Trash2, Ban, CheckCircle } from "lucide-react";
import Modal from "../Modal/Modal";
import TagSelector from "../TagSelector";
import CategorySelector from "../CategorySelector/CategorySelector";
import CreateCategoryModal from "../CreateCategoryModal/CreateCategoryModal";

interface BudgetTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  budgetId: string;
  itemToEdit?: BudgetTransaction | null;
  canEditItem?: boolean; // Can the current user edit this item?
  isBudgetCreator?: boolean; // Is current user the budget creator?
}

export default function BudgetTransactionModal({ isOpen, onClose, budgetId, itemToEdit, canEditItem = true, isBudgetCreator = false }: BudgetTransactionModalProps) {
  const isReadonly = !!itemToEdit && !canEditItem;
  const { addBudgetTransaction, updateBudgetTransaction, deleteBudgetTransaction, categories, groups, accounts, allAccounts, currentUser } = useFinance();

  const [name, setName] = useState("");
  const [plannedAmount, setPlannedAmount] = useState("");
  const [actualAmount, setActualAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [type, setType] = useState<TransactionType>("expense");
  const [categoryId, setCategoryId] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [accountId, setAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [isCancelled, setIsCancelled] = useState(false);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [isCreateCategoryOpen, setIsCreateCategoryOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (itemToEdit) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setName(itemToEdit.name);
        setPlannedAmount(itemToEdit.plannedAmount.toString());
        setActualAmount(itemToEdit.actualAmount?.toString() || "");
        setDate(new Date(itemToEdit.date).toISOString().split('T')[0]);
        setType(itemToEdit.type);
        setCategoryId(itemToEdit.categoryId);
        // Find category name from ID
        const cat = categories.find(c => c.id === itemToEdit.categoryId);
        setCategoryName(cat?.name || "");
        setAccountId(itemToEdit.accountId || "");
        setToAccountId(itemToEdit.toAccountId || "");
        setIsCancelled(itemToEdit.status === 'cancelled');
        setTagIds(itemToEdit.tagIds || []);
      } else {
        // Reset for new item
        setName("");
        setPlannedAmount("");
        setActualAmount("");
        setDate(new Date().toISOString().split('T')[0]);
        setType("expense");
        setTagIds([]);
        setCategoryId("");
        setCategoryName("");
        setAccountId("");
        setToAccountId("");
        setIsCancelled(false);
        setTagIds([]);
      }
    }
  }, [isOpen, itemToEdit, categories]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Resolve category ID from name
    const selectedCat = categories.find(c => c.name === categoryName);
    const resolvedCategoryId = selectedCat?.id || categoryId;

    if (!resolvedCategoryId) {
      alert("กรุณาเลือกหมวดหมู่");
      return;
    }

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
            alert("กรุณาเลือกบัญชี");
            return;
        }
        if (type === 'transfer' && !toAccountId) {
            alert("กรุณาเลือกบัญชีปลายทาง");
            return;
        }
    }

    const payload = {
        name,
        plannedAmount: parseFloat(plannedAmount),
        actualAmount: status === 'done' ? parseFloat(actualAmount) : undefined,
        date,
        type,
        categoryId: resolvedCategoryId,
        accountId: status === 'done' ? accountId : undefined,
        toAccountId: (status === 'done' && type === 'transfer') ? toAccountId : undefined,
        status,
        tagIds
    };

    if (itemToEdit) {
        updateBudgetTransaction(budgetId, itemToEdit.id, payload);
    } else {
        addBudgetTransaction(budgetId, payload);
    }
    onClose();
  };

  const handleDelete = () => {
    if (itemToEdit && confirm("คุณแน่ใจหรือไม่ว่าต้องการลบรายการนี้?")) {
        deleteBudgetTransaction(budgetId, itemToEdit.id);
        onClose();
    }
  };

  const handleCancelItem = () => {
      if (confirm("ทำเครื่องหมายรายการนี้เป็นยกเลิก?")) {
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

  const modalTitle = itemToEdit ? (isReadonly ? "ดูแผนรายการ" : "แก้ไขแผนรายการ") : "เพิ่มแผนรายการ";

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={modalTitle}>
        
        {isReadonly && (
            <div className={styles.restrictedNotice}>
                <Ban size={16} />
                <span>รายการนี้สร้างโดยสมาชิกคนอื่น คุณไม่สามารถแก้ไขได้</span>
            </div>
        )}

        {!isReadonly && isCancelled && (
            <div className={styles.restrictedNotice}>
                <Ban size={16} className="text-red-500" />
                <span>รายการนี้ถูกยกเลิกแล้ว กดเปิดใช้งานใหม่เพื่อแก้ไข</span>
            </div>
        )}
        
        <form onSubmit={isReadonly ? (e) => e.preventDefault() : handleSubmit}>
          
          <div className={styles.formGroup}>
            <label className={styles.label}>ชื่อรายการ</label>
            <input
              type="text"
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="เช่น ซื้อของเล่น, โอนเงินให้ลูก"
              required
              disabled={isCancelled || isReadonly}
            />
          </div>

          <div className={styles.formGroup}>
             <label className={styles.label}>ประเภท</label>
             <select
                className={styles.select}
                value={type}
                onChange={(e) => {
                    setType(e.target.value as TransactionType);
                    setCategoryId("");
                    setCategoryName("");
                }}
                disabled={isCancelled || isReadonly}
             >
                 <option value="expense">รายจ่าย</option>
                 <option value="income">รายรับ</option>
                 <option value="transfer">โอน</option>
             </select>
          </div>

          <div className={styles.categorySection} style={{ pointerEvents: (isCancelled || isReadonly) ? 'none' : 'auto', opacity: (isCancelled || isReadonly) ? 0.6 : 1 }}>
            <CategorySelector
              value={categoryName}
              onChange={(newName) => setCategoryName(newName)}
              onAddNew={() => setIsCreateCategoryOpen(true)}
              categories={categories}
              groups={groups}
              transactionType={type}
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>วันที่เป้าหมาย</label>
            <input
              type="date"
              className={styles.input}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              disabled={isCancelled || isReadonly}
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>จำนวนที่วางแผน</label>
            <input
              type="number"
              className={styles.input}
              value={plannedAmount}
              onChange={(e) => setPlannedAmount(e.target.value)}
              placeholder="0.00"
              step="0.01"
              required
              disabled={isCancelled || isReadonly}
            />
          </div>
          
          {/* Tag Selector */}
          <div className={styles.formGroup}>
             <TagSelector
                 selectedTagIds={tagIds}
                 onChange={setTagIds}
             />
          </div>
          
          {/* Actual Amount Section - Only if not cancelled */}
          {!isCancelled && (
            <div className={styles.actualSection}>
                <div className={styles.formGroup}>
                    <label className={styles.label}>จำนวนจริง <span className={styles.hint}>(กรอกเพื่อทำเสร็จ)</span></label>
                    <input
                    type="number"
                    className={styles.input}
                    value={actualAmount}
                    onChange={(e) => setActualAmount(e.target.value)}
                    placeholder="กรอกจำนวนเพื่อทำเสร็จ"
                    step="0.01"
                    />
                </div>

                {/* Account Selection - Visible if actual amount entered */}
                {actualAmount && parseFloat(actualAmount) > 0 && (
                    <div className={styles.accountSelection}>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>{type === 'income' ? 'บัญชีปลายทาง' : 'จ่ายจาก'}</label>
                            <select
                                className={styles.select}
                                value={accountId}
                                onChange={(e) => setAccountId(e.target.value)}
                                required
                            >
                                <option value="" disabled>เลือกบัญชี</option>
                                {accounts
                                .filter(a => (a.status === 'active' || a.id === accountId) && a.owner === currentUser?.name)
                                .map(acc => (
                                    <option key={acc.id} value={acc.id}>{acc.name} - {acc.owner}</option>
                                ))}
                            </select>
                        </div>

                        {type === 'transfer' && (
                            <div className={styles.formGroup}>
                                <label className={styles.label}>บัญชีปลายทาง</label>
                                <select
                                    className={styles.select}
                                    value={toAccountId}
                                    onChange={(e) => setToAccountId(e.target.value)}
                                    required
                                >
                                    <option value="" disabled>เลือกบัญชี</option>
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
            {!isReadonly && (
              !isCancelled ? (
                <button type="button" className={styles.cancelItemBtn} onClick={handleCancelItem}>
                  <Ban size={16} /> ยกเลิกรายการ
                </button>
              ) : (
                <button type="button" className={styles.reactivateBtn} onClick={handleReactivate}>
                  <CheckCircle size={16} /> เปิดใช้งานใหม่
                </button>
              )
            )}
            
            <div className={styles.rightActions}>
                <button type="button" className={styles.cancelBtn} onClick={onClose}>
                ปิด
                </button>
                {!isReadonly && (
                  <button type="submit" className={styles.submitBtn}>
                  บันทึก
                  </button>
                )}
            </div>
          </div>
          
          {/* Delete: only item creator (canEditItem) or budget creator can delete */}
          {itemToEdit && (canEditItem || isBudgetCreator) && (
              <div className={styles.deleteContainer}>
                   <button type="button" className={styles.deleteTextBtn} onClick={handleDelete}>
                       <Trash2 size={16} /> ลบถาวร
                   </button>
              </div>
          )}

        </form>

      <CreateCategoryModal
        isOpen={isCreateCategoryOpen}
        onClose={() => setIsCreateCategoryOpen(false)}
        onSuccess={(newCategoryName) => {
          setCategoryName(newCategoryName);
        }}
        transactionType={type}
      />
    </Modal>
  );
}
