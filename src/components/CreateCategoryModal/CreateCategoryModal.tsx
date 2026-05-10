"use client";

import { useState } from "react";
import Modal from "../Modal/Modal";
import styles from "./CreateCategoryModal.module.css";
import { useFinance } from "@/context/FinanceContext";
import { TransactionType } from "@/types";

interface CreateCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (categoryName: string) => void;
  transactionType?: TransactionType;
}

export default function CreateCategoryModal({
  isOpen,
  onClose,
  onSuccess,
  transactionType = "expense",
}: CreateCategoryModalProps) {
  const { addCategory, groups } = useFinance();
  const [categoryName, setCategoryName] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const availableGroups = groups.filter(g => g.type === transactionType);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!categoryName.trim()) {
      alert("กรุณาใส่ชื่อหมวดหมู่");
      return;
    }

    if (!selectedGroupId) {
      alert("กรุณาเลือกกลุ่ม");
      return;
    }

    setIsLoading(true);
    try {
      await addCategory({
        name: categoryName.trim(),
        groupId: selectedGroupId,
        isCustom: true,
        userId: null, // Global category
      });

      onSuccess?.(categoryName.trim());
      setCategoryName("");
      setSelectedGroupId("");
      onClose();
    } catch (err) {
      console.error("Failed to create category:", err);
      alert("สร้างหมวดหมู่ไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="เพิ่มหมวดหมู่ใหม่">
      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.formGroup}>
          <label className={styles.label}>ชื่อหมวดหมู่</label>
          <input
            type="text"
            value={categoryName}
            onChange={(e) => setCategoryName(e.target.value)}
            placeholder="เช่น อาหารริมทาง"
            className={styles.input}
            disabled={isLoading}
            autoFocus
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>กลุ่ม</label>
          <select
            value={selectedGroupId}
            onChange={(e) => setSelectedGroupId(e.target.value)}
            className={styles.select}
            disabled={isLoading}
            required
          >
            <option value="" disabled>
              เลือกกลุ่ม
            </option>
            {availableGroups.map(group => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.hint}>
          หมวดหมู่นี้จะมองเห็นได้เฉพาะคุณ
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            onClick={onClose}
            className={styles.cancelBtn}
            disabled={isLoading}
          >
            ยกเลิก
          </button>
          <button
            type="submit"
            className={styles.submitBtn}
            disabled={isLoading}
          >
            {isLoading ? "กำลังสร้าง..." : "สร้างหมวดหมู่"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
