"use client";

import { useFinance } from "@/context/FinanceContext";
import styles from "./budget.module.css";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useState } from "react";
import BudgetFormModal from "@/components/BudgetFormModal/BudgetFormModal";
import { Budget } from "@/types";
import Money from "@/components/Money/Money";

export default function BudgetPage() {
  const { budgets } = useFinance();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const calculateProgress = (budget: Budget) => {
    const items = budget.items || [];
    const pendingItems = items.filter(item => item.status === 'pending');
    const doneItems = items.filter(item => item.status === 'done');

    // Logic: Total Plan = Pending Planned + Done Actual
    const pendingPlanned = pendingItems.reduce((sum, item) => sum + item.plannedAmount, 0);
    const doneActual = doneItems.reduce((sum, item) => sum + (item.actualAmount || 0), 0);
    
    const planned = pendingPlanned + doneActual;
    const actual = doneActual;
    const percent = planned > 0 ? Math.min((actual / planned) * 100, 100) : 0;
    
    return { planned, actual, percent };
  };

  return (
    <div className={styles.container}>

      
      <div className={styles.grid}>
        {budgets.map((budget) => {
            const { planned, actual, percent } = calculateProgress(budget);
            return (
                <Link href={`/budget/${budget.id}`} key={budget.id} className={styles.card}>
                    <div className={styles.cardHeader}>
                        <div>
                            <div className={styles.cardTitle}>{budget.title}</div>
                            <div className={styles.cardDescription}>{budget.description}</div>
                        </div>
                    </div>
                    
                    <div className={styles.progressSection}>
                        <div className={styles.progressBar}>
                            <div 
                                className={styles.progressFill} 
                                style={{ width: `${percent}%`, backgroundColor: percent > 100 ? '#FF3B30' : undefined }} 
                            />
                        </div>
                        <div className={styles.stats}>


                             <div className={styles.statItem}>
                                <span className={styles.label}>Planned</span>
                                <span className={styles.amount}>
                                    <Money amount={planned} />
                                </span>
                             </div>
                             <div className={styles.statItem} style={{alignItems: 'flex-end'}}>
                                <span className={styles.label}>{percent.toFixed(0)}% Used</span>
                                <span className={styles.amount} style={{color: percent > 100 ? '#FF3B30' : undefined}}>
                                    <Money amount={actual} colored={false} />
                                </span>
                             </div>
                        </div>
                    </div>
                </Link>
            );
        })}
      </div>

      <button className={styles.fab} onClick={() => setIsModalOpen(true)}>
        <Plus size={24} />
      </button>

      {isModalOpen && <BudgetFormModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />}
    </div>
  );
}
