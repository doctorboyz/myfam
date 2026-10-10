# Lesson Learned: seed ≠ production DB state — query the DB before assuming code is wrong

**Date**: 2026-07-26
**Source**: retro `2026-07/26/16.04_liff-to-webapp-pivot.md`
**Tags**: auth, debugging, database, assumptions, login

## The Lesson

When debugging an auth (or any data-dependent) failure, **the seed file is not evidence about the running database**. A seed script describes the *intended* initial state, not the *actual* state. They drift the moment someone runs the app without re-seeding, or applies a manual fix, or the schema changes without a re-seed.

In the MyFam pivot, the user reported "cannot login with boyz 4444". I initially treated it as a code problem (the new login page, bcrypt, cookie). The real cause was:

1. The DB had LIFF-era `User` rows with `password IS NULL` — the old LIFF flow created users without passwords, and the seed (which sets bcrypt passwords) was never re-run against this environment.
2. The username in the DB was `DoctorBoyz`, not `boyz` — the seed said `boyz`, but production had an older value.

I only discovered both by querying the DB directly (`docker exec myfam-db psql ... SELECT name, password IS NULL FROM "User"`). Had I checked DB state first, the debug cycle would have been one query instead of a code review + dev-server restart + 500 investigation.

## How to apply

- **For auth/login bugs**: before reading any auth code, run one query against the live DB — `SELECT identifier_column, credential_column IS NULL, count(*) FROM users`. Two seconds, and it rules out the most common cause (missing/NULL credentials from an older flow).
- **Don't trust seed files as documentation of current state.** They document *intent*. The DB is the source of truth.
- **When a feature was recently pivot-rewritten** (e.g. login method changed from OAuth to password), the DB almost certainly has rows created under the *old* method that don't satisfy the *new* method's assumptions. Backfill or check — don't assume.
- **Symptom → cause shortcut**: "login fails with valid-looking credentials" → check (a) credential column populated? (b) identifier matches what the user typed? (c) hash algorithm consistent? — *in the DB*, not in the code, first.

## The uncomfortable part

I told the user "the code is fine, it was a stale dev server" — true for the 500, but I let that satisfying diagnosis paper over the fact that **login would have failed anyway** because the DB had no passwords and production was a stale image. The code being fine didn't make the user able to log in. The fix was SQL, not TypeScript.

Related: [[stale-dev-server-deleted-modules-500]] (companion lesson about the dev-server cache side of this session).