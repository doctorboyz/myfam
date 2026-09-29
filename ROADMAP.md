# Roadmap

## Current Phase: Active Development (Phase 1 — Core Features)

Last updated: 2026-09-29

## Completed

- [x] Web app with account + transaction CRUD
- [x] LINE LIFF authentication (retired 2026-09-29 — replaced by username/password + Telegram bot)
- [x] LINE chat bot with AI intent routing (10 intents) (retired — ported to Telegram)
- [x] OCR slip upload (Thai + English)
- [x] Dashboard with charts and filters
- [x] Family member management with invite flow
- [x] Category management (custom groups + subcategories)
- [x] Budget jar system (6-jars + 3-mini-jars)
- [x] Account reconciliation (ปรับยอด)
- [x] Transaction tags
- [x] Soft delete / trash system
- [x] Docker deployment with health checks
- [x] Session memory for multi-step bot flows
- [x] Telegram bot migration (2026-09-29): record/balance/slip/summary/reconcile flows, /start link-code binding, soft-delete scope, DB-backed BotSession, ack-then-process webhook, gemma4:31b slip vision (benchmarked)

## In Progress

- [ ] Consolidate duplicate rendering (TransactionList vs categories/page.tsx)

## Planned (Next)

- [ ] Push notifications (Telegram bill reminders, budget alerts)
- [ ] Recurring transactions (monthly bills, subscriptions)
- [ ] Multi-family support (user can belong to multiple families)
- [ ] Export to CSV/PDF
- [ ] PWA offline support
- [ ] Telegram bot: "add transaction by voice note" (speech-to-text)

## Phase 2: Polish & Growth

- [ ] E2E test suite with Playwright
- [ ] Automated test coverage ≥80%
- [ ] Performance optimization (bundle size, query optimization)
- [ ] Accessibility audit (WCAG AA)
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Production monitoring and alerting

## Phase 3: Platform

- [ ] Mobile PWA with offline mode
- [ ] Multi-language support (EN/TH full coverage)
- [ ] API documentation for potential integrations
- [ ] Data import from bank statements / other apps
