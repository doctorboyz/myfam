"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFinance } from "@/context/FinanceContext";
import Modal from "../Modal/Modal";
import styles from "./BudgetFormModal.module.css";
import { Budget, BudgetPurpose } from "@/types";

interface BudgetFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  budgetToEdit?: Budget;
  defaultPurpose?: BudgetPurpose;
}

export default function BudgetFormModal({ isOpen, onClose, budgetToEdit, defaultPurpose = "spending" }: BudgetFormModalProps) {
  const { addBudget, updateBudget, deleteBudget, accounts, users, currentUser } = useFinance();
  const router = useRouter();
  const [title, setTitle] = useState(budgetToEdit?.title || "");
  const [description, setDescription] = useState(budgetToEdit?.description || "");
  const [purpose, setPurpose] = useState<BudgetPurpose>(budgetToEdit?.purpose ?? defaultPurpose);
  const [limit, setLimit] = useState(budgetToEdit?.limit?.toString() || "");
  const [period, setPeriod] = useState(budgetToEdit?.period || "one_time");
  const [startDate, setStartDate] = useState(budgetToEdit?.startDate || new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(budgetToEdit?.endDate || "");
  const [targetAccountId, setTargetAccountId] = useState(budgetToEdit?.targetAccountId || "");
  const [rewardForUserId, setRewardForUserId] = useState(budgetToEdit?.rewardForUserId || "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const payload: any = {
      title,
      description,
      purpose,
      limit: parseFloat(limit),
      period: period as 'monthly' | 'one_time',
      startDate,
      endDate,
      targetAccountId: targetAccountId || undefined,
      rewardForUserId: rewardForUserId || undefined,
    };

    if (budgetToEdit) {
      updateBudget(budgetToEdit.id, payload);
    } else {
      addBudget({ ...payload, items: [] });
    }
    onClose();
  };

  const isParent = currentUser?.role === 'parent' || currentUser?.isAdmin;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={budgetToEdit ? "แก้ไข" : "สร้างใหม่"}>
      <form onSubmit={handleSubmit}>
        {!budgetToEdit && (
          <div className={styles.formGroup}>
            <label className={styles.label}>ประเภท</label>
            <select
              className={styles.input}
              value={purpose}
              onChange={(e) => {
                const p = e.target.value as BudgetPurpose;
                setPurpose(p);
                if (p !== "spending") setPeriod("one_time");
              }}
            >
              <option value="spending">งบประมาณรายจ่าย</option>
              <option value="savings">เป้าหมายการออม</option>
              <option value="reward">รางวัล</option>
            </select>
          </div>
        )}

        <div className={styles.formGroup}>
          <label className={styles.label}>{purpose === "reward" ? "ชื่อรางวัล" : "ชื่องบประมาณ"}</label>
          <input
            type="text"
            className={styles.input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={purpose === "reward" ? "เช่น ช่วยงานบ้าน" : "เช่น ทริปญี่ปุ่น"}
            required
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>รายละเอียด</label>
          <textarea
            className={styles.textarea}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="รายละเอียด (ไม่จำเป็น)"
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>
            {purpose === "savings" ? "เป้าหมายเงิน" : purpose === "reward" ? "เงินรางวัล" : "วงเงิน"}
          </label>
          <input
            type="number"
            className={styles.input}
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            placeholder="0.00"
            required
          />
        </div>

        {purpose === "spending" && (
          <div className={styles.formGroup}>
            <label className={styles.label}>รอบระยะเวลา</label>
            <select
              className={styles.input}
              value={period}
              onChange={(e) => setPeriod(e.target.value as 'monthly' | 'one_time')}
            >
              <option value="one_time">ครั้งเดียว</option>
              <option value="monthly">รายเดือน</option>
            </select>
          </div>
        )}

        <div className={styles.formGroup}>
          <label className={styles.label}>วันเริ่มต้น</label>
          <input
            type="date"
            className={styles.input}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>วันสิ้นสุด (ไม่จำเป็น)</label>
          <input
            type="date"
            className={styles.input}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>

        {(purpose === "savings" || purpose === "reward") && (
          <div className={styles.formGroup}>
            <label className={styles.label}>
              {purpose === "savings" ? "ออมเข้าบัญชี" : "โอนเข้าบัญชี"}
            </label>
            <select
              className={styles.input}
              value={targetAccountId}
              onChange={(e) => setTargetAccountId(e.target.value)}
              required
            >
              <option value="">เลือกบัญชี...</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
        )}

        {purpose === "reward" && isParent && (
          <div className={styles.formGroup}>
            <label className={styles.label}>ให้ใคร</label>
            <select
              className={styles.input}
              value={rewardForUserId}
              onChange={(e) => setRewardForUserId(e.target.value)}
              required
            >
              <option value="">เลือกสมาชิก...</option>
              {users
                .filter((u) => u.id !== currentUser?.id)
                .map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
            </select>
          </div>
        )}

        <div className={styles.actions}>
          {budgetToEdit && (
            <button
              type="button"
              onClick={async () => {
                if (confirm("ลบงบประมาณนี้? รายการที่รอดำเนินการจะถูกยกเลิก")) {
                  await deleteBudget(budgetToEdit.id);
                  onClose();
                  router.push("/budget");
                }
              }}
              className={styles.deleteBtn}
              style={{ marginRight: "auto", background: "transparent", color: "var(--danger)", border: "none", cursor: "pointer", fontWeight: 600 }}
            >
              ลบ
            </button>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>
              ยกเลิก
            </button>
            <button type="submit" className={styles.submitBtn}>
              บันทึก
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
