# MyFam Testing Analysis

**Date:** 2026-05-14
**Repo:** doctorboyz/myfam
**Tech Stack:** Next.js 16.1.6, React 19.2.3, TypeScript 5.9.3, Prisma 7.4.0, PostgreSQL (Neon/pg)

---

## Executive Summary

**The project has zero testing infrastructure.** No test files, no test frameworks, no test scripts, no CI test steps, and no test configuration. This is a production finance app handling real money transactions with no automated verification.

---

## 1. Test Infrastructure Status

| Item | Status | Evidence |
|------|--------|----------|
| Test framework installed | **NO** | No jest, vitest, playwright, cypress, or mocha in `package.json` dependencies or devDependencies |
| Test scripts in package.json | **NO** | Scripts: `dev`, `postinstall`, `build`, `start`, `lint` only |
| Test files (`.test.*`, `.spec.*`) | **NO** | `find` returned zero matches across entire repo |
| Test directories (`__tests__`, `tests`, `e2e`) | **NO** | None found in `src/` or root |
| Test config files | **NO** | No `jest.config.*`, `vitest.config.*`, `playwright.config.*`, `cypress.config.*` |
| CI test step | **NO** | `.github/workflows/deploy.yml` runs `npm run lint` but no tests |
| Coverage tooling | **NO** | No istanbul, v8 coverage, or equivalent configured |
| Test utilities / helpers | **NO** | No `test-utils.tsx`, no mock factories, no Prisma test client setup |

---

## 2. Source Code Overview (What Should Be Tested)

### 2.1 Library Utilities (`src/lib/` — ~2,731 lines total)

| File | Lines | Testable Surface | Risk Level |
|------|-------|------------------|------------|
| `lib/transaction-parser.ts` | 170 | Thai NLP text parsing for transactions (regex-based type detection, amount extraction, account fuzzy matching) | **HIGH** |
| `lib/reconcile-parser.ts` | 78 | Thai NLP text parsing for balance reconciliation (amount + account matching) | **HIGH** |
| `lib/chart-message.ts` | 165 | LINE Flex Message builders (monthly summary, budget progress bars) | MEDIUM |
| `lib/timezone.ts` | 77 | Bangkok timezone conversion helpers (`getBangkokDate`, `formatBangkokDate`, `getBangkokDateString`) | MEDIUM |
| `lib/compressImage.ts` | 53 | Canvas-based image compression (FileReader -> Image -> Canvas -> JPEG) | MEDIUM |
| `lib/line-verify.ts` | 41 | LINE webhook HMAC-SHA256 signature verification (security-critical) | **HIGH** |
| `lib/line-id-token.ts` | 45 | LINE ID Token verification via LINE API (security-critical) | **HIGH** |
| `lib/liff-auth.ts` | 117 | LIFF authentication flow logic | **HIGH** |
| `lib/line.ts` | 129 | LINE bot message handlers, webhook processing | **HIGH** |
| `lib/ollama.ts` | 599 | Ollama AI integration for chat / natural language processing | MEDIUM |
| `lib/api.ts` | 47 | API response helpers (`apiSuccess`, `apiError`, `getAuthUserId`, `getAuthUser`, `pickFields`) | MEDIUM |
| `lib/prisma.ts` | 22 | Prisma client singleton with Neon/pg adapter selection | LOW |

### 2.2 React Context (`src/context/`)

| File | Lines | Testable Surface | Risk Level |
|------|-------|------------------|------------|
| `context/FinanceContext.tsx` | 1,018 | Massive state management context with ~50 methods: CRUD for accounts, transactions, categories, tags, budgets, trash/restore, optimistic updates, filtering | **CRITICAL** |
| `context/LiffContext.tsx` | 108 | LIFF initialization, login state, profile | MEDIUM |

### 2.3 API Routes (`src/app/api/` — ~4,017 lines total)

**32 API route files** covering:

- **Auth:** `login`, `logout`, `me`, `liff`, `liff/link`, `liff/link-invite`
- **Accounts:** CRUD + soft delete + restore + permanent delete + trash list
- **Transactions:** CRUD + soft delete + restore + permanent delete + trash list
- **Budgets:** CRUD + soft delete + restore + permanent delete + trash list
- **Categories:** CRUD + soft delete + restore + permanent delete
- **Tags:** CRUD + soft delete + restore + permanent delete + trash list
- **Groups:** CRUD + restore
- **Users:** CRUD
- **Reconciliations:** CRUD
- **Invites:** Link code validation
- **LINE:** Webhook, sandbox, link
- **Cron:** Purge job

**Notable patterns:**
- Most routes use `prisma.$transaction` for balance updates on transactions
- Soft-delete pattern is consistent across entities (`deletedAt`, `deletedById`)
- Auth is cookie-based (`userId` cookie) with `getAuthUser()` helper
- No input validation library (Zod, Yup, Joi) — validation is manual/null checks

### 2.4 Components (`src/components/`)

**21 components** including:
- Form modals (Account, Budget, Category, CategoryGroup, Transaction)
- UI components (Modal, BottomNav, ActionFab, BalanceCard, Money)
- Data display (TransactionList, VisualizationView, DashboardFilter)
- Interaction (ImageUploader, TagSelector, CategorySelector)

### 2.5 Data & Types

| File | Content |
|------|---------|
| `data/categories.ts` | Hardcoded `INITIAL_GROUPS` and `INITIAL_CATEGORIES` seed data |
| `types/index.ts` | 139 lines of domain types: `Account`, `Transaction`, `Budget`, `Category`, `User`, `Tag`, `DashboardFilters`, etc. |

### 2.6 Middleware

| File | Content | Risk |
|------|---------|------|
| `middleware.ts` | LIFF URL prefix stripping, `x-liff-mode` header detection | MEDIUM |

---

## 3. What Is NOT Tested (Everything)

Since there are zero tests, the following are all untested:

### 3.1 Business Logic (Highest Risk)

1. **Transaction balance math** — Income adds, expense subtracts, transfer moves between accounts, fee handling
2. **Thai text parsing** — `transaction-parser.ts` and `reconcile-parser.ts` regex logic for Thai financial language
3. **Soft-delete / restore / permanent-delete** — State transitions, cascade behavior, balance recalculation
4. **Budget transaction status flow** — `pending` -> `done` -> balance updates, `cancelled` -> void
5. **User role-based access** — Parent sees all accounts, child sees own only
6. **Dashboard filtering** — Multi-filter intersection (users, date range, types, accounts, categories)

### 3.2 Security Logic

1. **LINE webhook signature verification** — HMAC-SHA256 timing-safe comparison
2. **LINE ID token verification** — JWT-like token validation against LINE API
3. **Cookie-based auth** — `userId` cookie parsing, session validation
4. **BCrypt password comparison** — Login route credential verification
5. **Family-scoped data access** — All Prisma queries filter by `familyId`

### 3.3 API Contract

1. **Request/response shapes** — No validation that API returns expected JSON structure
2. **HTTP status codes** — No verification of 200, 201, 400, 401, 404, 500 behavior
3. **Error handling** — No tests for database failures, missing records, malformed input
4. **Prisma query correctness** — Complex `include` trees, `where` clauses, `$transaction` blocks

### 3.4 Frontend Behavior

1. **FinanceContext state updates** — Optimistic updates, rollback on error, race conditions
2. **Component rendering** — No visual or behavioral component tests
3. **LIFF integration** — No tests for LINE in-app browser behavior
4. **Image upload/compression** — No tests for File -> canvas -> JPEG pipeline

---

## 4. Testing Gaps by Category

### 4.1 Unit Tests (Biggest Gap)

| Target | Priority | Why |
|--------|----------|-----|
| `transaction-parser.ts` | P0 | Regex parsing of Thai financial text is error-prone; no tests for edge cases |
| `reconcile-parser.ts` | P0 | Same as above; amount extraction and account fuzzy matching |
| `line-verify.ts` | P0 | Security-critical HMAC verification; no tests for valid/invalid signatures |
| `line-id-token.ts` | P0 | Auth-critical; no tests for token expiry, malformed tokens, network errors |
| `timezone.ts` | P1 | Date math is notorious for off-by-one errors; Bangkok timezone offset logic |
| `chart-message.ts` | P1 | LINE Flex Message JSON shape must be valid; percentage calculations |
| `compressImage.ts` | P1 | Canvas API is browser-only; needs jsdom or mock testing |
| `api.ts` | P1 | `pickFields` utility, `getAuthUser` with Prisma mock |

### 4.2 Integration Tests (API Routes)

| Target | Priority | Why |
|--------|----------|-----|
| `POST /api/transactions` | P0 | Balance updates inside `$transaction` — if this breaks, user money is wrong |
| `POST /api/auth/login` | P0 | Auth is the front door; bcrypt comparison, cookie setting |
| `POST /api/auth/liff` | P0 | LINE auth flow; token exchange, user creation/linking |
| `GET /api/auth/me` | P1 | Session validation |
| All DELETE routes | P1 | Soft-delete vs permanent-delete behavior |
| All PATCH restore routes | P1 | Restore logic and balance recalculation |
| `GET /api/cron/purge` | P1 | Data cleanup job |

### 4.3 E2E Tests (None Exist)

| Flow | Priority |
|------|----------|
| User login -> dashboard -> add transaction -> verify balance | P0 |
| LINE LIFF login flow | P0 |
| Budget creation -> add planned item -> mark done -> verify account balance | P1 |
| Trash -> restore -> verify reappearance | P1 |
| Category CRUD | P2 |
| Tag CRUD | P2 |

### 4.4 Visual/Component Tests

| Component | Priority |
|-----------|----------|
| `TransactionList` | P1 |
| `DashboardFilter` | P1 |
| `BalanceCard` | P1 |
| `Modal` + form modals | P2 |

---

## 5. Recommended Testing Stack

Given the Next.js + TypeScript + Prisma + PostgreSQL stack:

### 5.1 Unit / Integration: Vitest

- **Why:** Native ESM support, fast, excellent TypeScript support, built-in coverage (v8), modern replacement for Jest
- **Use for:** Lib utilities, API route handlers (with `node-mocks-http` or Next.js request mocking), Prisma queries with `jest-prisma` or custom mock

### 5.2 E2E: Playwright

- **Why:** Recommended by Next.js team, handles both server and client, can test LIFF flows with custom user-agent
- **Use for:** Full user flows, cross-browser testing, visual regression

### 5.3 Prisma Testing Setup

```typescript
// test/prisma-test-client.ts
import { PrismaClient } from '@prisma/client'
import { execSync } from 'child_process'

const prisma = new PrismaClient()

export async function setupTestDb() {
  execSync('npx prisma migrate reset --force --skip-generate', { env: { ...process.env, DATABASE_URL: testDbUrl } })
}
```

Alternative: Use `jest-prisma` or create a lightweight transaction-rollback wrapper for each test.

### 5.4 Suggested package.json Additions

```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui"
  },
  "devDependencies": {
    "@playwright/test": "^1.45.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/jest-dom": "^6.4.0",
    "jsdom": "^24.1.0",
    "vitest": "^2.0.0",
    "@vitest/coverage-v8": "^2.0.0"
  }
}
```

---

## 6. CI/CD Testing Gap

Current `.github/workflows/deploy.yml`:

```yaml
jobs:
  lint:
    name: Lint and Test  # <-- misnamed; only runs lint
    steps:
      - run: npm run lint  # <-- no test step
```

**The job is literally named "Lint and Test" but does not run tests.** This is misleading and gives false confidence.

---

## 7. First Steps to Add Testing

1. **Install Vitest + Playwright**
2. **Write causal tests for `transaction-parser.ts`** — this is the highest-value, lowest-effort win
3. **Write causal tests for `reconcile-parser.ts`**
4. **Add Prisma test harness** with isolated test database
5. **Test one critical API route end-to-end** (`POST /api/transactions` with balance math)
6. **Add test step to CI** after lint passes
7. **Set coverage target** at 80% per project rules

---

## 8. Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Balance calculation bugs in transaction routes | **CRITICAL** | Unit + integration tests for `POST /api/transactions` balance logic |
| Thai text parsing failures | **HIGH** | Unit tests for `transaction-parser.ts` and `reconcile-parser.ts` with comprehensive Thai input cases |
| Auth bypass / LINE webhook spoofing | **HIGH** | Unit tests for `line-verify.ts` and `line-id-token.ts` |
| Soft-delete data loss | **HIGH** | Integration tests for delete/restore/permanent-delete flows |
| Dashboard filter logic errors | MEDIUM | Unit tests for `getFilteredTransactions` in FinanceContext |
| Timezone date display bugs | MEDIUM | Unit tests for `timezone.ts` edge cases (DST transitions, year boundaries) |
| LINE Flex Message JSON malformation | LOW | Snapshot tests for `chart-message.ts` output |

---

## Appendix: File Count Summary

| Category | Count | Total Lines |
|----------|-------|-------------|
| API Routes | 32 files | ~4,017 |
| Components | 21 files | ~? |
| Contexts | 2 files | ~1,126 |
| Library Utils | 12 files | ~2,731 |
| Data/Types | 2 files | ~201 |
| Middleware | 1 file | ~44 |
| **TOTAL** | **~70 files** | **~8,000+** |

**Tests: 0 files, 0 lines, 0% coverage.**
