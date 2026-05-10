# MyFam Quick Reference

## 1. What It Does

**FamMee** is a family finance tracker web app. Multiple family members (parents and children) track income, expenses, transfers, and budgets together. Each user has their own accounts with role-based visibility: parents see all family data, children see only their own.

Core workflows:
- Record transactions (income/expense/transfer) with categories, tags, fee tracking, and slip image uploads
- Manage accounts (bank, cash, credit, wallet, loan, invest) with real-time balance updates
- Create budgets with planned transactions that can be marked done when realized
- Reconcile account balances against bank statements
- Filter dashboard by user, date range, transaction type, category, and account
- Thai-language category hierarchy (seeded defaults in Thai, custom categories supported)

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.1.6 (App Router) |
| UI | React 19.2.3, lucide-react icons, recharts |
| Language | TypeScript 5.9 |
| Database | PostgreSQL 16 (via Prisma 7.4.0) |
| ORM | Prisma 7 with `@prisma/adapter-pg` (local) and `@prisma/adapter-neon` (Vercel) |
| Auth | Cookie-based (`userId` httpOnly cookie), bcryptjs password hashing |
| Hosting | Docker (production) or Vercel (development) |
| CSS | CSS Modules per component |
| State | React Context (`FinanceContext`) -- no external state library |
| Charts | recharts |
| Image Compression | Client-side canvas resize to 800px max, JPEG quality 0.6 |

---

## 3. Installation

### Local Development (Neon/Vercel)

```bash
git clone <repo-url>
cd myfam
npm install
cp .env.example .env.development.local
# Edit .env.development.local with DATABASE_URL
npx prisma migrate deploy
npx prisma db seed   # optional: loads Thai categories + CSV data
npm run dev          # http://localhost:3000
```

### Docker Compose (Self-Hosted)

```bash
# Create .env with POSTGRES_PASSWORD
docker-compose up -d
# Entrypoint runs prisma migrate deploy then starts Next.js
# App exposed on host port 3001 -> container 3000
```

Default seed passwords: all users get `4444`.

### Prisma Commands

```bash
npx prisma migrate dev    # Create new migration
npx prisma migrate deploy # Apply migrations (used in Docker)
npx prisma studio         # Visual DB browser
npx prisma generate       # Regenerate client
npx prisma db seed        # Run seed script
```

---

## 4. Key Features

### Accounts
- Types: bank, cash, credit, wallet, loan, invest
- Each account has owner, color, icon, account number, alias
- Balance auto-updates on transaction create/delete
- Reconciliation: adjust balance to match bank statement, records difference

### Transactions
- Three types: income, expense, transfer
- Fields: amount, fee, date, category, tags, description, slip image, status
- Statuses: pending, completed, planned, void
- Transfer: source account decreases by amount+fee, destination increases by amount
- Deleting a completed transaction reverses the balance changes

### Budgets
- Two periods: monthly, one_time
- Budget = collection of planned transactions (status: planned)
- Marking a planned transaction as "done" converts it to completed and adjusts balances
- Deleting a budget archives it and voids all its pending/planned transactions
- Any family member can add transaction plans to shared budgets

### Categories
- Hierarchical: CategoryGroup -> Category
- Groups typed by transaction type (income, expense, transfer)
- System categories (seeded, Thai) + user-created custom categories
- Cannot delete a category that is used by any transaction

### Users & Roles
- Two roles: `parent` (sees all family data) and `child` (sees only own accounts)
- `isAdmin` flag for admin-level operations (category management)
- Avatar upload (base64, client-compressed)
- Each user belongs to a Family

### Dashboard
- Global balance card (filtered by selected users)
- Income vs expense chart (recharts)
- Category pie chart breakdown
- Transaction list with filters (user, date range, type, category, account)
- Default filter: current month, current user's accounts

---

## 5. Configuration

### Environment Variables

| Variable | Purpose | Required |
|----------|---------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `POSTGRES_PASSWORD` | DB password (Docker Compose) | Docker only |
| `NODE_ENV` | `production` or `development` | Docker sets this |
| `PORT` | Server port (default 3000) | Optional |
| `VERCEL` | If set, uses Neon serverless adapter | Auto on Vercel |

### Docker Compose

- `app` service: Next.js on port 3000 (mapped to host 3001)
- `myfam-db` service: PostgreSQL 16 alpine with health check
- Data persisted in `myfam-db-data` volume
- Both services on `server-network` (external Docker network)

### Next.js Config

- React Compiler enabled (`reactCompiler: true`)
- No custom rewrites or redirects

---

## 6. Development Workflow

```bash
npm run dev        # Start dev server (next dev)
npm run build      # Production build (next build)
npm run start      # Start production server
npm run lint       # ESLint check
npm run postinstall # Auto-runs prisma generate
```

### CI/CD

- GitHub Actions workflow (`.github/workflows/deploy.yml`)
- On push to `main`: lint check, then SSH deploy to production server
- Production server runs `git pull`, `docker-compose build`, `docker-compose up -d`

### Database Migrations

6 migrations exist:
1. Initial schema
2. Update account types and groups
3. Restore group name
4. Add budget creator
5. Add budget description
6. Add Family model

### Auth Flow

1. POST `/api/auth/login` with `{ username, password }`
2. Server sets `userId` httpOnly cookie (30-day expiry)
3. All API routes check cookie via `getAuthUserId()` / `getAuthUser()`
4. Frontend `FinanceContext` fetches `/api/auth/me` on load; redirects to `/login` if not authenticated
5. POST `/api/auth/logout` clears the cookie

---

## 7. API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login with username/password, sets httpOnly cookie |
| POST | `/api/auth/logout` | Clear auth cookie |
| GET | `/api/auth/me` | Get current authenticated user |

### Users

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users` | List all family members |
| POST | `/api/users` | Create new family member |
| PATCH | `/api/users/[id]` | Update user (name, role, color, avatar) |
| DELETE | `/api/users/[id]` | Delete user |

### Accounts

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/accounts` | List accounts (family-scoped, optional `?userId=` filter) |
| POST | `/api/accounts` | Create account |
| PATCH | `/api/accounts/[id]` | Update account fields |
| DELETE | `/api/accounts/[id]` | Delete account |

### Transactions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/transactions` | List transactions (family-scoped, optional `?accountId=`) |
| POST | `/api/transactions` | Create transaction (auto-adjusts account balances) |
| PATCH | `/api/transactions/[id]` | Update transaction; special: `planned->completed` adjusts balances |
| DELETE | `/api/transactions/[id]` | Delete transaction (reverts account balances) |

### Budgets

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/budgets` | List active (non-archived) budgets with items |
| POST | `/api/budgets` | Create budget |
| PATCH | `/api/budgets/[id]` | Update budget (only creator can edit) |
| DELETE | `/api/budgets/[id]` | Archive budget + void its planned transactions |

### Categories & Groups

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/categories` | Get all groups and categories |
| POST | `/api/categories` | Create category (name, groupId, optional userId) |
| PATCH | `/api/categories/[id]` | Update category (name, groupId) |
| DELETE | `/api/categories/[id]` | Delete category (blocked if used in transactions) |
| POST | `/api/groups` | Create category group (name, type) |
| PATCH | `/api/groups/[id]` | Update group name |
| DELETE | `/api/groups/[id]` | Delete group and its categories |

### Reconciliations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/reconciliations?accountId=` | List reconciliations for an account |
| POST | `/api/reconciliations` | Create reconciliation (sets account balance to new value) |

---

## 8. Database Models

```
Family
  id: UUID
  name: String
  members: User[]

User
  id: UUID
  name: String (unique)
  password: String? (bcrypt hash)
  role: UserRole [parent | child]
  isAdmin: Boolean
  avatar: String? (base64)
  color: String (hex default #000000)
  familyId: UUID -> Family
  accounts: Account[]
  transactions: Transaction[]
  categories: Category[]
  budgets: Budget[]

Account
  id: UUID
  name: String
  type: AccountType [bank | cash | credit | wallet | loan | invest]
  balance: Decimal (default 0)
  color: String
  icon: String?
  accountNo: String?
  alias: String?
  ownerId: UUID -> User
  status: String (default "active")
  incomingTransactions, outgoingTransactions, reconciliations

CategoryGroup
  id: UUID
  name: String
  type: String (income/expense/transfer)
  isCustom: Boolean (default false)
  categories: Category[]

Category
  id: UUID
  name: String
  groupId: UUID -> CategoryGroup
  userId: UUID? -> User (null = system category)
  transactions: Transaction[]

Transaction
  id: UUID
  amount: Decimal (default 0)
  planAmount: Decimal? (budgeted/expected amount)
  date: DateTime
  type: TransactionType [income | expense | transfer]
  description: String?
  status: TransactionStatus [pending | completed | planned | void]
  accountId: UUID? -> Account (source)
  toAccountId: UUID? -> Account (transfer destination)
  categoryId: UUID? -> Category
  budgetId: UUID? -> Budget
  createdById: UUID -> User
  fee: Decimal? (default 0)
  slipImage: String? (base64)
  tags: String[]

Budget
  id: UUID
  title: String
  description: String?
  period: BudgetPeriod [monthly | one_time]
  limit: Decimal
  startDate: DateTime?
  endDate: DateTime?
  status: BudgetStatus [active | archived]
  icon: String?
  color: String?
  transactions: Transaction[]
  createdById: UUID -> User

Reconciliation
  id: UUID
  accountId: UUID -> Account (cascade delete)
  previousBalance: Decimal
  newBalance: Decimal
  difference: Decimal
  note: String?
  performedById: UUID
```

### Key Relationships

- Family 1:N User
- User 1:N Account, Transaction, Budget
- Account 1:N Transaction (as source or destination)
- CategoryGroup 1:N Category
- Category 1:N Transaction
- Budget 1:N Transaction (via budgetId)
- Transaction balance adjustments are atomic (Prisma `$transaction`)

---

## 9. Known Issues / TODOs

From code comments and observed patterns:

1. **Auth is cookie-based without session management**: No token expiry, refresh, or CSRF protection. The `userId` cookie is the sole auth mechanism.
2. **Optimistic updates without rollback**: `updateUser`, `updateAccount`, `updateBudget` update local state first but only log errors on API failure -- no revert.
3. **No input validation on most API routes**: Request bodies are parsed as JSON without Zod or similar schema validation. Only `login`, `groups`, and `categories` POST routes validate required fields.
4. **Slip images stored as base64 in DB**: No file upload service; images are compressed client-side and stored directly in the `slipImage` column. This will bloat the database over time.
5. **No pagination on list endpoints**: All GET endpoints return full datasets -- no skip/take/limit parameters.
6. **No error boundary in React**: No `ErrorBoundary` component; API failures silently log to console.
7. **Delete user is hard delete**: No soft-delete; deleting a user cascades and may orphan transactions.
8. **Category deletion blocked by transactions**: Cannot delete a category in use, but no UI guidance for what to do instead (rename is suggested in the API message but not surfaced well).
9. **Settings page has mock UI**: "Appearance" and "Language" settings are non-functional placeholders.
10. **Budget transaction CRUD uses local state for some operations**: `addBudgetTransaction` and `deleteBudgetTransaction` update local state but also hit the API; inconsistency risk on partial failure.
11. **Thai/English naming inconsistency**: Seed data uses Thai category names; the `categories.ts` fallback file uses English. The seed script maps CSV Thai names to system Thai categories.
12. **No middleware auth guard**: Auth checks are done per-route inside each handler; no Next.js middleware redirects unauthenticated users at the edge.
13. **Environment variable exposure risk**: The `.env.development.local.bak` file in the repo contains live Neon database credentials. This should be in `.gitignore`.

---

## 10. Integration Points

### LINE Bot Integration

The app is positioned for LINE Bot integration (Thai family market). Where to plug in:

- **Webhook endpoint**: Create `src/app/api/line/webhook/route.ts` for LINE Messaging API webhooks
- **Transaction creation via chat**: Use existing `POST /api/transactions` endpoint; parse LINE message text into transaction payload
- **Quick expense logging**: Users could send a photo of a receipt (slip), which the bot OCRs and auto-fills transaction fields
- **Budget alerts**: Bot pushes notifications when budget thresholds are hit (would need a scheduled job or webhook from budget updates)
- **Family notification**: When a child creates a transaction, notify parents via LINE

### AI Features

- **Slip OCR**: Replace client-side base64 storage with server-side image processing. Create `src/app/api/ocr/route.ts` that accepts an image and returns extracted amount, date, merchant.
- **Category auto-suggestion**: Given a transaction description, suggest the category. Create `src/app/api/suggest/route.ts`.
- **Spending insights**: Analyze transaction patterns over time. Could be a new dashboard tab or API endpoint `GET /api/insights`.
- **Budget recommendations**: Based on historical spending, suggest budget limits.
- **Anomaly detection**: Flag unusual transactions.

### Other Integration Points

- **Export/Import**: Add `GET /api/export?format=csv` for transaction export. The seed script already has CSV parsing logic that could be reused for import.
- **Recurring transactions**: Add a `recurrence` model and a cron job (via Vercel Cron or external scheduler) to create planned transactions.
- **Shared accounts**: The schema supports accounts owned by one user; for shared family accounts, add a `AccountUser` junction table or an ownership model.
- **Real-time updates**: Currently no WebSocket/SSE; all data is fetched on context mount. Add Socket.io or Supabase Realtime for multi-device sync.
- **Mobile PWA**: The app uses viewport meta for mobile but lacks a service worker or manifest for offline support. The `public/manifest.json` exists but is minimal.

---

## Page Routes

| Route | Component | Purpose |
|-------|-----------|---------|
| `/` | Home | Account list with balances, quick-add buttons |
| `/login` | LoginPage | Username/password authentication |
| `/dashboard` | Dashboard | Filters, charts, transaction list |
| `/account/[id]` | AccountDetail | Single account view with transactions |
| `/budget` | BudgetList | All budgets with progress |
| `/budget/[id]` | BudgetDetail | Single budget with planned/done items |
| `/categories` | CategoriesPage | Category management |
| `/profile` | Profile | User profile with avatar, accounts summary |
| `/settings` | Settings | App settings (appearance, language, categories, family) |
| `/settings/categories` | CategorySettings | Admin: manage category groups and categories |
| `/settings/family` | FamilyManagement | Parent: manage family members |

## Key Components

| Component | Purpose |
|-----------|---------|
| `FinanceContext` | Global state provider; all CRUD operations via API calls |
| `ActionFab` | Floating action button for quick add (income/expense/transfer) |
| `TransactionDetailModal` | Create/edit transaction with category selector, tags, slip upload |
| `BudgetFormModal` | Create/edit budget |
| `BudgetTransactionModal` | Add planned transaction to a budget |
| `AccountFormModal` | Create/edit account |
| `CategorySelector` | Hierarchical category picker |
| `CategoryFormModal` | Create/edit category |
| `CategoryGroupFormModal` | Create/edit category group |
| `DashboardFilter` | Filter panel (users, date range, type, category, account) |
| `VisualizationView` | Income/expense charts and category pie chart |
| `ReconcileModal` | Account balance reconciliation |
| `BottomNav` | Mobile bottom navigation bar |
| `TopBar` | Top header with user info and navigation |
| `Money` | Currency formatting component |
| `TagSelector` | Tag input for transactions |
| `AvatarUploader` | Base64 avatar upload with client-side compression |
| `compressImage` | Utility: canvas-based image resize to max 800px, JPEG 0.6 quality |