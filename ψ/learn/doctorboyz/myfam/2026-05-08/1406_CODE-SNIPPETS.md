# myfam Code Snippets

> Collected 2026-05-08 from `/src`

---

## 1. Main Entry Points

### Root Layout (`src/app/layout.tsx`)

The app wraps everything in `FinanceProvider` with a `TopBar` + `BottomNav` shell. Font is Inter. Viewport is locked to prevent pinch-zoom.

```tsx
import { FinanceProvider } from "@/context/FinanceContext";
import BottomNav from "@/components/BottomNav/BottomNav";
import TopBar from "@/components/TopBar/TopBar";

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <FinanceProvider>
          <main>
            <TopBar />
            {children}
            <BottomNav />
          </main>
        </FinanceProvider>
      </body>
    </html>
  );
}
```

### Home Page (`src/app/page.tsx`)

Shows user-filtered accounts as a card grid. Has an `ActionFab` for quick transaction creation and an `AccountFormModal` for adding accounts. Uses `ICON_MAP` to map string icon names to lucide-react components.

```tsx
const ICON_MAP: Record<string, React.ComponentType<{size?: number; color?: string; strokeWidth?: number}>> = {
  'Wallet': Wallet, 'CreditCard': CreditCard, 'PiggyBank': PiggyBank, ...
};

const { accounts, addAccount, addTransaction, deleteTransaction, currentUser } = useFinance();
const myAccounts = accounts.filter(a => a.owner === currentUser?.name);
```

### Auth Flow

Login uses a simple cookie-based auth. `POST /api/auth/login` compares bcrypt hashes and sets an `httpOnly` cookie. `GET /api/auth/me` reads the cookie and returns the user object. Logout deletes the cookie.

```ts
// Login: sets httpOnly cookie
cookieStore.set('userId', user.id, {
  httpOnly: true, secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax', maxAge: 60 * 60 * 24 * 30, path: '/',
});

// Me: reads cookie
export async function getAuthUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get('userId')?.value ?? null;
}
```

---

## 2. FinanceContext — The God Provider (`src/context/FinanceContext.tsx`, 788 lines)

This is the central state management hub. A single context provides **all** CRUD for accounts, transactions, users, categories, groups, and budgets. Key patterns:

### Auth-gated data fetch

On mount, the provider fetches user, accounts, transactions, categories, and groups sequentially. If auth fails and not on `/login`, it redirects.

```tsx
useEffect(() => {
  const fetchData = async () => {
    // 1. Auth check - redirect to /login if not authenticated
    const userRes = await fetch('/api/auth/me');
    if (!userRes.ok) {
      if (!isPublicRoute) router.push('/login');
      return;
    }
    // 2-5. Fetch users, accounts, transactions, categories
    const [usersData, accountsData, txData, catData] = await Promise.all([...]);
  };
  fetchData();
}, [router]);
```

### Optimistic updates

Most mutations do an optimistic local state update first, then fire the API call. Errors are logged but not reverted (a noted TODO).

```tsx
const updateAccount = async (id: string, updates: Partial<Account>) => {
  // Optimistic update
  setAccounts(prev => prev.map(acc => acc.id === id ? { ...acc, ...updates } : acc));
  await fetch(`/api/accounts/${id}`, { method: 'PATCH', ... });
  // No error revert!
};
```

### Permission model: parent sees all, child sees own

```tsx
const accountsForUser = currentUser?.role === 'parent'
  ? accounts
  : accounts.filter(a => a.owner === currentUser.name);
```

### Transaction creation refreshes accounts

After adding a transaction, accounts are re-fetched because the backend adjusts balances atomically.

```tsx
const addTransaction = async (txData) => {
  const res = await fetch('/api/transactions', { method: 'POST', ... });
  if (res.ok) {
    setTransactions([newTx, ...transactions]);
    await fetchAccounts(); // Refresh balances
  }
};
```

### Budget transactions are planned transactions

`addBudgetTransaction` creates a `Transaction` with `status: 'planned'` and `planAmount`. The `updateBudgetTransaction` transition handler maps `done` -> `completed`, `cancelled` -> `void`.

```tsx
const payload = {
  amount: item.plannedAmount,
  planAmount: item.plannedAmount,
  status: 'planned',
  budgetId: budgetId,
  ...
};
```

### Context value exposes everything

The provider exposes 30+ functions/values:

```tsx
<FinanceContext.Provider value={{
  accounts: accountsForUser, allAccounts: accounts,
  transactions, globalBalance, currentUser, users, isLoading,
  logout, addUser, updateUser, removeUser,
  getAccountTransactions, addAccount, updateAccount, deleteAccount,
  addTransaction, deleteTransaction, getFilteredTransactions,
  groups, categories, addCategory, updateCategory, deleteCategory,
  addGroup, updateGroup, deleteGroup, getGroupsByType, getCategoriesByGroup,
  budgets, addBudget, updateBudget, deleteBudget,
  addBudgetTransaction, updateBudgetTransaction, deleteBudgetTransaction,
  fetchAccounts,
}}>
```

---

## 3. API Route Patterns

### API helper (`src/lib/api.ts`)

Clean response helpers and auth extraction:

```ts
export function apiSuccess(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function apiError(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

export async function getAuthUser() {
  const userId = await getAuthUserId();
  if (!userId) return null;
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, role: true, isAdmin: true, avatar: true, color: true, familyId: true },
  });
}

export function pickFields<T extends Record<string, unknown>>(body: T, allowedKeys: string[]): Partial<T> {
  const result: Record<string, unknown> = {};
  for (const key of allowedKeys) {
    if (key in body && body[key] !== undefined) result[key] = body[key];
  }
  return result as Partial<T>;
}
```

### Family-scoped data isolation

All list endpoints filter by `currentUser.familyId` so users only see their own family's data:

```ts
// GET /api/accounts
const where: Prisma.AccountWhereInput = {
  owner: { familyId: currentUser.familyId },
};
```

### Transaction creation with atomic balance adjustment

The `POST /api/transactions` route uses `prisma.$transaction` to create the record and adjust account balances atomically:

```ts
const result = await prisma.$transaction(async (tx) => {
  const transaction = await tx.transaction.create({ data: { ... }, include: { category: { include: { group: true } } } });

  if (!isPlanned && body.accountId) {
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
```

### Transaction deletion reverses balances

`DELETE /api/transactions/[id]` mirrors the creation logic in reverse:

```ts
if (transaction.type === 'income') {
  await tx.account.update({ where: { id: transaction.accountId }, data: { balance: { decrement: amount - fee } } });
} else {
  await tx.account.update({ where: { id: transaction.accountId }, data: { balance: { increment: amount + fee } } });
}
```

### Budget deletion = archive + void

Soft-delete pattern: budget `DELETE` sets `status: 'archived'` and voids all pending transactions:

```ts
await prisma.$transaction(async (tx) => {
  await tx.budget.update({ where: { id }, data: { status: 'archived' } });
  await tx.transaction.updateMany({
    where: { budgetId: id, status: { in: ['pending', 'planned'] } },
    data: { status: 'void' },
  });
});
```

### Dynamic route param handling (Next.js 15+)

Route params are now a Promise:

```ts
export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const id = await parseId(props);
  // ...
}
```

### Whitelisted field updates with `pickFields`

```ts
const data = pickFields(body, ['name', 'type', 'balance', 'color', 'icon', 'accountNo', 'alias', 'status']);
const account = await prisma.account.update({ where: { id }, data });
```

---

## 4. Prisma Schema (`prisma/schema.prisma`)

### Core models

```prisma
model Family {
  id        String   @id @default(uuid())
  name      String
  members   User[]
}

model User {
  id        String   @id @default(uuid())
  name      String   @unique
  password  String?
  role      UserRole @default(child)
  isAdmin   Boolean  @default(false)
  avatar    String?
  color     String   @default("#000000")
  familyId  String   @map("family_id")
  family    Family   @relation(fields: [familyId], references: [id])
  accounts     Account[]
  transactions Transaction[]
  categories   Category[]
  budgets      Budget[]
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
  // Relations: owner, incomingTransactions, outgoingTransactions, reconciliations
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
  toAccountId String?           @map("to_account_id")
  categoryId  String?           @map("category_id")
  budgetId    String?           @map("budget_id")
  createdById String            @map("created_by_id")
  fee         Decimal?          @default(0)
  slipImage   String?          @map("slip_image")
  tags        String[]          @default([])
}

model Budget {
  id          String       @id @default(uuid())
  title       String
  period      BudgetPeriod
  limit       Decimal
  status      BudgetStatus @default(active)
  transactions Transaction[]
  createdById String       @map("created_by_id")
}
```

### Enum definitions

```prisma
enum UserRole      { parent, child }
enum AccountType   { bank, cash, credit, wallet, loan, invest }
enum TransactionType { income, expense, transfer }
enum BudgetPeriod  { monthly, one_time }
enum BudgetStatus  { active, archived }
enum TransactionStatus { pending, completed, planned, void }
```

### Prisma client setup (`src/lib/prisma.ts`)

Supports both Neon (Vercel) and standard PostgreSQL via adapter pattern:

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
export const prisma = globalForPrisma.prisma || createPrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

---

## 5. Component Patterns

### Modal Pattern

`Modal` is a reusable overlay that locks body scroll, closes on overlay click, and passes through children:

```tsx
export default function Modal({ isOpen, onClose, title, children }) {
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : 'unset';
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.container} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>{title}</h2>
          <button onClick={onClose}><X size={24} /></button>
        </div>
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
```

### ActionFab (Speed Dial)

A floating action button that expands into 3 sub-actions (expense, income, transfer). Uses backdrop click-to-close:

```tsx
export default function ActionFab({ onTypeSelect }: ActionFabProps) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className={styles.container}>
      {isOpen && <div className={styles.backdrop} onClick={() => setIsOpen(false)} />}
      <div className={styles.actions}>
        <button onClick={() => handleSelect('transfer')}>Transfer</button>
        <button onClick={() => handleSelect('income')}>Income</button>
        <button onClick={() => handleSelect('expense')}>Expense</button>
      </div>
      <button className={styles.fab} onClick={toggleOpen}>
        {isOpen ? <X /> : <Plus />}
      </button>
    </div>
  );
}
```

### TransactionDetailModal — Dual-mode (View/Edit) form

This is the most complex modal in the app. It has two modes:
- **View mode**: shows transaction details with delete/edit buttons
- **Edit/Add mode**: full form with type selector, account dropdowns, amount, fee, category selector, slip image upload, tags, and note

Key patterns:
- `useEffect` resets form data when modal opens based on `transaction` (view) vs `null` (add)
- `isEditing` state toggles between view/edit
- `isOwner` prop gates edit/delete buttons
- Category/group selection cascades: changing type re-fetches groups, then categories
- Slip image uses client-side compression via `compressImage()`

```tsx
useEffect(() => {
  if (isOpen) {
    if (transaction) {
      setFormData({ ...transaction, toAccountId: transaction.toAccountId || "", ... });
      setIsEditing(false);
    } else {
      const initialGroups = getGroupsByType(initialType || "expense");
      const firstGroup = initialGroups[0];
      const firstCats = firstGroup ? getCategoriesByGroup(firstGroup.id) : [];
      setFormData({ accountId: accountId || availableAccounts[0]?.id || "", amount: 0, ... });
      setIsEditing(true);
    }
  }
}, [isOpen, transaction, initialType, accountId, availableAccounts]);
```

### DashboardFilter — Multi-select with cascading options

Uses a custom `MultiSelect` component. When user changes, accounts reset. When type changes, categories reset. Date presets for "This Month", "Last Month", "This Year", "All":

```tsx
const handleUserChange = (selected: string[]) => {
  onFilterChange({ ...filters, users: selected, accounts: [] }); // Reset accounts
};
const handleTypeChange = (selected: string[]) => {
  onFilterChange({ ...filters, types: selected as TransactionType[], categories: [] }); // Reset categories
};
```

### VisualizationView — Recharts with timeline + pie

Two charts:
1. **Income vs Expense bar chart** (daily/weekly/monthly grouping via `timeScale` toggle)
2. **Expense structure pie chart** (by group or category via `groupBy` toggle)

```tsx
const timelineData = useMemo(() => {
  // Groups transactions by day/week/month
  // Sums income/expense per bucket
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}, [transactions, timeScale]);

const pieData = useMemo(() => {
  // Maps expense transactions to category groups
  // Aggregates amounts per group name
  return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
}, [transactions, categories, groups, groupBy]);
```

### Money component — Thai Baht formatting

```tsx
export const formatMoney = (amount: number | string | null | undefined, decimalScale = 2) => {
  const num = Number(amount || 0);
  return num.toLocaleString('en-US', { minimumFractionDigits: decimalScale, maximumFractionDigits: decimalScale });
};

export default function Money({ amount, currency = '฿', colored = true }) {
  const num = Number(amount || 0);
  const isNegative = num < 0;
  const formatted = Math.abs(num).toLocaleString('en-US', { ... });
  const finalStyle = colored && isNegative ? { color: '#FF3B30' } : {};
  return <span style={finalStyle}>{isNegative ? '-' : ''}{currency}{formatted}</span>;
}
```

### CategorySelector — Searchable dropdown with grouping

Custom dropdown with search, grouped by category group, with an "Add New" button that opens `CreateCategoryModal`:

```tsx
const filteredCategories = useMemo(() => {
  return categories
    .filter(c => groups.find(g => g.id === c.groupId)?.type === transactionType)
    .filter(c => c.name.toLowerCase().includes(searchText))
    .sort((a, b) => a.name.localeCompare(b.name));
}, [categories, groups, transactionType, searchText]);
```

---

## 6. Finance Context Data Filtering

The `getFilteredTransactions` function in FinanceContext implements multi-criteria filtering:

```tsx
const getFilteredTransactions = (filters: DashboardFilters) => {
  return transactions.filter(tx => {
    // 1. Default: show only current user's transactions
    if (filters.users.length > 0) {
      if (!filters.users.includes(account.owner)) return false;
    } else {
      if (account.owner !== currentUser.name) return false;
    }
    // 2. Type filter
    if (filters.types.length > 0 && !filters.types.includes(tx.type)) return false;
    // 3. Account filter
    if (filters.accounts?.length > 0 && !filters.accounts.includes(tx.accountId)) return false;
    // 4. Category filter (by name, not ID — noted as potential bug)
    if (filters.categories?.length > 0 && !filters.categories.includes(tx.category)) return false;
    // 5. Date range filter (inclusive)
    if (filters.dateRange.start || filters.dateRange.end) { ... }
    return true;
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};
```

---

## 7. Error Handling Patterns

### API routes — try/catch with console.error

Every API route follows this pattern:

```ts
export async function GET() {
  try {
    // ... business logic
    return apiSuccess(data);
  } catch (error) {
    console.error('Failed to fetch X:', error);
    return apiError('Failed to fetch X');
  }
}
```

### Client-side — optimistic updates without rollback

```tsx
const deleteAccount = async (id: string) => {
  try {
    await fetch(`/api/accounts/${id}`, { method: 'DELETE' });
    setAccounts(accounts.filter(acc => acc.id !== id));
  } catch (error) {
    console.error("Failed to delete account", error);
    // No rollback — state is already modified
  }
};
```

### Client-side — alert for user-facing errors

```tsx
const deleteCategory = async (id: string): Promise<boolean> => {
  try {
    const res = await fetch(`/api/categories/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setCategories(categories.filter(c => c.id !== id));
      return true;
    } else {
      const data = await res.json();
      alert(data.error || 'Failed to delete category');
      return false;
    }
  } catch (error) {
    console.error("Failed to delete category", error);
    return false;
  }
};
```

---

## 8. Image Compression (`src/lib/compressImage.ts`)

Client-side canvas-based compression for slip images. Resizes to max 800px dimension, converts to JPEG at 60% quality:

```ts
export function compressImage(file: File, options?: { maxWidth?: number; maxHeight?: number; quality?: number }): Promise<string> {
  const { maxWidth = 800, maxHeight = 800, quality = 0.6 } = options || {};
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onloadend = () => { img.src = reader.result as string; };
    img.onload = () => {
      let { width, height } = img;
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    reader.readAsDataURL(file);
  });
}
```

---

## 9. Type System (`src/types/index.ts`)

```ts
type AccountType = 'bank' | 'cash' | 'credit' | 'wallet' | 'loan' | 'invest';
type UserRole = 'parent' | 'child';
type TransactionType = 'income' | 'expense' | 'transfer';
type BudgetStatus = 'pending' | 'done' | 'cancelled';

interface User { id; name; role; isAdmin?; avatar?; color; familyId; }
interface Account { id; name; type; balance; color; icon?; owner; accountNo?; alias?; status; }
interface Transaction { id; accountId; toAccountId?; category; categoryId?; categoryGroup; date; amount; fee?; type; note?; slipImage?; tags?; }
interface CategoryGroup { id; name; type; isCustom?; }
interface Category { id; name; groupId; isCustom?; userId?; }
interface Budget { id; title; description?; period; limit; startDate; endDate?; items: BudgetTransaction[]; createdById?; }
interface BudgetTransaction { id; name; plannedAmount; actualAmount?; date; status; type; categoryId; accountId?; toAccountId?; tags?; createdById?; }
interface DashboardFilters { users: string[]; dateRange: DateRange; types: TransactionType[]; categories: string[]; accounts: string[]; }
```

Note: Frontend `BudgetTransaction.status` uses `'pending' | 'done' | 'cancelled'` while the backend Prisma model uses `'planned' | 'completed' | 'void'`. The budgets API handler maps between them:

```ts
const STATUS_MAP: Record<string, string> = {
  planned: 'pending',
  completed: 'done',
  void: 'cancelled',
};
```

---

## 10. BottomNav — Mobile-first Navigation

Five tabs: Dashboard, History (categories), Home (accounts), Budget, Profile. Hides on `/login`:

```tsx
const navItems = [
  { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { name: 'History', path: '/categories', icon: ClipboardList },
  { name: 'Home', path: '/', icon: Home },
  { name: 'Budget', path: '/budget', icon: Calculator },
  { name: 'Profile', path: '/profile', icon: User },
];
```

---

## 11. Account Detail Page (`src/app/account/[id]/page.tsx`)

Uses React 19's `use()` to unwrap the params Promise. Has a tab switcher between Transactions and Reconcile. Owner/parent check for edit permissions:

```tsx
export default function AccountDetails({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const { id } = resolvedParams;
  const isOwner = currentUser?.name === account.owner || currentUser?.role === 'parent';
  // ...
}
```

Reconciliation is a separate feature that lets users manually adjust account balances with an audit trail:

```tsx
const handleReconcile = async (newBalance: number) => {
  const res = await fetch('/api/reconciliations', {
    method: 'POST',
    body: JSON.stringify({ accountId: id, newBalance, performedById: currentUser.id }),
  });
  if (res.ok) { await fetchAccounts(); await fetchReconciliations(); }
};
```

---

## 12. Key Architectural Observations

1. **Single Context Pattern**: All state lives in `FinanceContext`. No local state management for entities. Every page and component reads/writes through this provider.

2. **Optimistic Updates Without Rollback**: Mutations update local state immediately, then fire API calls. Failures are logged but state is not reverted. This is a known tech debt item.

3. **API-Client Mapping Mismatch**: Backend uses `createdById`, `ownerId`, `planAmount`, `slip_image`, etc. Frontend uses `owner` (name), `category` (name), `categoryGroup` (name). The `FinanceContext.fetchData()` function maps between these representations.

4. **Auth via Cookie**: Simple `httpOnly` cookie with user ID. No JWT, no refresh token. The `getAuthUser()` helper is called in every API route that needs auth.

5. **Prisma Atomic Transactions**: Balance adjustments are always done inside `prisma.$transaction()` to prevent race conditions.

6. **Soft Deletes**: Budgets are archived, not deleted. Planned transactions are voided, not deleted.

7. **Planned vs Completed Transactions**: The `Transaction.status` field drives business logic. `planned` transactions have `planAmount` set and `amount=0`. When completed, `amount` gets the real value and balances are adjusted.

8. **Thai Baht Currency**: The `Money` component defaults to `฿` and negative amounts render in red (`#FF3B30`).

9. **No Input Validation on API Routes**: Most POST/PATCH handlers do not validate request bodies with Zod or similar. `pickFields` provides field whitelisting but no type coercion or constraints.

10. **Family Isolation**: All data queries filter by `currentUser.familyId`. A user can only see data belonging to their family.