# MyFam Codebase Analysis

Generated: 2026-05-14 08:46
Repo: /Users/doctorboyz/Code/github.com/doctorboyz/myfam

---

## 1. Project Overview

**MyFam** is a Thai family finance tracker built as a Next.js 16 app with deep LINE integration. It combines a LIFF (LINE Front-end Framework) mini-app, a LINE Messaging API bot with AI-powered OCR/text parsing, and a full Prisma/PostgreSQL backend.

- **Stack**: Next.js 16.1.6, React 19.2.3, TypeScript 5.9, Prisma 7.4, PostgreSQL (Neon on Vercel, pg locally)
- **Auth**: Cookie-based session + LINE LIFF ID token verification
- **AI**: Ollama (qwen3.5:cloud) for Thai NLP transaction extraction and slip OCR
- **Deploy**: Docker multi-stage build, targets Vercel + self-hosted

---

## 2. Main Entry Points

### 2.1 Root Layout (`src/app/layout.tsx`)

The app wraps all pages in two providers:

```tsx
<html lang="th">
  <body className={`${prompt.variable} ${inter.variable}`}>
    <LiffProvider>
      <FinanceProvider>
        <main>
          {children}
          <BottomNav />
        </main>
      </FinanceProvider>
    </LiffProvider>
  </body>
</html>
```

Key observations:
- Thai-first UI with Prompt font (Cadson Demak) + Inter for numbers
- `viewportFit: "cover"` for LIFF safe-area handling
- `maximumScale: 1, userScalable: false` — mobile app feel

### 2.2 Home Redirect (`src/app/page.tsx`)

Simple server-side redirect to `/dashboard`.

```tsx
export default function Home() {
  redirect("/dashboard");
}
```

### 2.3 Middleware (`src/middleware.ts`)

Handles LIFF routing quirks and detection headers:

```ts
// Strip /liff prefix if LIFF endpoint URL includes it
if (pathname.startsWith('/liff')) {
  const newPath = pathname.slice('/liff'.length) || '/';
  const url = request.nextUrl.clone();
  url.pathname = newPath;
  return NextResponse.rewrite(url);
}

// Pass LIFF detection to client via response headers
const isLiff = userAgent.includes('Line/') || request.headers.get('x-line-channelid') !== null;
response.headers.set('x-liff-mode', isLiff ? 'true' : 'false');
```

---

## 3. Core Implementations

### 3.1 LIFF Auth Bridge (`src/lib/liff-auth.ts`)

Dynamic import pattern to avoid SSR issues with `@line/liff`:

```ts
let liffModule: import('@line/liff').Liff | null = null;

async function getLiff() {
  if (liffModule) return liffModule;
  const mod = await import('@line/liff');
  liffModule = mod.default || mod; // CJS/ESM interop
  return liffModule;
}
```

Interesting workaround: LIFF SDK v2.28.0 has a `redirectUri` bug where it can become `[object Object]`. The code patches `login()` at runtime:

```ts
const originalLogin = liff.login.bind(liff);
liff.login = function (options?: any) {
  const opts = options || {};
  if (!opts.redirectUri) {
    opts.redirectUri = window.location.href;
  } else if (typeof opts.redirectUri !== 'string') {
    const urlObj = opts.redirectUri;
    opts.redirectUri = urlObj.href || urlObj.url || (urlObj.toString ? urlObj.toString() : String(urlObj));
  }
  return originalLogin(opts);
};
```

### 3.2 Finance Context (`src/context/FinanceContext.tsx`)

Massive client-side state provider (~1000 lines) that acts as the app's data layer. Key pattern: API-first with local optimistic updates.

**Auth gate with LIFF grace period:**
```ts
// In LIFF mode, wait for LIFF auth to complete before checking session
const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
if (liffId && typeof window !== 'undefined') {
  const maxWait = 3000;
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const hasCookie = document.cookie.includes('userId=');
    if (hasCookie) break;
    await new Promise(r => setTimeout(r, 200));
  }
}
```

**RBAC for account visibility:**
```ts
const accountsForUser = currentUser
  ? (currentUser.role === 'parent'
      ? accounts
      : accounts.filter(a => a.owner === currentUser.name))
  : [];
```

**Budget transaction implementation note:** The code documents an architectural realization — budget items are actually `Transaction` records with `status='planned'` and `budgetId`:

```ts
const addBudgetTransaction = async (budgetId: string, item: Omit<BudgetTransaction, 'id'>) => {
  const payload = {
    amount: item.plannedAmount,
    planAmount: item.plannedAmount,
    date: item.date,
    type: item.type,
    categoryId: item.categoryId,
    budgetId: budgetId,
    status: 'planned',
    description: item.name,
    // ...
  };
  const res = await fetch('/api/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
```

### 3.3 LINE Webhook Handler (`src/app/api/line/webhook/route.ts`)

The most complex single file (~960 lines). Implements a full chatbot with AI fallback.

**Signature verification:**
```ts
const channelSecret = process.env.LINE_CHANNEL_SECRET;
const signature = request.headers.get('x-line-signature');
const rawBody = await request.text();
if (!verifyLineSignature(rawBody, signature, channelSecret)) {
  return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
}
```

**Dual-speed architecture:** Commands reply immediately; AI processing pushes later:
```ts
// Command shortcuts (reply immediately, no AI needed)
if (cmd === 'balance') {
  const reply = await handleBalanceQuery(user);
  await sendLineReply(replyToken, reply, menuQuickReply);
  return;
}

// AI-powered text processing (needs time)
await sendLineReply(replyToken, '⏳ กำลังประมวลผล...');
const intent = await detectIntent(text);
// ... then sendLinePush(lineUserId, result, menuQuickReply);
```

**Pending transaction confirmation flow:** When the AI is unsure about income vs expense, it creates a `pending` transaction and asks the user via Quick Reply:
```ts
if (extracted.needsConfirmation) {
  await createTransactionFromExtracted(extracted, user, 'pending');
  await sendLinePush(lineUserId, replyText, formatQuickReply(CONFIRM_TYPE_ITEMS));
}
```

**Image slip processing:**
```ts
async function handleImageMessage(replyToken, lineUserId, messageId, user) {
  await sendLineReply(replyToken, '⏳ กำลังอ่านสลิป...');
  const imageBuffer = await downloadLineImage(messageId);
  const extracted = await extractFromSlip(imageBase64, categoryContext);
  // Save base64 image directly to transaction
  await prisma.transaction.update({
    where: { id: transaction.id },
    data: { slipImage: `data:image/jpeg;base64,${imageBase64}` },
  });
}
```

### 3.4 AI Transaction Extraction (`src/lib/ollama.ts`)

Uses Ollama chat/generate endpoints with JSON output format and tight prompting.

**Text extraction prompt design:**
```ts
const systemPrompt = `คุณคือ AI สกัดข้อมูลธุรกรรมการเงินจากข้อความภาษาไทย
พิจารณา type อย่างรอบคอบ:
- expense (รายจ่าย): ซื้อ, จ่าย, ชำระ, ค่า, กิน, ดื่ม, เติม, โอนให้คนอื่น — เงินออกจากเรา
- income (รายรับ): รับ, เงินเข้า, เงินเดือน, โบนัส, ลูกค้าโอน, รับโอน — เงินเข้ามาหาเรา
- transfer: โอนระหว่างบัญชีตัวเอง
- ถ้าไม่แน่ใจว่า expense หรือ income ให้ใส่ needsConfirmation=true`;
```

**Intent detection with LLM + keyword fallback:**
```ts
export async function detectIntent(text: string): Promise<UserIntent> {
  try {
    const result = await ollamaChat({
      model: OLLAMA_TEXT_MODEL,
      messages: [{ role: 'user', content: prompt }],
      format: 'json',
      temperature: 0,
      topP: 0.3,
    });
    const parsed = JSON.parse(result.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, ''));
    // ...
  } catch {
    return detectIntentByKeywords(text); // Fallback
  }
}
```

**Image resizing with sharp (dynamic import to avoid client bundle):**
```ts
async function resizeImageBase64(base64: string, maxDim: number): Promise<string> {
  const { default: sharp } = await import('sharp');
  const buffer = Buffer.from(pure, 'base64');
  const resized = await sharp(buffer)
    .resize(maxDim, maxDim, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
  return resized.toString('base64');
}
```

### 3.5 Transaction API (`src/app/api/transactions/route.ts`)

Clean Prisma API with atomic balance updates:

```ts
export async function POST(request: Request) {
  const result = await prisma.$transaction(async (tx) => {
    const transaction = await tx.transaction.create({
      data: {
        amount: isPlanned ? 0 : body.amount,
        planAmount: isPlanned ? body.amount : (body.planAmount || null),
        status: isPlanned ? 'planned' : 'completed',
        tagRecords: tagIds.length > 0 ? {
          create: tagIds.map((tagId: string) => ({ tagId })),
        } : undefined,
      },
    });

    if (!isPlanned && body.accountId) {
      const amount = Number(body.amount);
      const fee = body.fee ? Number(body.fee) : 0;
      if (body.type === 'income') {
        await tx.account.update({
          where: { id: body.accountId },
          data: { balance: { increment: amount - fee } },
        });
      } else {
        await tx.account.update({
          where: { id: body.accountId },
          data: { balance: { decrement: amount + fee } },
        });
      }
      if (body.type === 'transfer' && body.toAccountId) {
        await tx.account.update({
          where: { id: body.toAccountId },
          data: { balance: { increment: amount } },
        });
      }
    }
    return transaction;
  });
}
```

### 3.6 Invite Code Linking (`src/app/link/page.tsx`)

LINE account linking flow with sessionStorage recovery across LIFF login redirects:

```tsx
const urlCode = searchParams.get('code');
const code = urlCode || (typeof window !== 'undefined' ? sessionStorage.getItem('inviteCode') : null);

const handleLogin = async () => {
  if (code) {
    sessionStorage.setItem('inviteCode', code); // Preserve across redirect
  }
  liffLogin();
};
```

---

## 4. Interesting Patterns

### 4.1 Dual Database Adapter Pattern (`src/lib/prisma.ts`)

Runtime adapter selection based on `VERCEL` env var:

```ts
function createPrismaClient() {
  if (process.env.VERCEL) {
    const adapter = new PrismaNeon({ connectionString });
    return new PrismaClient({ adapter });
  }
  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}
```

### 4.2 Soft Delete Everywhere

Nearly all models have `deletedAt`, `deletedById`, `deletedBy` relations. API routes filter `deletedAt: null` by default and expose `/trash` and `/permanent` endpoints.

Prisma schema example:
```prisma
model Transaction {
  deletedById String?   @map("deleted_by_id")
  deletedBy   User?     @relation("TransactionDeleter", fields: [deletedById], references: [id])
  deletedAt   DateTime? @map("deleted_at")
}
```

### 4.3 CSS Variable-Driven LIFF Adaptation

LIFF safe area insets are injected as CSS custom properties via JS:

```ts
if (_inClient) {
  document.documentElement.style.setProperty('--liff-header-height', '48px');
  document.documentElement.style.setProperty('--liff-extra-bottom', '16px');
}
```

And consumed in `globals.css`:
```css
main {
  padding-bottom: calc(var(--bottomnav-height) + var(--safe-bottom) + 8px + var(--liff-extra-bottom));
}
```

### 4.4 Category Matching Strategy (AI → DB bridge)

The `ollama.ts` module implements a 3-tier fuzzy matcher to align AI-generated category group names with actual DB records:

```ts
function matchCategory(extracted, categories) {
  // 1. Exact match on groupName or name
  let match = categories.find(c => c.groupName === aiGroup || c.name === aiGroup);
  // 2. Case-insensitive match
  if (!match) { match = categories.find(...); }
  // 3. Includes match
  if (!match) { match = categories.find(c => aiGroup.includes(c.groupName) || c.groupName.includes(aiGroup)); }
}
```

### 4.5 Frontend-Backend Type Bridge

`FinanceContext` defines separate `ApiAccount` / `ApiTransaction` interfaces that map Prisma's `Decimal` (string in JSON) to frontend `number`, and flatten nested relations:

```ts
const mappedAccounts = accountsData.map((acc: ApiAccount) => ({
  ...acc,
  owner: acc.owner?.name || 'Unknown',
  status: acc.status || 'active',
  balance: Number(acc.balance)
}));
```

### 4.6 LINE Flex Message Builders (`src/lib/chart-message.ts`)

Pure JSON builders for LINE Flex Messages (rich cards). Two templates:
- Monthly summary with income/expense/balance + top categories
- Budget progress with horizontal percentage bars

Example budget bar (inline CSS-in-JSON style):
```ts
{
  type: 'box',
  layout: 'horizontal',
  height: '8px',
  style: 'background-color: #e5e5ea; border-radius: 4px;',
  contents: [{
    type: 'box',
    layout: 'horizontal',
    width: `${pct}%`,
    style: `background-color: ${barColor}; border-radius: 4px;`,
    contents: [],
  }],
}
```

### 4.7 Transaction Parser (`src/lib/transaction-parser.ts`)

Rule-based Thai text parser as a lightweight fallback before AI:

```ts
function detectType(text: string) {
  // Transfer: "โอน 5000 จากกรุงไทยไปกสิกร"
  const transferRe = /โอน\s*([\d,]+(?:\.\d+)?)\s*(?:จาก)?\s*(.+)/i;
  // Expense: "รายจ่าย 500 อาหาร กรุงไทย"
  const expenseRe = /(?:รายจ่าย|จ่าย|ใช้|ซื้อ)\s*([\d,]+(?:\.\d+)?)\s*(.*)/i;
  // Fallback: bare number → assume expense
  const numRe = /([\d,]+(?:\.\d+)?)\s*(.*)/;
}
```

---

## 5. Prisma Schema Highlights

Key models and relationships:

| Model | Purpose |
|-------|---------|
| `Family` | Top-level grouping; has many `User`s |
| `User` | `role: parent | child`; `isAdmin` flag; audit trail relations |
| `Account` | `balance` as Decimal; soft delete; owner relation |
| `Transaction` | `amount`, `planAmount`, `fee`, `status` enum; `budgetId` FK |
| `CategoryGroup` | Top-level groups (e.g., "อาหาร", "เงินเดือน") |
| `Category` | Sub-categories under groups; optional `userId` for custom cats |
| `Tag` | Per-user tags; `@@unique([name, userId])` |
| `TransactionTag` | Join table with soft delete |
| `LineLink` | 1:1 mapping `lineUserId <-> userId` |
| `InviteCode` | One-time invite codes for LINE linking |
| `Budget` | `purpose: spending | savings | reward`; `period: monthly | one_time` |
| `Reconciliation` | Account balance reconciliation history |

---

## 6. Notable Files

| File | Role |
|------|------|
| `src/middleware.ts` | LIFF prefix stripping, LIFF detection headers |
| `src/context/FinanceContext.tsx` | App-wide state, data fetching, CRUD |
| `src/context/LiffContext.tsx` | LIFF init, auto-auth cookie setup |
| `src/lib/liff-auth.ts` | LIFF SDK wrapper with redirectUri bugfix |
| `src/lib/ollama.ts` | AI extraction, intent detection, vision OCR |
| `src/lib/line.ts` | LINE Messaging API client (reply/push/flex/download) |
| `src/lib/chart-message.ts` | Flex Message JSON builders |
| `src/lib/transaction-parser.ts` | Rule-based Thai text parser |
| `src/lib/api.ts` | API response helpers, auth user resolution |
| `src/app/api/line/webhook/route.ts` | Full LINE bot webhook handler |
| `src/app/api/auth/liff/route.ts` | LIFF ID token verification + cookie setup |
| `src/app/link/page.tsx` | LINE account linking UI with invite codes |
| `src/app/dashboard/page.tsx` | Main dashboard with filters + visualizations |
| `prisma/schema.prisma` | Full DB schema with soft delete audit trails |
| `Dockerfile` | Multi-stage build; runs `npx prisma generate` at build time |

---

## 7. Architecture Notes

- **No dedicated API client library**: All fetches use raw `fetch()` with inline JSON handling.
- **No error boundary or toast system**: Errors mostly log to console + occasional `alert()`.
- **Image handling**: Slip images stored as base64 data URIs in the `Transaction` row (not external storage).
- **Budget items = Transactions**: The architecture conflates budget planning items and actual transactions in the same table, differentiated by `status: 'planned' | 'completed' | 'void'`.
- **No Zod validation**: Request bodies are parsed with `request.json()` and cast; no runtime schema validation.
- **Console.log present**: Multiple `console.error` and `console.log` statements remain in production code.
- **Type safety gaps**: Several `any` types and `!` non-null assertions in the webhook handler.
- **React Compiler enabled**: `next.config.ts` sets `reactCompiler: true`.
