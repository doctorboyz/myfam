"use client";

import { useFinance } from "@/context/FinanceContext";
import styles from "./budgetDetail.module.css";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Plus, Check, X } from "lucide-react";
import { useState } from "react";
import { BudgetTransaction } from "@/types";
import BudgetTransactionModal from "@/components/BudgetTransactionModal/BudgetTransactionModal";
import BudgetFormModal from "@/components/BudgetFormModal/BudgetFormModal";
import Money from "@/components/Money/Money";

export default function BudgetDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { budgets, updateBudgetTransaction, currentUser, users } = useFinance();
  
  const budget = budgets.find(b => b.id === id);
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<BudgetTransaction | null>(null);
  const [isEditBudgetOpen, setIsEditBudgetOpen] = useState(false);

  if (!budget) return <div style={{padding: 20}}>Budget not found</div>;
  
  const isBudgetCreator = currentUser?.id === budget.createdById;
  const items = budget.items || [];

  const pendingItems = items.filter(i => i.status === 'pending');
  const doneItems = items.filter(i => i.status === 'done');
  const cancelledItems = items.filter(i => i.status === 'cancelled');

  const totalPlanned = pendingItems.reduce((sum, i) => sum + i.plannedAmount, 0) + doneItems.reduce((sum, i) => sum + (i.actualAmount || 0), 0);
  const totalActual = doneItems.reduce((sum, i) => sum + (i.actualAmount || 0), 0);
  const leftToSpend = Math.max(0, totalPlanned - totalActual); 

  // Helper: can current user edit this item?
  const canEditItem = (item: BudgetTransaction) =>
    isBudgetCreator || currentUser?.id === item.createdById;

  // Helper: get user display info from createdById
  const getItemCreator = (item: BudgetTransaction) => {
    if (!item.createdById) return null;
    return users.find(u => u.id === item.createdById) ?? null;
  };

  // Handlers
  const handleMarkDone = (item: BudgetTransaction) => {
    setEditingItem({...item, status: 'done', actualAmount: item.actualAmount || item.plannedAmount, date: new Date().toISOString().split('T')[0]});
    setIsTxModalOpen(true);
  };

  const handleCancel = (item: BudgetTransaction) => {
    if (confirm('Are you sure you want to cancel this item?')) {
      updateBudgetTransaction(budget.id, item.id, { status: 'cancelled' });
    }
  };

  const handleItemClick = (item: BudgetTransaction) => {
    if (canEditItem(item)) {
      setEditingItem(item);
      setIsTxModalOpen(true);
    }
  };

  // Creator badge component (inline)
  const CreatorBadge = ({ item }: { item: BudgetTransaction }) => {
    const creator = getItemCreator(item);
    if (!creator) return null;
    const isMe = creator.id === currentUser?.id;
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 11,
        color: 'var(--text-secondary)',
        marginTop: 2,
      }}>
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 16,
          height: 16,
          borderRadius: '50%',
          backgroundColor: creator.color || '#888',
          color: '#fff',
          fontSize: 9,
          fontWeight: 700,
          flexShrink: 0,
        }}>
          {creator.name.charAt(0).toUpperCase()}
        </span>
        {isMe ? 'คุณ' : creator.name}
      </span>
    );
  };

  return (
    <div className={styles.container}>
       {/* Header */}
       <div className={styles.header}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <button onClick={() => router.back()} style={{background:'none', border:'none', marginBottom: 16, padding:0, cursor:'pointer'}}>
                    <ArrowLeft size={24} color="var(--foreground)" />
                </button>
                {isBudgetCreator && (
                    <button 
                        onClick={() => setIsEditBudgetOpen(true)}
                        style={{
                            background: 'none', 
                            border: 'none', 
                            color: 'var(--primary)', 
                            fontSize: '14px', 
                            fontWeight: 600,
                            cursor: 'pointer'
                        }}
                    >
                        Edit
                    </button>
                )}
            </div>
            
            <h1 className={styles.title}>{budget.title}</h1>
            <p className={styles.description}>{budget.description}</p>

            <div className={styles.summaryCard}>
                <div className={styles.summaryItem}>
                    <span className={styles.summaryLabel}>Total Planned</span>
                    <span className={styles.summaryValue}>
                        <Money amount={totalPlanned} />
                    </span>
                </div>
                <div className={styles.summaryItem}>
                    <span className={styles.summaryLabel}>Total Spent</span>
                    <span className={styles.summaryValue} style={{color: totalActual > totalPlanned ? 'red' : 'green'}}>
                        <Money amount={totalActual} colored={false} />
                    </span>
                </div>
                 <div className={styles.summaryItem}>
                    <span className={styles.summaryLabel}>Remaining</span>
                    <span className={styles.summaryValue} style={{color: leftToSpend < 0 ? 'red' : 'var(--foreground)'}}>
                        <Money amount={leftToSpend} />
                    </span>
                </div>
            </div>
       </div>

       {/* Pending Items */}
       {pendingItems.length > 0 && (
           <div className={styles.section}>
               <h3 className={styles.sectionTitle}>แผนที่วางไว้</h3>
               {pendingItems.map(item => {
                 const editable = canEditItem(item);
                 return (
                   <div 
                        key={item.id} 
                        className={styles.itemCard}
                        onClick={() => handleItemClick(item)}
                        style={{cursor: editable ? 'pointer' : 'default'}}
                   >
                       <div className={styles.itemInfo}>
                           <div className={styles.itemName}>{item.name}</div>
                           <CreatorBadge item={item} />
                           <div className={styles.itemMeta}>{new Date(item.date).toLocaleDateString('th-TH')}</div>
                       </div>
                       <div className={styles.itemAmount}>
                            <div className={styles.planAmount}>
                                <Money amount={item.plannedAmount} />
                            </div>
                            {/* Done/Cancel: only budget creator */}
                            {isBudgetCreator && (
                                <div className={styles.actions}>
                                    <button className={`${styles.actionBtn} ${styles.btnDone}`} onClick={(e) => { e.stopPropagation(); handleMarkDone(item); }}>
                                        <Check size={14} style={{marginRight:4}} /> Done
                                    </button>
                                    <button className={`${styles.actionBtn} ${styles.btnCancel}`} onClick={(e) => { e.stopPropagation(); handleCancel(item); }}>
                                        <X size={14} />
                                    </button>
                                </div>
                            )}
                       </div>
                   </div>
                 );
               })}
           </div>
       )}

       {/* Done Items */}
       {doneItems.length > 0 && (
           <div className={styles.section}>
               <h3 className={styles.sectionTitle}>Completed</h3>
               {doneItems.map(item => {
                 const editable = canEditItem(item);
                 return (
                   <div 
                        key={item.id} 
                        className={styles.itemCard} 
                        style={{opacity: 0.8, cursor: editable ? 'pointer' : 'default'}}
                        onClick={() => handleItemClick(item)}
                    >
                       <div className={styles.itemInfo}>
                           <div className={styles.itemName}>{item.name}</div>
                           <CreatorBadge item={item} />
                           <div className={styles.itemMeta}>Paid on {new Date(item.date).toLocaleDateString('th-TH')}</div>
                       </div>
                       <div className={styles.itemAmount}>
                            <div className={styles.actualAmount}>
                                <Money amount={item.actualAmount} />
                            </div>
                            <div className={styles.itemMeta} style={{textDecoration:'line-through'}}>
                                <Money amount={item.plannedAmount} colored={false} />
                            </div>
                       </div>
                   </div>
                 );
               })}
           </div>
       )}
       
       {/* Cancelled Items */}
       {cancelledItems.length > 0 && (
           <div className={styles.section}>
               <h3 className={styles.sectionTitle}>Cancelled</h3>
               {cancelledItems.map(item => {
                 const editable = canEditItem(item);
                 return (
                   <div 
                        key={item.id} 
                        className={styles.itemCard} 
                        style={{opacity: 0.6, cursor: editable ? 'pointer' : 'default'}}
                        onClick={() => handleItemClick(item)}
                    >
                       <div className={styles.itemInfo}>
                           <div className={styles.itemName} style={{textDecoration:'line-through', color: 'var(--text-secondary)'}}>{item.name}</div>
                           <CreatorBadge item={item} />
                       </div>
                       <div className={styles.itemAmount}>
                            <div className={styles.planAmount}>{item.plannedAmount.toLocaleString()}</div>
                       </div>
                   </div>
                 );
               })}
           </div>
       )}

       {/* Empty state */}
       {items.length === 0 && (
           <div style={{textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)'}}>
               <p style={{fontSize: 14}}>ยังไม่มีแผนการใช้เงิน</p>
               <p style={{fontSize: 12, marginTop: 4}}>กด + เพื่อเริ่มวางแผน</p>
           </div>
       )}

       {/* FAB: ALL users can add plan items */}
       <button className={styles.fab} onClick={() => { setEditingItem(null); setIsTxModalOpen(true); }}>
            <Plus size={24} />
       </button>
       
       {isTxModalOpen && <BudgetTransactionModal 
            isOpen={isTxModalOpen} 
            onClose={() => { setIsTxModalOpen(false); setEditingItem(null); }} 
            budgetId={budget.id}
            itemToEdit={editingItem}
            canEditItem={editingItem ? canEditItem(editingItem) : true}
            isBudgetCreator={isBudgetCreator}
       />}

       {isEditBudgetOpen && (
           <div style={{position:'fixed', zIndex: 100}}>
                <BudgetFormModal 
                    isOpen={isEditBudgetOpen}
                    onClose={() => setIsEditBudgetOpen(false)}
                    budgetToEdit={budget}
                />
           </div>
       )}
    </div>
  );
}
