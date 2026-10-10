# MyFam Quick Reference

A Next.js family finance management app with LINE integration, AI-powered slip OCR, and multi-member family support.

---

## What the Project Does

MyFam is a family finance tracker (codename "FamMee") designed for Thai-speaking households. It enables multiple family members to collaboratively track income, expenses, and transfers across shared and personal accounts.

### Core Capabilities

- **Multi-member family support** — Role-based access (Parent/Child) with a single Family entity
- **Account management** — Cash, Bank, Credit, Wallet, Loan, and Investment accounts with reconciliation
- **Transaction tracking** — Income, Expense, and Transfer types with categorization, tags, and slip images
- **Budgeting** — Three budget purposes: Spending (limit-based), Savings (goal-based), and Reward (child incentives)
- **LINE Bot integration** — Natural language transaction recording, slip/receipt OCR, balance queries, and monthly summaries
- **AI-powered extraction** — Ollama cloud models parse Thai text messages and read payment slip images
- **Invite code system** — Parents generate 8-character codes to link family members to their LINE accounts
- **Dashboard & reports** — Balance cards, income vs expense visualization, and category breakdowns

### Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16.1.6 (App Router) |
| Language | TypeScript 5.9.3 |
| Database | PostgreSQL 16 (via Prisma 7.4.0) |
| ORM | Prisma with Neon serverless adapter |
| Auth | Cookie-based (`userId` cookie) + LINE LIFF ID token verification |
| UI | React 19.2.3, CSS Modules, Lucide icons |
| Charts | Recharts 3.7.0 |
| AI | Ollama (text + vision models via cloud API) |
| LINE | LIFF 2.28.0, Messaging API webhook |
| Image | Sharp 0.34.5 (server-side resize) |
| Compiler | React Compiler (babel-plugin-react-compiler) |

---

## Installation

### Prerequisites

- Node.js 20+
- PostgreSQL 16 (local or Docker)
- LINE Developers account (for bot credentials)
- Ollama instance (local or remote) with text and vision models

### Method 1: Local Development

```bash
# Clone and install
cd /Users/doctorboyz/Code/github.com/doctorboyz/myfam
npm install          # triggers prisma generate via postinstall

# Database
cp .env.example .env
# Edit .env — set POSTGRES_PASSWORD and DATABASE_URL for local Postgres
npx prisma migrate dev
npx prisma db seed   # optional: seed initial categories

# Start dev server
npm run dev          # http://localhost:3000
```

### Method 2: Docker Compose (Recommended for Production)

```bash
# Set environment
cp .env.example .env
# Edit .env — fill all LINE and Ollama variables

# Build and start
docker-compose up -d

# Services
# - myfam-app    : Next.js on port 3001 (bound to 127.0.0.1)
# - myfam-db     : Postgres 16 on port 5433 (bound to 127.0.0.1)
```

### Method 3: Production Server (GitHub Actions + SSH)

```bash
# On server
git clone <repo> /home/user/myfam
cd /home/user/myfam
cp .env.example .env
# Edit .env with production values
docker-compose build
docker-compose up -d
```

Pushes to `main` trigger `.github/workflows/deploy.yml`:
1. Lint check on CI
2. SSH into production server
3. `git pull`, `docker-compose build`, `docker-compose up -d`

---

## Key Features with Examples

### 1. Family & Member Management

```
Settings > Family Members
- Parent creates members (Parent or Child role)
- Parent generates invite code (8-char hex, 24h expiry, single-use)
- Child opens invite link → auto-linked to LINE account
```

### 2. Accounts

```
Accounts tab > + button
- Types: bank | cash | credit | wallet | loan | invest
- Fields: name, type, initial balance, color, icon, account number, alias
- Reconcile: enter actual balance → system records adjustment transaction
```

### 3. Transactions

```
Dashboard > + button
- Types: income | expense | transfer
- Fields: amount, plan amount, date, description, status (pending/completed/planned/void)
- Relations: account, toAccount (transfers), category, budget, tags, slip image
```

### 4. Budgets

```
Budget tab > + Create Budget
- Spending: set limit, track actual spend
- Savings: set goal, track deposits
- Reward: set goal for a specific child member
```

### 5. Categories

```
Settings > Categories
- Hierarchical: CategoryGroup > Category
- Default groups: Income, Transfer, Food, Transport, Utilities, Shopping,
  Entertainment, Health, Housing, Education, Investment
- Custom groups and categories supported
```

### 6. Tags

```
Settings > Tags
- User-defined colored labels
- Many-to-many with transactions via TransactionTag junction table
```

### 7. LINE Bot Commands

See LINE Bot Commands and Flows section below.

---

## Configuration Options (.env Variables)

```bash
# === Database ===
POSTGRES_PASSWORD=your_strong_password_here
# Local: DATABASE_URL="postgresql://root:rootpassword@localhost:5432/myfamdb"

# === LINE Messaging API ===
LINE_CHANNEL_SECRET=your_line_channel_secret
LINE_CHANNEL_ACCESS_TOKEN=your_line_channel_access_token
LINE_CHANNEL_ID=your_line_channel_id
NEXT_PUBLIC_LIFF_ID=your_liff_id_here
NEXT_PUBLIC_LINE_BASIC_ID=your_line_basic_id_here   # for add-friend button

# === Ollama AI ===
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_TEXT_MODEL=scb10x/llama3.2-typhoon2-3b-instruct
OLLAMA_VISION_MODEL=scb10x/typhoon-ocr1.5-3b

# === App ===
NEXT_PUBLIC_APP_URL=https://myfam.doctorboyz.com
```

---

## API Endpoints Summary

### Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Username/password login |
| POST | `/api/auth/liff` | Verify LINE ID token, auto-create user+family if new |
| POST | `/api/auth/liff/link` | Link LINE ID token to existing MyFam user |
| POST | `/api/auth/liff/link-invite` | Accept invite code via LIFF |
| POST | `/api/auth/logout` | Clear `userId` cookie |
| GET | `/api/auth/me` | Return current user from cookie |

### Users

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users` | List family members |
| GET | `/api/users/[id]` | Get single user |

### Accounts

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/accounts` | List accounts (scope by role) |
| POST | `/api/accounts` | Create account |
| GET | `/api/accounts/[id]` | Get account detail |
| PUT | `/api/accounts/[id]` | Update account |
| DELETE | `/api/accounts/[id]` | Soft delete |
| POST | `/api/accounts/[id]/restore` | Restore from soft delete |
| DELETE | `/api/accounts/[id]/permanent` | Hard delete |
| GET | `/api/accounts/trash` | List deleted accounts |

### Transactions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/transactions` | List transactions (scoped) |
| POST | `/api/transactions` | Create transaction + update balance |
| GET | `/api/transactions/[id]` | Get transaction |
| PUT | `/api/transactions/[id]` | Update transaction |
| DELETE | `/api/transactions/[id]` | Soft delete + reverse balance |
| POST | `/api/transactions/[id]/restore` | Restore |
| DELETE | `/api/transactions/[id]/permanent` | Hard delete |
| GET | `/api/transactions/trash` | List deleted |

### Categories & Groups

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/categories` | List categories |
| POST | `/api/categories` | Create category |
| PUT | `/api/categories/[id]` | Update |
| DELETE | `/api/categories/[id]` | Soft delete |
| POST | `/api/categories/[id]/restore` | Restore |
| DELETE | `/api/categories/[id]/permanent` | Hard delete |
| GET | `/api/groups` | List groups |
| POST | `/api/groups` | Create group |
| PUT | `/api/groups/[id]` | Update |
| DELETE | `/api/groups/[id]` | Soft delete |
| POST | `/api/groups/[id]/restore` | Restore |

### Budgets

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/budgets` | List budgets |
| POST | `/api/budgets` | Create budget |
| GET | `/api/budgets/[id]` | Get budget |
| PUT | `/api/budgets/[id]` | Update |
| DELETE | `/api/budgets/[id]` | Soft delete |
| POST | `/api/budgets/[id]/restore` | Restore |
| DELETE | `/api/budgets/[id]/permanent` | Hard delete |
| GET | `/api/budgets/trash` | List deleted |

### Tags

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tags` | List tags |
| POST | `/api/tags` | Create tag |
| PUT | `/api/tags/[id]` | Update |
| DELETE | `/api/tags/[id]` | Soft delete |
| POST | `/api/tags/[id]/restore` | Restore |
| DELETE | `/api/tags/[id]/permanent` | Hard delete |
| GET | `/api/tags/trash` | List deleted |

### Reconciliations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/reconciliations` | List |
| POST | `/api/reconciliations` | Create reconciliation record |
| DELETE | `/api/reconciliations/[id]` | Delete |

### Invites

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/invites` | List invite codes for family |
| POST | `/api/invites` | Generate invite code for a user |
| GET | `/api/invites/[code]` | Verify/accept invite code |

### LINE Integration

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/line/webhook` | LINE verification (returns 200) |
| POST | `/api/line/webhook` | Main webhook handler |
| GET | `/api/line/link?userId=xxx` | Check LINE link status |
| POST | `/api/line/link` | Create/update LINE-MyFam link |
| DELETE | `/api/line/link?lineUserId=xxx` | Unlink |
| POST | `/api/line/sandbox` | Sandbox webhook test |

### Maintenance

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/cron/purge` | Purge soft-deleted records (run periodically) |

---

## LINE Bot Commands and Flows

### Quick Commands (Instant Reply)

| Command | Thai Trigger | Action |
|---------|-------------|--------|
| `balance` | "ดูยอด", "ยอดคงเหลือ", "เงินเหลือ" | Show all account balances |
| `recent` | "รายการล่าสุด", "ล่าสุด", "วันนี้" | Show last 5 transactions |
| `summary` | "สรุปยอด", "รวมรายจ่าย", "รวมรายรับ" | Monthly summary Flex message |
| `budget` | "งบ", "งบประมาณ" | Budget progress Flex message |
| `help` | "ช่วยเหลือ", "ช่วย", "ใช้ยังไง" | Help text |
| `open_liff` | "เปิด MyFam", "เปิดแอป" | Send LIFF app URL |
| `unlink` | "ยกเลิกลิงก์" | Unlink LINE account |
| `delete_last` | "ลบรายการล่าสุด" | Delete last bot-created transaction |
| `confirm_expense` | "ยืนยันรายจ่าย" | Confirm pending as expense |
| `confirm_income` | "ยืนยันรายรับ" | Confirm pending as income |
| `cancel` | "ยกเลิก" | Cancel pending transaction |

### AI-Powered Flows

#### Text Transaction Flow
```
User sends: "ซื้อข้าวผัด 85 บาท"
  → detectIntent() → "create_transaction"
  → extractFromText() (Ollama text model)
  → If needsConfirmation: create pending + ask confirm
  → If multiple accounts: ask account selection
  → createTransactionFromExtracted() → update balance
  → Push confirmation message + main menu Quick Reply
```

#### Slip Image Flow
```
User sends image (payment slip/receipt)
  → downloadLineImage()
  → extractFromSlip() (Ollama vision model, 512px resize)
  → Same confirmation/selection logic as text
  → Save base64 image to transaction.slipImage
  → Push confirmation
```

#### Data Query Flows
```
"ดูยอด"     → handleBalanceQuery()   → list accounts + total
"รายการล่าสุด" → handleRecentQuery()    → last 5 tx
"สรุปยอด"   → handleSummaryFlex()    → Flex message with chart data
"งบ"       → handleBudgetFlex()     → Flex message with progress bars
```

### Quick Reply Buttons

After every bot response, the main menu Quick Reply is shown:
- "📱 เปิด MyFam" (opens LIFF app)
- "📊 ดูสรุปยอด"
- "❓ ช่วยเหลือ"

When type is uncertain:
- "✅ ใช่ รายจ่าย"
- "✅ ใช่ รายรับ"
- "❌ ยกเลิก"

When multiple accounts exist:
- Account list (up to 12) + cancel

### Webhook Architecture

```
LINE User → LINE Platform → POST /api/line/webhook
                                  ↓
                         verifyLineSignature()
                                  ↓
                         handleLineEvent()
                        ↙          ↘
                   Text Message    Image Message
                        ↓               ↓
               handleTextMessage   handleImageMessage
                      ↓                   ↓
              detectCommand()        processSlipImage()
              ↙    ↓     ↘                ↓
        Command    AI     Low conf    Ollama vision
           ↓     ↓        ↓            ↓
      Instant  Intent  Help msg    Category match
      reply    route                 ↓
           ↓     ↓                    ↓
      Reply  Extract              Confirmation
      token  from text            Quick Reply
      (30s)  ↓
           Push result
           (no time limit)
```

---

## Database Schema Overview

### Enums

| Enum | Values |
|------|--------|
| `UserRole` | `parent`, `child` |
| `AccountType` | `bank`, `cash`, `credit`, `wallet`, `loan`, `invest` |
| `TransactionType` | `income`, `expense`, `transfer` |
| `TransactionStatus` | `pending`, `completed`, `planned`, `void` |
| `BudgetPeriod` | `monthly`, `one_time` |
| `BudgetStatus` | `active`, `completed`, `archived` |
| `BudgetPurpose` | `spending`, `savings`, `reward` |

### Models

```
Family
  ├── id, name, createdAt, updatedAt
  ├── members[]      → User[]
  ├── tags[]         → Tag[]
  └── inviteCodes[]  → InviteCode[]

User
  ├── id, name (unique), password?, role, isAdmin, avatar, color, familyId
  ├── family         → Family
  ├── accounts[]     → Account[]
  ├── transactions[] → Transaction[] (createdBy)
  ├── categories[]   → Category[]
  ├── budgets[]      → Budget[] (createdBy)
  ├── lineLink       → LineLink? (1:1)
  ├── tags[]         → Tag[]
  └── audit trails   → createdBy/updatedBy/deletedBy on all soft-delete models

Account
  ├── id, name, type, balance, color, icon, accountNo, alias, ownerId, status
  ├── owner            → User
  ├── incomingTx[]     → Transaction[] (Incoming relation)
  ├── outgoingTx[]     → Transaction[] (Outgoing relation)
  ├── reconciliations[]→ Reconciliation[]
  └── soft-delete      → deletedBy, deletedAt

Transaction
  ├── id, amount, planAmount?, date, type, description, status
  ├── account?         → Account? (source)
  ├── toAccount?       → Account? (destination for transfer)
  ├── category?        → Category?
  ├── budget?          → Budget?
  ├── createdBy        → User
  ├── fee?, slipImage?
  ├── tagRecords[]     → TransactionTag[]
  └── soft-delete      → updatedBy, deletedBy, deletedAt

CategoryGroup
  ├── id, name, type, isCustom
  ├── categories[]     → Category[]
  └── soft-delete      → deletedBy, deletedAt

Category
  ├── id, name, groupId, userId?
  ├── group            → CategoryGroup
  ├── user?            → User (creator for custom cats)
  ├── transactions[]   → Transaction[]
  └── soft-delete      → deletedBy, deletedAt

Tag
  ├── id, name, userId, color?, familyId
  ├── user             → User
  ├── family           → Family
  ├── transactions[]   → TransactionTag[]
  └── soft-delete      → deletedBy, deletedAt

TransactionTag (junction)
  ├── id, transactionId, tagId
  ├── transaction      → Transaction
  ├── tag              → Tag
  └── soft-delete      → deletedBy, deletedAt

LineLink (1:1 LINE-MyFam mapping)
  ├── id, lineUserId (unique), userId (unique), displayName?
  └── user             → User

Budget
  ├── id, title, description?, purpose, period, limit, startDate?, endDate?
  ├── status, icon?, color?
  ├── targetAccountId? (for savings)
  ├── rewardForUserId? (for rewards)
  ├── transactions[]   → Transaction[]
  ├── createdBy        → User
  └── soft-delete      → updatedBy, deletedBy, deletedAt

Reconciliation
  ├── id, accountId, previousBalance, newBalance, difference, note?
  ├── account          → Account
  ├── performedById
  └── soft-delete      → deletedBy, deletedAt

InviteCode
  ├── id, code (unique, 8-char hex), userId (unique), familyId
  ├── createdById, usedAt?, expiresAt (24h)
  ├── user             → User
  ├── family           → Family
  └── createdBy        → User
```

### Soft Delete Pattern

All major entities support soft deletion via `deletedAt` and `deletedById`. Trashed records are excluded from normal queries. A cron endpoint (`/api/cron/purge`) can permanently delete old soft-deleted records.

---

## Deployment Notes

### Docker Production Setup

- **Multi-stage Dockerfile**: builder stage (`npm ci`, `prisma generate`, `next build`) → runner stage (minimal Alpine with `next start`)
- **Build args**: `NEXT_PUBLIC_LIFF_ID`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_LINE_BASIC_ID` (inlined at build time)
- **Entrypoint**: `entrypoint.sh` runs `prisma migrate deploy` then `next start`
- **Port**: 3000 internally, mapped to 3001 on host (127.0.0.1 only)
- **User**: Runs as `nextjs` (uid 1001) non-root
- **External network**: `server-network` (must exist beforehand)

### CI/CD

- GitHub Actions: `.github/workflows/deploy.yml`
- Lint check must pass before deploy
- SSH deployment to production server
- Secrets: `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY`, `SSH_PORT`

### Middleware

- Strips `/liff` prefix from incoming URLs (handles LIFF endpoint configuration)
- Sets `x-liff-mode` header based on User-Agent (`Line/`) or `x-line-channelid`
- Skips API routes, `_next`, and static files

### Ollama Integration

- Base URL configurable via `OLLAMA_BASE_URL`
- Default models: text (`qwen3.5:cloud`), vision (`qwen3.5:cloud`)
- 5-minute timeout on AI calls (`AbortSignal.timeout(300_000)`)
- Images resized to 512px before vision inference
- Response parsed as JSON with fallback truncation repair

### Security Notes

- LINE webhook signature verification via HMAC-SHA256 (`verifyLineSignature`)
- `userId` cookie: `httpOnly`, `secure` in production, `sameSite: lax`, 30-day expiry
- All API routes scope data by user role (Parent sees family scope; Child sees own scope)
- Invite codes are 8-character random hex, single-use, 24-hour expiry
- LINE link is strictly 1:1 (both `lineUserId` and `userId` are unique in `LineLink`)
