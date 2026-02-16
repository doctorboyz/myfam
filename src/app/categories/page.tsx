"use client";

import { useState } from "react";
import BottomNav from "@/components/BottomNav/BottomNav";
import CategoryFormModal from "@/components/CategoryFormModal/CategoryFormModal";
import CategoryGroupFormModal from "@/components/CategoryGroupFormModal/CategoryGroupFormModal";
import styles from "./categories.module.css";
import { useFinance } from "@/context/FinanceContext";
import { Category, CategoryGroup, TransactionType } from "@/types";
import { ChevronDown, ChevronRight, Plus, Edit2, FolderPlus } from "lucide-react";

export default function CategoriesPage() {
  const { getGroupsByType, getCategoriesByGroup, currentUser } = useFinance();
  const [activeTab, setActiveTab] = useState<TransactionType>('expense');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);

  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<CategoryGroup | null>(null);

  const toggleGroup = (groupId: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupId)) {
        newExpanded.delete(groupId);
    } else {
        newExpanded.add(groupId);
    }
    setExpandedGroups(newExpanded);
  };

  const handleEdit = (category: Category) => {
    setSelectedCategory(category);
    setIsModalOpen(true);
  };

  const handleAdd = () => {
    setSelectedCategory(null);
    setIsModalOpen(true);
  };

  const handleEditGroup = (group: CategoryGroup) => {
      setSelectedGroup(group);
      setIsGroupModalOpen(true);
  };
  
  const handleAddGroup = () => {
      setSelectedGroup(null);
      setIsGroupModalOpen(true);
  };

  const groupsList = getGroupsByType(activeTab);

  return (
    <div className={styles.container}>
      
      <div className={styles.content}>
        {/* Type Tabs */}
        <div className={styles.tabs}>
            {(['income', 'expense', 'transfer'] as TransactionType[]).map(t => (
                <button
                    key={t}
                    className={`${styles.tab} ${activeTab === t ? styles.activeTab : ''} ${styles[t]}`}
                    onClick={() => setActiveTab(t)}
                >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
            ))}
        </div>

        {/* Groups List */}
        <div className={styles.list}>
            {groupsList.map(group => {
                const groupCats = getCategoriesByGroup(group.id);
                const isExpanded = expandedGroups.has(group.id);

                return (
                    <div key={group.id} className={styles.groupItem}>
                        <div 
                            className={styles.groupHeader} 
                            onClick={() => toggleGroup(group.id)}
                        >
                            <span className={styles.groupName}>{group.name}</span>
                            <div className={styles.groupMeta}>
                                {currentUser?.isAdmin && (
                                    <button 
                                        className={styles.editBtn}
                                        style={{ marginRight: 8 }}
                                        onClick={(e) => { e.stopPropagation(); handleEditGroup(group); }}
                                    >
                                        <Edit2 size={16} />
                                    </button>
                                )}
                                <span className={styles.count}>{groupCats.length}</span>
                                {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                            </div>
                        </div>
                        
                        {isExpanded && (
                            <div className={styles.categoryList}>
                                {groupCats.map(cat => (
                                    <div key={cat.id} className={styles.categoryItem}>
                                        <span className={styles.categoryName}>{cat.name}</span>
                                        {/* 
                                            Show Edit if: 
                                            1. Admin (can edit Global or Personal?) -> Req: "add/edit category userid=null specific admin"
                                            2. Owner (userId matches) -> Req: "add/edit category userid who create can do"
                                            
                                            Global Category (userId is null/undefined): Only Admin
                                            Personal Category (userId is set): Only Owner
                                        */}
                                        {((!cat.userId && currentUser?.isAdmin) || (cat.userId && cat.userId === currentUser?.id)) && (
                                            <button 
                                                className={styles.editBtn}
                                                onClick={(e) => { e.stopPropagation(); handleEdit(cat); }}
                                            >
                                                <Edit2 size={16} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                                {groupCats.length === 0 && (
                                    <div className={styles.emptyState}>No categories</div>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
      </div>



      <CategoryFormModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        category={selectedCategory}
        initialType={activeTab}
      />
      
      <CategoryGroupFormModal 
        isOpen={isGroupModalOpen} 
        onClose={() => setIsGroupModalOpen(false)} 
        group={selectedGroup}
        initialType={activeTab}
      />
      
      <div className={styles.fabContainer}>
          {currentUser?.isAdmin && (
            <button className={styles.fabSecondary} onClick={handleAddGroup} title="New Group">
                <FolderPlus size={20} color="var(--primary)" />
            </button>
          )}
          <button className={styles.fab} onClick={handleAdd}>
            <Plus size={24} color="white" />
          </button>
      </div>
      
      <BottomNav />
    </div>
  );
}
