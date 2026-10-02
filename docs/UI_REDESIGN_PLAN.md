# MyFam UI Redesign Plan

> Gen Alpha × TikTok feel — cool, dark-first, mobile app + Telegram Mini App

## 1. Scope & Goals

**What:** Redesign the visual language and key screens of the existing MyFam Next.js PWA so it feels native to Gen Alpha short-form culture, while remaining usable for family finance tracking.

**Where:**
- `src/app/globals.css` — design tokens
- `src/app/layout.tsx` — root / font / Telegram-aware shell
- `src/components/*` — shared primitives (BottomNav, ActionFab, cards, modals)
- `src/app/dashboard/page.tsx` + `dashboard.module.css` — primary landing screen
- `src/app/transactions/page.tsx` + `page.module.css` — transaction feed
- `src/app/login/page.tsx` + `page.module.css` — Mini App / PWA login
- `docs/TELEGRAM_SETUP.md` — update Mini App guidance
- `docs/ONBOARDING.md` — update screenshots/flows if behavior changes

**How much:** Phase 1 = token system + shell + dashboard redesign as the new direction. Later phases extend to transactions, accounts, budget, profile, settings.

---

## 2. Current State Assessment

- **Stack:** Next.js 16 + React 19 + CSS Modules + Lucide icons + Recharts.
- **Typography:** Prompt (Thai) + Inter (numbers/Latin) — already good; keep.
- **Layout:** mobile-first, 480 px max-width container, fixed bottom nav, safe-area aware.
- **Color:** light-first, green primary, gray surfaces. Dark mode exists via `prefers-color-scheme`.
- **Telegram Mini App:** `/login` loads `telegram-web-app.js`, auto-login with `initData`, falls back to password form.
- **Strengths:** component-based, responsive constraints, Thai typography, PWA-ready.
- **Weaknesses for Gen Alpha:** dashboard is report-heavy, light theme default, no motion language, generic card grids, five-tab bottom nav feels utilitarian.

---

## 3. Design Direction

### Mood: Cool TikTok Family Feed

- **Dark-first.** 90% of surfaces near-black. Light mode optional, not default.
- **Accent:** one neon signal — acid green `#C8FF00` for primary actions and income.
- **Expense signal:** hot coral `#FF4D6D`.
- **Info/surface 3D:** electric violet `#8B5CF6` for transfers, avatars, badges.
- **Texture:** subtle grain overlay on hero/balance areas; glass cards; 1 px hairlines.
- **Shape:** large, consistent radius — 20/24/999 px.
- **Icon set:** keep **Lucide** (already imported) but use heavier `strokeWidth` (2.5) and 24 px base. Add a small set of custom category glyphs only if metaphors are missing.
- **Layout metaphor:** dashboard becomes a **vertical, glanceable feed** of family financial moments (balance, recent spend, budget pulse, uncategorized alerts) instead of a report dashboard.

### Anti-Template Policy Check

Avoid:
- default green-on-white banking app look
- sidebar nav, tables, dense charts
- uniform cards with identical padding
- stock gradient hero with centered headline

Use:
- hierarchy through scale contrast
- intentional rhythm in spacing
- depth/layering via glass, glow, grain
- motion that clarifies flow
- designed states for every interactive element

---

## 4. Token System (CSS Custom Properties)

Replace the current light-first palette with a dark-first token layer in `src/app/globals.css`.

```css
:root {
  /* Canvas */
  --bg: #050505;
  --surface: #121212;
  --surface-elevated: #1a1a1a;
  --surface-glass: rgba(26, 26, 26, 0.72);

  /* Text */
  --text-primary: #f5f5f7;
  --text-secondary: #8e8e93;
  --text-tertiary: #636366;

  /* Accents */
  --primary: #c8ff00;
  --primary-dim: rgba(200, 255, 0, 0.14);
  --income: #c8ff00;
  --expense: #ff4d6d;
  --expense-dim: rgba(255, 77, 109, 0.14);
  --transfer: #8b5cf6;
  --transfer-dim: rgba(139, 92, 246, 0.14);

  /* Utility */
  --border: rgba(255, 255, 255, 0.08);
  --border-strong: rgba(255, 255, 255, 0.14);
  --overlay: rgba(0, 0, 0, 0.6);
  --danger: #ff4d6d;
  --warning: #ff9f0a;
  --success: #c8ff00;

  /* Typography scale (mobile) */
  --text-xs: 11px;
  --text-sm: 13px;
  --text-base: 14px;
  --text-md: 15px;
  --text-lg: 17px;
  --text-xl: 20px;
  --text-2xl: 24px;
  --text-3xl: 30px;
  --text-hero: 40px;

  /* Spacing — 4/8-point grid */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;

  /* Radius */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 20px;
  --radius-xl: 24px;
  --radius-full: 999px;

  /* Motion */
  --duration-fast: 150ms;
  --duration-normal: 250ms;
  --duration-slow: 350ms;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);

  /* Layout */
  --bottomnav-height: 72px;
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --container-max-width: 480px;
}

@media (prefers-color-scheme: light) {
  :root {
    --bg: #ffffff;
    --surface: #f5f5f7;
    --surface-elevated: #ffffff;
    --surface-glass: rgba(255, 255, 255, 0.78);
    --text-primary: #1a1a2e;
    --text-secondary: #8c8c9a;
    --text-tertiary: #b4b4be;
    --border: rgba(0, 0, 0, 0.08);
    --border-strong: rgba(0, 0, 0, 0.12);
  }
}
```

---

## 5. Shell & Navigation

### Root Layout (`src/app/layout.tsx`)

- Keep Prompt + Inter fonts.
- Remove global `main` padding rule; let screens manage their own insets.
- Keep `BottomNav` for authenticated routes, hide on `/login`.
- Add a CSS class `tma` to `<body>` when running inside Telegram (detect via `window.Telegram?.WebApp`). This lets components adjust for Telegram header / safe areas.

### Bottom Nav Redesign (`src/components/BottomNav/BottomNav.tsx`)

- Reduce to **4 tabs** (Gen Alpha attention budget): Feed, Transactions, Accounts, Profile.
- Collapse “Budget” into Profile or surface it as a feed card instead of a tab.
- Floating pill-style nav, centered, with blurred glass background, 16 px radius, 12 px vertical padding, 8 px gap.
- Active tab: filled pill background `surface-elevated` + `primary` icon/text, with a tiny scale pop on tap.
- Inactive tab: `text-secondary` icon only, label hidden (accessibility label kept).
- Min touch target 48 × 48 dp.

### Top Header Pattern

- Sticky, minimal top bar with greeting + avatar + family status rings.
- Use `position: sticky; top: var(--safe-top)`.
- Backdrop blur when content scrolls underneath.

---

## 6. Dashboard Redesign — The Feed

Convert `/dashboard` from report view to a **vertical feed of family finance moments**.

### Feed Cards

1. **Hero Balance Card**
   - Full-width, near-top, neon accent glow.
   - Large hero amount, family label, date pill.
   - Tap expands mini-chart or goes to `/accounts`.

2. **Period Pulse Card**
   - Compact row: income / expense / net as three chips.
   - No heavy labels — numbers speak.

3. **Uncategorized Alert Card**
   - Only shown when count > 0.
   - Attention-grabbing but not scary: “X รายการรอจัดหมวด” with swipe-to-action suggestion.

4. **Recent Transactions Card**
   - Horizontal or vertical list of recent items.
   - Each item: icon circle (type-tinted), description line, amount, date chip.
   - Tap opens detail modal.

5. **Budget Pulse Card**
   - Ring progress (not bar) for up to 2 active budgets.
   - Tap to `/budget`.

6. **Top Categories Card (analysis view)**
   - Keep as second tab “วิเคราะห์” but redesign chart colors to new palette.
   - Use the new `VisualizationView` with Recharts color overrides.

### Interactions

- Pull-to-refresh: bouncy spinner, 250 ms spring settle.
- Card press: scale 0.98, background shifts to `surface-elevated`.
- Hero card: subtle floating grain/noise animation (CSS only, under 200 ms frame).

---

## 7. Telegram Mini App Adaptations

- **Safe areas:** all top insets respect Telegram header. Use `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)`.
- **Header:** in TMA, hide the custom top greeting to avoid double headers. Use Telegram native `MainButton` via `window.Telegram.WebApp.MainButton` for primary CTAs where possible (login, confirm add).
- **Haptics:** add `Telegram.WebApp.HapticFeedback.impactOccurred('light')` on button presses, quick-reply taps, and success states.
- **Back button:** use `Telegram.WebApp.BackButton` for modal stacks instead of custom back buttons.
- **Theme params:** read `WebApp.themeParams` only for adapting to Telegram’s own light/dark; do not let it override the new design tokens. Instead, sync the app theme to Telegram via `setHeaderColor`/`setBackgroundColor`.
- **Bundle:** keep dashboard first paint small. Lazy-load Recharts and heavy modals. JS budget per page < 150 kb gzipped.

---

## 8. Motion & Micro-interactions

- **Card enter:** translateY(12px) + opacity 0 → 1, 250 ms, ease-out.
- **Button press:** scale 0.96, 100 ms, ease-out.
- **Tab switch:** sliding pill background, 200 ms.
- **Modal:** sheet slides from bottom with backdrop fade, 300 ms.
- **Pull refresh:** custom spinner, spring settle.
- **Avatar status ring:** gentle pulse on unread activity.
- **Reduced motion:** all motion becomes simple opacity fades or removed entirely.

Implement shared motion helpers in `src/lib/animation.ts` (no GSAP unless justified).

---

## 9. Component Primitives to Build / Refactor

| Component | Action |
|---|---|
| `BottomNav` | Redesign to floating 4-tab pill |
| `ActionFab` | Keep, but redesign sheet to dark glass + neon accents |
| `TransactionTypeSheet` | Dark glass, large thumb-friendly chips |
| `Money` | Ensure tabular nums, hero variant |
| `PageLoadState` | Dark skeleton placeholders |
| `DashboardFilter` | Compact, bottom-sheet on mobile |
| `BalanceCard` | New hero glass card |
| `TransactionList` | New list item style |
| `Modal` | Bottom-sheet by default on mobile |
| New: `AvatarRing` | Family member avatar with online/activity pulse |
| New: `ProgressRing` | SVG ring for budgets |
| New: `FeedCard` | Reusable feed card wrapper |

---

## 10. Screen-by-Screen Plan

### Phase 1 — Foundation + Dashboard
1. Tokens in `globals.css`.
2. Layout / BottomNav / shell.
3. Dashboard feed redesign.
4. Login page dark mode + TMA polish.

### Phase 2 — Core Screens
5. Transactions list redesign.
6. Accounts list redesign.
7. Budget list + detail redesign.

### Phase 3 — Secondary Screens
8. Profile / Settings redesign.
9. Modals and forms unified.
10. Onboarding / empty states.

---

## 11. Accessibility & Performance

- Contrast: body text ≥ 4.5:1, large text/UI ≥ 3:1 in dark and light.
- Touch targets ≥ 48 × 48 dp.
- Focus rings visible on keyboard nav.
- `prefers-reduced-motion` respected.
- CWV targets: LCP < 2.5 s, INP < 200 ms, CLS < 0.1.
- Bundle: lazy-load Recharts, keep dashboard JS < 150 kb gzipped.
- Thai text checked with สระ/วรรณยุกต์ at 14–17 px.

---

## 12. Testing Plan

- Visual regression: screenshot 320/375/768/1024/1440 for dashboard, login, transactions.
- A11y: keyboard nav, reduced motion, contrast checks.
- TMA: test in Telegram iOS/Android, verify safe areas, haptics, back button.
- Unit tests for new helpers (animation, theme detection).
- Update existing tests if component APIs change.

---

## 13. Documentation to Update

- `docs/TELEGRAM_SETUP.md` — add TMA theme/header/back-button behavior.
- `docs/ONBOARDING.md` — update login flow screenshots/descriptions only if flows change.
- `CLAUDE.md` — if new architectural rules emerge (e.g., theme detection pattern).

---

## 14. Deliverables & Phasing

| Phase | Deliverable | Files Touched |
|---|---|---|
| 1 | Design tokens + shell + dashboard | `globals.css`, `layout.tsx`, `BottomNav`, `dashboard/*`, `login/*` |
| 2 | Core screens | `transactions/*`, `accounts/*`, `budget/*`, shared cards/modals |
| 3 | Polish | profile/settings, animations, docs, visual regression |

---

## 16. Logo & Icon Refresh

We are allowed to redesign the logo and app icon.

### Direction
- **Mark:** simple geometric family glyph — two overlapping rounded figures or a “home + heart” shape — rendered in the neon accent `#C8FF00` on dark.
- **Wordmark:** “MyFam” in Prompt Bold, tight tracking, lowercase-friendly “myfam” for Gen Alpha feel.
- **App icon:** rounded square, dark background, neon glyph, subtle glow.
- **Favicon / PWA icons:** regenerate `favicon.ico`, `icon.svg`, and manifest icons at 192/512 px.
- **Telegram bot avatar:** same neon-on-dark mark for consistency.
- **Implementation:** create SVG source in `public/logo.svg` and `public/logo-mark.svg`; generate PNG fallbacks via `sharp` script or design export.
- **Files to touch:**
  - `public/favicon.ico`
  - `public/favicon.png`
  - `public/icon.svg`
  - `src/app/icon.svg`
  - `src/app/apple-icon.png` (if present)
  - `public/manifest.json` icons (if present)
  - `src/app/login/page.tsx` — replace favicon.png logo with new SVG mark.

### Anti-pattern
- Avoid generic gradient blob + house icon.
- Avoid multiple icon styles across web/PWA/Telegram.

## 17. Open Questions

1. Should we keep the current 5-tab nav or collapse to 4? (Plan recommends 4.)
2. Should budget live in the feed card or remain a tab? (Plan: feed card + accessible from profile.)
3. Do we want a custom illustration set, or Lucide-only for launch? (Plan: Lucide-only, custom later.)
4. Light mode: ship dark-only first, or keep light override from day one? (Plan: keep light override via `prefers-color-scheme`.)
5. Logo concept: approve the neon geometric family glyph direction, or do you have another metaphor in mind?

