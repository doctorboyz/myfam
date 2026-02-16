
"use client";

import { useState, useEffect } from "react";
import Modal from "../Modal/Modal";
import { CategoryGroup, TransactionType } from "@/types";
import styles from "./CategoryGroupFormModal.module.css";
import { useFinance } from "@/context/FinanceContext";

interface CategoryGroupFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  group?: CategoryGroup | null;
  initialType?: TransactionType;
}

export default function CategoryGroupFormModal({ isOpen, onClose, group, initialType = 'expense' }: CategoryGroupFormModalProps) {
  const { addGroup, updateGroup } = useFinance();
  
  const [type, setType] = useState<TransactionType>(initialType);
  const [name, setName] = useState("");
  
  useEffect(() => {
    if (isOpen) {
        if (group) {
            // Edit Mode
            setName(group.name);
            setType(group.type);
        } else {
            // Add Mode
            setType(initialType);
            setName("");
        }
    }
  }, [isOpen, group, initialType]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;

    if (group) {
        updateGroup(group.id, { name });
    } else {
        addGroup({ name, type });
    }
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={group ? "Edit Group" : "New Group"}>
      <form onSubmit={handleSubmit} className={styles.form}>
        {!group && (
            <div className={styles.typeSelector}>
            {(['income', 'expense', 'transfer'] as TransactionType[]).map(t => (
                <button
                key={t}
                type="button"
                className={`${styles.typeBtn} ${type === t ? styles.selectedType : ''} ${type === t ? styles[t] : ''}`}
                onClick={() => setType(t)}
                >
                {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
            ))}
            </div>
        )}

        <div className={styles.field}>
          <label>Group Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={styles.input}
            placeholder="e.g. Vacation"
            autoFocus
          />
        </div>

        <div className={styles.formActions}>
          <button type="button" onClick={onClose} className={styles.cancelBtn}>
             Cancel
          </button>
          <button type="submit" className={styles.saveBtn} disabled={!name}>
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}
