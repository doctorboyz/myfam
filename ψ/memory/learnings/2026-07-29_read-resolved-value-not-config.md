# Lesson: Read the resolved runtime value, not the config files

**Date**: 2026-07-29
**Source**: myfam deploy — P1000 auth failure + migration P3009

## Situation

Two failures in one session, both from reasoning about config files instead of the running system:

1. **Prisma P1000 (auth failed)**: I reset the DB password to the `.env` value (`88888888`), restarted, and it still failed. The container was actually getting `s45dev` because a shell env var `POSTGRES_PASSWORD` overrode `.env` (compose prefers shell env). I didn't know the override existed until I inspected the container's resolved env.

2. **Migration P3009 (failed migration)**: I wrote `ALTER TABLE "users"` assuming Prisma's snake_case convention. The `User` model has no `@@map`, so the table is literally `"User"` (PascalCase, quoted). The migration failed on first apply.

## Lesson

When something is env- or schema-driven and the behavior surprises you, **stop reasoning from source files and read the resolved runtime state**:

- Env truth: `docker inspect <container> --format '{{.Config.Env}}'` and `docker compose config` (shows interpolated values).
- Schema/DB truth: `\dt` in psql, or grep `@@map` in `schema.prisma`. Prisma table names are snake_case **only when `@@map` says so** — never assume.
- For unremovable env overrides (e.g. a shell var sourced from an unfindable place), neutralize by **value-alignment** (make `.env` and the override agree) rather than hunting the source.

## How to apply

Before writing migration DDL: run `\dt` or read `@@map` for the exact table name.
Before declaring an env fix done: `docker compose config | grep <VAR>` to see the *resolved* value, not the file value.
When a password/auth mismatch recurs after a "fix": inspect the container's actual env, don't re-read `.env`.

## Related

- [[postgres-password-shell-override]] — the specific override that caused the P1009/P1000 here.