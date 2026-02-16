"use client";

import { useState, useEffect } from "react";
import Modal from "../Modal/Modal";
import { Category, CategoryGroup, TransactionType } from "@/types";
import styles from "./CategoryFormModal.module.css";
import { useFinance } from "@/context/FinanceContext";

interface CategoryFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  category?: Category | null;
  initialType?: TransactionType;
}

export default function CategoryFormModal({ isOpen, onClose, category, initialType = 'expense' }: CategoryFormModalProps) {
  const { addCategory, updateCategory, getGroupsByType, currentUser } = useFinance();
  
  const [type, setType] = useState<TransactionType>(initialType);
  const [groupId, setGroupId] = useState<string>("");
  const [name, setName] = useState("");
  const [isGlobal, setIsGlobal] = useState(false); // Only for admins
  
  // Available groups based on selected type
  const availableGroups = getGroupsByType(type);

  useEffect(() => {
    if (isOpen) {
        if (category) {
            // Edit Mode - Find group to get type
            // Note: In real app, we might need value lookup. 
            // For now, assume we can find the group in the context logic if needed, 
            // but here we just need to prepopulate.
            // Wait, we don't have the group object here, just groupId.
            // We need to find the group to know the type.
            // Let's assume the user passes correct initialType or we find it.
            // Actually, better to just rely on category.groupId
            setName(category.name);
            setGroupId(category.groupId);
            setIsGlobal(!category.userId); // If no userId, it's global
        } else {
            // Add Mode
            setType(initialType);
            setName("");
            setGroupId("");
            setIsGlobal(currentUser?.isAdmin ?? false); // Default to Global for Admin
        }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, category]); // Only run when isOpen or category changes

  // Update groups when type changes
  useEffect(() => {
      if (!category && availableGroups.length > 0 && !groupId) {
          setGroupId(availableGroups[0].id);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, availableGroups]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !groupId) return;

    // Determine userId
    // Admin: if isGlobal -> null, else -> currentUser.id
    // User: always currentUser.id
    let userId: string | null = currentUser?.id || null;
    if (currentUser?.isAdmin) {
        userId = isGlobal ? null : currentUser.id;
    }

    if (category) {
        updateCategory(category.id, { name, groupId, userId });
    } else {
        addCategory({ name, groupId, userId });
    }
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={category ? "Edit Category" : "New Category"}>
      <form onSubmit={handleSubmit} className={styles.form}>
        {!category && (
            <div className={styles.typeSelector}>
            {(['income', 'expense', 'transfer'] as TransactionType[]).map(t => (
                <button
                key={t}
                type="button"
                className={`${styles.typeBtn} ${type === t ? styles.selectedType : ''} ${type === t ? styles[t] : ''}`}
                onClick={() => { setType(t); setGroupId(""); }}
                >
                {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
            ))}
            </div>
        )}

        <div className={styles.field}>
            <label>Group</label>
            <select 
                value={groupId} 
                onChange={e => setGroupId(e.target.value)}
                className={styles.select}
                disabled={!!category} // Lock group for editing? Or allow move? Let's lock to simplify.
            >
                <option value="" disabled>Select Group</option>
                {availableGroups.map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                ))}
            </select>
        </div>

        <div className={styles.field}>
          <label>Category Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={styles.input}
            placeholder="e.g. Street Food"
            autoFocus
          />
        </div>

        <div className={styles.formActions}>
          <button type="button" onClick={onClose} className={styles.cancelBtn}>
             Cancel
          </button>
          <button type="submit" className={styles.saveBtn} disabled={!name || !groupId}>
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}
