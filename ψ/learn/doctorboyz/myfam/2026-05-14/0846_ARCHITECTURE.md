# MyFam — Architecture Overview

> Explored: 2026-05-14  
> Source: `/Users/doctorboyz/Code/github.com/doctorboyz/myfam`

---

## 1. Directory Structure

```
myfam/
├── src/
│   ├── app/                    # Next.js App Router (entry points + API)
│   │   ├── (routes)/           # Page components (dashboard, login, link, etc.)
│   │   └── api/                # REST API routes (colocated by resource)
│   ├── components/             # React components (feature-named folders)
│   ├── context/                # React Context providers
│   ├── data/                   # Seed/category static data
│   ├── lib/                    # Utilities, clients, parsers
│   ├── middleware.ts           # Next.js middleware (LIFF routing)
│   └── types/                  # Shared TypeScript interfaces
├── prisma/
│   ├── schema.prisma           # Database schema
│   ├── seed.ts                 # Seed script
│   └── verify_seed.ts          # Seed validation
├── docs/                       # Project docs (ONBOARDING, LINE_SETUP)
├── scripts/                    # Python scripts (rich-menu creation)
└── public/                     # Static assets
```

---

## 2. Entry Points

| Entry | File | Purpose |
|-------|------|---------|
| **App bootstrap** | `src/app/layout.tsx` | Root layout: fonts (Prompt + Inter), `LiffProvider`, `FinanceProvider`, `BottomNav` |
| **Home redirect** | `src/app/page.tsx` | Redirects `/` → `/dashboard` |
| **Dashboard** | `src/app/dashboard/page.tsx` | Main surface: balance, filters, charts, transaction FAB |
| **Login** | `src/app/login/page.tsx` | LINE LIFF login gate |
| **Account link** | `src/app/link/page.tsx` | LINE↔MyFam account linking via invite code |
| **LINE Webhook** | `src/app/api/line/webhook/route.ts` | Bot handler: text commands, image OCR, quick replies |
| **Middleware** | `src/middleware.ts` | Strips `/liff` prefix, sets `x-liff-mode` header |

---

## 3. Core Abstractions

### 3.1 Data Model (Prisma)

The schema uses **PostgreSQL** with a soft-delete / audit-trail design:

- **Family** → Users, Tags, InviteCodes
- **User** → parent/child roles, linked to LINE via `LineLink`
- **Account** → owned by User, tracks balance, supports soft delete (`deletedAt`, `deletedById`)
- **Transaction** → income/expense/transfer, links to Account(s), Category, Budget, Tags
- **CategoryGroup / Category** → hierarchical classification (Food → Groceries)
- **Budget** → spending/savings/reward goals with period (monthly/one_time)
- **Tag** → user-scoped labels attached via `TransactionTag` junction
- **Reconciliation** → manual balance adjustment audit trail
- **InviteCode** → one-time codes for LINE account linking

Every deletable entity carries `deletedAt` + `deletedById` + an audit relation back to `User`. This enables a **Trash** feature with restore/permanent-delete.

### 3.2 API Pattern

API routes follow a flat REST convention under `src/app/api/<resource>/route.ts`:

```
GET    /api/accounts
POST   /api/accounts
GET    /api/accounts/[id]
PATCH  /api/accounts/[id]
DELETE /api/accounts/[id]          → soft delete
PATCH  /api/accounts/[id]/restore   → restore
DELETE /api/accounts/[id]/permanent → hard delete
GET    /api/accounts/trash          → list soft-deleted
```

Shared helpers in `src/lib/api.ts`:
- `apiSuccess(data, status)` / `apiError(message, status)`
- `getAuthUserId()` — reads `userId` cookie
- `getAuthUser()` — resolves cookie → Prisma user
- `pickFields(body, keys)` — whitelist request fields

### 3.3 State Management

No external state library (Zustand/Redux). State is managed via two React Contexts:

**`LiffContext`** (`src/context/LiffContext.tsx`)
- Wraps `@line/liff` SDK (dynamic import, SSR-safe)
- Handles initialization, login state, auto-submits ID token to `/api/auth/liff`
- Sets CSS variables for LIFF safe-area (`--liff-header-height`, `--liff-extra-bottom`)

**`FinanceContext`** (`src/context/FinanceContext.tsx`)
- Central data hub: accounts, transactions, users, categories, tags, budgets
- Loads all domain data on mount via parallel `fetch()` calls
- Implements optimistic updates for CUD operations
- Computes `globalBalance` and `accountsForUser` (parent sees all, child sees own)
- Soft-delete trash state + restore/permanent delete functions

### 3.4 LINE Integration

**LIFF (Frontend)**
- `src/lib/liff-auth.ts` — SDK wrapper with a monkey-patch for v2.28.0 `redirectUri` bug
- `src/app/api/auth/liff/route.ts` — validates ID token, creates session cookie
- `src/app/api/auth/liff/link-invite/route.ts` — binds LINE user to MyFam user via invite code

**Messaging API (Bot)**
- `src/lib/line.ts` — thin wrapper for reply, push, flex, and image download
- `src/app/api/line/webhook/route.ts` — main webhook handler
  - Signature verification (`lib/line-verify.ts`)
  - Command routing (exact match + fuzzy regex)
  - AI fallback via Ollama for unstructured text
  - Image OCR for slip/receipt processing

### 3.5 AI Pipeline (Ollama)

`src/lib/ollama.ts` provides:
- `extractFromText(text, categories)` → structured transaction (amount, type, category, confidence)
- `extractFromSlip(imageBase64, categories)` → OCR + extraction from receipt photos
- `detectIntent(text)` → balance / recent / summary / budget / create_transaction / help

Model: `qwen3.5:cloud` (Ollama Max cloud) for both text and vision.

### 3.6 Prisma Client Setup

`src/lib/prisma.ts` creates a singleton PrismaClient with driver adapters:
- **Vercel (production)**: `PrismaNeon` adapter (Neon serverless)
- **Local / Docker**: `PrismaPg` adapter with `pg.Pool`

---

## 4. Dependencies

### Runtime
| Package | Role |
|---------|------|
| `next` 16.1.6 | App framework (App Router, React Compiler enabled) |
| `react` 19.2.3 / `react-dom` | UI library |
| `@prisma/client` 7.4.0 | ORM |
| `@prisma/adapter-neon` / `@prisma/adapter-pg` | Serverless & local DB drivers |
| `@neondatabase/serverless` | Neon connection |
| `pg` | PostgreSQL driver |
| `@line/liff` 2.28.0 | LINE Front-end Framework |
| `bcryptjs` | Password hashing |
| `lucide-react` | Icon set |
| `recharts` | Dashboard charts |
| `sharp` | Image optimization |

### Dev
| Package | Role |
|---------|------|
| `typescript` 5.9.3 | Type system |
| `prisma` 7.4.0 | Schema & migrations |
| `eslint` + `eslint-config-next` | Linting |
| `babel-plugin-react-compiler` | React Compiler (Next 16) |
| `tsx` / `ts-node` | Script runner |

---

## 5. Notable Patterns

- **Soft-delete everywhere** — `deletedAt` + `deletedById` on Account, Transaction, Category, Tag, Budget. Trash views query `deletedAt: { not: null }`.
- **Audit relations** — Every mutation records `createdById`, `updatedById`, `deletedById` with Prisma relations to `User`.
- **Cookie-based auth** — Simple `userId` HTTP-only cookie (no JWT library). LINE LIFF sets the same cookie after ID token validation.
- **Invite code linking** — Parent generates a code in the app; child opens `/link?code=XXX` in LIFF to bind their LINE account.
- **Thai-first UX** — Copy, dates, and greetings are Thai-language. Fonts include Thai subset (`Prompt`).
- **Bangkok timezone** — `src/lib/timezone.ts` ensures date calculations align to `Asia/Bangkok`.
- **No tests present** — The codebase has no test files. Rules demand 80% coverage + TDD; this is a gap.
- **No Zod or schema validation** — API routes parse JSON directly without runtime validation.

---

## 6. Key Files Summary

| File | Lines | Responsibility |
|------|-------|----------------|
| `src/context/FinanceContext.tsx` | ~1018 | Central data store, all CRUD + filtering + trash |
| `src/app/api/line/webhook/route.ts` | ~964 | LINE bot: commands, AI, OCR, quick replies |
| `prisma/schema.prisma` | ~329 | Full data model with enums, relations, soft-delete |
| `src/context/LiffContext.tsx` | ~108 | LIFF lifecycle, auth cookie bootstrap |
| `src/lib/ollama.ts` | ~300+ | AI text extraction, vision OCR, intent detection |
| `src/lib/api.ts` | ~48 | API response helpers, auth cookie resolver |
| `src/lib/liff-auth.ts` | ~133 | LIFF SDK wrapper with redirectUri bugfix |
| `src/lib/line.ts` | ~130 | LINE Messaging API client |
| `src/middleware.ts` | ~55 | `/liff` prefix strip, LIFF detection header |

---

## 7. Deployment Context

- **Primary host**: Vercel (Neon PostgreSQL)
- **Docker**: `Dockerfile` + `docker-compose.yml` present for local/containerized runs
- **LINE OA**: Webhook points to `/api/line/webhook`; LIFF endpoint URL uses `/liff` prefix handled by middleware
- **Rich menu**: Python script in `scripts/create-rich-menu.py` for LINE OA menu configuration
