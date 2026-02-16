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
  const { budgets, updateBudgetTransaction, currentUser } = useFinance();
  
  const budget = budgets.find(b => b.id === id);
  const [isTxModalOpen, setIsTxModalOpen] = useState(false); // To add/edit item
  const [editingItem, setEditingItem] = useState<BudgetTransaction | null>(null);
  
  // Budget Edit Modal
  const [isEditBudgetOpen, setIsEditBudgetOpen] = useState(false);

  if (!budget) return <div style={{padding: 20}}>Budget not found</div>;
  
  const isCreator = currentUser?.id === budget.createdById;
  const items = budget.items || [];

  const pendingItems = items.filter(i => i.status === 'pending');
  const doneItems = items.filter(i => i.status === 'done');
  const cancelledItems = items.filter(i => i.status === 'cancelled');

  const totalPlanned = pendingItems.reduce((sum, i) => sum + i.plannedAmount, 0) + doneItems.reduce((sum, i) => sum + (i.actualAmount || 0), 0);
  const totalActual = doneItems.reduce((sum, i) => sum + (i.actualAmount || 0), 0);
  const leftToSpend = Math.max(0, totalPlanned - totalActual); 

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

  return (
    <div className={styles.container}>
       {/* Custom Header with Back Button */}
       <div className={styles.header}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <button onClick={() => router.back()} style={{background:'none', border:'none', marginBottom: 16, padding:0, cursor:'pointer'}}>
                    <ArrowLeft size={24} color="var(--foreground)" />
                </button>
                {isCreator && (
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
               <h3 className={styles.sectionTitle}>Pending</h3>
               {pendingItems.map(item => (
                   <div 
                        key={item.id} 
                        className={styles.itemCard}
                        onClick={() => { if(isCreator) { setEditingItem(item); setIsTxModalOpen(true); } }}
                        style={{cursor: isCreator ? 'pointer' : 'default'}}
                   >
                       <div className={styles.itemInfo}>
                           <div className={styles.itemName}>{item.name}</div>
                           <div className={styles.itemMeta}>{new Date(item.date).toLocaleDateString()}</div>
                       </div>
                       <div className={styles.itemAmount}>
                            <div className={styles.planAmount}>
                                <Money amount={item.plannedAmount} />
                            </div>
                            {isCreator && (
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
               ))}
           </div>
       )}

       {/* Done Items */}
       {doneItems.length > 0 && (
           <div className={styles.section}>
               <h3 className={styles.sectionTitle}>Completed</h3>
               {doneItems.map(item => (
                   <div 
                        key={item.id} 
                        className={styles.itemCard} 
                        style={{opacity: 0.8, cursor: isCreator ? 'pointer' : 'default'}}
                        onClick={() => { if(isCreator) { setEditingItem(item); setIsTxModalOpen(true); } }}
                    >
                       <div className={styles.itemInfo}>
                           <div className={styles.itemName}>{item.name}</div>
                           <div className={styles.itemMeta}>Paid on {new Date(item.date).toLocaleDateString()}</div>
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
               ))}
           </div>
       )}
       
       {/* Cancelled Items */}
       {cancelledItems.length > 0 && (
           <div className={styles.section}>
               <h3 className={styles.sectionTitle}>Cancelled</h3>
               {cancelledItems.map(item => (
                   <div 
                        key={item.id} 
                        className={styles.itemCard} 
                        style={{opacity: 0.6, cursor: isCreator ? 'pointer' : 'default'}}
                        onClick={() => { if(isCreator) { setEditingItem(item); setIsTxModalOpen(true); } }}
                    >
                       <div className={styles.itemInfo}>
                           <div className={styles.itemName} style={{textDecoration:'line-through', color: 'var(--text-secondary)'}}>{item.name}</div>
                       </div>
                       <div className={styles.itemAmount}>
                            <div className={styles.planAmount}>${item.plannedAmount.toLocaleString()}</div>
                       </div>
                   </div>
               ))}
           </div>
       )}

       {isCreator && (
           <button className={styles.fab} onClick={() => { setEditingItem(null); setIsTxModalOpen(true); }}>
                <Plus size={24} />
           </button>
       )}
       
       {isTxModalOpen && <BudgetTransactionModal 
            isOpen={isTxModalOpen} 
            onClose={() => { setIsTxModalOpen(false); setEditingItem(null); }} 
            budgetId={budget.id}
            itemToEdit={editingItem}
       />}

       {isEditBudgetOpen && (
           <div style={{position:'fixed', zIndex: 100}}>
                <BudgetFormModal 
                    isOpen={isEditBudgetOpen}
                    onClose={() => setIsEditBudgetOpen(false)}
                    budgetToEdit={budget}
                />
                 {/* Delete Button injected into modal or separate? 
                     BudgetFormModal currently doesn't have Delete. 
                     I will handle it here or modify Modal.
                     Let's modify Modal nicely. OR adding a DELETE button in the header of this page might be easier?
                     "Only creator can edit/delete".
                     I added "Edit" button.
                     I can add "Delete" next to it or inside the modal.
                     Inside modal is cleaner for "Edit Budget" flow.
                     But I need to pass onDelete prop to BudgetFormModal.
                 */}
           </div>
       )}
    </div>
  );
}
