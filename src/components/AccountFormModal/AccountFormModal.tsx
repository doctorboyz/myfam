"use client";

import { useState, useEffect } from "react";
import Modal from "../Modal/Modal";
import { Account, AccountType } from "@/types";
import styles from "./AccountFormModal.module.css";

interface AccountFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (account: Omit<Account, "id" | "balance" | "owner">) => void;
  initialData?: Account;
}

const COLORS = ["#007AFF", "#34C759", "#FF3B30", "#5856D6", "#FF9500", "#5AC8FA", "#FF2D55", "#8E8E93"];

export default function AccountFormModal({ isOpen, onClose, onSave, initialData }: AccountFormModalProps) {
  const [formData, setFormData] = useState({
    name: "",
    type: "bank" as AccountType,
    balance: 0,
    color: COLORS[0],
    accountNo: "",
    alias: "",
  });

  useEffect(() => {
    if (isOpen) {
        if (initialData) {
        setFormData({
            name: initialData.name,
            type: initialData.type,
            balance: initialData.balance,
            color: initialData.color,
            accountNo: initialData.accountNo || "",
            alias: initialData.alias || "",
        });
        } else {
        setFormData({ // Reset form for new entry
            name: "",
            type: "bank",
            balance: 0,
            color: COLORS[0],
            accountNo: "",
            alias: "",
        });
        }
    }
  }, [isOpen, initialData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return; // Simple validation
    onSave({ ...formData, status: initialData?.status || 'active' });
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={initialData ? "Edit Account" : "New Account"}>
      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.field}>
          <label>Description (Name)</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g. Main Bank"
            required
            className={styles.input}
          />
        </div>

        {/* Removed Owner Field */}

        <div className={styles.field}>
            <label>Type</label>
            <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as AccountType })}
                className={styles.select}
            >
                <option value="bank">Bank</option>
                <option value="cash">Cash</option>
                <option value="credit">Credit Card</option>
                <option value="wallet">Digitial Wallet</option>
                <option value="loan">Loan</option>
                <option value="invest">Investment</option>
            </select>
        </div>

        <div className={styles.field}>
          <label>Account No. (Optional)</label>
          <input
            type="text"
            value={formData.accountNo}
            onChange={(e) => setFormData({ ...formData, accountNo: e.target.value })}
            placeholder="e.g. 123-xxx-xxx"
            className={styles.input}
          />
        </div>

        {!initialData && (
             <div className={styles.field}>
              <label>Starting Balance</label>
              <input
                type="number"
                step="0.01"
                value={formData.balance}
                onChange={(e) => setFormData({ ...formData, balance: parseFloat(e.target.value) })}
                className={styles.input}
              />
            </div>
        )}

        <div className={styles.field}>
          <label>Color</label>
          <div className={styles.colors}>
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`${styles.colorSwatch} ${formData.color === c ? styles.selectedColor : ""}`}
                style={{ backgroundColor: c }}
                onClick={() => setFormData({ ...formData, color: c })}
              />
            ))}
          </div>
        </div>

        <div className={styles.field}>
          <label>Alias (Optional)</label>
          <input
            type="text"
            value={formData.alias}
            onChange={(e) => setFormData({ ...formData, alias: e.target.value })}
            placeholder="Short name"
            className={styles.input}
          />
        </div>

        <div className={styles.actions}>
            <button type="button" onClick={onClose} className={styles.cancelBtn}>
              Cancel
            </button>
            <button type="submit" className={styles.submitBtn}>
              Save
            </button>
        </div>
      </form>
    </Modal>
  );
}
