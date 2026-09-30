"use client";

/**
 * Shared page-level loading / error state.
 * - isLoading → skeleton placeholders (accounts/transactions shape)
 * - loadError → error banner with a retry button (calls refreshData)
 * Replaces the ambiguous "กำลังโหลด..." text that made loading,
 * error and empty states indistinguishable.
 */
import { useFinance } from "@/context/FinanceContext";
import styles from "./PageLoadState.module.css";

export function PageSkeleton({ variant = "list" }: { variant?: "list" | "dashboard" }) {
  return (
    <div className={styles.skeletonWrap} role="status" aria-label="กำลังโหลดข้อมูล">
      {variant === "dashboard" && (
        <div className={`${styles.skeletonRow} ${styles.skeletonCard}`} />
      )}
      <div className={styles.skeletonRow} />
      <div className={styles.skeletonRow} />
      <div className={`${styles.skeletonRow} ${styles.skeletonShort}`} />
    </div>
  );
}

export function PageLoadState() {
  const { loadError, refreshData } = useFinance();
  return (
    <div className={styles.errorWrap} role="alert">
      <p className={styles.errorText}>⚠️ {loadError}</p>
      <button type="button" className={styles.retryButton} onClick={() => refreshData()}>
        ลองใหม่อีกครั้ง
      </button>
    </div>
  );
}

/**
 * Gate for pages: show skeleton while loading, error banner on failure,
 * null when data is ready (children render).
 */
export function PageGate({
  children,
  variant = "list",
}: {
  children?: React.ReactNode;
  variant?: "list" | "dashboard";
}) {
  const { isLoading, loadError } = useFinance();
  if (loadError) return <PageLoadState />;
  if (isLoading) return <PageSkeleton variant={variant} />;
  return <>{children}</>;
}