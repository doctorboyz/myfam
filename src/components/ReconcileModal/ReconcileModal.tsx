"use client";

import { useState } from "react";
import Modal from "../Modal/Modal";
import styles from "./ReconcileModal.module.css";

interface ReconcileModalProps {
  isOpen: boolean;
  onClose: () => void;
  accountName: string;
  currentSystemBalance: number;
  onConfirm: (newBalance: number) => void;
}

export default function ReconcileModal({ isOpen, onClose, accountName, currentSystemBalance, onConfirm }: ReconcileModalProps) {
  const [actualBalance, setActualBalance] = useState<number | "">("");

  const diff = typeof actualBalance === "number" ? actualBalance - currentSystemBalance : 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (typeof actualBalance !== "number") return;
    onConfirm(actualBalance);
    onClose();
    setActualBalance(""); // Reset
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="กระทบยอด">
      <form onSubmit={handleSubmit} className={styles.form}>
        <p className={styles.description}>
          อัปเดต <strong>{accountName}</strong> ให้ตรงกับยอดจริง
        </p>

        <div className={styles.stats}>
          <div className={styles.stat}>
            <span>ยอดในระบบ</span>
            <strong>{currentSystemBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
          </div>
        </div>

        <div className={styles.field}>
          <label>ยอดจริง (ที่มีอยู่ตอนนี้)</label>
          <input
            type="number"
            step="0.01"
            value={actualBalance}
            onChange={(e) => setActualBalance(parseFloat(e.target.value))}
            placeholder="0.00"
            required
            className={styles.input}
            autoFocus
          />
        </div>

        {typeof actualBalance === "number" && (
          <div className={styles.difference}>
            <span>ผลต่าง: </span>
            <span style={{ color: diff >= 0 ? "var(--success)" : "var(--danger)" }}>
              {diff >= 0 ? "+" : ""}{diff.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>
        )}

        <button type="submit" className={styles.submitBtn}>
          ยืนยันการปรับยอด
        </button>
      </form>
    </Modal>
  );
}
