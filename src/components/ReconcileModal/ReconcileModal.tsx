"use client";

import { useState } from "react";
import Modal from "../Modal/Modal";
import { Account } from "@/types";
import { parseReconcile } from "@/lib/reconcile-parser";
import styles from "./ReconcileModal.module.css";

interface ReconcileModalProps {
  isOpen: boolean;
  onClose: () => void;
  accountName: string;
  currentSystemBalance: number;
  accounts?: Account[];
  onConfirm: (newBalance: number) => void;
}

export default function ReconcileModal({ isOpen, onClose, accountName, currentSystemBalance, accounts = [], onConfirm }: ReconcileModalProps) {
  const [actualBalance, setActualBalance] = useState<number | "">("");
  const [quickParseText, setQuickParseText] = useState("");

  const diff = typeof actualBalance === "number" ? actualBalance - currentSystemBalance : 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (typeof actualBalance !== "number") return;
    onConfirm(actualBalance);
    onClose();
    setActualBalance(""); // Reset
  };

  const handleQuickParse = (text: string) => {
    setQuickParseText(text);
    if (!text.trim() || accounts.length === 0) return;

    const parsed = parseReconcile(text, accounts);
    if (!parsed || parsed.confidence < 0.5) return;

    setActualBalance(parsed.newBalance);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="กระทบยอด">
      <form onSubmit={handleSubmit} className={styles.form}>
        {accounts.length > 0 && (
          <div className={styles.quickParse}>
            <div className={styles.quickParseLabel}>พิมพ์เร็ว</div>
            <input
              type="text"
              className={styles.quickParseInput}
              value={quickParseText}
              onChange={(e) => handleQuickParse(e.target.value)}
              placeholder='เช่น "ยอดจริง 15000 กรุงไทย"'
            />
            <div className={styles.quickParseHint}>
              พิมพ์ข้อความ → กรอกยอดอัตโนมัติ
            </div>
          </div>
        )}

        <p className={styles.description}>
          อัปเดต <strong>{accountName}</strong> ให้ตรงกับยอดจริง
        </p>

        <div className={styles.stats}>
          <div className={styles.stat}>
            <span>ยอดในระบบ</span>
            <strong>฿{currentSystemBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
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
              {diff >= 0 ? "+" : ""}฿{diff.toLocaleString('en-US', { minimumFractionDigits: 2 })}
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
