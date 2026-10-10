# Deploy verification must mirror production conditions — timezone AND dimensions

**Date**: 2026-09-30 · **Session**: 5a76a5db · **Project**: myfam

Two production bugs survived a 96/96-green test suite during the Telegram bot
deploy, and both existed because my verification ran under conditions that were
not production's conditions:

1. **Timezone**: `validateExtracted` compared Bangkok calendar dates against
   container-local `new Date()`. Tests ran on a Bangkok-TZ host, so they passed;
   the container runs UTC, so between 00:00–07:00 Bangkok every transaction was
   rejected as future-dated. Deploy happened at 05:55 Bangkok — pure luck to
   land inside the bug window. Fix + durable pattern: compare date *strings*
   against `getBangkokDateString()`, and write the causal test with
   `process.env.TZ = 'UTC'` + `vi.setSystemTime()` inside the failure window.

2. **Verification dimensions**: the slip-model benchmark asserted JSON validity
   and amounts — never dates. gemma4:31b passed Thai Buddhist-era (พ.ศ.) years
   through (e.g. 2033/2569 instead of 2026), and every slip was rejected as
   future-dated. The user chose the model based on my incomplete benchmark.

**Rules going forward:**

- Time-dependent logic is only tested when the test runs in the production
  timezone (or TZ is explicitly shifted).
- A benchmark must assert **every field the pipeline consumes** — or state
  explicitly in its report which fields were NOT verified.
- Thai OCR/vision dates need a พ.ศ. guard: years ≥2400 → subtract 543.
- AI model catalogs are mutable infra — probe configured models at deploy
  time, the same way we run `prisma migrate deploy`.

Evidence: commits `95936b8`, `95128da`; causal tests in
`src/lib/bot/extract.test.ts`; retro 2026-09/30/07.30.