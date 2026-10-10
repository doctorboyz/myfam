---
name: myfam-db-access-conventions
description: psql access to myfam Postgres — role, container, quoted PascalCase table names, snake_case columns, naive date semantics
metadata:
  type: project
---

Direct DB access for MyFam (OrbStack local):

```bash
docker exec myfam-db psql -U myfam -d myfam        # role "postgres" does NOT exist
```

- Tables are **PascalCase and must be double-quoted**: `"Account"`, `"Transaction"`, `"Reconciliation"` (Prisma @@map kept table names; the lowercase `account`/`transaction` relations do not exist — I hit this error twice, hence this note).
- Columns are **snake_case**: `created_by_id`, `owner_id`, `to_account_id`, `deleted_at` — but Prisma field names are camelCase (`createdById`).
- `date` on Transaction is a **naive timestamp**; app stores date-only values at midnight-Bangkok (e.g. a "12 Aug" tx is stored as `2026-08-11 17:00` UTC = `2026-08-12 00:00` BKK). Comparing with `t.date >= '2026-09-12'` in SQL compares naive-to-naive and includes those rows correctly.
- Amounts are `numeric(38,18)` — display is verbose; use `sum()` and `count(*)` rather than eyeballing raw values.
- `DATABASE_URL` in `.env` is `postgresql://myfam:***@localhost:5433/myfam` — scripts need it passed explicitly (`DATABASE_URL="$(grep -E '^DATABASE_URL' .env | cut -d= -f2-)"`) because the shell env may override. Related: [[check-balance-freshness-before-historical-import]].