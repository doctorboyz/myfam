"use client";

import { useState } from "react";
import Modal from "../Modal/Modal";
import styles from "./CreateCategoryModal.module.css";
import { useFinance } from "@/context/FinanceContext";
import { CategoryGroup, TransactionType } from "@/types";

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
      alert("Please enter a category name");
      return;
    }

    if (!selectedGroupId) {
      alert("Please select a group");
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
      alert("Failed to create category. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add New Category">
      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.formGroup}>
          <label className={styles.label}>Category Name</label>
          <input
            type="text"
            value={categoryName}
            onChange={(e) => setCategoryName(e.target.value)}
            placeholder="e.g., Groceries, Gas Station..."
            className={styles.input}
            disabled={isLoading}
            autoFocus
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>Group</label>
          <select
            value={selectedGroupId}
            onChange={(e) => setSelectedGroupId(e.target.value)}
            className={styles.select}
            disabled={isLoading}
            required
          >
            <option value="" disabled>
              Select a group
            </option>
            {availableGroups.map(group => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.hint}>
          This will create a custom category visible only to you.
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            onClick={onClose}
            className={styles.cancelBtn}
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            type="submit"
            className={styles.submitBtn}
            disabled={isLoading}
          >
            {isLoading ? "Creating..." : "Create Category"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
