"use client";

import { useState, useMemo } from "react";
import { Plus } from "lucide-react";
import styles from "./CategorySelector.module.css";
import { Category, CategoryGroup, TransactionType } from "@/types";

interface CategorySelectorProps {
  value: string; // category name
  onChange: (categoryName: string) => void;
  onAddNew: () => void;
  categories: Category[];
  groups: CategoryGroup[];
  transactionType: TransactionType;
}

export default function CategorySelector({
  value,
  onChange,
  onAddNew,
  categories,
  groups,
  transactionType,
}: CategorySelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState("");

  // Get groups for current type
  const currentGroups = groups.filter(g => g.type === transactionType);

  // Filter categories by current type + search
  const filteredCategories = useMemo(() => {
    const searchLower = searchText.toLowerCase();
    return categories
      .filter(c => {
        const group = groups.find(g => g.id === c.groupId);
        return group?.type === transactionType;
      })
      .filter(c => c.name.toLowerCase().includes(searchLower))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [categories, groups, transactionType, searchText]);

  // Group filtered categories by group name
  const groupedCategories = useMemo(() => {
    const grouped: Record<string, Category[]> = {};
    filteredCategories.forEach(cat => {
      const group = groups.find(g => g.id === cat.groupId);
      const groupName = group?.name || "Other";
      if (!grouped[groupName]) {
        grouped[groupName] = [];
      }
      grouped[groupName].push(cat);
    });
    return grouped;
  }, [filteredCategories, groups]);

  const selectedCat = categories.find(c => c.name === value);

  return (
    <div className={styles.container}>
      <label className={styles.label}>Category</label>

      <div className={styles.selectorWrapper}>
        <div
          className={`${styles.selectorInput} ${isOpen ? styles.active : ""}`}
          onClick={() => setIsOpen(!isOpen)}
        >
          <span className={styles.selectedValue}>
            {value || "Select Category"}
          </span>
          <span className={styles.arrow}>▼</span>
        </div>

        {isOpen && (
          <div className={styles.dropdown}>
            <div className={styles.searchBox}>
              <input
                type="text"
                placeholder="Search categories..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className={styles.searchInput}
                autoFocus
              />
            </div>

            <div className={styles.categoryList}>
              {Object.entries(groupedCategories).length === 0 ? (
                <div className={styles.empty}>No categories found</div>
              ) : (
                Object.entries(groupedCategories).map(([groupName, cats]) => (
                  <div key={groupName} className={styles.group}>
                    <div className={styles.groupName}>{groupName}</div>
                    <div className={styles.groupCategories}>
                      {cats.map(cat => (
                        <div
                          key={cat.id}
                          className={`${styles.categoryItem} ${
                            cat.id === selectedCat?.id ? styles.selected : ""
                          }`}
                          onClick={() => {
                            onChange(cat.name);
                            setIsOpen(false);
                            setSearchText("");
                          }}
                        >
                          <span>{cat.name}</span>
                          {cat.isCustom && (
                            <span className={styles.customBadge}>custom</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>

            <button
              type="button"
              className={styles.addNewBtn}
              onClick={() => {
                setIsOpen(false);
                setSearchText("");
                onAddNew();
              }}
            >
              <Plus size={16} /> Add New Category
            </button>
          </div>
        )}
      </div>

      {/* Close dropdown when clicking outside */}
      {isOpen && (
        <div
          className={styles.overlay}
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}
