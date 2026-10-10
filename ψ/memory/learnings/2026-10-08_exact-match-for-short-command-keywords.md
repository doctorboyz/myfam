---
name: exact-match-for-short-command-keywords
description: When adding a bot command keyword that is a substring of other commands, use exact match (q === 'ยอด') above fuzzy regexes — never a regex alternative
metadata:
  type: feedback
---

Thai command detection (`src/lib/bot/commands.ts`) mixes exact matches (keyboard buttons) with fuzzy regexes. When a new short keyword is a **substring of an existing longer command** — "ยอด" ⊂ "ปรับยอด"/"แก้ยอด", "รายการ" ⊂ "ลบรายการล่าสุด" — adding it to the fuzzy regex silently shadows the longer command (e.g. "ปรับยอดกสิกรเป็น 5000" would become `balance` instead of `reconcile`).

**Why:** ISSUE-029 (2026-10-08) — docs promised bare `ยอด`/`รายการ` worked, but the regexes only matched compound phrases; bare keywords fell through to AI extraction. The fix was two exact-match lines above the fuzzy section, with anti-shadow test assertions.

**How to apply:** `if (q === '<keyword>') return '<command>';` in the exact-match section, plus a test block asserting both the bare keyword AND the compound commands that contain it. Related: [[verify-through-the-user-path]].