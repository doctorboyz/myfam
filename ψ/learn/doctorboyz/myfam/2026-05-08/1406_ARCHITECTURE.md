# MyFam Architecture Document

> Generated: 2026-05-08 | Branch: main | Commit: 90f98b8

## 1. Overview

MyFam is a family-oriented personal finance tracker built with Next.js 16 (App Router), Prisma 7, and PostgreSQL. It allows multiple family members (parents and children) to track accounts, transactions, budgets, and categories with role-based visibility. The UI is mobile-first with a 480px max-width container mimicking a phone app. Currency is Thai Baht (THB).

---

## 2. Directory Structure

```
myfam/
├── prisma/
│   ├── schema.prisma              # Database schema (7 models, 5 enums)
│   ├── seed.ts                    # Seed script: family, users, categories, CSV import
│   ├── verify_seed.ts             # Seed verification utility
│   ├── check_constraints.ts       # DB constraint checker
│   └── migrations/                # 6 migration files
├── src/
│   ├── app/                       # Next.js App Router pages & API routes
│   │   ├── layout.tsx             # Root layout: Inter font, FinanceProvider wrapper
│   │   ├── page.tsx               # Home: account list + add account/transaction FAB
│   │   ├── globals.css            # CSS custom properties, Apple-like design tokens
│   │   ├── login/                 # Login page (username + password form)
│   │   ├── dashboard/             # Dashboard: filters, balance, charts, transactions
│   │   ├── categories/            # Category history page (transaction list by category)
│   │   ├── budget/                # Budget list page
│   │   │   └── [id]/              # Budget detail page (plan items)
│   │   ├── account/[id]/          # Account detail page (transactions per account)
│   │   ├── profile/               # User profile page
│   │   ├── settings/              # Settings landing page
│   │   │   ├── family/            # Family member management (parent-only)
│   │   │   └── categories/        # Category/group management (admin-only)
│   │   └── api/                   # REST API routes
│   │       ├── auth/
│   │       │   ├── login/         # POST: bcrypt login, sets httpOnly cookie
│   │       │   ├── me/            # GET: current user from cookie
│   │       │   └── logout/        # POST: clears cookie
│   │       ├── accounts/          # GET (family-scoped), POST
│   │       │   └── [id]/          # PATCH, DELETE
│   │       ├── transactions/      # GET (family-scoped), POST (with balance adjustment)
│   │       │   └── [id]/          # DELETE (with balance reversal), PATCH (status transitions)
│   │       ├── budgets/           # GET (active, family-scoped), POST
│   │       │   └── [id]/          # PATCH (creator-only), DELETE (archive + void planned)
│   │       ├── users/             # GET (family members), POST (add member)
│   │       │   └── [id]/          # PATCH, DELETE
│   │       ├── categories/        # GET (groups + categories), POST
│   │       │   └── [id]/          # PATCH, DELETE (with usage check)
│   │       ├── groups/            # POST (custom group)
│   │       │   └── [id]/          # PATCH, DELETE (cascading)
│   │       └── reconciliations/   # GET (by account), POST (balance override)
│   ├── components/               # React UI components (20+ components)
│   │   ├── ActionFab/             # Floating action button (income/expense/transfer)
│   │   ├── AccountFormModal/      # Create/edit account modal
│   │   ├── AvatarUploader/        # Avatar upload with image compression
│   │   ├── BalanceCard/           # Account balance display card
│   │   ├── BottomNav/             # 5-tab mobile navigation
│   │   ├── BudgetFormModal/      # Create budget modal
│   │   ├── BudgetTransactionModal/# Add plan item to budget
│   │   ├── CategoryFormModal/    # Create/edit category
│   │   ├── CategoryGroupFormModal/ # Create/edit category group
│   │   ├── CategorySelector/      # Category picker with group tabs
│   │   ├── CreateCategoryModal/  # Quick category creation from transaction form
│   │   ├── DashboardFilter/       # Filter bar (user, type, date, category, account)
│   │   ├── ImageUploader/         # Generic image upload (currently unused separately)
│   │   ├── Modal/                 # Reusable modal wrapper
│   │   ├── Money/                 # Currency formatter (Thai Baht, color for negatives)
│   │   ├── ReconcileModal/       # Account balance reconciliation
│   │   ├── TagSelector/          # Tag selection for transactions
│   │   ├── TopBar/                # Header with title and settings link
│   │   ├── TransactionDetailModal/ # Create/edit/view transaction modal
│   │   ├── TransactionList/      # Transaction list component
│   │   └── VisualizationView/    # Charts (Recharts bar + pie)
│   ├── context/
│   │   └── FinanceContext.tsx      # Central React context (all CRUD, state, auth)
│   ├── data/
│   │   └── categories.ts         # Static default category/group data (legacy/seed)
│   ├── lib/
│   │   ├── api.ts                 # API helpers: apiSuccess, apiError, getAuthUser, parseId, pickFields
│   │   ├── compressImage.ts       # Client-side image compression (canvas + JPEG)
│   │   └── prisma.ts              # Prisma client singleton (Neon adapter for Vercel, PG elsewhere)
│   └── types/
│       └── index.ts               # TypeScript interfaces: User, Account, Transaction, Budget, etc.
├── public/
│   ├── manifest.json              # PWA manifest
│   └── favicon.png                # App icon
├── docker-compose.yml             # App + PostgreSQL 16 Alpine
├── Dockerfile                     # Multi-stage build (node:20-alpine)
├── entrypoint.sh                  # prisma migrate deploy + next start
├── next.config.ts                 # React Compiler enabled
├── prisma.config.ts               # Prisma config with seed command
└── .github/workflows/deploy.yml   # CI: lint + SSH deploy on push to main
```

---

## 3. Entry Points

### Pages (Next.js App Router)

| Route | File | Purpose |
|---|---|---|
| `/` | `src/app/page.tsx` | Account list (home), add account/transaction |
| `/login` | `src/app/login/page.tsx` | Username + password authentication |
| `/dashboard` | `src/app/dashboard/page.tsx` | Transaction dashboard with charts + filters |
| `/categories` | `src/app/categories/page.tsx` | Category-grouped transaction history |
| `/budget` | `src/app/budget/page.tsx` | Budget list with progress bars |
| `/budget/[id]` | `src/app/budget/[id]/page.tsx` | Budget detail: plan items |
| `/account/[id]` | `src/app/account/[id]/page.tsx` | Account detail: transactions |
| `/profile` | `src/app/profile/page.tsx` | User profile with avatar |
| `/settings` | `src/app/settings/page.tsx` | Settings hub |
| `/settings/family` | `src/app/settings/family/page.tsx` | Family member CRUD (parent-only) |
| `/settings/categories` | `src/app/settings/categories/page.tsx` | Category/group management (admin-only) |

### API Routes

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/login` | Authenticate user, set httpOnly cookie |
| GET | `/api/auth/me` | Get current authenticated user |
| POST | `/api/auth/logout` | Clear auth cookie |
| GET/POST | `/api/accounts` | List (family-scoped) / Create account |
| PATCH/DELETE | `/api/accounts/[id]` | Update / Delete account |
| GET/POST | `/api/transactions` | List (family-scoped) / Create transaction |
| PATCH/DELETE | `/api/transactions/[id]` | Update (status transitions) / Delete (with balance reversal) |
| GET/POST | `/api/budgets` | List active budgets / Create budget |
| PATCH/DELETE | `/api/budgets/[id]` | Update (creator-only) / Archive budget |
| GET/POST | `/api/users` | List family members / Add member |
| PATCH/DELETE | `/api/users/[id]` | Update / Delete user |
| GET/POST | `/api/categories` | List groups + categories / Create category |
| PATCH/DELETE | `/api/categories/[id]` | Update / Delete (with usage check) |
| POST | `/api/groups` | Create custom category group |
| PATCH/DELETE | `/api/groups/[id]` | Update / Delete (cascading) |
| GET/POST | `/api/reconciliations` | List by account / Create reconciliation |

---

## 4. Core Abstractions & Relationships

### FinanceContext (Central State)

`FinanceContext.tsx` is the single source of truth for all client-side state. It:

- Fetches auth, users, accounts, transactions, categories, groups, and budgets on mount
- Redirects to `/login` if not authenticated
- Filters accounts by role (parent sees all, child sees own only)
- Exposes CRUD operations for every entity
- Uses optimistic updates for `updateAccount` and `updateBudget`
- Refreshes accounts after transaction create/delete (balance changes)
- Maps API response shapes to frontend types (e.g., `category.group.name` to `categoryGroup`)

**Data flow**: User action -> Context method -> API call -> Local state update

### Type System

The `types/index.ts` defines frontend interfaces that diverge from Prisma models in key ways:

- **Account.owner**: frontend stores `string` (user name), API returns `{ id, name }` object
- **Transaction.category**: frontend stores category `name` string, API returns `{ id, name, group }` object
- **Transaction.note**: frontend uses `note`, API uses `description`
- **Budget.items**: frontend `BudgetTransaction[]`, mapped from Prisma `Transaction[]` with status mapping (`planned` -> `pending`, `completed` -> `done`, `void` -> `cancelled`)

---

## 5. Dependencies

| Package | Purpose |
|---|---|
| `next` 16.1.6 | App Router, SSR, React Compiler |
| `react` 19.2.3 | React 19 with compiler support |
| `@prisma/client` 7.4.0 | ORM client |
| `@prisma/adapter-pg` | PostgreSQL adapter (local/Docker) |
| `@prisma/adapter-neon` | Neon serverless adapter (Vercel) |
| `pg` | Node PostgreSQL driver |
| `bcryptjs` | Password hashing |
| `recharts` 3.7 | Bar charts and pie charts for dashboard |
| `lucide-react` | Icon library |
| `babel-plugin-react-compiler` | React Compiler for automatic optimization |
| `tsx` | TypeScript execution for seed scripts |

No state management library (Redux, Zustand, etc.) -- all state lives in `FinanceContext`.

No CSS framework (Tailwind, etc.) -- all styling is CSS Modules with custom properties.

---

## 6. Architecture Patterns

### Next.js App Router

- Server Components by default (layout, page shells)
- Client Components (`"use client"`) for all interactive pages and components
- API routes use `NextResponse.json()` for responses
- No middleware -- auth check happens in `FinanceContext` and API routes

### Authentication

- Cookie-based: `userId` httpOnly cookie set on login
- No session tokens, no JWT -- just the user UUID in a cookie
- `getAuthUser()` in `api.ts` reads the cookie and queries the database
- Authorization: family-scoped queries (only see your family's data)
- Budget edits restricted to creator (`createdById` check)

### Database Access

- Prisma ORM with PostgreSQL
- Dual adapter: `PrismaNeon` for Vercel (serverless), `PrismaPg` for local/Docker
- Global singleton pattern for Prisma client (`globalForPrisma`)
- All mutations go through API routes, never directly from client to DB

### State Management

- Single React context (`FinanceContext`) holds all app state
- No server state management library (no SWR, no React Query)
- Data fetching happens on mount via `useEffect`
- Optimistic updates for some operations (account update, budget update)
- Manual refetch for critical data (accounts after transaction changes)

### Role-Based Visibility

- `parent` role: sees all family accounts, can manage members and categories
- `child` role: sees only own accounts
- `isAdmin` flag: grants access to category management settings page
- No middleware enforcement -- visibility is client-side filtered

### Transaction Balance Logic

- Creating a transaction adjusts account balance in a Prisma `$transaction`:
  - **income**: source account balance += (amount - fee)
  - **expense**: source account balance -= (amount + fee)
  - **transfer**: source -= (amount + fee), destination += amount
- Deleting a transaction reverses the balance change
- Completing a planned transaction (`planned` -> `completed`) adjusts balances

### Budget System

- Budgets have a `status`: `active` or `archived`
- Budget items are `Transaction` records with `budgetId` and `status = planned`
- Deleting a budget archives it and voids all its planned transactions
- Budget progress = (actual of completed items) / (planned of pending + actual of completed)

---

## 7. Database Schema

```
Family
  └── User (1:N) ─── familyId
        ├── Account (1:N) ─── ownerId
        ├── Transaction (1:N, "createdBy") ─── createdById
        ├── Category (1:N) ─── userId (nullable, null = system category)
        └── Budget (1:N) ─── createdById

Account
  ├── Transaction (1:N, "Outgoing") ─── accountId
  ├── Transaction (1:N, "Incoming") ─── toAccountId
  └── Reconciliation (1:N) ─── accountId

CategoryGroup
  └── Category (1:N) ─── groupId (cascade delete)

Category
  └── Transaction (1:N) ─── categoryId

Transaction
  ├── Account (N:1, "Outgoing") ─── accountId
  ├── Account (N:1, "Incoming") ─── toAccountId
  ├── Category (N:1) ─── categoryId
  ├── Budget (N:1) ─── budgetId
  └── User (N:1, "createdBy") ─── createdById

Budget
  └── Transaction (1:N) ─── budgetId
```

### Key Enums

| Enum | Values |
|---|---|
| `UserRole` | `parent`, `child` |
| `AccountType` | `bank`, `cash`, `credit`, `wallet`, `loan`, `invest` |
| `TransactionType` | `income`, `expense`, `transfer` |
| `BudgetPeriod` | `monthly`, `one_time` |
| `BudgetStatus` | `active`, `archived` |
| `TransactionStatus` | `pending`, `completed`, `planned`, `void` |

### Notable Fields

- `Account.balance`: `Decimal` -- maintained by transaction triggers, not calculated on read
- `Transaction.planAmount`: nullable Decimal for planned transactions (budget items)
- `Transaction.slipImage`: nullable string for receipt/slip image (base64)
- `Transaction.tags`: string array for flexible tagging
- `Transaction.fee`: nullable Decimal for transaction fees
- `Reconciliation`: records manual balance overrides with previous/new balance and difference
- `Category.userId`: nullable -- null means system category, set means user-created custom category
- `CategoryGroup.isCustom`: boolean distinguishing system defaults from user-created groups

---

## 8. Authentication Flow

```
1. User visits any page
2. FinanceProvider useEffect fires
3. GET /api/auth/me reads httpOnly userId cookie
4. If 401 -> redirect to /login
5. If 200 -> set currentUser, proceed to fetch data
6. Login: POST /api/auth/login with { username, password }
7. bcrypt.compare(password, user.password)
8. On success: Set-Cookie userId=user.id (httpOnly, 30-day expiry)
9. On logout: DELETE cookie
```

**Security observations**:
- Auth is cookie-based with no CSRF protection
- No rate limiting on login
- Password is optional on the User model (`password: String?`)
- No password hashing on creation via API (only seed hashes passwords)
- New users created via `POST /api/users` have no password (cannot log in independently)

---

## 9. Docker / Deployment

### Docker Compose

Two services:
1. **myfam-app**: Next.js production server (port 3000 internal, 3001 external on localhost)
2. **myfam-db**: PostgreSQL 16 Alpine with health check

Networking: Both on an external `server-network` (shared with other services).

Volumes: `myfam-db-data` for persistent PostgreSQL storage.

### Dockerfile

Multi-stage build:
1. **builder**: Installs deps, generates Prisma client, builds Next.js
2. **runner**: Copies built artifacts, runs as non-root `nextjs` user

### Entrypoint

`entrypoint.sh` runs `prisma migrate deploy` before starting Next.js, ensuring database schema is up to date on every deployment.

### CI/CD

GitHub Actions workflow (`.github/workflows/deploy.yml`):
1. Lint check
2. SSH deploy on push to main: `git pull`, `docker-compose build`, `docker-compose up -d`

No test suite in CI.

### Environment

- `DATABASE_URL`: PostgreSQL connection string
- `POSTGRES_PASSWORD`: Database password (for Docker Compose)
- `NODE_ENV`: Set to `production` in Docker
- `VERCEL`: Auto-detected to switch Prisma adapter

---

## 10. Unique Characteristics

1. **Thai-localized**: Categories are in Thai (with English fallbacks), currency is THB, seed data includes Thai family names and expense categories like "Thai massage" and "temple donations"

2. **Budget-as-Transaction pattern**: Budget plan items are not a separate model -- they are `Transaction` records with `status: planned` and a `budgetId` foreign key. Completing a plan item transitions it to `completed` and adjusts account balances.

3. **Account reconciliation**: Manual balance overrides are tracked with previous balance, new balance, and difference -- enabling audit trails for when balances don't match transaction history.

4. **Family-scoped data isolation**: All queries filter by `familyId` through the authenticated user's family membership. No cross-family data leakage is possible at the API level.

5. **Mobile-first design**: The app is constrained to 480px width with a fixed bottom navigation bar, mimicking a native mobile app experience. CSS custom properties support both light and dark themes via `prefers-color-scheme`.

6. **No external auth provider**: Authentication is entirely self-managed with bcrypt password hashing and httpOnly cookies -- no OAuth, no JWT, no session store.

7. **Dual Prisma adapter**: The same codebase works on Vercel (Neon serverless) and self-hosted Docker (standard PostgreSQL) by detecting the `VERCEL` environment variable.

8. **CSV data migration**: The seed script processes two CSV files (`Expense.csv` and `Expense kid.csv`) with Thai category names, mapping them to system categories. This is how the app bootstraps real historical data.

9. **Image compression**: Client-side image compression (canvas resize to 800px, JPEG at 60% quality) for transaction slip images and user avatars, stored as base64 strings in the database.

10. **React Compiler**: `next.config.ts` enables `reactCompiler: true` for automatic memoization optimization.