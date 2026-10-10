# MyFam Learnings — May 2026 Summary

Consolidated from 14 individual daily learnings files (2026-05-09 through 2026-05-28).

---

## LINE Bot & AI Pipeline

**[2026-05-09] LINE Bot Integration**
- LINE webhook requires GET handler for console verification. Reply tokens expire in 30s — always use reply+push pattern. Fuzzy command matching (removing `^...$` anchors) handles Thai typos like "ดูยอ" instead of "ดูยอด". Never copy secrets manually — verify byte-for-byte with `wc -c` to prevent truncation errors.

**[2026-05-09] LIFF Redesign Reference**
- Comprehensive design system for LIFF-native look: LINE Green (`#06C755`) replaces Apple Blue as primary, Sarabun font for Thai body text with Inter for numbers, 9px labels throughout. LIFF mode hides TopBar (LINE provides its own), removes max-width constraint, adds safe-area handling. Eight conflicts between current codebase and LIFF requirements documented with precise fix code.

**[2026-05-16] Intent Router: Example-Driven AI Response Pipeline**
- Prompt engineering as editable `.md` files, not code strings. Intent routing flow: detectCommand -> detectIntent -> load intent/*.md -> Prisma query -> ollamaGenerate + session memory -> response. Query logic stays in code (never AI-generated SQL); only response formatting uses LLM. Session memory uses 5-cycle sliding window per user in Map. 38/39 tests passing, Ollama Max cloud averages ~53s per call.

**[2026-05-22] Intent-First Pipeline Gap Fixing**
- When fixing pipeline gaps in intent-driven chatbot, start with intent-level solutions before schema changes. Query enhancement > intent addition > prompt enrichment > schema migration. `parseRelativeDateRange()` uses regex (not AI) for Thai date patterns — faster and deterministic. Budgets-as-goals and tags-as-recurring are valid MVPs.

---

## LIFF & Frontend

**[2026-05-12] LIFF Font Size Debugging**
- Built `/debug/ui` comparison page for systematic font size testing inside LIFF WebView. Final choice: 9px for all secondary labels. Added `text-size-adjust: 100%` to prevent WebView auto-zoom. Uniform font sizes are simpler than dynamic shrinking and work better across all components.

**[2026-05-14] Many-to-Many Alias Pattern + LIFF Auth Guard**
- `UserAlias(ownerId, targetId, alias)` with composite unique key gives per-viewer display names. Self-view uses LINE name, others-view uses alias then canonical name. Critical bug: LiffContext auto-auth must NOT run on `/link` page (`!isLinkPage` guard) or it creates duplicate accounts before invite processing. Never overwrite canonical `User.name` from LINE profile — use `LineLink.displayName`.

---

## Bug Fixes & Patterns

**[2026-05-13] Budget Model Unification & LINE Bot Menu**
- Unified 3 purposes (spending/savings/reward) into single Budget model with `purpose` enum reduces schema but increases business logic complexity. LINE Quick Reply `type: 'uri'` is better than text command for opening LIFF — no message quota consumed. CSS `calc()` reference point matters — check whether measuring from screen edge or element edge.

**[2026-05-15] Initial Account Balance Should Use Reconciliation**
- Frontend hardcoded `balance: 0` in FinanceContext, silently discarding user input. Fix: create account with `balance: 0` then create Reconciliation record in Prisma `$transaction`. Every balance change must have audit trail. Installed vitest, 17 passing tests across 3 API routes. Rate limiters need test isolation (module-level Map breaks parallel tests).

**[2026-05-21] Edit Tool: Append vs Replace**
- When adding code alongside existing code, read surrounding context first. Replacing `menuQuickReply` with `unlinkedQuickReply` instead of appending deleted a constant referenced 58 times (56 TypeScript errors). Use Edit to insert between two lines, not replace one.

**[2026-05-25] Duplicate Rendering Creates Blind Spots**
- Before fixing UI, grep for ALL usages of the pattern. `categories/page.tsx` had its own inline transaction rendering separate from `TransactionList`. Fixing only one component left the bug visible on the page the user was actually looking at.

**[2026-05-27] Init-vs-Refresh Asymmetry: Balance String Bug**
- `fetchAccounts()` was missing `Number(acc.balance)` in its `.map()` that the initial fetch had. Prisma Decimal serialized as string caused JavaScript concatenation instead of arithmetic. Pattern: values correct at startup, wrong after refresh -> compare init vs refresh code.

**[2026-05-27] Form State Before Intent Detection**
- Multi-turn forms should short-circuit the AI pipeline: check `getFormState()` before `detectIntent()`. Form responses like "500" or "ออมสิน" would be misclassified as `create_transaction` or `help` by LLM. Use deterministic keyword matching for form steps, save LLM for initial intent detection only.

**[2026-05-28] Grep All Usages Before Fixing Reused Components**
- TransactionDetailModal used in 4 pages, 3 hardcoded `isOwner={true}`. Account mappings happen in 3 places in FinanceContext. Fixing only the location user pointed to means incomplete fix. Multiple deploys for the same fix wastes time.

**[2026-05-28] LIFF Cookie Bridge Pattern for Invite Links**
- LIFF opens endpoint URL as-is — no path segments or query params forwarded. Solution: regular URL `/link/CODE` -> middleware sets `pending_invite` cookie -> redirect to LIFF -> middleware reads cookie -> redirect to `/link?code=CODE`. SameSite=Lax cookie, 5-min TTL. Both requests hit same domain so cookies forwarded.
