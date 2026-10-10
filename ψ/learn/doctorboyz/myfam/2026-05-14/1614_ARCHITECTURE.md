# MyFam Architecture Overview

> Next.js family finance app with LINE integration (LIFF + Messaging API Bot)
> Generated: 2026-05-14 from codebase at `/Users/doctorboyz/Code/github.com/doctorboyz/myfam`

---

## 1. Directory Structure & Organization Philosophy

The project follows **Next.js App Router conventions** with a flat, surface-oriented organization rather than strict feature-based modules. Code is grouped by concern within `src/`:

```
myfam/
├── prisma/              # Schema, seed, migrations
├── src/
│   ├── app/             # Next.js App Router (pages + API routes)
│   │   ├── api/         # REST API endpoints
│   │   ├── (pages)/     # App pages (dashboard, accounts, etc.)
│   │   ├── globals.css  # Global styles + CSS variables
│   │   └── layout.tsx   # Root layout with context providers
│   ├── components/      # React components (co-located styles)
│   │   ├── ActionFab/
│   │   ├── BottomNav/
│   │   ├── DashboardFilter/
│   │   ├── TransactionDetailModal/
│   │   └── ...
│   ├── context/         # Global React contexts
│   │   ├── FinanceContext.tsx
│   │   └── LiffContext.tsx
│   ├── data/            # Static seed data
│   │   └── categories.ts
│   ├── lib/             # Shared utilities & service clients
│   │   ├── api.ts
│   │   ├── prisma.ts
│   │   ├── line.ts
│   │   ├── liff-auth.ts
│   │   ├── line-verify.ts
│   │   ├── line-id-token.ts
│   │   ├── ollama.ts
│   │   ├── chart-message.ts
│   │   ├── transaction-parser.ts
│   │   ├── reconcile-parser.ts
│   │   ├── compressImage.ts
│   │   └── timezone.ts
│   ├── middleware.ts    # Next.js middleware (LIFF routing)
│   └── types/           # Global TypeScript types
│       └── index.ts
├── public/              # Static assets
├── scripts/             # Deployment scripts
├── docs/                # Project documentation
└── docker-compose.yml   # Local infra (Postgres)
```

### Organization Philosophy
- **App Router native**: All pages and API routes live under `app/`, using Route Handlers (`route.ts`) for APIs and `page.tsx` for UI.
- **Co-located styles**: Each component has its own `*.module.css` in the same folder.
- **Context-heavy state**: Global state is managed via React Context (`FinanceContext`, `LiffContext`) rather than external state libraries.
- **Monolithic API layer**: API routes are flat REST endpoints under `app/api/`, grouped by entity (accounts, transactions, budgets, etc.).
- **No feature-based architecture**: The codebase does not use `features/` boundaries; components and API routes are organized by surface area (page/component) and entity.

---

## 2. Entry Points

### Web Entry Points

| Route | File | Purpose |
|-------|------|---------|
| `/` | `src/app/page.tsx` | Redirects to `/dashboard` |
| `/dashboard` | `src/app/dashboard/page.tsx` | Main dashboard with balance, filters, transactions, charts |
| `/accounts` | `src/app/accounts/page.tsx` | Account list and management |
| `/account/[id]` | `src/app/account/[id]/page.tsx` | Account detail & transaction history |
| `/budget` | `src/app/budget/page.tsx` | Budget list |
| `/budget/[id]` | `src/app/budget/[id]/page.tsx` | Budget detail |
| `/categories` | `src/app/categories/page.tsx` | Category & group management |
| `/settings` | `src/app/settings/page.tsx` | Settings hub |
| `/settings/family` | `src/app/settings/family/page.tsx` | Family member & invite management |
| `/settings/tags` | `src/app/settings/tags/page.tsx` | Tag management |
| `/settings/categories` | `src/app/settings/categories/page.tsx` | Category settings |
| `/profile` | `src/app/profile/page.tsx` | User profile |
| `/login` | `src/app/login/page.tsx` | Login via LINE LIFF |
| `/link` | `src/app/link/page.tsx` | LINE account linking with invite code |

### API Entry Points

| Route | File | Purpose |
|-------|------|---------|
| `/api/accounts` | `src/app/api/accounts/route.ts` | CRUD accounts |
| `/api/accounts/[id]` | `src/app/api/accounts/[id]/route.ts` | Update/delete single account |
| `/api/accounts/trash` | `src/app/api/accounts/trash/route.ts` | Soft-deleted accounts |
| `/api/transactions` | `src/app/api/transactions/route.ts` | CRUD transactions (with balance side-effects) |
| `/api/budgets` | `src/app/api/budgets/route.ts` | CRUD budgets |
| `/api/categories` | `src/app/api/categories/route.ts` | Categories & groups |
| `/api/groups` | `src/app/api/groups/route.ts` | Category groups |
| `/api/tags` | `src/app/api/tags/route.ts` | Tags |
| `/api/users` | `src/app/api/users/route.ts` | Family members |
| `/api/reconciliations` | `src/app/api/reconciliations/route.ts` | Account reconciliation |
| `/api/invites` | `src/app/api/invites/route.ts` | Invite code generation |
| `/api/invites/[code]` | `src/app/api/invites/[code]/route.ts` | Invite validation |
| `/api/auth/login` | `src/app/api/auth/login/route.ts` | Username/password login |
| `/api/auth/logout` | `src/app/api/auth/logout/route.ts` | Clear auth cookie |
| `/api/auth/me` | `src/app/api/auth/me/route.ts` | Current user session |
| `/api/auth/liff` | `src/app/api/auth/liff/route.ts` | LIFF auto-login/auto-signup |
| `/api/auth/liff/link-invite` | `src/app/api/auth/liff/link-invite/route.ts` | LINE link via invite code |
| `/api/line/webhook` | `src/app/api/line/webhook/route.ts` | LINE Messaging API webhook |
| `/api/cron/purge` | `src/app/api/cron/purge/route.ts` | Hard-delete soft-deleted records >7 days |

### LINE Bot Entry Point
- **Webhook URL**: `POST /api/line/webhook`
- Handles all LINE events (text messages, image messages, quick reply actions)
- Signature verification via `X-Line-Signature` header

### LIFF Entry Point
- **LIFF App ID**: configured via `NEXT_PUBLIC_LIFF_ID`
- **Endpoint**: can be `https://myfam.doctorboyz.com` or `https://myfam.doctorboyz.com/liff`
- Middleware strips `/liff` prefix if configured

### Cron Job Entry Point
- **Purge endpoint**: `GET /api/cron/purge?key=<CRON_SECRET>`
- Scheduled externally (e.g., Vercel Cron) to permanently delete soft-deleted records older than 7 days.

---

## 3. Core Abstractions & Their Relationships

### 3.1 Authentication & Identity

```
Family
  └── User (1:N)
        ├── Account (1:N) [owner]
        ├── Transaction (1:N) [createdBy]
        ├── Category (1:N) [user-specific custom categories]
        ├── Budget (1:N) [createdBy]
        ├── Tag (1:N) [user-scoped]
        ├── InviteCode (1:N) [createdBy]
        └── LineLink (1:1) [optional LINE binding]
```

**Key abstractions:**
- `User`: family member with role (`parent` | `child`). Parents see all family data; children see only their own.
- `Family`: top-level grouping. All entities are scoped to a family.
- `LineLink`: binds a `User` to a LINE `userId`, enabling bot interactions and LIFF auto-login.
- `InviteCode`: 8-character hex code (expires in 24h) used by parents to invite family members to link their LINE account.

### 3.2 Finance Domain

```
Account
  ├── outgoingTransactions: Transaction[] (relation "Outgoing")
  ├── incomingTransactions: Transaction[] (relation "Incoming")
  └── reconciliations: Reconciliation[]

CategoryGroup
  └── categories: Category[]

Category
  └── transactions: Transaction[]

Transaction
  ├── account: Account? (source)
  ├── toAccount: Account? (destination for transfers)
  ├── category: Category?
  ├── budget: Budget? (if budget-planned)
  ├── tagRecords: TransactionTag[] (many-to-many)
  └── createdBy: User

Budget
  ├── transactions: Transaction[] (budget items are transactions with budgetId)
  └── purpose: 'spending' | 'savings' | 'reward'
```

**Key abstractions:**
- `Account`: financial account (bank, cash, credit, wallet, loan, invest). Has `balance` (Decimal) and supports soft-delete.
- `Transaction`: the core ledger entry. Types: `income`, `expense`, `transfer`. Status: `pending`, `completed`, `planned`, `void`.
- `Budget`: planning container. Budget items are stored as `Transaction` records with `budgetId` and `planAmount`.
- `Reconciliation`: snapshot of balance correction (`previousBalance` -> `newBalance`).

### 3.3 Client-Side State Architecture

The frontend uses **two global React contexts** instead of Redux/Zustand:

#### `FinanceContext`
- **Role**: Central data store for all finance entities.
- **Data fetched on mount**: current user, family users, accounts, transactions, categories, tags, budgets.
- **Optimistic updates**: Most mutations update local state immediately before API call.
- **Auth flow**: If `api/auth/me` fails, redirects to `/login` (unless already on public routes).
- **LIFF coordination**: In LIFF mode, waits up to 3 seconds for LIFF auth cookie to appear before checking session.

#### `LiffContext`
- **Role**: LIFF SDK lifecycle manager.
- **Responsibilities**:
  - Dynamically imports `@line/liff` (SSR-safe)
  - Initializes LIFF with `NEXT_PUBLIC_LIFF_ID`
  - Detects `isInClient` (inside LINE app) and sets CSS variables for safe areas
  - Auto-sends ID token to `/api/auth/liff` upon login
  - Exposes: `isLiffReady`, `isLoggedIn`, `isInClient`, `liffLogin`, `getIDToken`, `getProfile`

### 3.4 AI / NLP Layer

The LINE bot integrates with an **Ollama** instance (cloud model `qwen3.5:cloud`) for:

- **Intent detection**: classify user messages into `create_transaction`, `balance`, `recent`, `summary`, `budget`, `help`
- **Text extraction**: parse Thai text into structured transaction data (`amount`, `type`, `description`, `categoryGroupName`, `accountName`, `confidence`, `needsConfirmation`)
- **Vision/OCR**: extract transaction data from slip/receipt images (base64 -> Ollama vision model)

**Confidence-based flow:**
- `confidence < 0.3`: reject, show help
- `amount === 0`: ask user to specify amount
- `needsConfirmation === true`: create `pending` transaction, ask user to confirm type (expense/income)
- Multiple accounts + ambiguous account name: store pending extraction, ask user to pick account via Quick Reply

---

## 4. Dependencies

### Direct Dependencies (Production)

| Package | Version | Role |
|---------|---------|------|
| `next` | 16.1.6 | Framework (App Router, React 19) |
| `react` | 19.2.3 | UI library |
| `react-dom` | 19.2.3 | React DOM renderer |
| `@line/liff` | ^2.28.0 | LINE Front-end Framework |
| `@prisma/client` | ^7.4.0 | ORM |
| `@prisma/adapter-pg` | ^7.4.0 | Prisma driver adapter for node-postgres |
| `@prisma/adapter-neon` | ^7.4.0 | Prisma driver adapter for Neon (Vercel) |
| `@neondatabase/serverless` | ^1.0.2 | Neon serverless driver |
| `pg` | ^8.18.0 | PostgreSQL client |
| `bcryptjs` | ^3.0.3 | Password hashing |
| `lucide-react` | ^0.564.0 | Icon library |
| `recharts` | ^3.7.0 | Data visualization (charts) |
| `sharp` | ^0.34.5 | Image processing (resize/compress for OCR) |

### Dev Dependencies

| Package | Role |
|---------|------|
| `typescript` | Type checking |
| `prisma` | Schema & migration CLI |
| `eslint` / `eslint-config-next` | Linting |
| `tsx` / `ts-node` | Script execution |
| `babel-plugin-react-compiler` | React Compiler (Next.js config enables it) |

### External Services (Runtime)

| Service | Purpose |
|---------|---------|
| PostgreSQL (Neon/Vercel or self-hosted) | Primary database |
| LINE Messaging API | Bot replies, push messages, Flex Messages |
| LINE LIFF | In-app web view within LINE |
| Ollama (self-hosted or cloud) | AI text extraction, vision OCR, intent detection |
| Vercel | Hosting platform |

---

## 5. Database Schema & Models

### Datasource
- **Provider**: PostgreSQL
- **Adapter**: Prisma with `driverAdapters` (Pg on local/Docker, Neon on Vercel)

### Enums

| Enum | Values |
|------|--------|
| `UserRole` | `parent`, `child` |
| `AccountType` | `bank`, `cash`, `credit`, `wallet`, `loan`, `invest` |
| `TransactionType` | `income`, `expense`, `transfer` |
| `BudgetPeriod` | `monthly`, `one_time` |
| `BudgetStatus` | `active`, `completed`, `archived` |
| `BudgetPurpose` | `spending`, `savings`, `reward` |
| `TransactionStatus` | `pending`, `completed`, `planned`, `void` |

### Models

#### `Family`
- `id: String @id @default(uuid())`
- `name: String`
- Relations: `members: User[]`, `tags: Tag[]`, `inviteCodes: InviteCode[]`

#### `User`
- `id`, `name` (unique), `password` (nullable), `role`, `isAdmin`, `avatar`, `color`, `familyId`
- **Audit relations**: extensive reverse relations for `createdBy`, `updatedBy`, `deletedBy` on Accounts, Transactions, Categories, Tags, Budgets, Reconciliations

#### `Account`
- `id`, `name`, `type`, `balance` (Decimal), `color`, `icon`, `accountNo`, `alias`, `ownerId`, `status`
- Soft-delete: `deletedAt`, `deletedById`
- Relations: `owner: User`, `incomingTransactions`, `outgoingTransactions`, `reconciliations`

#### `Transaction`
- `id`, `amount` (Decimal), `planAmount` (Decimal?), `date`, `type`, `description`, `status`
- `accountId` (source), `toAccountId` (destination), `categoryId`, `budgetId`
- `fee` (Decimal?), `slipImage` (String?)
- Relations: `tagRecords: TransactionTag[]`, `createdBy`, `updatedBy`, `deletedBy`
- **Balance side-effects**: created in a `$transaction` block that also updates `Account.balance`

#### `CategoryGroup`
- `id`, `name`, `type` (String), `isCustom`
- Soft-delete supported

#### `Category`
- `id`, `name`, `groupId`, `userId` (nullable for shared)
- Relations: `group`, `user`, `transactions`

#### `Tag`
- `id`, `name`, `userId`, `color`, `familyId`
- Unique constraint: `@@unique([name, userId])`
- Soft-delete supported

#### `TransactionTag` (junction table)
- `id`, `transactionId`, `tagId`
- `@@unique([transactionId, tagId])`
- Soft-delete supported

#### `LineLink`
- `id`, `lineUserId` (unique), `userId` (unique), `displayName`
- `@@map("line_links")`

#### `Budget`
- `id`, `title`, `description`, `purpose`, `period`, `limit` (Decimal), `startDate`, `endDate`, `status`
- `targetAccountId`, `rewardForUserId`
- Relations: `transactions: Transaction[]`

#### `InviteCode`
- `id`, `code` (unique), `userId` (unique), `familyId`, `createdById`, `usedAt`, `expiresAt`

#### `Reconciliation`
- `id`, `accountId`, `previousBalance`, `newBalance`, `difference`, `note`, `performedById`
- Soft-delete supported

### Soft-Delete Pattern
All major entities support soft delete via `deletedAt: DateTime?` and `deletedById: String?`.
- API `GET` endpoints filter `deletedAt: null`
- Trash endpoints return records where `deletedAt != null`
- `restore` endpoints clear `deletedAt` and `deletedById`
- `permanent` endpoints actually delete the record
- Cron job hard-deletes records older than 7 days.

---

## 6. API Routes Structure

### REST Conventions
- **List**: `GET /api/<entity>`
- **Create**: `POST /api/<entity>`
- **Get one**: `GET /api/<entity>/[id]` (some entities)
- **Update**: `PATCH /api/<entity>/[id]`
- **Delete (soft)**: `DELETE /api/<entity>/[id]`
- **Restore**: `PATCH /api/<entity>/[id]/restore`
- **Permanent delete**: `DELETE /api/<entity>/[id]/permanent`
- **Trash list**: `GET /api/<entity>/trash`

### Auth Pattern
- `getAuthUser()` helper reads `userId` from `httpOnly` cookie
- Most API routes require auth and scope data to the user's `familyId`
- Parent role sees all family data; child role sees only own data

### Balance-Side Effect API
The `POST /api/transactions` route is the most critical:
1. Wraps creation in `prisma.$transaction`
2. If transaction is `completed` (not `planned`):
   - `income`: increment account balance by `amount - fee`
   - `expense`: decrement account balance by `amount + fee`
   - `transfer`: decrement source, increment destination
3. Creates `TransactionTag` junction records if `tagIds` provided

### Utility Helpers (`src/lib/api.ts`)
- `apiSuccess(data, status=200)` -> `NextResponse.json`
- `apiError(message, status=500)` -> standardized error JSON
- `getAuthUserId()` -> reads cookie
- `getAuthUser()` -> Prisma lookup with selected fields
- `parseId(props)` -> async param extraction for dynamic routes
- `pickFields(body, allowedKeys)` -> whitelist body fields for updates

---

## 7. LINE Bot & LIFF Integration Architecture

### 7.1 LINE Messaging API Bot (`/api/line/webhook`)

**Webhook flow:**
1. `POST` arrives with `X-Line-Signature`
2. `verifyLineSignature(rawBody, signature, channelSecret)` validates HMAC-SHA256
3. Parse body, iterate `events`
4. For each event, resolve `lineUserId` -> `LineLink` -> `User`
5. Route by event type and command:

**Command routing:**
- `balance`, `recent`, `summary`, `budget`, `help`, `delete_last` -> immediate reply
- `confirm_expense` / `confirm_income` -> convert pending transaction to completed
- `cancel` -> void pending transaction
- `select_group:{id}`, `select_subcategory:{id}`, `select_account:{id}` -> update latest bot transaction
- `link` -> guide to invite system
- `unlink` -> delete LineLink
- Anything else -> AI intent detection + extraction

**AI-powered transaction creation flow:**
1. `detectIntent(text)` (LLM or keyword fallback)
2. If `create_transaction`: `extractFromText(text, categories)` -> `ExtractedTransaction`
3. Low confidence -> help message
4. Zero amount -> ask for amount
5. `needsConfirmation` -> create `pending` transaction, ask user to confirm type via Quick Reply
6. Multiple accounts + ambiguous name -> ask user to pick account via Quick Reply
7. Otherwise -> create `completed` transaction, adjust balance, send confirmation

**Image (slip) processing flow:**
1. Download image from LINE Content API (`downloadLineImage`)
2. `extractFromSlip(base64, categories)` -> Ollama vision model
3. Same confirmation/account-selection logic as text
4. Saves slip image as `data:image/jpeg;base64,...` on the transaction

**Quick Reply strategy:**
- Every bot response includes a Quick Reply menu: "Open MyFam", "Summary", "Help"
- Confirmation replies show: "Confirm Expense", "Confirm Income", "Cancel"
- Account selection shows up to 12 accounts + cancel
- Category group selection shows up to 12 groups + skip
- Subcategory selection shows up to 12 categories + skip

**Rate limiting:**
- `/api/auth/liff/link-invite` has in-memory rate limiter: 5 attempts per `lineUserId` per 15 minutes

### 7.2 LIFF (LINE Front-end Framework)

**Architecture:**
- `liff-auth.ts`: dynamic import wrapper for `@line/liff`. Exposes init, login, profile, ID token, `isInClient`, `isLoggedIn`.
- `LiffContext`: React context that initializes LIFF on mount, detects LINE environment, auto-sends ID token to backend.
- `middleware.ts`: strips `/liff` prefix from URLs and sets `x-liff-mode` header for client-side detection.

**Auth flows:**

1. **Auto-login (existing user)**:
   - User opens LIFF app
   - `LiffContext` gets ID token from LINE
   - POSTs to `/api/auth/liff`
   - Backend verifies token with LINE, finds `LineLink`, sets `userId` cookie
   - User is authenticated

2. **Auto-signup (new user, no invite)**:
   - Same flow as auto-login
   - If no `LineLink` exists, backend auto-creates:
     - A `Family` named "{name}'s Family"
     - A `User` (role=parent, isAdmin=true)
     - A `LineLink`
   - Sets cookie, returns user data

3. **Invite linking (new family member)**:
   - Parent generates invite code in app (`POST /api/invites`)
   - Sends LIFF link with `?code=XXXX` to family member via LINE
   - Family member opens `/link?code=XXXX`
   - `LinkPage` shows confirmation UI
   - User clicks "Link Account"
   - POSTs `idToken + code` to `/api/auth/liff/link-invite`
   - Backend verifies token, validates invite (unused, unexpired), creates `LineLink`, marks invite used
   - Sets cookie, redirects to dashboard

**Security considerations:**
- `httpOnly` cookie (`userId`) with `secure` in production, `sameSite: 'lax'`
- LINE signature verification on webhooks (timing-safe comparison)
- ID token verification against LINE Platform (`api.line.me/oauth2/v2.1/verify`)
- Invite codes expire in 24 hours

### 7.3 LINE Rich Menu / Add Friend
- `NEXT_PUBLIC_LINE_BASIC_ID` configures the "Add Friend" button on the success screen
- Rich menu image exists at `public/rich-menu.png`
- Scripts for rich menu creation exist in `scripts/create-rich-menu.py`

---

## 8. Key Design Patterns

### Soft Delete with Audit Trail
Every mutable entity tracks `deletedAt`, `deletedById`, `updatedById`, `createdById`. This enables trash/restore functionality and auditability.

### Optimistic Updates on Frontend
`FinanceContext` updates React state immediately after user actions, then syncs with the API. If the API fails, state drift occurs (no rollback implemented in most cases).

### Server-Side Balance Management
Account balances are never computed on the frontend. The API manages balance increments/decrements inside Prisma transactions to prevent race conditions.

### Thai-Natural-Language Parsing
Custom regex-based parsers (`transaction-parser.ts`, `reconcile-parser.ts`) handle simple Thai commands. Complex extraction is delegated to Ollama LLM with structured JSON output.

### Bangkok Timezone Handling
All date displays use `Asia/Bangkok` timezone helpers (`lib/timezone.ts`). The dashboard defaults to "this month" in Bangkok time.

### Role-Based Data Scoping
- **Parent**: sees all accounts, transactions, and budgets within the family
- **Child**: sees only own accounts and transactions
- API routes implement this via Prisma `where` clauses using `familyId` or `ownerId`

---

## 9. Notable File Paths

- **Prisma schema**: `/Users/doctorboyz/Code/github.com/doctorboyz/myfam/prisma/schema.prisma`
- **Prisma client init**: `/Users/doctorboyz/Code/github.com/doctorboyz/myfam/src/lib/prisma.ts`
- **Root layout**: `/Users/doctorboyz/Code/github.com/doctorboyz/myfam/src/app/layout.tsx`
- **Middleware**: `/Users/doctorboyz/Code/github.com/doctorboyz/myfam/src/middleware.ts`
- **Finance context**: `/Users/doctorboyz/Code/github.com/doctorboyz/myfam/src/context/FinanceContext.tsx`
- **LIFF context**: `/Users/doctorboyz/Code/github.com/doctorboyz/myfam/src/context/LiffContext.tsx`
- **LINE webhook**: `/Users/doctorboyz/Code/github.com/doctorboyz/myfam/src/app/api/line/webhook/route.ts`
- **LIFF auth**: `/Users/doctorboyz/Code/github.com/doctorboyz/myfam/src/app/api/auth/liff/route.ts`
- **Invite link**: `/Users/doctorboyz/Code/github.com/doctorboyz/myfam/src/app/api/auth/liff/link-invite/route.ts`
- **Ollama client**: `/Users/doctorboyz/Code/github.com/doctorboyz/myfam/src/lib/ollama.ts`
- **Transaction parser**: `/Users/doctorboyz/Code/github.com/doctorboyz/myfam/src/lib/transaction-parser.ts`
- **API utilities**: `/Users/doctorboyz/Code/github.com/doctorboyz/myfam/src/lib/api.ts`
- **Types**: `/Users/doctorboyz/Code/github.com/doctorboyz/myfam/src/types/index.ts`
- **Category seed data**: `/Users/doctorboyz/Code/github.com/doctorboyz/myfam/src/data/categories.ts`
