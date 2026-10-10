---
name: check-balance-freshness-before-historical-import
description: Before importing historical transactions with balance adjustments, check when the target account balance was last touched (updated_at + Reconciliation) — only apply movements after the last touch, or you double-count
metadata:
  type: feedback
---

When importing historical rows into a tracked account (one-time import script), **always query the account's `updated_at` and the Reconciliation table before `--apply`**:

- Balance last touched **before** the import window → safe to apply net movement (e.g. Butjet 9,991 untouched since 12 Sep 11:44 → applying statement net -45.75 was correct).
- Balance last touched **inside/after** the window (e.g. ทรูมันนี่ reconciled to real balance 109.77 on 6 Oct, after all top-ups landed) → do NOT apply the balance increment again — the ledger already reflects it.

**Why:** replicating the app's mutation logic (`createTransaction`) is code-correct but reality-wrong when the user has since ปรับยอด. A reconciliation row means "this number is now truth" — historical deltas that fall inside its window must not be re-applied.

**How to apply:** dry-run → query `SELECT name, balance, updated_at FROM "Account"` + recent `"Reconciliation"` rows → decide per account whether to adjust → apply → verify type-sums against the source statement's own net before declaring done. Related: [[myfam-db-access-conventions]].