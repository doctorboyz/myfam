# Product Requirements Document: MyFam (FamMee)

> ครอบครัว — ดูแล จัดการ แจ้งเตือน

## 1. Overview

A family finance tracker combining a web dashboard with a LINE chat bot. Family members track income, expenses, and transfers via the web app or by chatting with the LINE bot — uploading slips, asking for balances, and recording transactions in natural language.

## 2. Glossary

| Thai | English | Description |
|------|---------|-------------|
| บัญชี | Account | Bank account, cash wallet, or financial account |
| รายการ | Transaction | Income, expense, or transfer record |
| รายรับ | Income | Money coming in |
| รายจ่าย | Expense | Money going out |
| โอน | Transfer | Moving money between accounts |
| หมวดหมู่ | Category | Hierarchical grouping (Category Group → Category) |
| ปรับยอด | Reconcile | Adjust account balance to match reality |
| เจ้าของ | Owner | Family member who owns the account |
| สมาชิกครอบครัว | Family Member | User in the family group |
| ค่าใช้จ่ายตามแผน | Budget | Planned vs actual spending |
| สลิป | Slip | Receipt or payment evidence (uploaded image) |
| แท็ก | Tag | Flexible label for filtering |

## 3. User Authentication

- **LINE LIFF**: Primary auth — users log in via LINE, auto-creating a MyFam account
- **Family model**: Each user belongs to one family. First user in a family is the parent/admin
- **Invite flow**: Parent creates invite code → new member clicks LINE link → LINE account binds to family member
- **Roles**: `parent` (full access, manage members) and `child` (own transactions only)

## 4. Account Management

Users can create and manage financial accounts.

- **Fields**: description, owner, account number, reconcile balance, color, alias
- **Account types**: bank accounts, cash wallets, credit cards, e-wallets
- **Ownership**: Each account has one owner. Other family members see but can't edit
- **Soft delete**: Accounts can be trashed and restored

## 5. Transaction Management

Core functionality to record financial activities.

- **Types**: Income, Expense, Transfer
- **Fields**: date/time, amount, fee, totalAmount, category, account (source), toAccount (transfer destination), note, tags, slip image
- **Status**: pending → completed / void (soft delete)
- **Fee handling**: Income adds amount, Expense subtracts amount+fee, Transfer subtracts amount+fee from source and adds amount to destination
- **Categories**: Hierarchical (group → subcategory), separated by type. Admins can create/edit custom categories

## 6. LINE Chat Bot

The LINE bot is the primary mobile interface. Users interact via natural language in a LINE chat.

### 6.1 Intent Pipeline

```
User message → Keyword detection → AI intent classification → Extract entities → Execute
```

**Supported intents**: balance, recent, summary, budget, categories, search, family, advice, reconcile, help

**Fallback chain**: AI extraction → regex fallback → ask user to clarify

### 6.2 Slip Upload (OCR)

1. User sends slip image in LINE chat
2. Tesseract OCR extracts text (Thai + English)
3. AI parses extracted text into transaction fields (amount, category, date, note)
4. Bot confirms with user → user confirms → transaction created with slip image attached

### 6.3 Account Selection

Type-aware: income selects destination account, expense selects source account, transfer does two-step (source → destination).

Multi-account matching: exact name → alias → contains → partial word → show account list.

### 6.4 Reconcile (ปรับยอด)

Two modes:
- **set**: "ปรับ 1688 เป็น 5000" → balance becomes exactly N
- **adjust**: "ปรับ make เพิ่ม 500" → balance changes by N

Creates Reconciliation record + updates account balance atomically.

### 6.5 Session Memory

Per-user short-term memory (5 min TTL) for multi-step flows: slip confirmation, account selection, reconcile confirmation.

### 6.6 Error Handling

- Escalation keywords (ขอคุยกับเจ้าหน้าที่, ติดต่อ, แจ้งปัญหา) → human escalation message
- Negative balance warnings on balance/summary queries
- Consecutive failure tracking (≥3 failures → escalation hint)

## 7. Budgeting (Jar System)

- **6 Jars**: Necessities (55%), Long-term savings (10%), Education (10%), Play (10%), Give (5%), Emergency (10%)
- **3 Mini Jars**: Simplified version for quick budget checks
- Budget items are transactions with a `planAmount` field

## 8. Dashboard & Reports

- **Filters**: account, owner, date range, transaction type, category
- **Visualizations**: Balance card, income vs expense chart, category pie chart, budget vs actual
- **History page** (`/categories`): Transactions grouped by type with expandable sections

## 9. Family Management

- **Members list** at `/settings/family`
- **Invite flow**: Parent creates member → generates invite code → sends LINE link → new member opens link → LINE binds to member
- **Aliases**: Parent can set display aliases for members
- **User identity**: Custom identity context for AI personalization

## 10. Data Model

- **Family** → has many Users, Accounts, Categories, Budgets
- **User** → owns Accounts, creates Transactions, has one LineLink
- **Account** → owned by User, has Transactions, Reconciliations
- **Transaction** → has Category, Account(s), Tags, optional slip image
- **LineLink** → connects LINE userId to MyFam User
- **InviteCode** → one-time code for family member LINE binding
