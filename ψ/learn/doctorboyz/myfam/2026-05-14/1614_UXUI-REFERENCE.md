# UX/UI Reference — MyFam (LINE LIFF Family Finance App)

> Audit date: 2026-05-14
> Scope: Full source-code audit of all pages, components, and styles
> Context: LINE LIFF mobile-first app (Next.js + CSS Modules)

---

## 1. UI Component Inventory

### Reusable Components

| Component | File | Props Interface | Reusability |
|-----------|------|----------------|-------------|
| **Modal** | `src/components/Modal/Modal.tsx` | `isOpen`, `onClose`, `title`, `children` | High — generic bottom-sheet modal on mobile, centered dialog on desktop |
| **ActionFab** | `src/components/ActionFab/ActionFab.tsx` | `onTypeSelect?`, `onClick?` | High — primary floating action button with transaction-type sheet |
| **TransactionTypeSheet** | `src/components/TransactionTypeSheet/TransactionTypeSheet.tsx` | `isOpen`, `onClose`, `onSelect` | Medium — used by ActionFab only; could be generalized |
| **TransactionList** | `src/components/TransactionList/TransactionList.tsx` | `transactions`, `title?`, `onTransactionClick?` | High — used on dashboard and account detail |
| **Money** | `src/components/Money/Money.tsx` | `amount`, `currency?`, `colored?`, `decimalScale?`, `className?`, `style?` | High — currency formatter used across all pages |
| **BalanceCard** | `src/components/BalanceCard/BalanceCard.tsx` | `title?`, `balance`, `onReconcile?`, `onEdit?`, `icon?` | Medium — used on account detail page |
| **DashboardFilter** | `src/components/DashboardFilter/DashboardFilter.tsx` | `users`, `currentUser`, `filters`, `onFilterChange` | Low — tightly coupled to finance context |
| **MultiSelect** | `src/components/DashboardFilter/MultiSelect.tsx` | (not read) | Unknown |
| **CategorySelector** | `src/components/CategorySelector/CategorySelector.tsx` | `value`, `onChange`, `onAddNew`, `categories`, `groups`, `transactionType` | Medium — used in transaction form only |
| **TagSelector** | `src/components/TagSelector.tsx` | (not read) | Unknown |
| **AvatarUploader** | `src/components/ImageUploader/AvatarUploader.tsx` | (not read) | Unknown — used on profile page |
| **VisualizationView** | `src/components/VisualizationView/VisualizationView.tsx` | `transactions` | Low — tightly coupled to recharts and finance context |

### Page-Specific Components / Fragments

| Fragment | Location | Notes |
|----------|----------|-------|
| **Login card** | `src/app/login/page.tsx` + `page.module.css` | Standalone, not reusable |
| **Link flow states** | `src/app/link/page.tsx` + `page.module.css` | 5-step wizard (loading, needs-login, confirm, success, error) |
| **Budget cards** | `src/app/budget/page.tsx` + `budget.module.css` | Progress bars with tab navigation |
| **Account cards** | `src/app/accounts/page.tsx` + `accounts.module.css` | Grid of account cards with icon + color |
| **History grouped list** | `src/app/categories/page.tsx` + `history.module.css` | Collapsible income/expense/transfer groups |
| **Profile menu** | `src/app/profile/page.tsx` + `profile.module.css` | Avatar, name edit, menu sections, danger zone |
| **Tag manager** | `src/app/settings/tags/page.tsx` + `tags.module.css` | Inline CRUD with color picker |
| **Account detail** | `src/app/account/[id]/page.tsx` + `accountDetail.module.css` | Tabs (transactions / reconcile), delete confirmation |

### Modals / Forms

| Modal | File | Purpose |
|-------|------|---------|
| **TransactionDetailModal** | `src/components/TransactionDetailModal/TransactionDetailModal.tsx` | Add/edit/view transaction (complex 520-line form) |
| **AccountFormModal** | `src/components/AccountFormModal/AccountFormModal.tsx` | Add/edit account |
| **BudgetFormModal** | `src/components/BudgetFormModal/BudgetFormModal.tsx` | Add/edit budget |
| **CategoryFormModal** | `src/components/CategoryFormModal/CategoryFormModal.tsx` | Add/edit category |
| **CategoryGroupFormModal** | `src/components/CategoryGroupFormModal/CategoryGroupFormModal.tsx` | Add/edit category group |
| **CreateCategoryModal** | `src/components/CreateCategoryModal/CreateCategoryModal.tsx` | Quick-create category from transaction form |
| **ReconcileModal** | `src/components/ReconcileModal/ReconcileModal.tsx` | Account reconciliation |
| **BudgetTransactionModal** | `src/components/BudgetTransactionModal/BudgetTransactionModal.tsx` | Budget item transactions |

---

## 2. Design System Audit

### Color Palette

| Token | Value | Usage | Assessment |
|-------|-------|-------|------------|
| `--background` | `#f5f5f7` (light) / `#000000` (dark) | Page background | Good — warm gray avoids sterile white |
| `--foreground` | `#1a1a2e` (light) / `#f5f5f7` (dark) | Primary text | Good — near-black with slight blue tint |
| `--card-bg` | `#ffffff` (light) / `#1c1c1e` (dark) | Card surfaces | Good — clean separation |
| `--primary` | `#00b386` | Brand green | Good — MAKE by KBank inspired, recognizable |
| `--primary-dark` | `#009975` | Hover/active states | Good — consistent gradient usage |
| `--primary-light` | `#e6f7f2` | Subtle backgrounds | Good — used for highlights |
| `--danger` | `#ff4757` | Errors, deletions, expenses | Good — distinct from primary |
| `--success` | `#00b386` | Income, success | **Inconsistency**: Same as `--primary`. Income and primary brand share color; could cause confusion. |
| `--warning` | `#ffa502` | Warnings | Defined but rarely used in audited files |
| `--secondary-text` | `#8c8c9a` | Captions, hints | Good — sufficient contrast on light |
| `--border` | `#e8e8ed` | Dividers, outlines | Good — subtle but visible |
| `--interactive` | `#007aff` | Links, transfers | Good — iOS-style blue for interactive |

### Inconsistencies

- **`--success` equals `--primary`**: Income transactions and primary brand elements use the same green. This makes it harder to distinguish "positive money" from "brand identity" at a glance. (`globals.css:11`, `globals.css:30`)
- **Danger color inconsistency**: `--danger` is `#ff4757` in tokens, but charts use `#FF3B30` (Apple system red) for expenses. (`VisualizationView.tsx:16`, `globals.css:12`)
- **Chart color palette is hardcoded**: `COLORS` array in `VisualizationView.tsx:15` uses raw hex values instead of CSS variables, breaking dark mode and theming.
- **Login page uses raw `#06c755`**: LINE brand green differs from app primary (`#00b386`). (`login/page.module.css:8`, `login/page.module.css:52`)

### Typography Scale

| Token | Size | Usage |
|-------|------|-------|
| `--font-xs` | 11px | Labels, hints |
| `--font-sm` | 12px | Secondary text, captions |
| `--font-base` | 12px | Body text |
| `--font-md` | 15px | Menu items, inputs |
| `--font-lg` | 16px | Card titles, modal headers |
| `--font-xl` | 18px | Page titles |
| `--font-2xl` | 22px | Large headings |
| `--font-3xl` | 28px | Large amounts |
| `--font-hero` | 34px | (unused in audit) |

### Typography Issues

- **Base font-size is 12px**: Very small for mobile body text. WCAG recommends minimum 16px for body to prevent iOS zoom on inputs, though the app sets `userScalable: false` which mitigates this. (`globals.css:57`, `layout.tsx:28`)
- **Hardcoded `font-size: 9px` scattered**: `dashboard.module.css:99` (tabs), `budget.module.css:64` (tabs), `history.module.css:139` (tx category), `TransactionDetailModal.module.css:202` (field labels), `TransactionDetailModal.module.css:373` (quick parse hint). These are well below recommended minimums for mobile readability.
- **Hardcoded `font-size: 10px`**: `budget.module.css:107` (card title), `history.module.css:58` (group title). Also too small.
- **Mixed `px` and `var()` usage**: Many components use raw pixel values instead of tokens, creating drift.

### Spacing Scale

| Token | Value |
|-------|-------|
| `--space-xs` | 4px |
| `--space-sm` | 6px |
| `--space-md` | 10px |
| `--space-lg` | 14px |
| `--space-xl` | 16px |
| `--space-2xl` | 20px |

### Spacing Issues

- **Compact but consistent**: The scale is mobile-appropriate.
- **Inconsistent padding between pages**: `accounts` uses `padding-left: var(--space-lg)` while `dashboard` uses `padding: 0 var(--section-margin)` (16px). Not a major issue but shows slight drift.

### Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-lg` | 24px | Bottom sheet, login card |
| `--radius-md` | 16px | Cards, modals |
| `--radius-sm` | 10px | Buttons, inputs |
| `--radius-xs` | 6px | Small badges, pills |

### Shadows

| Token | Value | Assessment |
|-------|-------|------------|
| `--shadow-sm` | `0 1px 3px rgba(0,0,0,0.06)` | Subtle, good for cards |
| `--shadow-md` | `0 4px 12px rgba(0,0,0,0.08)` | Good for elevated elements |
| `--shadow-lg` | `0 12px 40px rgba(0,0,0,0.12)` | Good for modals |

- **Balance card uses custom shadow**: `0 8px 32px rgba(0, 179, 134, 0.25)` — colored shadow is a nice branded touch but deviates from the neutral shadow system. (`dashboard.module.css:40`)

---

## 3. Accessibility Review

### WCAG 2.1 AA Compliance

#### Touch Targets

| Element | Size | Status | Reference |
|---------|------|--------|-----------|
| BottomNav items | 44px min-height | PASS | `BottomNav.module.css:33` |
| FAB button | 52x52px | PASS | `ActionFab.module.css` (via `--fab-size`) |
| Modal close button | 44x44px | PASS | `Modal.module.css:56-57` |
| Tab buttons | 40px min-height | **MARGINAL** | `dashboard.module.css:105`, `budget.module.css:68` — should be 44px |
| Type selector buttons | 40px min-height | **MARGINAL** | `TransactionDetailModal.module.css:189` |
| Bottom sheet option rows | ~48px | PASS | `TransactionTypeSheet.module.css` |
| Edit/Cancel icon buttons | 36x36px | **FAIL** | `profile.module.css:43-45`, `tags.module.css:183-184` — below 44px |
| Tag action icon buttons | 32x32px | **FAIL** | `tags.module.css:183`, `tags.module.css:214` — well below 44px |
| Trash action buttons | 36x36px | **FAIL** | `accounts.module.css:165`, `accounts.module.css:183` |
| Add tag button | 36x36px | **FAIL** | `tags.module.css:65-70` |
| Slip delete button | ~32px | **FAIL** | Inline Tailwind class in `TransactionDetailModal.tsx:462` |

#### Contrast Ratios

| Element | Foreground | Background | Ratio | Status |
|---------|-----------|------------|-------|--------|
| Body text | `#1a1a2e` | `#f5f5f7` | ~15:1 | PASS |
| Secondary text | `#8c8c9a` | `#f5f5f7` | ~3.5:1 | **MARGINAL** — close to 4.5:1 boundary |
| Secondary text on card | `#8c8c9a` | `#ffffff` | ~3.1:1 | **FAIL** for small text |
| Primary button (white on green) | `#ffffff` | `#00b386` | ~3.2:1 | **FAIL** for WCAG AA (needs 4.5:1) |
| Danger button (white on red) | `#ffffff` | `#ff4757` | ~3.4:1 | **FAIL** for WCAG AA |
| Inactive tab text | `#8c8c9a` | `#f0f0f5` | ~3.3:1 | **MARGINAL** |
| Date input text | `#8c8c9a` | `#f0f0f5` | ~3.3:1 | **MARGINAL** |
| Label text (9px) | `#8c8c9a` | `#ffffff` | ~3.1:1 | **FAIL** — small text needs 4.5:1 |
| Balance card label (9px, white) | `rgba(255,255,255,0.85)` | `#00b386` | ~2.8:1 | **FAIL** |

#### Semantic HTML

| Check | Status | Reference |
|-------|--------|-----------|
| `<main>` wrapper | PASS | `layout.tsx:43` |
| `<nav>` for BottomNav | PASS | `BottomNav.tsx:24` |
| `<header>` on dashboard | PASS | `dashboard/page.tsx:82` |
| `<h1>` page titles | PASS | Most pages |
| Form labels | **MIXED** | Some fields use `<label>`, but many inline labels are `<div className={styles.label}>` without `htmlFor` |
| Heading hierarchy | **FAIL** | Dashboard uses `<h1>` for user name, but no `<h2>` structure. Pages skip levels. |
| Buttons vs divs | PASS | All interactive elements use `<button>` |
| List markup | **FAIL** | Transaction lists use `<div>` stacks instead of `<ul>`/`<li>` |

#### ARIA

| Check | Status | Reference |
|-------|--------|-----------|
| FAB `aria-label` | PASS | `ActionFab.tsx:36` |
| Icon-only buttons with `aria-label` | PASS | Most icon buttons have labels |
| Modal focus trap | **MISSING** | No focus trap implementation in `Modal.tsx` |
| Modal `role="dialog"` | **MISSING** | Modal overlay lacks `role` and `aria-modal` |
| Live regions for errors | **MISSING** | Error messages in link page are static text |
| `aria-expanded` for collapsible | **MISSING** | History group headers lack expanded state |
| `aria-current` for nav | **MISSING** | BottomNav active item not marked |

#### Focus Management

| Check | Status | Reference |
|-------|--------|-----------|
| Focus styles on inputs | PASS | `box-shadow: 0 0 0 2px var(--primary-light)` |
| Focus styles on buttons | **MISSING** | Most buttons only have `:active` styles, no `:focus-visible` |
| Keyboard navigation | **MARGINAL** | Form fields are tabbable, but modal close on Escape is the only keyboard shortcut |
| Focus trap in modals | **MISSING** | Users can tab behind modal overlay |

#### Keyboard Navigation

| Check | Status | Reference |
|-------|--------|-----------|
| Enter to submit forms | PASS | Implicit `<form onSubmit>` |
| Escape to close modals | **MISSING** | Modal.tsx does not handle Escape key |
| Escape to cancel inline edit | PASS | `profile/page.tsx:68` |
| Keyboard shortcuts | **MISSING** | No shortcuts for common actions |

---

## 4. Visual Hierarchy

### Heading Structure

| Page | h1 | h2 | h3 | Notes |
|------|----|----|----|-------|
| Dashboard | User name | — | — | Greeting + name as h1; balance amount is plain div |
| Accounts | "บัญชี" | — | — | Single h1 |
| Budget | "งบประมาณ" | — | — | Single h1 |
| History | "รายการ" | — | — | Single h1 |
| Profile | User name | — | — | Name is h1 |
| Settings/Tags | "จัดการแท็ก" | — | — | Single h1 |

### Issues

- **No `<h2>` structure**: Pages are flat. The balance card title ("ยอดคงเหลือ") should be at least an `<h2>` or `<p>` with semantic weight. Currently it's a `<div className={styles.label}>`. (`dashboard.module.css:58`)
- **Balance amount dominates**: At `var(--amount-size)` (24px), the balance is smaller than the page title (18px). In practice the balance feels prominent due to the large card and white-on-green contrast, but the raw font size is modest.
- **Section titles are inconsistent**: Dashboard uses `var(--font-lg)` (16px) for section titles, while history page uses `var(--font-lg)` for page title.
- **Transfer amounts use `var(--foreground)` instead of `--interactive`**: Transfer type shows in near-black, missing the opportunity to use the defined `--transfer` (`--interactive` / `#007aff`) color. (`TransactionList.module.css:92`)

### Font Weight Distribution

| Token | Weight | Usage | Assessment |
|-------|--------|-------|------------|
| `--weight-regular` | 400 | Body, hints | Good |
| `--weight-medium` | 500 | Labels, secondary | Good |
| `--weight-semibold` | 600 | Buttons, titles | Good |
| `--weight-bold` | 700 | Page titles, amounts | Good |

- **Hardcoded `font-weight: 800`**: `login/page.module.css:34` uses raw `800` not in the token system.
- **Hardcoded `font-weight: 600` in charts**: `VisualizationView.module.css:24`, `VisualizationView.module.css:46` use raw values.

---

## 5. Interaction Patterns

### Transitions & Animations

| Animation | Duration | Easing | File |
|-----------|----------|--------|------|
| Modal slide-up | 300ms | `cubic-bezier(0.16, 1, 0.3, 1)` | `Modal.module.css:29` |
| Modal fade-in (desktop) | 200ms | `ease-out` | `Modal.module.css:81` |
| Bottom sheet slide-up | 300ms | `cubic-bezier(0.16, 1, 0.3, 1)` | `TransactionTypeSheet.module.css:24` |
| Bottom sheet overlay fade | 200ms | `ease-out` | `TransactionTypeSheet.module.css:9` |
| Button active scale | 100-150ms | `var(--ease-out)` | Various `.module.css` |
| Tab transition | 200ms | `var(--ease-out)` | `dashboard.module.css:104` |
| Progress bar width | 300ms | `var(--ease-out)` | `budget.module.css:134` |
| Budget bar fill | 300ms | `var(--ease-out)` | `VisualizationView.module.css:137` |

### Loading States

| State | Implementation | Assessment |
|-------|---------------|------------|
| Dashboard loading | Text "กำลังโหลด..." | **Poor** — No spinner, just text. Suspense fallback is identical. (`dashboard/page.tsx:78`, `dashboard/page.tsx:137`) |
| Link page loading | CSS spinner animation | Good — `spin` keyframe with border-top-color |
| History loading | Inline `style={{ padding: 20 }}` text | **Poor** — No spinner, inconsistent with dashboard |
| Categories loading | Not observed | — |
| Image upload | No loading state | **Missing** — `compressImage` is async but no UI feedback |

### Error States

| State | Implementation | Assessment |
|-------|---------------|------------|
| Link page errors | Red text below card | Good — clear error message with icon |
| Form validation | `alert()` dialogs | **Critical** — Native `alert()` blocks UI thread and feels jarring on mobile. (`TransactionDetailModal.tsx:154`, `TransactionDetailModal.tsx:158`) |
| API errors | Console logs mostly | **Poor** — Users see silent failures or generic text |
| Image compression error | Fallback to original | Good — graceful degradation |

### Empty States

| Page | Empty State | Assessment |
|------|------------|------------|
| Dashboard transactions | "ยังไม่มีรายการ" in gray card | Good — centered, clear |
| Accounts | "ยังไม่มีบัญชี..." | Good — actionable hint |
| Trash | "ถังขยะว่างเปล่า" | Good |
| History groups | "ไม่มีรายการ..." per group | Good |
| Budget | No empty state observed | **Missing** |
| Tags | "ยังไม่มีแท็ก..." | Good |

### Micro-interactions

| Interaction | Implementation | Assessment |
|-------------|---------------|------------|
| Card press | `transform: scale(0.98)` | Good — tactile feedback |
| Button press | `transform: scale(0.96-0.98)` | Good — consistent |
| FAB press | `transform: scale(0.93)` + shadow reduction | Good — prominent feedback |
| Nav item active | Color change + dot indicator | Good — clear state |
| Input focus | Border color + glow shadow | Good — accessible focus ring |
| Category selector dropdown | Slide-down with overlay | Good — clear layering |
| Slip image preview | Scale on active | Good |
| Lightbox close | Button with backdrop | Good |

---

## 6. Mobile & Responsive

### Viewport Configuration

| Attribute | Value | Assessment |
|-----------|-------|------------|
| `width` | `device-width` | Good |
| `initial-scale` | `1` | Good |
| `maximum-scale` | `1` | **Controversial** — Prevents zoom; improves app-like feel but reduces accessibility for low-vision users |
| `userScalable` | `false` | **Controversial** — Same as above |
| `viewportFit` | `cover` | Good — enables safe-area-inset support |

### Safe Area Handling

| Location | Implementation | Status |
|----------|---------------|--------|
| `main` padding-top | `var(--safe-top)` | PASS |
| `main` padding-bottom | `calc(var(--bottomnav-height) + var(--safe-bottom) + 8px + var(--liff-extra-bottom))` | PASS |
| BottomNav padding-bottom | `calc(var(--safe-bottom) + var(--liff-extra-bottom))` | PASS |
| Modal overlay padding-bottom | `calc(var(--safe-bottom) + var(--space-xl))` | PASS |
| TransactionTypeSheet padding-bottom | `calc(var(--space-xl) + var(--safe-bottom))` | PASS |
| Dashboard container padding-bottom | `calc(var(--bottomnav-height) + var(--safe-bottom) + var(--space-xl))` | PASS |

- **LIFF-specific variables**: `--liff-header-height` and `--liff-extra-bottom` are defined but set via JS in `LiffContext` (not audited). This is the correct approach for LIFF apps.

### Responsive Breakpoints

| Breakpoint | Behavior | File |
|------------|----------|------|
| `max-width: 480px` | FAB right edge aligns to screen edge | `ActionFab.module.css:20-23` |
| `min-width: 481px` | Modal centers vertically; border-radius becomes uniform | `Modal.module.css:75-86` |
| `min-width: 768px` | DashboardFilter becomes 4-column grid | `DashboardFilter.module.css:78-104` |

### Container Strategy

| Property | Value | Assessment |
|----------|-------|------------|
| `max-width` | 480px | Good — mobile-first with desktop centering |
| Centering | `margin: 0 auto` | Good |
| BottomNav centering | `left: 50%; transform: translateX(-50%)` | Good — stays aligned with container |

### Touch-Friendly Sizing

- **Minimum tap target issues**: See Accessibility / Touch Targets section.
- **Form inputs**: `min-height: 40px` for inputs; should be 44px for optimal touch. (`CategorySelector.module.css:29`, `TransactionDetailModal.module.css:209`)
- **Date inputs**: Very small at `padding: var(--space-xs)` (4px). (`DashboardFilter.module.css:65`)
- **Preset buttons**: `min-width: 52px` with `font-size: 9px`. Very small touch targets. (`DashboardFilter.module.css:44`)

---

## 7. UX Defects

### Critical

| # | Defect | File | Line | Impact |
|---|--------|------|------|--------|
| 1 | **Form validation uses native `alert()`** | `TransactionDetailModal.tsx` | 154, 158 | Blocks UI thread, breaks app-like feel, no styling control |
| 2 | **No focus trap in modals** | `Modal.tsx` | 14-40 | Keyboard users can tab behind overlay; screen reader users lose context |
| 3 | **Modal does not close on Escape** | `Modal.tsx` | — | Keyboard users cannot easily dismiss |
| 4 | **Profile edit icon is 32x32px** | `profile.module.css` | 43-45 | Below WCAG minimum 44px touch target |
| 5 | **Tag action buttons are 32x32px** | `tags.module.css` | 183, 214 | Well below minimum touch target |

### High

| # | Defect | File | Line | Impact |
|---|--------|------|------|--------|
| 6 | **Primary button contrast fails WCAG AA** | `globals.css` | 7, 11 | White on `#00b386` = ~3.2:1; needs 4.5:1 |
| 7 | **Danger button contrast fails WCAG AA** | `globals.css` | 11 | White on `#ff4757` = ~3.4:1 |
| 8 | **Secondary text on cards fails contrast** | `globals.css` | 14 | `#8c8c9a` on `#ffffff` = ~3.1:1 |
| 9 | **Hardcoded 9px font sizes throughout** | Multiple | — | Difficult to read on small screens; risks iOS zoom |
| 10 | **Loading states are just text** | `dashboard/page.tsx` | 78, 137 | No visual spinner; users may think app is frozen |
| 11 | **No loading state for image upload** | `TransactionDetailModal.tsx` | 67-83 | Async compression with zero feedback |
| 12 | **CategorySelector dropdown has no scroll containment** | `CategorySelector.module.css` | 62 | `position: absolute` may overflow viewport on small screens |
| 13 | **Dashboard Suspense fallback is identical to main loading** | `dashboard/page.tsx` | 137 | Causes layout flicker if they resolve at different times |
| 14 | **Confirm delete uses `window.confirm()`** | `account/[id]/page.tsx` | 341 | Native dialog breaks app feel |
| 15 | **History page inline loading style** | `categories/page.tsx` | 76 | `style={{ padding: 20 }}` is unstyled and inconsistent |

### Medium

| # | Defect | File | Line | Impact |
|---|--------|------|------|--------|
| 16 | **Tab buttons are 40px not 44px** | `dashboard.module.css`, `budget.module.css` | 105, 68 | Slightly below ideal touch target |
| 17 | **No `aria-expanded` on collapsible history groups** | `categories/page.tsx` | 100 | Screen readers don't know state |
| 18 | **No `aria-current` for active nav item** | `BottomNav.tsx` | 29 | Screen readers can't identify current page |
| 19 | **Chart colors are hardcoded hex** | `VisualizationView.tsx` | 15 | Breaks dark mode; inconsistent with tokens |
| 20 | **Login page uses different green** | `login/page.module.css` | 8, 52 | `#06c755` vs `#00b386` — brand inconsistency |
| 21 | **Body `font-size: 12px`** | `globals.css` | 57 | Small for mobile; triggers zoom on iOS unless `userScalable: false` |
| 22 | **Money component uses `en-US` locale** | `Money.tsx` | 16, 33 | Should use `th-TH` for Thai baht formatting |
| 23 | **Transaction list uses `<div>` not `<ul>`** | `TransactionList.tsx` | 39 | Less semantic for screen readers |
| 24 | **No empty state for budget page** | `app/budget/page.tsx` | — | Users see blank grid when no budgets exist |
| 25 | **Date inputs are tiny (4px padding, 9px font)** | `DashboardFilter.module.css` | 65-70 | Hard to tap and read |

### Low

| # | Defect | File | Line | Impact |
|---|--------|------|------|--------|
| 26 | **Inconsistent padding between pages** | Various | — | Minor visual drift |
| 27 | **Hardcoded `font-weight: 800`** | `login/page.module.css` | 34 | Outside token system |
| 28 | **Balance card label uses 9px white text on green** | `dashboard.module.css` | 58-63 | Low contrast but decorative |
| 29 | **No hover styles (mobile-appropriate but desktop lacking)** | Most components | — | Desktop users get no hover feedback |
| 30 | **Preset buttons have uneven flex distribution** | `DashboardFilter.module.css` | 28-45 | `justify-content: space-between` with `flex: 1` can cause uneven widths |
| 31 | **CategorySelector search input has no clear button** | `CategorySelector.tsx` | 77-84 | User must manually delete text |
| 32 | **Avatar fallback is emoji on link page** | `link/page.tsx` | 196 | `🤝` as avatar is playful but inconsistent with app style |
| 33 | **BottomNav active indicator is tiny dot (4px)** | `BottomNav.module.css` | 46-49 | Could be larger for visibility |

---

## 8. Recommendations

### Critical Fixes (Do First)

1. **Replace all `alert()` and `confirm()` with in-app dialogs**
   - Files: `TransactionDetailModal.tsx:154,158`, `account/[id]/page.tsx:341`
   - Use the existing Modal/overlay pattern for consistency
   - Impact: Removes UI thread blocking, enables styling, improves app-like feel

2. **Add focus trap and Escape-to-close to Modal component**
   - File: `src/components/Modal/Modal.tsx`
   - Implement `useEffect` keydown listener for Escape
   - Use `tabbable` or manual querySelector focus cycling
   - Impact: WCAG compliance, keyboard accessibility

3. **Increase touch targets to 44px minimum**
   - Files: `profile.module.css` (edit icon 32px), `tags.module.css` (icon buttons 32px), `accounts.module.css` (trash buttons 36px)
   - Increase padding or wrap icons in larger invisible hit areas
   - Impact: WCAG 2.5.5 compliance, reduces mis-taps

### High-Impact Enhancements

4. **Improve color contrast**
   - Darken `--primary` to `#008f6b` (white on this = 4.6:1)
   - Darken `--danger` to `#e02e3e` (white on this = 4.6:1)
   - Darken `--secondary-text` to `#6e6e7a` (on white = 4.5:1)
   - Impact: WCAG AA compliance, better readability

5. **Add proper loading spinners**
   - Files: `dashboard/page.tsx`, `categories/page.tsx`
   - Reuse the CSS spinner from `link/page.module.css`
   - Impact: Reduces perceived latency, clearer system status

6. **Increase minimum font sizes to 12px (avoid 9px)**
   - Files: `dashboard.module.css:99`, `budget.module.css:64,107`, `history.module.css:58,139`, `TransactionDetailModal.module.css:202,373`
   - Use `--font-xs` (11px) as absolute minimum, `--font-sm` (12px) as default small
   - Impact: Readability, reduces iOS auto-zoom risk

7. **Add image upload loading state**
   - File: `TransactionDetailModal.tsx:67-83`
   - Show spinner or "กำลังประมวลผล..." on the file label
   - Impact: Users know compression is happening

8. **Move chart colors to CSS variables**
   - File: `VisualizationView.tsx:15`
   - Define `--chart-1` through `--chart-8` in `globals.css`
   - Impact: Dark mode support, theming consistency

### Polish & Consistency

9. **Standardize heading hierarchy**
   - Add `<h2>` for section titles (balance card, visualization, lists)
   - Add `<h3>` for card-level headings
   - Impact: Screen reader navigation, SEO

10. **Add `aria-expanded`, `aria-current`, and `role="dialog"`**
    - Files: `BottomNav.tsx`, `categories/page.tsx`, `Modal.tsx`
    - Impact: Screen reader context

11. **Use semantic lists for transaction items**
    - Files: `TransactionList.tsx`, `categories/page.tsx`
    - Replace `<div className={styles.list}>` with `<ul>`, items with `<li>`
    - Impact: Better screen reader announcement

12. **Add hover styles for desktop**
    - Most components have `:active` but no `:hover`
    - Add `@media (hover: hover)` hover states
    - Impact: Desktop UX polish

13. **Unify login page green with brand primary**
    - File: `login/page.module.css:8,52`
    - Use `var(--primary)` instead of `#06c755`
    - Impact: Brand consistency

14. **Change Money locale to `th-TH`**
    - File: `Money.tsx:16,33`
    - Use `.toLocaleString('th-TH', ...)` for proper Thai number formatting
    - Impact: Localization accuracy

15. **Add empty state to budget page**
    - File: `app/budget/page.tsx`
    - Show "ยังไม่มีงบประมาณ" card when `filtered.length === 0`
    - Impact: Clearer UX for new users

### LIFF-Specific Considerations

16. **Test `--liff-extra-bottom` in real LIFF WebView**
    - The variable is defined but its runtime value depends on `LiffContext`
    - Verify that bottom sheet action buttons are not obscured by LIFF's bottom bar
    - Impact: Prevents unusable buttons in production

17. **Test `viewportFit: cover` with iPhone safe areas**
    - `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)` are used
    - Verify on iPhone with Dynamic Island and notch models
    - Impact: Prevents content clipping

18. **Add `user-scalable: false` accessibility disclaimer**
    - The viewport prevents zoom, which helps app-like feel but hurts low-vision users
    - Consider adding a font-size preference in settings
    - Impact: Accessibility inclusivity

---

## Appendix: File Index

| File | Lines | Description |
|------|-------|-------------|
| `src/app/layout.tsx` | 52 | Root layout with fonts, viewport, providers |
| `src/app/globals.css` | 154 | CSS variables, dark mode, base styles |
| `src/app/page.tsx` | 5 | Home redirect |
| `src/app/login/page.tsx` | 40 | LINE login page |
| `src/app/login/page.module.css` | 71 | Login styles |
| `src/app/dashboard/page.tsx` | 141 | Main dashboard |
| `src/app/dashboard/dashboard.module.css` | 123 | Dashboard styles |
| `src/app/accounts/page.tsx` | 237 | Accounts list + trash |
| `src/app/accounts/accounts.module.css` | 301 | Accounts styles |
| `src/app/budget/page.tsx` | 142 | Budget list |
| `src/app/budget/budget.module.css` | 76 | Budget styles |
| `src/app/categories/page.tsx` | 174 | Transaction history |
| `src/app/categories/history.module.css` | 159 | History styles |
| `src/app/profile/page.tsx` | 202 | Profile page |
| `src/app/profile/profile.module.css` | 393 | Profile styles |
| `src/app/link/page.tsx` | 306 | LINE account linking |
| `src/app/link/page.module.css` | 179 | Link page styles |
| `src/app/settings/tags/page.tsx` | 167 | Tag manager |
| `src/app/settings/tags/tags.module.css` | 336 | Tag styles |
| `src/app/account/[id]/page.tsx` | 358 | Account detail |
| `src/components/Modal/Modal.tsx` | 41 | Generic modal |
| `src/components/Modal/Modal.module.css` | 87 | Modal styles |
| `src/components/ActionFab/ActionFab.tsx` | 47 | FAB button |
| `src/components/ActionFab/ActionFab.module.css` | 24 | FAB styles |
| `src/components/TransactionTypeSheet/TransactionTypeSheet.tsx` | 66 | Bottom sheet |
| `src/components/TransactionTypeSheet/TransactionTypeSheet.module.css` | 124 | Sheet styles |
| `src/components/TransactionDetailModal/TransactionDetailModal.tsx` | 521 | Transaction form |
| `src/components/TransactionDetailModal/TransactionDetailModal.module.css` | 521 | Form styles |
| `src/components/TransactionList/TransactionList.tsx` | 70 | Transaction list |
| `src/components/TransactionList/TransactionList.module.css` | 103 | List styles |
| `src/components/BottomNav/BottomNav.tsx` | 37 | Bottom navigation |
| `src/components/BottomNav/BottomNav.module.css` | 56 | Nav styles |
| `src/components/Money/Money.tsx` | 49 | Currency formatter |
| `src/components/VisualizationView/VisualizationView.tsx` | 336 | Charts |
| `src/components/VisualizationView/VisualizationView.module.css` | 144 | Chart styles |
| `src/components/DashboardFilter/DashboardFilter.tsx` | 179 | Filter panel |
| `src/components/DashboardFilter/DashboardFilter.module.css` | 105 | Filter styles |
| `src/components/CategorySelector/CategorySelector.tsx` | 144 | Category dropdown |
| `src/components/CategorySelector/CategorySelector.module.css` | 207 | Selector styles |
| `src/components/BalanceCard/BalanceCard.tsx` | 36 | Balance display |
| `src/components/BalanceCard/BalanceCard.module.css` | (not read) | — |
