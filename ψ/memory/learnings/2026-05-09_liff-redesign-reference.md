# MyFam LIFF Redesign — UX/UI Reference & Conflict Log

## 1. Design System Reference

### Color Palette (เปลี่ยนจาก Apple Blue เป็น LINE Green primary)

| Token | Current | LIFF | ใช้ที่ไหน |
|-------|---------|------|-----------|
| `--primary` | `#007AFF` (Apple Blue) | `#06C755` (LINE Green) | ปุ่มหลัก, link, active tab, transfer type |
| `--primary-bg` | `rgba(0,122,255,0.1)` | `rgba(6,199,85,0.1)` | badge, hover |
| `--success` | `#34C759` | `#34C759` (ไม่เปลี่ยน) | รายรับ, positive |
| `--danger` | `#FF3B30` | `#FF3B30` (ไม่เปลี่ยน) | รายจ่าย, error, delete |
| `--income` | `var(--success)` | `var(--success)` | รายรับ |
| `--expense` | `var(--danger)` | `var(--danger)` | รายจ่าย |
| `--transfer` | `var(--primary)` | `var(--primary)` | โอน — เปลี่ยนเป็น LINE Green |
| `--background` | `#F5F5F7` | `#F7F8FA` | พื้นหลังหน้า |
| `--card-bg` | `#FFFFFF` | `#FFFFFF` | การ์ด |
| `--foreground` | `#1D1D1F` | `#1D1D1F` | ข้อความหลัก |
| `--secondary-text` | `#86868B` | `#8E8E93` | ข้อความรอง |
| `--border` | `#D2D2D7` | `#E5E5EA` | เส้นแบ่ง |
| `--liff-header` | — | `#06C755` | LINE header bar (44px) |

### Typography (เปลี่ยนจาก Inter เป็น Thai-first)

```css
:root {
  --font-thai: 'Sarabun', 'Noto Sans Thai', 'Thonburi', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-number: 'Inter', 'SF Pro Display', 'Helvetica Neue', sans-serif;
}
```

- **Body**: ขั้นต่ำ 15px (Thai glyphs ต้องการ vertical space มากกว่า Latin)
- **Money amounts**: 28-36px, `--font-number`, `font-weight: 700`
- **Section headers**: 18px, `font-weight: 600`
- **Page titles**: 24px, `font-weight: 700`
- **Labels**: 13px, `var(--secondary-text)`
- **Bottom nav labels**: 10px → 11px (เพิ่มขึ้นเพราะ Thai อ่านยากกว่าที่ 10px)

### Spacing & Layout

| Token | Value | Note |
|-------|-------|------|
| `--radius-lg` | 20px | Cards, modals |
| `--radius-md` | 12px | Buttons, inputs |
| `--radius-sm` | 8px | Badges, chips |
| Card padding | 20-24px | |
| Horizontal padding | 16px | Content area |
| Grid gap | 12px | Between cards |
| Bottom nav height | 80px | + 20px safe area |
| Top bar height | 60px | **ซ่อนใน LIFF mode** |
| FAB position | bottom: 90px, right: 20px | |
| Max width | 480px | **อาจขยายเป็น 100% ใน LIFF** |
| Touch target min | 44×44px | Apple HIG / LINE guideline |

### LIFF Layout Constraints

```
+----------------------------------+
|  LINE Header (44px, ไม่สามารถเอาออก)  |
+----------------------------------+
|  Safe Area Top (env variable)    |
|                                  |
|  App Content (scrollable)        |
|  - ไม่มี TopBar (LINE มีให้แล้ว)    |
|  - Greeting + Balance card      |
|  - Charts / Lists               |
|  - FAB button                   |
|                                  |
+----------------------------------+
|  Bottom Nav (80px)               |
|  [หน้าหลัก] [รายการ] [+] [งบ] [ฉัน] |
|  Safe Area Bottom (34px)         |
+----------------------------------+
```

**CSS adjustments สำหรับ LIFF**:
```css
/* ซ่อน TopBar เมื่ออยู่ใน LIFF */
.liff-mode .topBar { display: none; }
.liff-mode main { padding-top: env(safe-area-inset-top, 0px); }
.liff-mode .bottomNav { padding-bottom: env(safe-area-inset-bottom, 34px); }
```

---

## 2. Screen-by-Screen Thai Translation Map

### Navigation Labels

| English | Thai | Component |
|---------|------|-----------|
| Dashboard | หน้าหลัก | TopBar title, BottomNav tab |
| History | รายการ | TopBar title, BottomNav tab |
| Home | หน้าหลัก | BottomNav tab (icon only) |
| Budget | งบประมาณ | TopBar title, BottomNav tab |
| Profile | โปรไฟล์ | TopBar title, BottomNav tab |
| My Accounts | บัญชีของฉัน | TopBar title |
| Settings | ตั้งค่า | TopBar title |

### Dashboard

| English | Thai |
|---------|------|
| Good morning | สวัสดีตอนเช้า |
| Good afternoon | สวัสดีตอนบ่าย |
| Good evening | สวัสดีตอนเย็น |
| Total Balance | ยอดคงเหลือ |
| This Month | เดือนนี้ |
| Last Month | เดือนที่แล้ว |
| This Year | ปีนี้ |
| All | ทั้งหมด |
| User | ผู้ใช้ |
| Account | บัญชี |
| Type | ประเภท |
| Category | หมวดหมู่ |
| Loading... | กำลังโหลด... |

### Transaction Form

| English | Thai |
|---------|------|
| Transaction Details | รายละเอียดรายการ |
| New Transaction | เพิ่มรายการใหม่ |
| Edit Transaction | แก้ไขรายการ |
| INCOME | รายรับ |
| EXPENSE | รายจ่าย |
| TRANSFER | โอน |
| From Account | บัญชีต้นทาง |
| To Account | บัญชีปลายทาง |
| Amount | จำนวนเงิน |
| Fee | ค่าธรรมเนียม |
| Category | หมวดหมู่ |
| Select Category | เลือกหมวดหมู่ |
| Search categories... | ค้นหาหมวดหมู่... |
| No categories found | ไม่พบหมวดหมู่ |
| Add New Category | เพิ่มหมวดหมู่ใหม่ |
| Slip Image | รูปสลิป |
| Choose Image | เลือกรูป |
| Change Image | เปลี่ยนรูป |
| Date | วันที่ |
| Note | หมายเหตุ |
| Add a note | เพิ่มหมายเหตุ |
| Cancel | ยกเลิก |
| Save | บันทึก |
| Delete | ลบ |
| Edit | แก้ไข |
| Reconcile | กระทะยืนยันยอด |

### Accounts

| English | Thai |
|---------|------|
| Accounts | บัญชี |
| New | ใหม่ |
| bank | ธนาคาร |
| cash | เงินสด |
| credit | เครดิต |
| wallet | กระเป๋าเงิน |
| loan | สินเชื่อ |
| invest | ลงทุน |

### Login

| English | Thai |
|---------|------|
| My Fam | MyFam |
| Family Finance Tracker | ติดตามการเงินครอบครัว |
| Username | ชื่อผู้ใช้ |
| Enter your name | กรอกชื่อผู้ใช้ |
| Password | รหัสผ่าน |
| Sign In | เข้าสู่ระบบ |
| Signing in... | กำลังเข้าสู่ระบบ... |
| Login failed | เข้าสู่ระบบไม่สำเร็จ |
| Connection error | ข้อผิดพลาดการเชื่อมต่อ |

### Action FAB

| English | Thai |
|---------|------|
| Expense | รายจ่าย |
| Income | รายรับ |
| Transfer | โอน |

---

## 3. Conflict Log — Plan vs Codebase

### CONFLICT 1: Font — Inter vs Thai

**ปัญหา**: `layout.tsx` ใช้ `Inter` font (Latin-only) ซึ่งไม่รองรับภาษาไทย

**ปัจจุบัน**:
```tsx
const inter = Inter({ subsets: ["latin"] });
// <body className={inter.className}>
```

**แก้ไข**: เปลี่ยนเป็น `Sarabun` (Google Font ที่ออกแบบมาสำหรับภาษาไทยโดยเฉพาะ) + `Inter` สำหรับตัวเลขเท่านั้น

```tsx
const sarabun = Sarabun({ subsets: ["thai", "latin"], weight: ["400", "600", "700"] });
const inter = Inter({ subsets: ["latin"] }); // สำหรับตัวเลขเท่านั้น
```

### CONFLICT 2: TopBar ใน LIFF mode

**ปัญหา**: `TopBar` แสดงเสมอ (60px sticky) แต่ใน LIFF mode LINE มี header ให้แล้ว (44px)

**ปัจจุบัน**: TopBar ซ่อนเฉพาะ `/login`:
```tsx
// TopBar.tsx — ซ่อนเฉพาะหน้า login
const hiddenRoutes = ["/login"];
```

**แก้ไข**: เพิ่มเงื่อนไข `isLiff && isInClient` → ซ่อน TopBar ทั้งหมด เพราะ LINE มี header ให้แล้ว

### CONFLICT 3: Max-width 480px

**ปัญหา**: `main` element จำกัด `max-width: 480px` แต่ LIFF Full-size ใช้ 100% viewport

**ปัจจุบัน**:
```css
main {
  max-width: 480px;
  margin: 0 auto;
}
```

**แก้ไข**: ใน LIFF mode ยกเลิก `max-width` constraint:
```css
.liff-mode main {
  max-width: 100%;
}
```

### CONFLICT 4: Bottom Nav Labels

**ปัญหา**: BottomNav labels เป็นภาษาอังกฤษ และ `font-size: 10px` เล็กเกินไปสำหรับภาษาไทย

**ปัจจุบัน**:
```tsx
const tabs = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
  { icon: ClipboardList, label: "History", path: "/categories" },
  { icon: Home, label: "Home", path: "/" },
  { icon: Calculator, label: "Budget", path: "/budget" },
  { icon: User, label: "Profile", path: "/profile" },
];
```

**แก้ไข**: เปลี่ยนเป็นภาษาไทย + เพิ่ม font-size:
```tsx
const tabs = [
  { icon: LayoutDashboard, label: "หน้าหลัก", path: "/dashboard" },
  { icon: ClipboardList, label: "รายการ", path: "/categories" },
  { icon: Home, label: "", path: "/" },           // FAB center, no label
  { icon: Calculator, label: "งบ", path: "/budget" },
  { icon: User, label: "ฉัน", path: "/profile" },
];
```

### CONFLICT 5: Primary Color — Blue vs Green

**ปัญหา**: `--primary` ใช้ `#007AFF` (Apple Blue) แต่ LIFF ควรใช้ `#06C755` (LINE Green) เพื่อให้รู้สึกเหมือนส่วนหนึ่งของ LINE

**แก้ไข**: เปลี่ยน `--primary` เป็น LINE Green แต่ **เก็บ Blue ไว้สำหรับ transfer type**:
```css
:root {
  --primary: #06C755;       /* LINE Green — ปุ่มหลัก, active tab */
  --primary-dark: #05A34A;  /* LINE Green hover */
  --transfer: #007AFF;     /* Apple Blue — สำหรับ transfer type เท่านั้น */
}
```

### CONFLICT 6: Money Component — Hardcoded Color

**ปัญหา**: `Money.tsx` ใช้ `#FF3B30` แฮร์ดโค้ดแทน `var(--danger)`

**ปัจจุบัน**:
```tsx
color: colored && amount < 0 ? "#FF3B30" : "inherit"
```

**แก้ไข**: เปลี่ยนเป็น CSS variable:
```tsx
color: colored && amount < 0 ? "var(--danger)" : "inherit"
```

### CONFLICT 7: Auth Flow — Cookie vs LINE Token

**ปัญหา**: `FinanceContext` อ่าน `userId` จาก cookie ที่ `POST /api/auth/login` ตั้ง แต่ LIFF จะต้องตั้ง cookie ผ่าน `POST /api/auth/liff`

**ปัจจุบัน**:
```tsx
const response = await fetch("/api/auth/login", {
  method: "POST",
  body: JSON.stringify({ username, password }),
  credentials: "include",
});
```

**แก้ไข**: เพิ่ม LIFF auth path ใน `FinanceContext`:
```tsx
if (isLiff) {
  // ใช้ LINE ID token แทน username/password
  const idToken = liff.getIDToken();
  await fetch("/api/auth/liff", {
    method: "POST",
    body: JSON.stringify({ idToken }),
    credentials: "include",
  });
} else {
  // browser login เหมือนเดิม
  await fetch("/api/auth/login", { ... });
}
```

### CONFLICT 8: Route Path — `/categories` → `/history`

**ปัญหา**: BottomNav ชี้ไป `/categories` แต่ชื่อไทยคือ "รายการ" (History) — path ควรเปลี่ยนด้วย?

**ตัดสินใจ**: เปลี่ยน path จาก `/categories` เป็น `/history` เพื่อให้สอดคล้องกับชื่อไทย "รายการ" — ต้องอัปเดต BottomNav, TopBar title mapping, และ `next.config` redirect สำหรับ backward compatibility

---

## 4. Component Reuse Assessment

### ใช้ต่อเลย (เปลี่ยนแค่ label เป็นไทย)

| Component | เปลี่ยนอะไร |
|-----------|-------------|
| `Money` | เปลี่ยน hardcoded color เป็น var, เพิ่ม `฿` prefix format |
| `Modal` | ไม่ต้องเปลี่ยน |
| `BalanceCard` | เปลี่ยน default title เป็น "ยอดคงเหลือ" |
| `CategorySelector` | เปลี่ยน placeholder/labels เป็นไทย |
| `DashboardFilter` | เปลี่ยน labels เป็นไทย |
| `VisualizationView` | เปลี่ยน chart labels เป็นไทย |
| `ReconcileModal` | เปลี่ยน labels เป็นไทย |
| `TagSelector` | เปลี่ยน labels เป็นไทย |
| `MultiSelect` | เปลี่ยน labels เป็นไทย |

### ต้องแก้มากขึ้น

| Component | เปลี่ยนอะไร |
|-----------|-------------|
| `TopBar` | เพิ่ม LIFF mode → ซ่อนเมื่ออยู่ใน LINE, เปลี่ยน titles เป็นไทย |
| `BottomNav` | เปลี่ยน labels เป็นไทย, เพิ่ม safe area padding, เปลี่ยน `/categories` → `/history` |
| `ActionFab` | เปลี่ยน labels เป็นไทย (รายรับ/รายจ่าย/โอน) |
| `TransactionDetailModal` | เปลี่ยน labels เป็นไทย, เพิ่ม camera upload สำหรับ LIFF |
| `AccountFormModal` | เปลี่ยน labels เป็นไทย |
| `BudgetFormModal` | เปลี่ยน labels เป็นไทย |
| `BudgetTransactionModal` | เปลี่ยน labels เป็นไทย |
| `CategoryFormModal` | เปลี่ยน labels เป็นไทย |
| `CategoryGroupFormModal` | เปลี่ยน labels เป็นไทย |
| `CreateCategoryModal` | เปลี่ยน labels เป็นไทย |

### สร้างใหม่

| Component | ทำอะไร |
|-----------|--------|
| `LiffProvider` | Context ห่อหุ้ม app, provides `isLiff`, `lineProfile`, auto-auth |
| `LiffBottomNav` | หรือแก้ BottomNav เดิมเพิ่ม LIFF mode detection |
| `LinkAccountPage` | หน้าเชื่อมบัญชี LINE (username/password หรือ invite code) |
| `QuickAddPage` | หน้าเพิ่มรายการเร็ว (3 fields: amount, category, note) |

---

## 5. Implementation Priority Order

ลำดับการทำงาน (เรียงตาม dependency):

1. **Install `@line/liff`** + create `liff-auth.ts`
2. **Create `LiffContext.tsx`** — LIFF detection + auth
3. **Modify `globals.css`** — เพิ่ม Thai font, LINE Green, LIFF mode CSS
4. **Modify `layout.tsx`** — wrap with LiffProvider, เปลี่ยน font
5. **Create `/api/auth/liff`** endpoints
6. **Modify existing pages** — Thai labels (Dashboard, History, Budget, Accounts, Profile, Settings)
7. **Modify components** — TopBar, BottomNav, ActionFab, all modals → Thai labels
8. **Add LIFF layout logic** — hide TopBar in LIFF, safe areas
9. **Create Link Account page** (`/link`)
10. **Create Quick Add page** (`/add`)
11. **Create Transaction Detail page** (`/transaction/[id]`)
12. **Modify FinanceContext** — LIFF auth flow
13. **Prisma migration** — InviteCode model
14. **Create invite endpoints** — `/api/invite`, `/api/auth/liff/register`
15. **Bot-LIFF bridge** — deep links in bot messages
16. **Configure Rich Menu** — LINE Official Account rich menu