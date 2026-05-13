"use client";

import { useFinance } from "@/context/FinanceContext";
import styles from "./budget.module.css";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useState } from "react";
import BudgetFormModal from "@/components/BudgetFormModal/BudgetFormModal";
import { Budget, BudgetPurpose } from "@/types";
import Money from "@/components/Money/Money";

const TABS: { key: BudgetPurpose; label: string }[] = [
  { key: "spending", label: "รายจ่าย" },
  { key: "savings", label: "ออม" },
  { key: "reward", label: "รางวัล" },
];

export default function BudgetPage() {
  const { budgets, accounts, currentUser } = useFinance();
  const [activeTab, setActiveTab] = useState<BudgetPurpose>("spending");
  const [isModalOpen, setIsModalOpen] = useState(false);

  const filtered = budgets.filter((b) => (b.purpose ?? "spending") === activeTab);

  const calculateProgress = (budget: Budget) => {
    const purpose = budget.purpose ?? "spending";
    const items = budget.items || [];

    if (purpose === "spending") {
      const pendingItems = items.filter((item) => item.status === "pending");
      const doneItems = items.filter((item) => item.status === "done");
      const pendingPlanned = pendingItems.reduce((sum, item) => sum + item.plannedAmount, 0);
      const doneActual = doneItems.reduce((sum, item) => sum + (item.actualAmount || 0), 0);
      const planned = pendingPlanned + doneActual;
      const actual = doneActual;
      const percent = planned > 0 ? Math.min((actual / planned) * 100, 100) : 0;
      return { planned, actual, percent, labelDone: "ใช้ไป", labelPlanned: "วางแผนไว้" };
    }

    if (purpose === "savings") {
      const doneItems = items.filter((item) => item.status === "done");
      // For savings: income/transfer transactions that are completed
      const saved = doneItems.reduce((sum, item) => sum + (item.actualAmount || item.plannedAmount || 0), 0);
      const percent = budget.limit > 0 ? Math.min((saved / budget.limit) * 100, 100) : 0;
      return { planned: budget.limit, actual: saved, percent, labelDone: "ออมแล้ว", labelPlanned: "เป้าหมาย" };
    }

    // reward
    const doneItems = items.filter((item) => item.status === "done");
    const rewarded = doneItems.reduce((sum, item) => sum + (item.actualAmount || item.plannedAmount || 0), 0);
    const percent = budget.limit > 0 ? Math.min((rewarded / budget.limit) * 100, 100) : 0;
    return { planned: budget.limit, actual: rewarded, percent, labelDone: "ให้แล้ว", labelPlanned: "เป้าหมาย" };
  };

  const getTargetAccountName = (id?: string) => {
    if (!id) return "";
    const acct = accounts.find((a) => a.id === id);
    return acct ? acct.name : "";
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>งบประมาณ</h1>
        <button className={styles.addBtn} onClick={() => setIsModalOpen(true)}>
          <Plus size={18} />
          สร้างใหม่
        </button>
      </div>

      <div className={styles.tabBar}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={`${styles.tab} ${activeTab === tab.key ? styles.tabActive : ""}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className={styles.grid}>
        {filtered.map((budget) => {
          const { planned, actual, percent, labelDone, labelPlanned } = calculateProgress(budget);
          const isOver = actual > planned && budget.purpose === "spending";
          return (
            <Link href={`/budget/${budget.id}`} key={budget.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <div className={styles.cardTitle}>{budget.title}</div>
                  <div className={styles.cardDescription}>
                    {budget.description}
                    {budget.targetAccountId && (
                      <span style={{ display: "block", marginTop: 2 }}>
                        บัญชี: {getTargetAccountName(budget.targetAccountId)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className={styles.progressSection}>
                <div className={styles.progressBar}>
                  <div
                    className={styles.progressFill}
                    style={{ width: `${percent}%`, backgroundColor: isOver ? "var(--danger)" : undefined }}
                  />
                </div>
                <div className={styles.stats}>
                  <div className={styles.statItem}>
                    <span className={styles.label}>{labelPlanned}</span>
                    <span className={styles.amount}>
                      <Money amount={planned} />
                    </span>
                  </div>
                  <div className={styles.statItem} style={{ alignItems: "flex-end" }}>
                    <span className={styles.label}>
                      {percent.toFixed(0)}% {labelDone}
                    </span>
                    <span className={styles.amount} style={{ color: isOver ? "var(--danger)" : undefined }}>
                      <Money amount={actual} colored={false} />
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {isModalOpen && (
        <BudgetFormModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          defaultPurpose={activeTab}
        />
      )}
    </div>
  );
}
