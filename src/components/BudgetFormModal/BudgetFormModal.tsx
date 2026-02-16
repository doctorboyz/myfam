"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFinance } from "@/context/FinanceContext";
import Modal from "../Modal/Modal";
import styles from "./BudgetFormModal.module.css";
import { Budget } from "@/types";

interface BudgetFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  budgetToEdit?: Budget;
}

export default function BudgetFormModal({ isOpen, onClose, budgetToEdit }: BudgetFormModalProps) {
  const { addBudget, updateBudget, deleteBudget } = useFinance();
  const router = useRouter();
  const [title, setTitle] = useState(budgetToEdit?.title || "");
  const [description, setDescription] = useState(budgetToEdit?.description || "");
  const [limit, setLimit] = useState(budgetToEdit?.limit?.toString() || "");
  const [period, setPeriod] = useState(budgetToEdit?.period || "one_time");
  const [startDate, setStartDate] = useState(budgetToEdit?.startDate || new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(budgetToEdit?.endDate || "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (budgetToEdit) {
        updateBudget(budgetToEdit.id, {
            title,
            description,
            limit: parseFloat(limit),
            period: period as 'monthly' | 'one_time',
            startDate,
            endDate
        });
    } else {
        addBudget({
            title,
            description,
            limit: parseFloat(limit),
            period: period as 'monthly' | 'one_time',
            startDate,
            endDate,
            items: []
        });
    }
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={budgetToEdit ? "Edit Budget" : "New Budget"}>
      <form onSubmit={handleSubmit}>
        <div className={styles.formGroup}>
          <label className={styles.label}>Budget Title</label>
          <input
            type="text"
            className={styles.input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Japan Trip"
            required
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>Description</label>
          <textarea
            className={styles.textarea}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
          />
        </div>

        <div className={styles.formGroup}>
           <label className={styles.label}>Limit Amount</label>
           <input
             type="number"
             className={styles.input}
             value={limit}
             onChange={(e) => setLimit(e.target.value)}
             placeholder="0.00"
             required
           />
        </div>

        <div className={styles.formGroup}>
           <label className={styles.label}>Period</label>
           <select
               className={styles.input}
               value={period}
               onChange={(e) => setPeriod(e.target.value as 'monthly' | 'one_time')}
           >
               <option value="one_time">One Time</option>
               <option value="monthly">Monthly</option>
           </select>
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>Start Date</label>
          <input
            type="date"
            className={styles.input}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
          />
        </div>

         <div className={styles.formGroup}>
          <label className={styles.label}>End Date (Optional)</label>
          <input
            type="date"
            className={styles.input}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>

        <div className={styles.actions}>
          {budgetToEdit && (
              <button type="button"
                onClick={async () => {
                    if(confirm("Delete this budget? Pending items will be voided.")) {
                        await deleteBudget(budgetToEdit.id);
                        onClose();
                        router.push('/budget');
                    }
                }}
                className={styles.deleteBtn}
                style={{marginRight: 'auto', background: 'transparent', color: 'var(--danger)', border: 'none', cursor: 'pointer', fontWeight: 600}}
              >
                  Delete Budget
              </button>
          )}
          <div style={{display:'flex', gap: 8}}>
              <button type="button" className={styles.cancelBtn} onClick={onClose}>
              Cancel
              </button>
              <button type="submit" className={styles.submitBtn}>
              Save
              </button>
          </div>
          </div>
      </form>
    </Modal>
  );
}
