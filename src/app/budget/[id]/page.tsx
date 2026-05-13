"use client";

import { useFinance } from "@/context/FinanceContext";
import styles from "./budgetDetail.module.css";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Plus, Check, X, ArrowUpCircle, ArrowDownCircle, Gift } from "lucide-react";
import { useState } from "react";
import { BudgetTransaction } from "@/types";
import BudgetTransactionModal from "@/components/BudgetTransactionModal/BudgetTransactionModal";
import BudgetFormModal from "@/components/BudgetFormModal/BudgetFormModal";
import Money from "@/components/Money/Money";
import { formatBangkokDate } from "@/lib/timezone";

export default function BudgetDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { budgets, updateBudgetTransaction, currentUser, users, accounts } = useFinance();

  const budget = budgets.find((b) => b.id === id);
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<BudgetTransaction | null>(null);
  const [isEditBudgetOpen, setIsEditBudgetOpen] = useState(false);

  if (!budget) return <div style={{ padding: 20 }}>ไม่พบงบประมาณ</div>;

  const purpose = budget.purpose ?? "spending";
  const isBudgetCreator = currentUser?.id === budget.createdById;
  const items = budget.items || [];

  // --- Progress calculation per purpose ---
  const doneItems = items.filter((i) => i.status === "done");

  let totalPlanned = 0;
  let totalActual = 0;
  let leftToSpend = 0;
  let percent = 0;

  if (purpose === "spending") {
    const pendingItems = items.filter((i) => i.status === "pending");
    totalPlanned = pendingItems.reduce((sum, i) => sum + i.plannedAmount, 0) + doneItems.reduce((sum, i) => sum + (i.actualAmount || 0), 0);
    totalActual = doneItems.reduce((sum, i) => sum + (i.actualAmount || 0), 0);
    leftToSpend = Math.max(0, totalPlanned - totalActual);
    percent = totalPlanned > 0 ? Math.min((totalActual / totalPlanned) * 100, 100) : 0;
  } else if (purpose === "savings") {
    totalPlanned = Number(budget.limit);
    totalActual = doneItems.reduce((sum, i) => sum + (i.actualAmount || i.plannedAmount || 0), 0);
    leftToSpend = Math.max(0, totalPlanned - totalActual);
    percent = totalPlanned > 0 ? Math.min((totalActual / totalPlanned) * 100, 100) : 0;
  } else {
    // reward
    totalPlanned = Number(budget.limit);
    totalActual = doneItems.reduce((sum, i) => sum + (i.actualAmount || i.plannedAmount || 0), 0);
    leftToSpend = Math.max(0, totalPlanned - totalActual);
    percent = totalPlanned > 0 ? Math.min((totalActual / totalPlanned) * 100, 100) : 0;
  }

  // --- Helpers ---
  const canEditItem = (item: BudgetTransaction) =>
    isBudgetCreator || currentUser?.id === item.createdById;

  const getItemCreator = (item: BudgetTransaction) => {
    if (!item.createdById) return null;
    return users.find((u) => u.id === item.createdById) ?? null;
  };

  const targetAccount = accounts.find((a) => a.id === budget.targetAccountId);
  const rewardUser = users.find((u) => u.id === budget.rewardForUserId);

  // --- Handlers ---
  const handleMarkDone = (item: BudgetTransaction) => {
    setEditingItem({
      ...item,
      status: "done",
      actualAmount: item.actualAmount || item.plannedAmount,
      date: new Date().toISOString().split("T")[0],
    });
    setIsTxModalOpen(true);
  };

  const handleCancel = (item: BudgetTransaction) => {
    if (confirm("คุณแน่ใจหรือไม่ที่จะยกเลิกรายการนี้?")) {
      updateBudgetTransaction(budget.id, item.id, { status: "cancelled" });
    }
  };

  const handleItemClick = (item: BudgetTransaction) => {
    if (canEditItem(item)) {
      setEditingItem(item);
      setIsTxModalOpen(true);
    }
  };

  // Creator badge
  const CreatorBadge = ({ item }: { item: BudgetTransaction }) => {
    const creator = getItemCreator(item);
    if (!creator) return null;
    const isMe = creator.id === currentUser?.id;
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          fontSize: 9,
          color: "var(--text-secondary)",
          marginTop: 2,
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 16,
            height: 16,
            borderRadius: "50%",
            backgroundColor: creator.color || "#888",
            color: "#fff",
            fontSize: 9,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {creator.name.charAt(0).toUpperCase()}
        </span>
        {isMe ? "คุณ" : creator.name}
      </span>
    );
  };

  // --- Summary labels per purpose ---
  const summaryLabels =
    purpose === "savings"
      ? { planned: "เป้าหมาย", actual: "ออมแล้ว", left: "เหลืออีก" }
      : purpose === "reward"
      ? { planned: "เป้าหมาย", actual: "ให้แล้ว", left: "เหลืออีก" }
      : { planned: "วางแผนไว้", actual: "ใช้ไปแล้ว", left: "คงเหลือ" };

  const sectionPendingTitle =
    purpose === "savings" ? "รายการออม" : purpose === "reward" ? "รายการให้รางวัล" : "แผนที่วางไว้";

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button
            onClick={() => router.back()}
            style={{ background: "none", border: "none", marginBottom: 16, padding: 0, cursor: "pointer" }}
          >
            <ArrowLeft size={24} color="var(--foreground)" />
          </button>
          {isBudgetCreator && (
            <button
              onClick={() => setIsEditBudgetOpen(true)}
              style={{
                background: "none",
                border: "none",
                color: "var(--primary)",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              แก้ไข
            </button>
          )}
        </div>

        <h1 className={styles.title}>{budget.title}</h1>
        <p className={styles.description}>{budget.description}</p>

        {purpose === "savings" && targetAccount && (
          <p className={styles.metaBadge}>
            <ArrowUpCircle size={12} /> ออมเข้า {targetAccount.name}
          </p>
        )}

        {purpose === "reward" && rewardUser && (
          <p className={styles.metaBadge}>
            <Gift size={12} /> รางวัลให้ {rewardUser.name}
            {targetAccount && ` · โอนเข้า ${targetAccount.name}`}
          </p>
        )}

        <div className={styles.summaryCard}>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>{summaryLabels.planned}</span>
            <span className={styles.summaryValue}>
              <Money amount={totalPlanned} />
            </span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>{summaryLabels.actual}</span>
            <span
              className={styles.summaryValue}
              style={{ color: totalActual > totalPlanned ? "red" : "var(--primary)" }}
            >
              <Money amount={totalActual} colored={false} />
            </span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>{summaryLabels.left}</span>
            <span
              className={styles.summaryValue}
              style={{ color: leftToSpend < 0 ? "red" : "var(--foreground)" }}
            >
              <Money amount={leftToSpend} />
            </span>
          </div>
        </div>

        {purpose === "savings" && totalActual >= totalPlanned && totalPlanned > 0 && (
          <div className={styles.goalReachedBanner}>
            🎉 ครบเป้าหมายแล้ว! สามารถใช้เงินได้
          </div>
        )}

        {purpose === "reward" && totalActual >= totalPlanned && totalPlanned > 0 && (
          <div className={styles.goalReachedBanner}>
            🎉 รางวัลครบแล้ว!
          </div>
        )}
      </div>

      {/* Pending / Active Items */}
      {items.length > 0 && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>{sectionPendingTitle}</h3>
          {items.map((item) => {
            const editable = canEditItem(item);
            const isDone = item.status === "done";
            const isCancelled = item.status === "cancelled";
            return (
              <div
                key={item.id}
                className={styles.itemCard}
                onClick={() => handleItemClick(item)}
                style={{
                  cursor: editable ? "pointer" : "default",
                  opacity: isCancelled ? 0.6 : isDone ? 0.8 : 1,
                }}
              >
                <div className={styles.itemInfo}>
                  <div
                    className={styles.itemName}
                    style={{
                      textDecoration: isCancelled ? "line-through" : undefined,
                      color: isCancelled ? "var(--text-secondary)" : undefined,
                    }}
                  >
                    {item.name}
                  </div>
                  <CreatorBadge item={item} />
                  <div className={styles.itemMeta}>
                    {isDone ? "เมื่อ " : ""}
                    {formatBangkokDate(item.date)}
                  </div>
                </div>
                <div className={styles.itemAmount}>
                  <div className={isDone ? styles.actualAmount : styles.planAmount}>
                    <Money amount={isDone ? item.actualAmount : item.plannedAmount} />
                  </div>
                  {isDone && (
                    <div className={styles.itemMeta} style={{ textDecoration: "line-through" }}>
                      <Money amount={item.plannedAmount} colored={false} />
                    </div>
                  )}
                  {/* Done/Cancel buttons: only budget creator for spending */}
                  {purpose === "spending" && !isDone && !isCancelled && isBudgetCreator && (
                    <div className={styles.actions}>
                      <button
                        className={`${styles.actionBtn} ${styles.btnDone}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMarkDone(item);
                        }}
                      >
                        <Check size={14} style={{ marginRight: 4 }} /> เสร็จ
                      </button>
                      <button
                        className={`${styles.actionBtn} ${styles.btnCancel}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCancel(item);
                        }}
                      >
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

      {/* Empty state */}
      {items.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-secondary)" }}>
          <p style={{ fontSize: 9 }}>
            {purpose === "savings"
              ? "ยังไม่มีรายการออม"
              : purpose === "reward"
              ? "ยังไม่มีรายการให้รางวัล"
              : "ยังไม่มีแผนการใช้เงิน"}
          </p>
          <p style={{ fontSize: 9, marginTop: 4 }}>กด + เพื่อเริ่ม</p>
        </div>
      )}

      {/* FAB */}
      <button
        className={styles.fab}
        onClick={() => {
          setEditingItem(null);
          setIsTxModalOpen(true);
        }}
      >
        <Plus size={24} />
      </button>

      {/* Modals */}
      {isTxModalOpen && (
        <BudgetTransactionModal
          isOpen={isTxModalOpen}
          onClose={() => {
            setIsTxModalOpen(false);
            setEditingItem(null);
          }}
          budgetId={budget.id}
          itemToEdit={editingItem}
          canEditItem={editingItem ? canEditItem(editingItem) : true}
          isBudgetCreator={isBudgetCreator}
        />
      )}


      {isEditBudgetOpen && (
        <div style={{ position: "fixed", zIndex: 100 }}>
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
