# Role-based behavior needs at least one test per role — and helpers must be audited for bypass

**Date**: 2026-09-30 · **Session**: 5a76a5db · **Project**: myfam

The Telegram bot shipped claiming a "full feature set" with role-based scoping
("parent sees family-wide data, children see their own") — but ดูยอด hardcoded
`ownerId` and silently hid children's balances from parents. The gap survived
because:

1. **All verification ran as one role.** Every sandbox pipeline test used a
   child account. Parent-specific behavior had zero test coverage — the bug
   only surfaced when the user asked "can a parent still check children's
   data?"
2. **A policy helper existed but wasn't universal.** `getDataScope` encoded
   the policy; `handleBalanceQuery` bypassed it with a raw filter. Nobody
   grepped for query paths that skipped the helper.

**Rules going forward:**

- Role-based behavior (parent/admin vs regular user) needs at least one test
  per role, including the negative case (the restricted role must NOT see the
  expanded data — scope-leak test).
- When a shared helper encodes a policy, grep all call sites for code that
  bypasses it before declaring the feature done. A policy that isn't enforced
  at every entry point is a policy that doesn't exist.
- For user-facing report/display formats, show a short mock preview before
  implementing — format is a preference, not a technical decision. Guessing
  it costs a wasted build+deploy cycle.

Evidence: commits `f2bee5d` (scope fix), `1ae2244` (per-person format after
guessing wrong the first time); tests in `src/lib/bot/queries.test.ts`
(parent scope + child-scope-unchanged pairs); retro 2026-09/30/07.45.