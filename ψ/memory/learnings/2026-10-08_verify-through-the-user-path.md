---
name: verify-through-the-user-path
description: SQL-level and bot-level correctness are different claims — verify bot behavior through the sandbox route (key = TELEGRAM_WEBHOOK_SECRET) before calling a data change done
metadata:
  type: feedback
---

Verifying data only against the DB proves storage correctness, not user-facing correctness. The Telegram sandbox route (`POST /api/telegram/sandbox?key=<TELEGRAM_WEBHOOK_SECRET>`, body `{"type":"text","userId":"<id>","text":"…"}`) exercises the full dispatch → command → query path and returns the exact replies users see.

**Why:** twice in one session (2026-10-08) this layering paid off — the Lita import displayed correct Bangkok times only provable via the app's formatter path, and the bare `ยอด`/`รายการ` command gap (ISSUE-029) existed only in the bot path, invisible to SQL checks. The gap contradicted docs and had shipped who-knows-how-long.

**How to apply:** after any data or bot-logic change, run at least one sandbox command (`ดูยอด`, `รายการล่าสุด`, `สรุป`) as the affected user and eyeball the reply. Note: the sandbox key is the same `TELEGRAM_WEBHOOK_SECRET` from `.env` — don't invent a `TELEGRAM_SANDBOX_KEY`. Related: [[exact-match-for-short-command-keywords]].