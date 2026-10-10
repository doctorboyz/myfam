# MyFam Code Snippets — 2026-05-14

A curated collection of the most interesting and representative code from the MyFam codebase. MyFam is a family finance tracker built with Next.js 16, Prisma 7, PostgreSQL (Neon/Vercel), and deep LINE integration (LIFF + Messaging API + AI-powered bot).

---

## 1. Project Overview

**Tech Stack**
- Next.js 16.1.6 (App Router)
- React 19.2.3
- Prisma 7.4.0 with `@prisma/adapter-pg` / `@prisma/adapter-neon`
- PostgreSQL via Neon (serverless) or local pg Pool
- LINE LIFF 2.28 + Messaging API
- Ollama Cloud (`qwen3.5:cloud`) for Thai NLP / OCR
- Recharts for data viz
- CSS Modules for styling

---

## 2. Layout & Providers

### `src/app/layout.tsx` — Root Layout with LIFF + Finance Providers

```tsx
import type { Metadata, Viewport } from "next";
import { Prompt } from "next/font/google";
import { Inter } from "next/font/google";
import BottomNav from "@/components/BottomNav/BottomNav";
import { FinanceProvider } from "@/context/FinanceContext";
import { LiffProvider } from "@/context/LiffContext";

const prompt = Prompt({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-prompt",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
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
  );
}
```

Key pattern: LIFF provider wraps finance provider, ensuring LINE auth is initialized before any data fetching. Viewport is locked with `viewportFit: "cover"` for LIFF safe-area handling.

---

## 3. Middleware & Routing

### `src/middleware.ts` — LIFF Path Rewriting + Detection Headers

```ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip API routes, static files, and _next
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Strip /liff prefix from incoming URLs
  // Handles LIFF endpoint URL set to https://myfam.doctorboyz.com/liff
  if (pathname.startsWith('/liff')) {
    const newPath = pathname.slice('/liff'.length) || '/';
    const url = request.nextUrl.clone();
    url.pathname = newPath;
    return NextResponse.rewrite(url);
  }

  const response = NextResponse.next();

  // Pass LIFF detection to client via response headers
  const userAgent = request.headers.get('user-agent') || '';
  const isLiff = userAgent.includes('Line/') || request.headers.get('x-line-channelid') !== null;
  response.headers.set('x-liff-mode', isLiff ? 'true' : 'false');

  return response;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
```

---

## 4. LIFF Auth Flow

### `src/lib/liff-auth.ts` — Dynamic LIFF SDK Import (SSR-safe)

```ts
let liffModule: import('@line/liff').Liff | null = null;

async function getLiff() {
  if (liffModule) return liffModule;
  const mod = await import('@line/liff');
  // Handle CJS/ESM interop: ESM has {default: liff}, CJS is liff itself
  liffModule = mod.default || mod;
  return liffModule;
}

let initialized = false;

export async function initLiff(): Promise<boolean> {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
  if (!liffId) return false;
  try {
    const liff = await getLiff();
    await liff.init({ liffId });
    initialized = true;
    return true;
  } catch {
    return false;
  }
}

export async function getIDToken(): Promise<string | null> {
  if (!initialized) return null;
  const liff = await getLiff();
  try { return liff.getIDToken(); } catch { return null; }
}

export async function getProfile() {
  if (!initialized) return null;
  const liff = await getLiff();
  try {
    const profile = await liff.getProfile();
    return {
      userId: profile.userId,
      displayName: profile.displayName,
      pictureUrl: profile.pictureUrl ?? null,
      statusMessage: profile.statusMessage ?? null,
    };
  } catch { return null; }
}
```

Key pattern: Dynamic `import('@line/liff')` prevents SSR crashes because LIFF requires `window`. ESM/CJS interop handled via `mod.default || mod`.

---

### `src/context/LiffContext.tsx` — LIFF Bootstrap + Auto-Auth

```tsx
'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { initLiff, isInClient, isLoggedIn, getIDToken } from '@/lib/liff-auth';

export function LiffProvider({ children }: { children: React.ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [inClient, setInClient] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      const ok = await initLiff();
      if (!ok || !mounted) { setIsReady(true); return; }

      const _loggedIn = await isLoggedIn();
      const _inClient = await isInClient();
      if (mounted) { setLoggedIn(_loggedIn); setInClient(_inClient); }

      // Mark LIFF environment via CSS variables
      if (_inClient) {
        document.documentElement.style.setProperty('--liff-header-height', '48px');
        document.documentElement.style.setProperty('--liff-extra-bottom', '16px');
      }

      // On /link page, let the page handle its own LIFF auth flow
      const isLinkPage = typeof window !== 'undefined' && window.location.pathname === '/link';

      if (_loggedIn) {
        const idToken = await getIDToken();
        if (idToken && mounted) {
          try {
            await fetch('/api/auth/liff', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ idToken }),
              credentials: 'include',
            });
          } catch {
            // Auth failed silently — fallback to cookie auth
          }
        }
      }
      if (mounted) setIsReady(true);
    }

    bootstrap();
    return () => { mounted = false; };
  }, []);

  return (
    <LiffContext.Provider value={{ isLiffReady: isReady, liffLogin, isLoggedIn: loggedIn, isInClient: inClient, getIDToken, getProfile }}>
      {children}
    </LiffContext.Provider>
  );
}
```

Key pattern: After LIFF init, if the user is logged in, the ID token is immediately POSTed to `/api/auth/liff` to set an HTTP-only cookie. This bridges LIFF identity to session-based web auth. The `/link` page is exempt from auto-auth to allow invite-code linking.

---

### `src/app/api/auth/liff/route.ts` — ID Token Verification + Auto-Create User

```ts
export async function POST(request: Request) {
  const body = await request.json();
  const { idToken } = body;
  if (!idToken) return NextResponse.json({ error: 'Missing idToken' }, { status: 400 });

  const payload = await verifyLineIdToken(idToken);
  if (!payload || !payload.sub) {
    return NextResponse.json({ error: 'Invalid LINE ID token' }, { status: 401 });
  }

  const lineUserId = payload.sub;

  const link = await prisma.lineLink.findUnique({
    where: { lineUserId },
    include: { user: { select: { id: true, name: true, role: true, isAdmin: true, avatar: true, color: true, familyId: true } },
  });

  if (link) {
    // Update name/avatar from LINE if changed
    const updateData: { name?: string; avatar?: string } = {};
    if (payload.name && payload.name !== link.user.name) updateData.name = payload.name;
    if (payload.picture && payload.picture !== link.user.avatar) updateData.avatar = payload.picture;
    if (Object.keys(updateData).length > 0) {
      const updatedUser = await prisma.user.update({ where: { id: link.userId }, data: updateData, select: { ... } });
      link.user = updatedUser;
    }

    // Set cookie
    cookieStore.set('userId', link.userId, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30,
    });
    return NextResponse.json({ success: true, linked: true, user: link.user });
  }

  // No link found — auto-create new user + family (signup with LINE)
  const baseName = payload.name || 'User';
  let userName = baseName; let suffix = 1;
  while (await prisma.user.findUnique({ where: { name: userName } })) {
    userName = `${baseName}_${suffix}`; suffix++;
  }

  const family = await prisma.family.create({ data: { name: `${userName}'s Family` } });
  const newUser = await prisma.user.create({
    data: { name: userName, role: 'parent', isAdmin: true, familyId: family.id, avatar: payload.picture || null },
    select: { id: true, name: true, role: true, isAdmin: true, avatar: true, color: true, familyId: true },
  });
  await prisma.lineLink.create({ data: { lineUserId, userId: newUser.id, displayName: payload.name || userName } });

  cookieStore.set('userId', newUser.id, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 });
  return NextResponse.json({ success: true, linked: true, user: newUser });
}
```

Key pattern: LINE login is the **only** login method in production. First-time LINE users are auto-provisioned with a new `Family` and `User`. Existing users get cookie auth + avatar sync.

---

### `src/app/api/auth/liff/link-invite/route.ts` — Invite-Code Linking with Rate Limiting

```ts
// Simple in-memory rate limiter: 5 attempts per lineUserId per 15 min
const rateLimiter = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW = 15 * 60 * 1000;

function checkRateLimit(lineUserId: string): boolean {
  const now = Date.now();
  const entry = rateLimiter.get(lineUserId);
  if (!entry || now > entry.resetAt) {
    rateLimiter.set(lineUserId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

export async function POST(request: Request) {
  // Verify ID token
  const payload = await verifyLineIdToken(idToken);
  if (!payload?.sub) return NextResponse.json({ error: 'Invalid LINE ID token' }, { status: 401 });

  if (!checkRateLimit(payload.sub)) {
    return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 });
  }

  // Check if this LINE account is already linked
  const existingLink = await prisma.lineLink.findUnique({ where: { lineUserId: payload.sub } });
  if (existingLink) return NextResponse.json({ error: 'LINE account already linked' }, { status: 403 });

  // Look up invite code
  const invite = await prisma.inviteCode.findUnique({ where: { code: code.toUpperCase() }, include: { user: true } });
  if (!invite) return NextResponse.json({ error: 'Invite code not found' }, { status: 404 });
  if (invite.usedAt) return NextResponse.json({ error: 'Invite code already used' }, { status: 409 });
  if (invite.expiresAt < new Date()) return NextResponse.json({ error: 'Invite code expired' }, { status: 410 });

  // Transaction: create LineLink + mark invite used + update avatar
  const result = await prisma.$transaction(async (tx) => {
    if (payload.picture && payload.picture !== invite.user.avatar) {
      await tx.user.update({ where: { id: invite.userId }, data: { avatar: payload.picture } });
    }
    await tx.lineLink.create({ data: { lineUserId: payload.sub, userId: invite.userId, displayName: payload.name || invite.user.name } });
    await tx.inviteCode.update({ where: { id: invite.id }, data: { usedAt: new Date() } });
    return tx.user.findUnique({ where: { id: invite.userId }, select: { ... } });
  });

  cookieStore.set('userId', result.id, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 });
  return NextResponse.json({ success: true, user: result });
}
```

Key pattern: In-memory rate limiter for invite-code attempts, full transaction for linking + invite consumption, and HTTP-only cookie set on success.

---

### `src/app/link/page.tsx` — LIFF Invite-Link Landing Page

```tsx
'use client';

function LinkPageContent() {
  const searchParams = useSearchParams();
  const { isLiffReady, isLoggedIn: liffLoggedIn, getIDToken, getProfile } = useLiff();
  const urlCode = searchParams.get('code');
  const code = urlCode || (typeof window !== 'undefined' ? sessionStorage.getItem('inviteCode') : null);

  useEffect(() => {
    async function init() {
      if (!isLiffReady) return;
      if (!liffLoggedIn) { setStep('needs-login'); return; }

      const idToken = await getIDToken();
      if (!idToken) { setStep('needs-login'); return; }

      if (code) {
        // Verify invite code exists, then show confirm step
        const res = await fetch(`/api/invites/${code.toUpperCase()}`);
        if (res.ok) { const data = await res.json(); setInviteInfo({ code: code.toUpperCase(), userName: data.userName }); }
        setStep('confirm');
        return;
      }

      // No invite code — normal auth (auto-create if new)
      const authRes = await fetch('/api/auth/liff', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }), credentials: 'include' });
      const authData = await authRes.json();
      if (authData.success && authData.linked) {
        sessionStorage.removeItem('inviteCode');
        router.push('/dashboard');
      }
    }
    init();
  }, [isLiffReady, liffLoggedIn, getIDToken, getProfile, code, router]);

  const handleLogin = async () => {
    if (code) sessionStorage.setItem('inviteCode', code);
    liffLogin();
  };
}
```

Key pattern: Invite code is preserved across LIFF login redirect via `sessionStorage`. After LIFF login, the code is restored from storage and the user sees a confirmation screen before binding.

---

## 5. Database & Prisma Patterns

### `src/lib/prisma.ts` — Adapter-Aware Prisma Client (Neon vs pg)

```ts
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaNeon } from '@prisma/adapter-neon';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL!;
const globalForPrisma = global as unknown as { prisma: PrismaClient };

function createPrismaClient() {
  if (process.env.VERCEL) {
    const adapter = new PrismaNeon({ connectionString });
    return new PrismaClient({ adapter });
  }
  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma || createPrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

Key pattern: Runtime switch between Neon adapter (Vercel/serverless) and pg adapter (local/Docker) without code changes.

---

### Prisma Schema Highlights (`prisma/schema.prisma`)

```prisma
enum UserRole { parent child }
enum AccountType { bank cash credit wallet loan invest }
enum TransactionType { income expense transfer }
enum BudgetPeriod { monthly one_time }
enum BudgetStatus { active completed archived }
enum TransactionStatus { pending completed planned void }

model User {
  id        String   @id @default(uuid())
  name      String   @unique
  password  String?  // null for LINE-only users
  role      UserRole @default(child)
  isAdmin   Boolean  @default(false)
  avatar    String?
  color     String   @default("#000000")
  familyId  String
  family    Family   @relation(fields: [familyId], references: [id])
  accounts     Account[]
  transactions Transaction[]
  lineLink     LineLink?
  tags         Tag[]
  inviteCodes  InviteCode[]
}

model Account {
  id        String      @id @default(uuid())
  name      String
  type      AccountType
  balance   Decimal     @default(0)
  color     String      @default("#000000")
  icon      String?
  accountNo String?     @map("account_no")
  alias     String?
  ownerId   String      @map("owner_id")
  status    String      @default("active")
  owner     User        @relation(fields: [ownerId], references: [id])
  deletedAt DateTime?   @map("deleted_at")
  createdAt DateTime    @default(now()) @map("created_at")
  updatedAt DateTime    @updatedAt @map("updated_at")
}

model Transaction {
  id          String            @id @default(uuid())
  amount      Decimal           @default(0)
  planAmount  Decimal?          @map("plan_amount")
  date        DateTime
  type        TransactionType
  description String?
  status      TransactionStatus @default(completed)
  accountId   String?           @map("account_id")
  account     Account?          @relation("Outgoing", fields: [accountId], references: [id], onDelete: Cascade)
  toAccountId String?           @map("to_account_id")
  toAccount   Account?          @relation("Incoming", fields: [toAccountId], references: [id])
  categoryId  String?           @map("category_id")
  category    Category?         @relation(fields: [categoryId], references: [id])
  budgetId    String?           @map("budget_id")
  budget      Budget?           @relation(fields: [budgetId], references: [id])
  createdById String            @map("created_by_id")
  createdBy   User              @relation(fields: [createdById], references: [id])
  tagRecords  TransactionTag[]
  deletedAt   DateTime?         @map("deleted_at")
}

model LineLink {
  id          String   @id @default(uuid())
  lineUserId  String   @unique @map("line_user_id")
  userId      String   @unique @map("user_id")
  displayName String?  @map("display_name")
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@map("line_links")
}

model InviteCode {
  id          String    @id @default(uuid())
  code        String    @unique
  userId      String    @unique
  familyId    String
  createdById String
  usedAt      DateTime? @map("used_at")
  expiresAt   DateTime  @map("expires_at")
  user       User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  family     Family @relation(fields: [familyId], references: [id])
  createdBy  User   @relation("InviteCreator", fields: [createdById], references: [id])
  @@map("invite_codes")
}
```

Key patterns:
- **Soft deletes** via `deletedAt` on most models (no hard deletes in UI)
- **Audit trail** relations on User (`createdAccounts`, `updatedAccounts`, `deletedAccounts`, etc.)
- **LINE identity** decoupled via `LineLink` (1:1 with User)
- **Invite codes** for family member onboarding without passwords

---

## 6. API Patterns

### `src/lib/api.ts` — Shared API Helpers

```ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';

export function apiSuccess(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function apiError(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

export async function getAuthUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get('userId')?.value ?? null;
}

export async function getAuthUser() {
  const userId = await getAuthUserId();
  if (!userId) return null;
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, role: true, isAdmin: true, avatar: true, color: true, familyId: true },
  });
}

export function pickFields<T extends Record<string, unknown>>(
  body: T, allowedKeys: string[]
): Partial<T> {
  const result: Record<string, unknown> = {};
  for (const key of allowedKeys) {
    if (key in body && body[key] !== undefined) {
      result[key] = body[key];
    }
  }
  return result as Partial<T>;
}
```

---

### `src/app/api/transactions/route.ts` — Transaction CRUD with Prisma `$transaction`

```ts
const transactionInclude = {
  category: { include: { group: true } },
  account: true,
  toAccount: true,
  tagRecords: { include: { tag: true } },
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get('accountId');

  const currentUser = await getAuthUser();
  if (!currentUser) return apiError('Not authenticated', 401);

  const where: Prisma.TransactionWhereInput = {
    deletedAt: null,
    createdBy: { familyId: currentUser.familyId },
  };
  if (accountId) {
    where.OR = [{ accountId }, { toAccountId: accountId }];
  }

  const transactions = await prisma.transaction.findMany({
    where, orderBy: { date: 'desc' }, include: transactionInclude,
  });

  const mapped = transactions.map(tx => ({
    ...tx,
    tags: tx.tagRecords.map(tr => tr.tag.name),
    tagIds: tx.tagRecords.map(tr => tr.tagId),
  }));
  return apiSuccess(mapped);
}

export async function POST(request: Request) {
  const body = await request.json();
  const isPlanned = body.status === 'planned';

  const result = await prisma.$transaction(async (tx) => {
    const tagIds: string[] = body.tagIds || [];
    const transaction = await tx.transaction.create({
      data: {
        amount: isPlanned ? 0 : body.amount,
        planAmount: isPlanned ? body.amount : (body.planAmount || null),
        date: new Date(body.date),
        type: body.type,
        status: isPlanned ? 'planned' : 'completed',
        description: body.description,
        accountId: body.accountId || null,
        toAccountId: body.toAccountId || null,
        categoryId: body.categoryId,
        budgetId: body.budgetId || null,
        createdById: body.createdById,
        fee: body.fee || 0,
        slipImage: body.slipImage || null,
        tagRecords: tagIds.length > 0 ? {
          create: tagIds.map((tagId: string) => ({ tagId })),
        } : undefined,
      },
      include: transactionInclude,
    });

    // Only adjust balances for completed transactions with an account
    if (!isPlanned && body.accountId) {
      const amount = Number(body.amount);
      const fee = body.fee ? Number(body.fee) : 0;
      if (body.type === 'income') {
        await tx.account.update({ where: { id: body.accountId }, data: { balance: { increment: amount - fee } } });
      } else {
        await tx.account.update({ where: { id: body.accountId }, data: { balance: { decrement: amount + fee } } });
      }
      if (body.type === 'transfer' && body.toAccountId) {
        await tx.account.update({ where: { id: body.toAccountId }, data: { balance: { increment: amount } } });
      }
    }
    return transaction;
  });

  const mapped = {
    ...result,
    tags: result.tagRecords.map(tr => tr.tag.name),
    tagIds: result.tagRecords.map(tr => tr.tagId),
  };
  return apiSuccess(mapped, 201);
}
```

Key pattern: Prisma `$transaction` wraps transaction creation + account balance adjustment atomically. Tags are stored via a join table (`TransactionTag`) but mapped to string arrays for the frontend.

---

### `src/app/api/accounts/route.ts` — Family-Scoped Queries

```ts
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');

  const currentUser = await getAuthUser();
  if (!currentUser) return apiError('Not authenticated', 401);

  const where: Prisma.AccountWhereInput = {
    deletedAt: null,
    owner: { familyId: currentUser.familyId },
  };
  if (userId) { where.ownerId = userId; }

  const accounts = await prisma.account.findMany({
    where, orderBy: { createdAt: 'asc' }, include: { owner: true },
  });
  return apiSuccess(accounts);
}
```

Key pattern: **Family-scoped authorization** — every query filters by `owner.familyId` so users only see data within their family.

---

## 7. LINE Webhook & Bot

### `src/app/api/line/webhook/route.ts` — Webhook Handler (AI Bot)

```ts
export const maxDuration = 300;

// Temporary storage for extractions waiting for account selection
const pendingExtractions = new Map<
  string, { extracted: ExtractedTransaction; lineUserId: string }
>();

function getDataScope(user: { id: string; role: string; familyId: string }) {
  if (user.role === 'parent') {
    return { createdBy: { familyId: user.familyId } };
  }
  return { createdById: user.id };
}

// ── Command Detection ──
type CommandType = 'open_liff' | 'summary' | 'help' | 'balance' | 'recent' | 'budget'
  | 'confirm_expense' | 'confirm_income' | 'cancel' | 'link' | 'unlink' | 'delete_last'
  | 'select_group' | 'select_subcategory' | 'select_account' | 'skip_group' | 'skip_subcategory' | 'none';

function detectCommand(text: string): CommandType {
  const q = text.trim();
  if (q === 'ยืนยันรายจ่าย') return 'confirm_expense';
  if (q === 'ยืนยันรายรับ') return 'confirm_income';
  if (q === 'ยกเลิก') return 'cancel';
  if (/เปิด MyFam|เปิดแอป|open app/i.test(q)) return 'open_liff';
  if (/ดูยอด|ยอดคงเหลือ|ยอดเงิน|เงินเหลือ|ยอด|balance/i.test(q)) return 'balance';
  if (/รายการล่าสุด|ล่าสุด|รายการวันนี้|recent/i.test(q)) return 'recent';
  if (/สรุปยอด|สรุปยอด|รวมรายจ่าย|รวมรายรับ|สรุป|summary/i.test(q)) return 'summary';
  if (/^งบ$|งบประมาณ|budget/i.test(q)) return 'budget';
  return 'none';
}

// ── AI-powered text processing (needs time) ──
// Reply "processing" immediately, then push result
async function handleTextMessage(replyToken, lineUserId, text, user) {
  await sendLineReply(replyToken, '⏳ กำลังประมวลผล...');

  try {
    const intent = await detectIntent(text);
    console.log(`[webhook] intent: ${intent} for text: "${text.slice(0, 50)}"`);

    if (intent === 'balance') { /* ... */ }
    if (intent === 'recent') { /* ... */ }
    if (intent === 'summary') { /* ... */ }
    if (intent === 'budget') { /* ... */ }
    if (intent === 'help') { /* ... */ }

    // intent === 'create_transaction'
    const categories = await getCategoriesForFamily(user.familyId);
    const categoryContext = getCategoryContext(categories);
    const extracted = await extractFromText(text, categoryContext);

    if (extracted.confidence < 0.3) {
      // Not a transaction — show help
      await sendLinePush(lineUserId, helpText, menuQuickReply);
      return;
    }

    if (extracted.amount === 0) {
      await sendLinePush(lineUserId, 'ไม่พบจำนวนเงินในข้อความ...', menuQuickReply);
      return;
    }

    if (extracted.needsConfirmation) {
      // Create pending transaction + ask user to confirm type
      await createTransactionFromExtracted(extracted, user, 'pending');
      await sendLinePush(lineUserId, confirmText, formatQuickReply(CONFIRM_TYPE_ITEMS));
      return;
    }

    // If multiple accounts, ask user to pick one
    const accounts = await prisma.account.findMany({ where: { ownerId: user.id, status: 'active' } });
    if (accounts.length > 1 && !matchedAccount) {
      pendingExtractions.set(user.id, { extracted, lineUserId });
      await sendLinePush(lineUserId, pickAccountText, buildAccountReply(accounts));
      return;
    }

    const transaction = await createTransactionFromExtracted(extracted, user, 'completed', matchedAccount);
    await sendLinePush(lineUserId, formatConfirmationMessage(transaction, extracted), menuQuickReply);
  } catch (error) {
    await sendLinePush(lineUserId, formatErrorMessage(message), menuQuickReply);
  }
}
```

Key pattern: Two-phase messaging architecture. The webhook handler replies immediately with `sendLineReply` (30-second token limit), then processes AI in the background and pushes the result via `sendLinePush`.

---

### `src/lib/line.ts` — LINE Messaging API Client

```ts
const LINE_API_BASE = 'https://api.line.me/v2/bot';
const LINE_DATA_BASE = 'https://api-data.line.me/v2/bot';

export async function sendLineReply(
  replyToken: string, text: string, quickReply?: { type: 'quickReply'; items: Array<{...}> },
): Promise<void> {
  const message: Record<string, unknown> = { type: 'text', text };
  if (quickReply) message.quickReply = quickReply;

  const response = await fetch(`${LINE_API_BASE}/message/reply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ replyToken, messages: [message] }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LINE reply error (${response.status}): ${errorText}`);
  }
}

export async function sendLinePush(to: string, text: string, quickReply?: {...}): Promise<void> {
  const message: Record<string, unknown> = { type: 'text', text };
  if (quickReply) message.quickReply = quickReply;

  const response = await fetch(`${LINE_API_BASE}/message/push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ to, messages: [message] }),
  });
  // ...
}

export async function downloadLineImage(messageId: string): Promise<Buffer> {
  const response = await fetch(
    `${LINE_DATA_BASE}/message/${messageId}/content`,
    { headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` } },
  );
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
```

---

### `src/lib/line-verify.ts` — HMAC-SHA256 Signature Verification

```ts
import crypto from 'crypto';

export function verifyLineSignature(
  body: string, signature: string | null, channelSecret: string,
): boolean {
  if (!signature) return false;

  const expected = crypto
    .createHmac('SHA256', channelSecret)
    .update(body)
    .digest('base64');

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}
```

Key pattern: Timing-safe equality (`crypto.timingSafeEqual`) prevents timing attacks on webhook signature validation.

---

## 8. AI / Ollama Integration

### `src/lib/ollama.ts` — Thai NLP + OCR with Ollama

```ts
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_TEXT_MODEL = process.env.OLLAMA_TEXT_MODEL || 'qwen3.5:cloud';
const OLLAMA_VISION_MODEL = process.env.OLLAMA_VISION_MODEL || 'qwen3.5:cloud';

export async function extractFromText(
  text: string,
  categories: Array<{ id: string; name: string; groupName: string; groupType: string }>,
): Promise<ExtractedTransaction> {
  // Only send top-level group names (not all 73 categories) to keep prompt short
  const groups = [...new Set(categories.map((c) => `${c.groupName}(${c.groupType})`))];
  const groupList = groups.join(', ');

  const systemPrompt = `คุณคือ AI สกัดข้อมูลธุรกรรมการเงินจากข้อความภาษาไทย
พิจารณา type อย่างรอบคอบ:
- expense (รายจ่าย): ซื้อ, จ่าย, ชำระ, ค่า, กิน, ดื่ม, เติม, โอนให้คนอื่น — เงินออกจากเรา
- income (รายรับ): รับ, เงินเข้า, เงินเดือน, โบนัส, ลูกค้าโอน, รับโอน — เงินเข้ามาหาเรา
- transfer: โอนระหว่างบัญชีตัวเอง
- ถ้าไม่แน่ใจว่า expense หรือ income ให้ใส่ needsConfirmation=true

ถ้าข้อความไม่มีจำนวนเงินชัดเจน หรือไม่ใช่ข้อความเกี่ยวกับธุรกรรมการเงิน ให้ confidence ต่ำ (ต่ำกว่า 0.4)`;

  const today = new Date().toISOString().split('T')[0];

  const userPrompt = `สกัดข้อมูลธุรกรรมจาก: "${text}"
วันนี้: ${today}
กลุ่มหมวด: ${groupList}

ตอบเป็น JSON เท่านั้น:
{"amount":จำนวนเงิน,"date":"YYYY-MM-DD","description":"คำอธิบาย","type":"expenseหรือincomeหรือtransfer","categoryGroupName":"ชื่อกลุ่มหมวด","merchantName":"ชื่อร้านหรือnull","accountName":"ชื่อบัญชีหรือnull","confidence":0ถึง1,"needsConfirmation":trueหรือfalse}`;

  const result = await ollamaChat({
    model: OLLAMA_TEXT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    format: 'json',
  });

  const extracted = parseExtractedTransaction(result);
  matchCategory(extracted, categories);
  return extracted;
}

export async function extractFromSlip(imageBase64: string, categories): Promise<ExtractedTransaction> {
  const resizedBase64 = await resizeImageBase64(imageBase64, 512);
  const groups = [...new Set(categories.map((c) => `${c.groupName}(${c.groupType})`))];
  const groupList = groups.join(', ');

  const prompt = `อ่านสลิป/ใบเสร็จ/QR payment นี้แล้วสกัดข้อมูลธุรกรรม
วันนี้: ${new Date().toISOString().split('T')[0]}
กลุ่มหมวด: ${groupList}

สำคัญ: พิจารณา type จากสลิปอย่างรอบคอบ:
- expense (เราจ่ายออก): เห็นชื่อเราเป็น "ผู้โอน" หรือ "จากบ/ช", มีคำว่า "โอนเงิน", "จ่าย", "ชำระ", PromptPay ที่เราแสกนจ่าย
- income (เรารับเข้า): เห็นชื่อเราเป็น "ผู้รับโอน" หรือ "เข้าบ/ช", มีคำว่า "รับโอน", "รับเงิน", "CREDIT", สลิปที่คนอื่นส่งมา
- transfer: โอนระหว่างบัญชีตัวเอง
- ถ้าไม่แน่ใจว่า expense หรือ income ให้ใส่ needsConfirmation=true

ตอบเป็น JSON เท่านั้น...`;

  const result = await ollamaGenerate({
    model: OLLAMA_VISION_MODEL, prompt, images: [resizedBase64],
    format: 'json', temperature: 0.1, topP: 0.6, repetitionPenalty: 1.1,
  });

  const extracted = parseExtractedTransaction(result);
  matchCategory(extracted, categories);
  return extracted;
}
```

Key pattern: Category context is sent as a **deduplicated list of group names** (not all 73 categories) to keep the prompt short. The AI returns a structured JSON that is then fuzzy-matched against the actual category IDs.

---

### `src/lib/ollama.ts` — Intent Detection + Fallback

```ts
export type UserIntent = 'create_transaction' | 'balance' | 'recent' | 'summary' | 'budget' | 'help';

export async function detectIntent(text: string): Promise<UserIntent> {
  const prompt = `จากข้อความต่อไปนี้ ระบุความตั้งใจของผู้ใช้:
ข้อความ: "${text}"
ตอบเป็น JSON เท่านั้น โดยเลือก intent หนึ่งตัวเท่านั้น:
- "create_transaction" — ผู้ใช้ต้องการบันทึกรายการใช้เงิน/รับเงิน (มีจำนวนเงิน)
- "balance" — ผู้ใช้ต้องการดูยอดเงินคงเหลือ
- "recent" — ผู้ใช้ต้องการดูรายการล่าสุด
- "summary" — ผู้ใช้ต้องการดูสรุปยอดรายรับรายจ่าย
- "help" — ผู้ใช้ถามว่าบอททำอะไรได้ หรือข้อความไม่เข้ากรณีอื่น

ตอบ: {"intent":"..."}`;

  try {
    const result = await ollamaChat({ model: OLLAMA_TEXT_MODEL, messages: [{ role: 'user', content: prompt }], format: 'json', temperature: 0, topP: 0.3 });
    const parsed = JSON.parse(result.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, ''));
    if (['create_transaction', 'balance', 'recent', 'summary', 'help'].includes(parsed.intent)) {
      return parsed.intent as UserIntent;
    }
  } catch {
    // Fall through to keyword detection
  }

  return detectIntentByKeywords(text);
}

function detectIntentByKeywords(text: string): UserIntent {
  const q = text.toLowerCase().trim();
  if (/(ดูยอด|ยอดคงเหลือ|ยอดเงิน|เงินเหลือ|เหลือเท่าไหร่|balance)/i.test(q)) return 'balance';
  if (/(รายการล่าสุด|ล่าสุด|รายการวันนี้|วันนี้|recent|last)/i.test(q)) return 'recent';
  if (/(สรุป|สรุปยอด|รวม|รวมรายจ่าย|รวมรายรับ|summary|total)/i.test(q)) return 'summary';
  if (/(^งบ$|งบประมาณ|budget)/i.test(q)) return 'budget';
  if (/(ช่วย|ใช้ยังไง|ทำอะไรได้|help|บอททำอะไร)/i.test(q)) return 'help';
  return 'create_transaction';
}
```

Key pattern: LLM-based intent detection with **keyword fallback** for resilience when Ollama is unavailable. This prevents the bot from becoming completely unresponsive.

---

### `src/lib/chart-message.ts` — LINE Flex Message Builders

```ts
export function buildMonthlySummaryFlex(data: SummaryData) {
  const categoryLines = data.topCategories.slice(0, 3).map((c) => ({
    type: 'box', layout: 'horizontal',
    contents: [
      { type: 'text', text: c.name, size: 'sm', color: '#8e8e93', flex: 1 },
      { type: 'text', text: `฿${fmt.format(c.amount)}`, size: 'sm', align: 'end', weight: 'bold' },
    ],
  }));

  return {
    type: 'bubble',
    body: {
      type: 'box', layout: 'vertical',
      contents: [
        { type: 'text', text: `📊 สรุปยอด${data.monthName}`, weight: 'bold', size: 'lg' },
        { type: 'separator', margin: 'md' },
        {
          type: 'box', layout: 'vertical', margin: 'md',
          contents: [
            {
              type: 'box', layout: 'horizontal',
              contents: [
                { type: 'text', text: '🟢 รายรับ', size: 'sm', flex: 1 },
                { type: 'text', text: `฿${fmt.format(data.totalIncome)}`, size: 'sm', align: 'end', weight: 'bold', color: '#34c759' },
              ],
            },
            {
              type: 'box', layout: 'horizontal',
              contents: [
                { type: 'text', text: '🔴 รายจ่าย', size: 'sm', flex: 1 },
                { type: 'text', text: `฿${fmt.format(data.totalExpense)}`, size: 'sm', align: 'end', weight: 'bold', color: '#ff3b30' },
              ],
            },
            { type: 'separator', margin: 'sm' },
            {
              type: 'box', layout: 'horizontal', margin: 'sm',
              contents: [
                { type: 'text', text: '💰 คงเหลือ', size: 'sm', weight: 'bold', flex: 1 },
                { type: 'text', text: `฿${fmt.format(data.balance)}`, size: 'sm', align: 'end', weight: 'bold' },
              ],
            },
          ],
        },
        ...(categoryLines.length > 0 ? [
          { type: 'separator', margin: 'md' } as const,
          { type: 'text', text: '🔝 รายจ่ายหลัก', size: 'sm', weight: 'bold', margin: 'md' } as const,
          ...categoryLines,
        ] : []),
      ],
    },
  };
}
```

---

## 9. Frontend Patterns

### `src/context/FinanceContext.tsx` — Data Fetching with LIFF Wait Loop

```tsx
useEffect(() => {
  const fetchData = async () => {
    setIsLoading(true);

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

    try {
      // 1. Fetch Current User
      const userRes = await fetch('/api/auth/me');
      if (userRes.ok) {
        const userData = await userRes.json();
        setCurrentUser(userData);
      } else {
        const isPublicRoute = window.location.pathname === '/login' || window.location.pathname === '/link';
        if (!isPublicRoute) router.push('/login');
        setIsLoading(false);
        return;
      }

      // 2. Fetch Users, Accounts, Transactions, Categories, Tags in sequence
      // ...
    } catch (error) {
      console.error("Failed to fetch data", error);
    } finally {
      setIsLoading(false);
    }
  };
  fetchData();
}, [router]);
```

Key pattern: A **cookie-polling wait loop** (up to 3 seconds) allows the `LiffProvider` to finish its async POST to `/api/auth/liff` before `FinanceContext` checks auth state. Without this, LIFF users would see a login flash.

---

### `src/components/BottomNav/BottomNav.tsx` — Simple Path-Based Navigation

```tsx
const navItems = [
  { name: 'หน้าหลัก', path: '/dashboard', icon: LayoutDashboard },
  { name: 'รายการ', path: '/categories', icon: ClipboardList },
  { name: 'บัญชี', path: '/accounts', icon: Wallet },
  { name: 'งบประมาณ', path: '/budget', icon: Calculator },
  { name: 'โปรไฟล์', path: '/profile', icon: User },
];

export default function BottomNav() {
  const pathname = usePathname();
  if (pathname === '/login') return null;

  const isActive = (path: string) => pathname === path || pathname.startsWith(path + '/');

  return (
    <nav className={styles.nav}>
      {navItems.map((item) => (
        <Link key={item.path} href={item.path}
          className={`${styles.item} ${isActive(item.path) ? styles.active : ''}`}>
          <item.icon size={22} strokeWidth={isActive(item.path) ? 2.5 : 1.5} />
          <span className={styles.label}>{item.name}</span>
        </Link>
      ))}
    </nav>
  );
}
```

---

### `src/app/dashboard/page.tsx` — Dashboard with Suspense + Query Param Actions

```tsx
function DashboardContent() {
  const { globalBalance, currentUser, addTransaction, deleteTransaction, accounts, users, getFilteredTransactions } = useFinance();
  const searchParams = useSearchParams();

  // Handle ?action=add from Rich Menu links — auto-open the add modal
  useEffect(() => {
    const action = searchParams.get('action');
    if (action === 'add') {
      setInitialType('expense');
      setSelectedTransaction(null);
      setIsTxModalOpen(true);
    }
  }, [searchParams]);

  // Initial filters with Default Date Range (This Month) in Bangkok timezone
  const [filters, setFilters] = useState<FilterType>(() => {
    const now = getBangkokDate();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { users: [], dateRange: { start: startOfMonth, end: endOfMonth }, types: [], categories: [], accounts: [] };
  });

  const getGreeting = () => {
    const hour = getBangkokHour();
    if (hour < 12) return "สวัสดีตอนเช้า";
    if (hour < 18) return "สวัสดีตอนบ่าย";
    return "สวัสดีตอนเย็น";
  };
}
```

---

## 10. Timezone Utilities

### `src/lib/timezone.ts` — Bangkok (GMT+7) Helpers

```ts
const BANGKOK_TZ = 'Asia/Bangkok';

const bangkokFormatter = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('th-TH', { ...options, timeZone: BANGKOK_TZ });

/** Get current Bangkok time as a Date-like string */
export function getBangkokDate(): Date {
  const now = new Date();
  const bangkokOffset = 7 * 60; // GMT+7 in minutes
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utcMs + bangkokOffset * 60000);
}

/** Get Bangkok hour (0-23) for greeting logic */
export function getBangkokHour(): number {
  return parseInt(
    bangkokShortFormatter({ hour: 'numeric', hour12: false }).format(new Date()), 10
  );
}

/** Format date in Bangkok timezone with Thai locale */
export function formatBangkokDate(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return bangkokFormatter(options ?? { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
}
```

---

## 11. Error Handling & Security Patterns

### `src/lib/line-id-token.ts` — LINE ID Token Verification

```ts
export interface LineIdTokenPayload {
  sub: string; name?: string; picture?: string; aud: string; exp: number; iss: string;
}

export async function verifyLineIdToken(idToken: string): Promise<LineIdTokenPayload | null> {
  const channelId = process.env.LINE_CHANNEL_ID;
  if (!channelId) { console.error('[line-id-token] LINE_CHANNEL_ID not configured'); return null; }

  try {
    const res = await fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `id_token=${encodeURIComponent(idToken)}&client_id=${encodeURIComponent(channelId)}`,
    });

    if (!res.ok) { console.error('[line-id-token] LINE verify failed:', res.status); return null; }
    const payload: LineIdTokenPayload = await res.json();
    if (payload.exp && Date.now() / 1000 > payload.exp) { console.error('[line-id-token] ID token expired'); return null; }
    return payload;
  } catch (err) {
    console.error('[line-id-token] Verify error:', err);
    return null;
  }
}
```

---

## 12. Interesting Files Not Shown Above

| File | Purpose |
|------|---------|
| `src/app/api/invites/route.ts` | Generate 8-char hex invite codes for family linking, 24h expiry |
| `src/app/api/cron/purge/route.ts` | Cron job to hard-delete soft-deleted records older than 30 days |
| `src/lib/reconcile-parser.ts` | Parse bank statement text/images for reconciliation |
| `src/lib/compressImage.ts` | Client-side image compression before upload |
| `src/components/VisualizationView/VisualizationView.tsx` | Recharts-based pie/bar charts for dashboard |
| `src/components/TransactionDetailModal/TransactionDetailModal.tsx` | Full transaction CRUD modal with category picker |
| `src/app/settings/family/page.tsx` | Family member management + invite code generation UI |

---

*Generated by Claude Code on 2026-05-14 for codebase exploration.*
