# MyFam Learning Index

## Source
- **Origin**: ./origin/
- **GitHub**: https://github.com/doctorboyz/myfam

## Explorations

### 2026-05-14 0846 (default — 3 agents)
- [[2026-05-14/0846_ARCHITECTURE|Architecture]]
- [[2026-05-14/0846_CODE-SNIPPETS|Code Snippets]]
- [[2026-05-14/0846_QUICK-REFERENCE|Quick Reference]]

### 2026-05-14 1614 (deep — 6 agents)
- [[2026-05-14/1614_ARCHITECTURE|Architecture]]
- [[2026-05-14/1614_CODE-SNIPPETS|Code Snippets]]
- [[2026-05-14/1614_QUICK-REFERENCE|Quick Reference]]
- [[2026-05-14/1614_TESTING|Testing]]
- [[2026-05-14/1614_API-SURFACE|API Surface]]
- [[2026-05-14/1614_UXUI-REFERENCE|UX/UI Reference]]

**Key insights**:
1. **Zero testing infrastructure** — no jest, vitest, playwright, or cypress. CI job "Lint and Test" only runs lint.
2. **UX/UI critical defects**: `alert()`/`confirm()` native dialogs, no focus trap/ESC-to-close in Modal, touch targets below 44px (profile edit 32px, tag actions 32px), primary button contrast fails WCAG AA (~3.2:1)
3. **AI pipeline complete**: Ollama qwen3.5:cloud for Thai NLP intent detection, slip OCR, transaction extraction with confidence scoring, category fuzzy matching, account selection quick reply
4. **LINE integration**: Two-phase messaging (fast reply + async push), invite code system (8-char hex, 24h expiry, rate-limited), LIFF auto-create user/family on first login
5. **Database**: 14 Prisma models with soft-delete + audit trail, cron purge for records >7 days old
