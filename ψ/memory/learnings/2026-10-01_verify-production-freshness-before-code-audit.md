---
date: 2026-10-01
slug: verify-production-freshness-before-code-audit
---

# Verify production freshness before auditing code paths

**Context**: myfam, 2026-10-01. User reported the Telegram confirm step had no
quick-reply buttons. The codebase had `confirmKeyboard()` wired end-to-end
(keyboards.ts → handlers → client.ts → Telegram API). An hour went into
tracing phantom bugs before the simple truth: **production hadn't been rebuilt
in ~5 months** — 28 commits sat unpushed and the container ran old code.

**Lesson**:
1. When a user reports a feature missing that the code clearly has, the FIRST
   check is deployment freshness, not another code path. For this repo:
   `docker logs myfam-app`, `docker ps` (OrbStack = production), or ask when the
   container was last built.
2. Infra in config files can be a lie: `.github/workflows/deploy.yml` describes
   an SSH deploy, but `gh run list` shows every run since Feb 2026 failed with
   "missing server host" (no SSH secrets). Actual deploy = local
   `docker-compose build && docker-compose up -d`; migrations run at boot via
   entrypoint.sh (`prisma migrate deploy` — check `_prisma_migrations` first).
3. Because the only CI gate is dead, nothing enforces lint/tsc/push — local
   verification (tsc + vitest + manual rebuild) IS the release gate.

**Action**: before diagnosing "missing feature" reports —
`git log origin/main..HEAD --oneline | wc -l` + `docker ps` + `gh run list`.

Related: [[data-fix-script-pattern-dryrun-backup-apply]]