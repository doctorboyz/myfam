# MyFam API Surface Documentation

> Generated from codebase exploration of `src/app/api/` and supporting libraries.
> Date: 2026-05-14

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Public API Routes](#public-api-routes)
   - [Accounts](#accounts)
   - [Auth](#auth)
   - [Budgets](#budgets)
   - [Categories](#categories)
   - [Groups](#groups)
   - [Invites](#invites)
   - [LINE Integrations](#line-integrations)
   - [Reconciliations](#reconciliations)
   - [Tags](#tags)
   - [Transactions](#transactions)
   - [Users](#users)
   - [Cron](#cron)
3. [Authentication & Authorization](#authentication--authorization)
4. [Data Models & Relationships](#data-models--relationships)
5. [Integration Patterns](#integration-patterns)
   - [LINE Messaging API](#line-messaging-api)
   - [LIFF (LINE Front-end Framework)](#liff-line-front-end-framework)
   - [Ollama AI](#ollama-ai)
6. [Middleware Architecture](#middleware-architecture)
7. [Extension Points & Hooks](#extension-points--hooks)
8. [External Service Integrations](#external-service-integrations)
9. [Environment Variables](#environment-variables)

---

## Architecture Overview

MyFam is a Next.js 14+ application using the App Router with API routes defined under `src/app/api/`. It uses:

- **Prisma ORM** with PostgreSQL (Neon on Vercel, local pg otherwise)
- **Cookie-based session auth** (`userId` httpOnly cookie)
- **Soft-delete pattern** across all major entities with a trash/purge lifecycle
- **LINE ecosystem integration**: Messaging API bot + LIFF mini app + LINE Login
- **Ollama AI** for Thai NLP (intent detection, transaction extraction, OCR from slips)

All API routes return a consistent envelope via helpers in `src/lib/api.ts`:

```typescript
// Success:  { ...data }  (or any object directly)
// Error:    { error: string }
```

---

## Public API Routes

### Accounts

Base: `/api/accounts`

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/accounts` | List accounts for current user's family. Query: `?userId=` to filter by owner. | Cookie |
| POST | `/api/accounts` | Create account | Cookie |
| PATCH | `/api/accounts/[id]` | Update account fields: `name`, `type`, `balance`, `color`, `icon`, `accountNo`, `alias`, `status` | Cookie |
| DELETE | `/api/accounts/[id]` | Soft delete | Cookie |
| GET | `/api/accounts/trash` | List soft-deleted accounts | Cookie |
| PATCH | `/api/accounts/[id]/restore` | Restore from trash | Cookie |
| DELETE | `/api/accounts/[id]/permanent` | Permanent delete (must already be soft-deleted) | Cookie |

**POST Body**:
```json
{
  "name": "string",
  "type": "bank | cash | credit | wallet | loan | invest",
  "balance": 0,
  "color": "#000000",
  "icon": "string?",
  "ownerId": "string"
}
```

---

### Auth

Base: `/api/auth`

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/api/auth/login` | Username/password login, sets `userId` cookie | None |
| POST | `/api/auth/logout` | Clear `userId` cookie | Cookie |
| GET | `/api/auth/me` | Return current user profile | Cookie |
| POST | `/api/auth/liff` | LIFF LINE login: verify ID token, auto-create user+family if unlinked | None |
| POST | `/api/auth/liff/link` | Link LINE account to existing MyFam user (password required) | None |
| POST | `/api/auth/liff/link-invite` | Link LINE account via invite code (rate-limited: 5 attempts/15min) | None |

**POST /api/auth/login Body**:
```json
{ "username": "string", "password": "string" }
```

**POST /api/auth/liff Body**:
```json
{ "idToken": "LINE_JWT" }
```

**Response (linked)**:
```json
{
  "success": true,
  "linked": true,
  "user": { "id", "name", "role", "isAdmin", "avatar", "color", "familyId" },
  "lineProfile": { "lineUserId", "displayName", "pictureUrl" }
}
```

**Response (needs linking)**:
```json
{
  "success": true,
  "linked": false,
  "lineProfile": { "lineUserId", "displayName", "pictureUrl" }
}
```

---

### Budgets

Base: `/api/budgets`

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/budgets` | List budgets with nested transactions mapped to `items`. Query: `?purpose=` | Cookie |
| POST | `/api/budgets` | Create budget | Cookie |
| PATCH | `/api/budgets/[id]` | Update budget. Only creator can edit. | Cookie |
| DELETE | `/api/budgets/[id]` | Soft delete + void pending/planned transactions | Cookie |
| GET | `/api/budgets/trash` | Trashed budgets | Cookie |
| PATCH | `/api/budgets/[id]/restore` | Restore | Cookie |
| DELETE | `/api/budgets/[id]/permanent` | Permanent delete | Cookie |

**POST Body**:
```json
{
  "title": "string",
  "purpose": "spending | savings | reward",
  "period": "monthly | one_time",
  "limit": 0,
  "startDate": "ISO?",
  "endDate": "ISO?",
  "createdById": "string",
  "targetAccountId": "string?",
  "rewardForUserId": "string?"
}
```

---

### Categories

Base: `/api/categories`

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/categories` | List groups + categories | Cookie |
| POST | `/api/categories` | Create category | Cookie |
| PATCH | `/api/categories/[id]` | Update: `name`, `groupId` | Cookie |
| DELETE | `/api/categories/[id]` | Soft delete | Cookie |
| PATCH | `/api/categories/[id]/restore` | Restore | Cookie |
| DELETE | `/api/categories/[id]/permanent` | Permanent delete | Cookie |

---

### Groups

Base: `/api/groups` (Category Groups)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/api/groups` | Create group: `{ name, type }` | Cookie |
| PATCH | `/api/groups/[id]` | Rename group | Cookie |
| DELETE | `/api/groups/[id]` | Soft delete group + cascade soft-delete its categories | Cookie |
| PATCH | `/api/groups/[id]/restore` | Restore group + its categories | Cookie |

---

### Invites

Base: `/api/invites`

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/api/invites` | Generate invite code for a family member (parent only) | Cookie |
| GET | `/api/invites` | List family invite codes with status | Cookie |
| GET | `/api/invites/[code]` | Verify invite code (public) | None |
| DELETE | `/api/invites/[code]` | Revoke invite (parent only) | Cookie |

**POST /api/invites Body**:
```json
{ "userId": "string" }
```

**Invite Code**: 8-character hex, uppercase, expires in 24 hours.

---

### LINE Integrations

Base: `/api/line`

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/line/link?userId=` | Check if user has LINE link | Cookie |
| POST | `/api/line/link` | Create/update LINE-MyFam link (1:1 enforced) | Cookie |
| DELETE | `/api/line/link?lineUserId=` | Unlink LINE account | Cookie |
| POST | `/api/line/sandbox` | Test AI pipeline without real LINE webhook | None |
| POST | `/api/line/webhook` | LINE Messaging API webhook (sig-verified) | LINE Signature |
| GET | `/api/line/webhook` | Webhook verification ping (LINE health check) | None |

**POST /api/line/sandbox Body**:
```json
// Text extraction
{ "type": "text", "text": "ซื้อข้าว 85 บาท", "userId": "..." }

// Image OCR
{ "type": "image", "imageBase64": "...", "userId": "..." }

// Direct query
{ "type": "query", "query": "ดูยอด", "userId": "..." }

// Confirm type
{ "type": "confirm", "confirmedType": "expense", "extracted": { ... }, "userId": "..." }
```

---

### Reconciliations

Base: `/api/reconciliations`

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/reconciliations?accountId=` | List reconciliations for account | Cookie |
| POST | `/api/reconciliations` | Create reconciliation + update account balance atomically | Cookie |
| PATCH | `/api/reconciliations/[id]` | Update note | Cookie |
| DELETE | `/api/reconciliations/[id]` | Soft delete | Cookie |

**POST Body**:
```json
{
  "accountId": "string",
  "newBalance": 0,
  "performedById": "string",
  "note": "string?"
}
```

---

### Tags

Base: `/api/tags`

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/tags` | List tags for family | Cookie |
| POST | `/api/tags` | Create tag (unique per user) | Cookie |
| PATCH | `/api/tags/[id]` | Update name/color | Cookie |
| DELETE | `/api/tags/[id]` | Soft delete (owner or admin) | Cookie |
| GET | `/api/tags/trash` | Trashed tags | Cookie |
| PATCH | `/api/tags/[id]/restore` | Restore | Cookie |
| DELETE | `/api/tags/[id]/permanent` | Permanent delete | Cookie |

---

### Transactions

Base: `/api/transactions`

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/transactions?accountId=` | List transactions for family. Query `accountId` filters source or destination. | Cookie |
| POST | `/api/transactions` | Create transaction + adjust account balances atomically | Cookie |
| PATCH | `/api/transactions/[id]` | Update. Handles `planned` -> `completed` transition with balance recalc. | Cookie |
| DELETE | `/api/transactions/[id]` | Soft delete + revert balances | Cookie |
| GET | `/api/transactions/trash` | Trashed transactions | Cookie |
| PATCH | `/api/transactions/[id]/restore` | Restore + re-apply balances | Cookie |
| DELETE | `/api/transactions/[id]/permanent` | Permanent delete | Cookie |

**POST Body**:
```json
{
  "amount": 0,
  "date": "ISO",
  "type": "income | expense | transfer",
  "status": "completed | planned",
  "description": "string?",
  "accountId": "string?",
  "toAccountId": "string?",
  "categoryId": "string?",
  "budgetId": "string?",
  "createdById": "string",
  "fee": 0,
  "slipImage": "string?",
  "tagIds": ["string"]
}
```

---

### Users

Base: `/api/users`

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/users` | List family members with lineLink info | Cookie |
| POST | `/api/users` | Create family member | Cookie |
| PATCH | `/api/users/[id]` | Update: `name`, `role`, `color`, `avatar` | Cookie |
| DELETE | `/api/users/[id]` | Hard delete with full cascade (parent/admin only, cannot self-delete) | Cookie |

---

### Cron

Base: `/api/cron`

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/cron/purge?key=` | Purge soft-deleted records older than 7 days | `CRON_SECRET` |

**Purged entities** (in dependency order): `transactionTags`, `transactions`, `budgets`, `categories`, `categoryGroups`, `tags`, `reconciliations`, `accounts`.

---

## Authentication & Authorization

### Session Mechanism

- **Cookie name**: `userId`
- **Attributes**: `httpOnly`, `secure` (prod), `sameSite: 'lax'`, `maxAge: 30 days`
- **Set by**: `/api/auth/login`, `/api/auth/liff`, `/api/auth/liff/link`, `/api/auth/liff/link-invite`
- **Cleared by**: `/api/auth/logout`

### Auth Helpers (`src/lib/api.ts`)

| Function | Purpose |
|----------|---------|
| `getAuthUserId()` | Read `userId` from cookie |
| `getAuthUser()` | Resolve cookie `userId` to user record with selected fields |
| `parseId(props)` | Await Next.js 15 async params |
| `pickFields(body, keys)` | Whitelist request body fields |

### Role-Based Access Control

| Role | Permissions |
|------|-------------|
| `parent` | Full access to family data; can create/delete users; can manage invites; data scope = entire family |
| `child` | Own data only; data scope = `createdById: self` |
| `isAdmin` | Additional admin privileges (tag deletion, etc.) |

### LINE Authentication Flows

1. **Auto Signup** (`POST /api/auth/liff`):
   - User opens LIFF / LINE bot -> sends ID token
   - If no `LineLink` exists, auto-creates new `User` + `Family`
   - Sets cookie, returns user data

2. **Link to Existing Account** (`POST /api/auth/liff/link`):
   - Requires username + password (or user without password)
   - Verifies ID token, creates `LineLink`, sets cookie

3. **Link via Invite Code** (`POST /api/auth/liff/link-invite`):
   - Parent generates invite code -> child enters code in LIFF
   - Rate-limited (5 attempts / 15 min per LINE user)
   - Creates `LineLink`, marks invite used, sets cookie

---

## Data Models & Relationships

### Prisma Schema Overview (`prisma/schema.prisma`)

#### Enums

| Enum | Values |
|------|--------|
| `UserRole` | `parent`, `child` |
| `AccountType` | `bank`, `cash`, `credit`, `wallet`, `loan`, `invest` |
| `TransactionType` | `income`, `expense`, `transfer` |
| `BudgetPeriod` | `monthly`, `one_time` |
| `BudgetStatus` | `active`, `completed`, `archived` |
| `BudgetPurpose` | `spending`, `savings`, `reward` |
| `TransactionStatus` | `pending`, `completed`, `planned`, `void` |

#### Entity Relationships

```
Family
|-- members: User[]
|-- tags: Tag[]
|-- inviteCodes: InviteCode[]

User
|-- family: Family
|-- accounts: Account[]
|-- transactions: Transaction[] (createdBy)
|-- categories: Category[]
|-- budgets: Budget[]
|-- lineLink: LineLink? (1:1)
|-- tags: Tag[]

Account
|-- owner: User
|-- incomingTransactions: Transaction[] (toAccount)
|-- outgoingTransactions: Transaction[] (account)
|-- reconciliations: Reconciliation[]

Transaction
|-- account: Account? (source)
|-- toAccount: Account? (destination)
|-- category: Category?
|-- budget: Budget?
|-- createdBy: User
|-- tagRecords: TransactionTag[]

Category
|-- group: CategoryGroup
|-- user: User?
|-- transactions: Transaction[]

CategoryGroup
|-- categories: Category[]

Budget
|-- transactions: Transaction[]
|-- createdBy: User

Tag
|-- user: User
|-- family: Family
|-- transactions: TransactionTag[]

TransactionTag (junction)
|-- transaction: Transaction
|-- tag: Tag

LineLink
|-- user: User (1:1, cascade delete)

InviteCode
|-- user: User (target)
|-- family: Family
|-- createdBy: User

Reconciliation
|-- account: Account (cascade delete)
```

#### Audit Trail Fields

All major entities include soft-delete and audit fields:

- `deletedAt` / `deletedById` / `deletedBy` -> soft delete
- `updatedById` / `updatedBy` -> last modifier
- `createdById` / `createdBy` -> creator (where applicable)

---

## Integration Patterns

### LINE Messaging API

**Webhook Handler**: `POST /api/line/webhook`

- Signature verification via HMAC-SHA256 (`src/lib/line-verify.ts`)
- Max duration: 300s (OCR inference time)
- Async event processing with `Promise.allSettled`
- Reply token used for immediate ack; push messages for delayed AI responses

**Supported Message Types**:

| Type | Handler |
|------|---------|
| Text | `handleTextMessage` -> intent detection -> extraction -> confirmation |
| Image | `handleImageMessage` -> download from LINE -> OCR via Ollama -> extraction |

**Bot Commands** (Thai language):

| Command | Trigger | Action |
|---------|---------|--------|
| `ดูยอด` / `balance` | Keyword/AI intent | Show account balances |
| `รายการล่าสุด` / `recent` | Keyword/AI intent | Last 5 transactions |
| `สรุปยอด` / `summary` | Keyword/AI intent | Monthly summary Flex Message |
| `งบ` / `budget` | Keyword/AI intent | Budget progress Flex Message |
| `ช่วยเหลือ` / `help` | Keyword/AI intent | Help text |
| `ยืนยันรายจ่าย` | Quick Reply | Confirm pending as expense |
| `ยืนยันรายรับ` | Quick Reply | Confirm pending as income |
| `ยกเลิก` | Quick Reply | Cancel pending transaction |
| `เลือกหมวด:{id}` | Quick Reply | Select category group |
| `เลือกประเภท:{id}` | Quick Reply | Select subcategory |
| `เลือกบัญชี:{id}` | Quick Reply | Select account for transaction |
| `ข้ามหมวด` / `ข้ามประเภท` | Quick Reply | Skip category selection |
| `เปิด MyFam` / `open app` | Keyword | Return LIFF URL |
| `ลิงก์` | Keyword | Guide to invite linking |
| `ยกเลิกลิงก์` / `unlink` | Keyword | Delete LineLink |
| `ลบรายการล่าสุด` | Keyword | Delete last LINE-bot transaction + revert balances |

**LINE Client Lib** (`src/lib/line.ts`):

| Function | Purpose |
|----------|---------|
| `sendLineReply(replyToken, text, quickReply?)` | Reply within 30s |
| `sendLinePush(to, text, quickReply?)` | Push message (quota-based) |
| `downloadLineImage(messageId)` | Download user-sent image |
| `sendLineFlexReply(replyToken, altText, contents)` | Rich Flex Message |

**Flex Message Templates** (`src/lib/chart-message.ts`):

- `buildMonthlySummaryFlex` -> income/expense/balance + top categories
- `buildBudgetProgressFlex` -> horizontal progress bars per budget

---

### LIFF (LINE Front-end Framework)

**LIFF Auth Lib** (`src/lib/liff-auth.ts`):

| Function | Purpose |
|----------|---------|
| `initLiff()` | Initialize LIFF SDK with `NEXT_PUBLIC_LIFF_ID` |
| `getIDToken()` | Get LINE ID token for backend verification |
| `getProfile()` | Get LINE user profile |
| `login(redirectUri?)` | Trigger LINE login |
| `logout()` | Logout from LINE |
| `closeWindow()` | Close LIFF window |
| `sendMessages(messages)` | Send messages to chat |

**LIFF Flow**:
1. User opens LIFF app in LINE
2. Frontend calls `liff.login()` or uses existing session
3. Gets `idToken` via `getIDToken()`
4. Sends to `POST /api/auth/liff` (auto-signup) or `POST /api/auth/liff/link-invite`
5. Backend verifies token with LINE Platform (`https://api.line.me/oauth2/v2.1/verify`)
6. Sets `userId` cookie -> full app access

**Middleware** (`src/middleware.ts`):
- Strips `/liff` prefix from URLs (handles LIFF endpoint config variations)
- Sets `x-liff-mode` header based on User-Agent (`Line/`) or `x-line-channelid`
- Skips API routes and static files

---

### Ollama AI

**Client** (`src/lib/ollama.ts`):

| Function | Model | Purpose |
|----------|-------|---------|
| `ollamaGenerate(options)` | `OLLAMA_TEXT_MODEL` / `OLLAMA_VISION_MODEL` | Single-prompt generation |
| `ollamaChat(options)` | `OLLAMA_TEXT_MODEL` | Multi-turn chat |
| `extractFromText(text, categories)` | Text model | Parse Thai text into transaction data |
| `extractFromSlip(imageBase64, categories)` | Vision model | OCR + parse slip/receipt image |
| `detectIntent(text)` | Text model | Classify user intent |

**Environment**:
- `OLLAMA_BASE_URL` (default: `http://localhost:11434`)
- `OLLAMA_TEXT_MODEL` (default: `qwen3.5:cloud`)
- `OLLAMA_VISION_MODEL` (default: `qwen3.5:cloud`)

**ExtractedTransaction Interface**:
```typescript
interface ExtractedTransaction {
  amount: number;
  date: string;           // YYYY-MM-DD
  description: string;
  type: 'income' | 'expense' | 'transfer';
  categoryId: string | null;
  categoryGroupName: string;
  merchantName?: string;
  accountName?: string;
  confidence: number;     // 0-1
  needsConfirmation?: boolean;
}
```

**Intent Types**: `create_transaction`, `balance`, `recent`, `summary`, `budget`, `help`

**Confidence Thresholds**:
- `< 0.3`: Reject as non-transaction
- `< 0.7`: Warn user about low confidence
- `needsConfirmation`: Ask user to confirm expense vs income

**Quick Reply Builders** (LINE-specific):
- `QUICK_REPLY_ITEMS` -> main menu (Open LIFF, Summary, Help)
- `CONFIRM_TYPE_ITEMS` -> type confirmation (Expense, Income, Cancel)
- `buildCategoryGroupReply(groups, type)` -> group selection
- `buildSubcategoryReply(categories)` -> subcategory selection
- `buildAccountReply(accounts)` -> account selection

---

## Middleware Architecture

### Next.js Middleware (`src/middleware.ts`)

- **Matcher**: All paths except `api`, `_next/static`, `_next/image`, `favicon.ico`
- **LIFF prefix stripping**: `/liff/*` -> rewrite to `/*`
- **LIFF detection header**: `x-liff-mode: true|false` based on User-Agent
- No auth enforcement at middleware layer (handled per-route via `getAuthUser`)

### Prisma Client Setup (`src/lib/prisma.ts`)

- Runtime adapter selection:
  - **Vercel**: `PrismaNeon` adapter
  - **Local/Other**: `PrismaPg` adapter with `pg.Pool`
- Global singleton pattern for hot-reload safety in development

---

## Extension Points & Hooks

### Server-Side Extension Points

1. **Custom Transaction Parsers** (`src/lib/transaction-parser.ts`):
   - `parseTransaction(text, accounts)` -> regex-based Thai text parsing
   - Supports transfer detection (`โอน ... จาก...ไป...`)
   - Fuzzy account matching by name/alias/accountNo

2. **Reconcile Parser** (`src/lib/reconcile-parser.ts`):
   - `parseReconcile(text, accounts)` -> extract actual balance + account

3. **Category Matching Hook** (`src/lib/ollama.ts`):
   - `matchCategory(extracted, categories)` -> fuzzy-match AI output to known categories
   - Falls back: exact -> case-insensitive -> substring inclusion

4. **Image Compression** (`src/lib/compressImage.ts`):
   - Canvas-based client-side resize before upload
   - Configurable maxWidth/maxHeight/quality

5. **Timezone Utilities** (`src/lib/timezone.ts`):
   - All user-facing times in `Asia/Bangkok` (GMT+7)
   - `getBangkokDate()`, `formatBangkokDate()`, `getBangkokDateString()`

### Client-Side Hooks

- No custom React hooks documented in API layer; UI hooks are outside `src/app/api/`

---

## External Service Integrations

### LINE Platform

| Service | Endpoint | Env Var |
|---------|----------|---------|
| ID Token Verify | `POST https://api.line.me/oauth2/v2.1/verify` | `LINE_CHANNEL_ID` |
| Messaging API | `https://api.line.me/v2/bot` | `LINE_CHANNEL_ACCESS_TOKEN` |
| Content API | `https://api-data.line.me/v2/bot` | `LINE_CHANNEL_ACCESS_TOKEN` |

**Webhook Security**:
- HMAC-SHA256 signature verification (`src/lib/line-verify.ts`)
- Timing-safe comparison to prevent timing attacks

### Ollama

| Endpoint | Purpose |
|----------|---------|
| `POST /api/generate` | Single-prompt text/vision generation |
| `POST /api/chat` | Multi-turn conversation |

**Timeout**: 300s (5 minutes) for CPU inference
**Format**: JSON mode enforced for structured outputs

### PostgreSQL

| Provider | Adapter | Condition |
|----------|---------|-----------|
| Neon | `@prisma/adapter-neon` | `process.env.VERCEL` |
| Standard pg | `@prisma/adapter-pg` + `pg.Pool` | Default |

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `LINE_CHANNEL_ID` | Yes | LINE Login channel ID |
| `LINE_CHANNEL_ACCESS_TOKEN` | Yes | LINE Messaging API access token |
| `LINE_CHANNEL_SECRET` | Yes | LINE webhook signature secret |
| `NEXT_PUBLIC_LIFF_ID` | Yes | LIFF app ID |
| `NEXT_PUBLIC_LINE_BASIC_ID` | No | LINE Basic ID for add-friend button |
| `CRON_SECRET` | No | Secret for `/api/cron/purge` |
| `OLLAMA_BASE_URL` | No | Ollama server URL (default: localhost) |
| `OLLAMA_TEXT_MODEL` | No | Text model name (default: qwen3.5:cloud) |
| `OLLAMA_VISION_MODEL` | No | Vision model name (default: qwen3.5:cloud) |

---

## Soft-Delete Lifecycle

All mutable entities support a trash lifecycle:

1. **DELETE** -> sets `deletedAt` + `deletedById`
2. **GET /trash** -> lists soft-deleted items
3. **PATCH /restore** -> clears `deletedAt` + `deletedById`, re-applies side effects (balances)
4. **DELETE /permanent** -> requires `deletedAt != null`, then hard delete
5. **Cron purge** -> hard-deletes records older than 7 days

**Entities with soft-delete**: Account, Transaction, Budget, Category, CategoryGroup, Tag, Reconciliation

**Balance-aware restore** (Transactions):
- On restore, re-applies income/expense/transfer balance changes
- On soft-delete, reverts balance changes
- Fee handling included in balance adjustments

---

## Rate Limiting

| Endpoint | Limit |
|----------|-------|
| `POST /api/auth/liff/link-invite` | 5 attempts per `lineUserId` per 15 minutes (in-memory Map) |

---

## File Index

Key files referenced in this document:

- `/src/app/api/` - All API route handlers
- `/src/lib/api.ts` - Response helpers & auth utilities
- `/src/lib/prisma.ts` - Prisma client setup
- `/src/lib/line.ts` - LINE Messaging API client
- `/src/lib/line-verify.ts` - Webhook signature verification
- `/src/lib/line-id-token.ts` - LINE ID token verification
- `/src/lib/liff-auth.ts` - LIFF SDK wrapper
- `/src/lib/ollama.ts` - Ollama AI client + extraction logic
- `/src/lib/chart-message.ts` - LINE Flex Message builders
- `/src/lib/transaction-parser.ts` - Regex-based Thai transaction parser
- `/src/lib/reconcile-parser.ts` - Regex-based reconcile parser
- `/src/lib/compressImage.ts` - Client-side image compression
- `/src/lib/timezone.ts` - Bangkok timezone utilities
- `/src/middleware.ts` - Next.js middleware
- `/prisma/schema.prisma` - Database schema
