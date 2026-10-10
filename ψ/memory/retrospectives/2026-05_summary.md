# MyFam Session Retrospectives — May 2026

Consolidated from 12 session retrospectives across May 09-28. Organized by week.

---

## Week 1: May 04-10

### May 09 — LINE Bot AI Pipeline (~7h 40m)
Built complete LINE Bot integration: webhook handler, Ollama AI pipeline (qwen3.5:cloud) for intent detection and slip OCR, reply+push messaging pattern, fuzzy Thai command matching, Quick Reply menus. Fixed truncated LINE_CHANNEL_SECRET (missing `f`) causing 403 errors. LINE webhook verification requires GET handler. Deleted duplicate root folder `/Users/doctorboyz/myfam`. 19 files changed, +2464 lines.

**Key decisions**: Reply+push pattern for slow AI inference, LLM intent detection with keyword fallback, pending transaction for uncertain expense/income classification.

**Friction**: Manual secret copy-paste caused truncation bug. No automated testing for LINE integration. Category selection flow left incomplete.

---

## Week 2: May 11-17

### May 12 — LIFF Font Debugging (~30 min)
Built debug UI page for systematic font size testing in LIFF WebView. User chose 9px for all labels. Fixed invite link from raw URL to `liff.line.me/{id}` format. Added `text-size-adjust: 100%` to prevent WebView auto-zoom. 12 files changed.

**Key decisions**: Uniform font sizes over dynamic shrinking. LIFF URL format for invites keeps users in LINE ecosystem.

**Friction**: Dynamic font sizing was the wrong call — flat values are simpler. Dead code left behind after pivot (`getLabelClass` stub, `labelSmall` class).

### May 13 — Budget Model Redesign (~4h 30m)
Unified spending/savings/reward into single Budget model with `purpose` enum. Added budget UI tabs, purpose-specific progress calculation, reconciliation detail modal with soft delete, LINE bot menu redesign (5 items -> 3 with URI action), onboarding guide. 25+ files changed, ~1600 lines.

**Key decisions**: Unified model over separate tables (trade-off: less schema, more business logic complexity). Soft delete for reconciliation history. URI Quick Reply for opening LIFF directly.

**Friction**: Context compaction caused re-read overhead. Font size iteration fatigue — no design token system. Budget purpose logic complexity needs helper extraction.

### May 14 — Alias System + Invite Code Fix (~13h 30m)
Fixed critical invite-code bug where LiffContext auto-auth on `/link` page created duplicate parent accounts (`!isLinkPage` guard). Built many-to-many `UserAlias` system with per-viewer display names. Type-aware account selection for LINE bot AI. Font size standardization (header 12/normal 10/detail 9px). 40+ files changed.

**Key decisions**: DisplayName as derived field computed at API boundary. LINE name in `LineLink.displayName` only — never overwrite `User.name`. Global categories, not per-family. In-memory rate limiter for invite linking.

**Friction**: Context pressure from 13.5-hour session. LIFF SDK `URL` object monkey-patch is technical debt. Font size refactoring should have been scripted.

### May 15 (A) — Account Balance Reconciliation (~35 min)
Fixed bug where initial account balance was hardcoded `balance: 0`, silently ignoring user input. Fix: create account with balance=0, then Reconciliation record, then update balance — all in `$transaction`. Installed vitest, wrote 17 tests across 3 API routes. 7 files modified.

**Friction**: Type system betrayed — `Omit<Account, "balance">` prevented TypeScript from catching the hardcoded value. Zero test coverage until now. Added scope (vitest setup) without checking with user.

### May 15 (B) — Quick Reply Audit (~25 min)
Audited 6 Quick Reply sets across LINE Bot, mapped natural language flow through AI intent detection to query engine. Confirmed Quick Reply is UI shortcut of existing intent handlers, not a separate code path.

### May 16 — Intent Router + Session Memory (~1h 7m)
Replaced 50+ lines of hardcoded intent handlers with example-driven AI routing. Created 5 markdown prompt templates (`src/intent/*.md`), in-memory session memory with 5-cycle sliding window, `intent-router.ts` with example caching. 38/39 tests passed. 8 new files, route.ts -49 lines.

**Key decisions**: Intent examples as editable .md files (not code). Session memory in Map (not PostgreSQL). ollamaGenerate for response formatting. detectIntent kept for natural language understanding.

**Friction**: Jumped to "remove detectIntent" too fast — user wanted to build UP not cut corners. Test script over-engineered (510 lines). Still 2 sequential AI calls — original slowness not solved, just restructured.

---

## Week 3: May 18-24

### May 21 — Reconcile Intent + Onboarding (~5h)
Completed 5-phase plan: reconcile intent (ปรับยอด) with state machine, error handling (escalation, negative warnings, failure tracking), app identity prompt, unlinked-user onboarding. Fixed self-inflicted `menuQuickReply` deletion causing 56 TS errors. Deployed successfully.

**Friction**: Context compaction disorienting for long feature work. Edit tool encouraged lazy string matching. Quick Reply format confusing (expanded vs simplified API format).

### May 22 — Pipeline Gap Fixes (~40 min)
Fixed 5 remaining pipeline gaps without schema changes: `parseRelativeDateRange()` for Thai date patterns, family intent (per-member balances), goal tracking via budgets, recurring tracking via tags. 9 files modified, 3 deploys, zero TypeScript errors.

**Key decisions**: No schema changes — intent-level solutions only. Date parsing is regex (deterministic), not AI. Intent count now 11 — dispatch conditionals getting unwieldy.

**Friction**: No testing beyond type-check. Goal/recurring tracking are lightweight shims, not real features. Intent dispatch needs refactoring from `||` chains.

---

## Week 4: May 25-31

### May 25 — Slip Bug + Display Fix (~40 min)
Fixed slip upload bug where `promptAccountSelection` dropped `imageBuffer/imageHash/categories` during multi-account selection. Fixed in 4 re-set points across 3 functions. Display fix: transaction list now shows `description` as primary label (was `category`), but missed duplicate rendering in `categories/page.tsx` on first pass. 3 deploys.

**Root cause**: `pendingExtractions.set(user.id, { extracted, lineUserId })` dropped all slip data and didn't set `step`. State machine spread across 5+ functions with implicit data dependencies is fragile.

### May 27 (A) — Balance String Bug (~54 min)
`fetchAccounts()` missing `Number(acc.balance)` in refresh vs initial fetch. Prisma Decimal serialized as string caused concatenated balances. Pattern: DB correct, values correct on load, wrong after mutation -> compare init vs refresh code.

**Friction**: Over-explored before asking user for detail. Read 8+ files before finding one-line bug.

### May 27 (B) — Account Creation via LINE Chat (~48 min)
Implemented multi-turn form for creating accounts in LINE: "เพิ่มบัญชี" -> AI asks name, type, initial balance, confirm -> Prisma create. Form state check short-circuits intent detection. Keyword matching for form steps (no LLM), save LLM for initial detection only.

**Friction**: Shipped untested (no LINE e2e). No form cancel UI. No unit tests for `handleAccountFormStep` despite pure-enough function.

### May 28 (A) — Invite Link Cookie Bridge (~60 min)
LIFF strips ALL URL parameters (not just path segments). 5 deploy cycles chasing wrong hypothesis from inherited conclusion. Fix: regular URL -> middleware sets `pending_invite` cookie -> redirect to LIFF -> middleware reads cookie -> redirect to `/link?code=CODE`. SameSite=Lax, 5-min TTL.

**Friction**: Trusted inherited conclusion ("LIFF preserves query params") from previous session without verifying. Should have instrumented middleware first before writing 3 approaches.

### May 28 (B) — Transaction Ownership + Alias Display (~1h)
Account-level `isOwner` fix was incomplete — 3 of 4 pages hardcoded `isOwner={true}` for TransactionDetailModal. Alias-first display name resolution (`getUserLabel`) integrated across all components. 12 files modified, 3 deploys, 0 build failures.

**Friction**: Two deploys for a single-line fix pattern. Forgot about `display-name.ts` helper already written in earlier session. Reused component with hardcoded `isOwner={true}` in callers = bug waiting to happen.

---

## Cross-Cutting Patterns (May 2026)

1. **Context compaction** is a recurring friction — long sessions lose working memory, requiring file re-reads.
2. **No automated testing** for LINE Bot flows — every deploy is "type-check, build, push" with zero integration tests.
3. **Edit tool discipline gap** — multiple instances of replacing instead of appending, causing build breaks.
4. **Grep-first verification** — pattern of fixing one location while missing duplicate rendering / duplicate hardcoding.
5. **Uncommitted changes accumulate** — multiple sessions end with 0 commits, deferring to later.
