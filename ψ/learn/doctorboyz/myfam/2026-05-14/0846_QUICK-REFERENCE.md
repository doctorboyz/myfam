# MyFam — Quick Reference

> Family Finance Tracker (FamMee)  
> Built: Next.js 16 + React 19 + Prisma 7 + PostgreSQL + LINE LIFF  
> Language: Thai primary / English secondary  

---

## 1. What It Does

MyFam is a **family-oriented personal finance tracker** with multi-member support, LINE integration, and AI-powered receipt parsing.

### Core Functions
- **Multi-user family accounts** — Parent/Child roles with permission scoping (parents see all; children see only their own)
- **Account management** — Bank, cash, credit, wallet, loan, investment accounts with reconciliations
- **Transaction tracking** — Income, expense, and transfer with categories, tags, fees, and slip images
- **Budgeting** — Monthly / one-time budgets with purposes: spending, savings, reward
- **Dashboard & reports** — Balance cards, income vs expense graphs, category pie charts
- **Soft-delete & trash** — Restore or permanently delete accounts, transactions, budgets, tags
- **LINE Bot integration** — Text commands and OCR receipt parsing via Ollama AI
- **LIFF login** — LINE Front-end Framework for seamless mobile auth
- **Invite-code linking** — Parents generate 24h invite codes to link children's LINE accounts

### LINE Bot AI Pipeline (Ollama)
```
LINE User → Webhook (/api/line/webhook) → verify signature
  → Text: parse command → category matching → quick-reply confirmation → record transaction
  → Image: vision model (Typhoon OCR) → parse slip → category matching → confirmation
```

---

## 2. Installation

### Prerequisites
- Node.js 20+
- PostgreSQL 16 (local or Neon)
- LINE Developers account (for bot + LIFF)
- Ollama instance (optional, for receipt OCR)

### Environment Setup
Copy `.env.example` to `.env` and configure:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `LINE_CHANNEL_SECRET` | LINE Messaging API channel secret |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE channel access token |
| `NEXT_PUBLIC_LIFF_ID` | LIFF app ID (starts with `liff-`) |
| `NEXT_PUBLIC_LINE_BASIC_ID` | LINE Official Account ID for add-friend button |
| `NEXT_PUBLIC_APP_URL` | Public app URL (e.g. `https://myfam.doctorboyz.com`) |
| `OLLAMA_BASE_URL` | Ollama server URL (default: `http://host.docker.internal:11434`) |
| `OLLAMA_TEXT_MODEL` | Text parsing model (default: `qwen3.5:cloud`) |
| `OLLAMA_VISION_MODEL` | OCR model (default: `qwen3.5:cloud`) |

### Database
```bash
# Generate Prisma client and run migrations
npm install
npx prisma migrate dev
npx prisma db seed    # Seeds default category groups + categories
```

### Development
```bash
npm run dev           # localhost:3000
```

### Production (Docker)
```bash
docker compose up -d  # App on :3001, DB on :5433
```

### LINE Setup Checklist
1. Create Provider + Messaging API channel in [LINE Developers](https://developers.line.biz/console/)
2. Issue channel access token, copy channel secret → `.env`
3. Set webhook URL: `https://<domain>/api/line/webhook`
4. Create LINE Login channel → add LIFF app → copy LIFF ID → `.env`
5. Add callback URLs: `https://<domain>/api/line/link` and `https://<domain>/liff`

---

## 3. Key Features

### 3.1 Auth & Roles
- **Parent**: full CRUD on all family data, can manage members, create invite codes
- **Child**: can view own data, record transactions, view budgets; cannot create accounts or manage members
- Auth methods: username/password (cookie-based) or LINE LIFF (auto-login via ID token)

### 3.2 Soft Delete Architecture
Almost every entity supports soft delete with audit trails:
- `deletedAt` / `deletedById` fields on Account, Transaction, Category, CategoryGroup, Tag, Budget, Reconciliation
- Trash endpoints: `/api/<entity>/trash`
- Restore: `PATCH /<id>/restore`
- Permanent delete: `DELETE /<id>/permanent`
- Monthly cron purge: `POST /api/cron/purge`

### 3.3 Category System
- Hierarchical: **CategoryGroup** (type: income/expense/transfer) → **Category**
- Default groups seeded via `prisma/seed.ts`
- Users can create custom groups and categories
- Categories are scoped to users for custom entries

### 3.4 Budget Types
| Purpose | Behavior |
|---------|----------|
| `spending` | Limit expenses in a period |
| `savings` | Target amount to save into an account |
| `reward` | Parent-defined reward for child milestones |

Budget items are stored as `Transaction` records with `status='planned'` and linked via `budgetId`.

### 3.5 Transaction States
- `completed` — finalized, affects balance
- `planned` — budget plan only, no balance impact
- `pending` — recorded but not cleared
- `void` — soft-deleted, excluded from calculations

### 3.6 Reconciliation
When app balance drifts from reality, parents can run **Reconcile** on any account:
- Enter actual current balance
- System computes difference and records a reconciliation entry
- History visible per account

### 3.7 Mobile-First Design
- Bottom navigation (`BottomNav`)
- Floating Action Button (`ActionFab`) for quick transaction entry
- `100dvh` + `viewport-fit=cover` for LIFF safe areas
- CSS variables for LIFF header offset (`--liff-header-height: 48px`)

---

## 4. Usage Patterns

### 4.1 Daily Transaction Entry (Mobile / LIFF)
1. Open app via LINE or browser
2. Tap **+** FAB → select type (Income / Expense / Transfer)
3. Fill amount, category, account, date, note, tags
4. Attach slip image (optional)
5. Save → balance updates immediately

### 4.2 Adding a Family Member
1. Parent goes to **Settings > Family Members**
2. Tap **Add Member** → enter name, select role
3. Tap **Send Invite** → generates 8-char invite code (24h expiry)
4. Send link to child's LINE chat
5. Child opens `/link?code=XXXX` and confirms → LINE account linked

### 4.3 Budget Workflow
1. **Budgets** tab → **+ Create Budget**
2. Choose purpose → fill title, limit, period, dates
3. Add budget items (planned transactions)
4. When executed, promote item to real transaction (`status: planned → completed`)
5. Progress bar tracks limit vs actual

### 4.4 LINE Bot Commands
| Message | Action |
|---------|--------|
| `ยอด` / `สรุป` | Reply current family balance |
| `ช่วยเหลือ` | Show available commands |
| Any expense text | AI parses amount + category → quick-reply confirmation |
| Photo of receipt | OCR extracts amount/merchant → confirmation flow |

### 4.5 Dashboard Filtering
- Default view: **current month** (Bangkok timezone)
- Filters: users (parents can multi-select), date range, transaction types, categories, accounts
- Visualizations re-render based on active filters

### 4.6 Reconcile an Account
1. Open **Accounts** → select account
2. Tap refresh icon on balance card
3. Enter actual balance
4. Confirm → reconciliation logged, difference noted

---

## 5. Project Structure

```
src/
├── app/                  # Next.js App Router pages
│   ├── api/              # REST API routes (entity-per-folder)
│   ├── dashboard/        # Main dashboard with filters + charts
│   ├── accounts/         # Account list
│   ├── account/[id]/     # Account detail + transactions + reconcile
│   ├── budget/           # Budget list + detail
│   ├── categories/       # Category management
│   ├── settings/         # Family, tags, categories settings
│   ├── login/            # Username/password login
│   ├── link/             # LINE invite-code linking page
│   └── layout.tsx        # Root layout: LiffProvider + FinanceProvider
├── components/           # Feature-organized React components
│   ├── ActionFab/        # Floating + button
│   ├── TransactionDetailModal/
│   ├── DashboardFilter/
│   ├── VisualizationView/
│   ├── BottomNav/
│   └── ...
├── context/
│   ├── FinanceContext.tsx  # Central data fetching + CRUD state
│   └── LiffContext.tsx     # LINE LIFF initialization
├── lib/
│   ├── prisma.ts           # Prisma client (Neon adapter for Vercel, pg for local)
│   ├── liff-auth.ts        # LIFF init wrapper
│   ├── transaction-parser.ts
│   ├── line-verify.ts      # Signature verification
│   └── ollama.ts           # AI pipeline
├── types/index.ts          # Shared TypeScript interfaces
prisma/
├── schema.prisma           # Full data model with soft-delete audit trails
└── seed.ts                 # Default categories + groups
```

### API Route Conventions
```
/api/accounts        GET  POST
/api/accounts/[id]   GET  PATCH  DELETE
/api/accounts/trash  GET
/api/accounts/[id]/restore     PATCH
/api/accounts/[id]/permanent   DELETE
```
Same pattern applies to: `transactions`, `categories`, `groups`, `tags`, `budgets`, `users`, `reconciliations`, `invites`

---

## 6. Important Files

| File | Role |
|------|------|
| `src/context/FinanceContext.tsx` | God context — fetches all data on mount, exposes CRUD methods |
| `src/middleware.ts` | Strips `/liff` prefix, detects LIFF mode via User-Agent |
| `src/lib/prisma.ts` | Dual-adapter Prisma client (Neon for Vercel, pg for Docker/local) |
| `prisma/schema.prisma` | Single source of truth for all models and relations |
| `docs/ONBOARDING.md` | Thai-language user manual |
| `docs/LINE_SETUP.md` | Step-by-step LINE Developers configuration |
| `docker-compose.yml` | Production stack: app + PostgreSQL |

---

## 7. Tech Stack Summary

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16.1.6 (App Router) |
| UI | React 19.2.3 + CSS Modules |
| Compiler | React Compiler (babel-plugin-react-compiler) |
| Fonts | Prompt (Thai) + Inter (Latin) via next/font |
| ORM | Prisma 7.4.0 |
| Database | PostgreSQL 16 (Neon on Vercel, local pg via Docker) |
| Auth | Cookie-based session + LINE LIFF ID token |
| Charts | Recharts 3.7 |
| AI | Ollama (Typhoon OCR + text model) |
| Icons | Lucide React |
| Build | TypeScript 5.9 + ESLint 9 |

---

*Document generated from codebase analysis on 2026-05-14.*
