---
name: gen-alpha-deploy-lessons
description: Lessons from deploying the Gen Alpha UI redesign across PWA and Telegram Mini App.
metadata:
  type: project
---

# Gen Alpha UI Redesign + Deploy Lessons

## What Worked

- **Phase-based delivery.** Splitting a large UI redesign into 4 phases (tokens/dashboard, core screens, settings/profile, motion/haptics) kept each commit reviewable and each build green. It also matched the user's decision rhythm.
- **Dark-first token system.** Defining CSS custom properties once in `src/app/globals.css` prevented color drift across 8+ screens. Semantic tokens (`--color-bg`, `--color-surface`, `--color-text`, `--color-primary`, `--color-danger`) are the right abstraction for a redesign of this size.
- **Centralized Telegram types.** Putting `Window.Telegram` and `WebApp` types in `src/types/telegram.d.ts` eliminated duplicate declaration errors as more screens adopted TMA features.

## Friction Points

- **Context compaction removed intermediate verification.** I did not re-run `tsc`/`test` in the final deploy session; I relied on the prior session's build verification plus a smoke test.
- **Untracked file debt grew.** The working tree accumulated design docs, scripts, graphify output, and model data that were not committed or ignored.
- **No visual validation.** "Cool TikTok feeling" is subjective; we did not run Lighthouse or visual regression after deploy.

## How to Apply

- For large visual redesigns, always schedule a verification phase: screenshots at key breakpoints + Lighthouse mobile audit + real-device/TMA check.
- After a multi-phase feature ships, do a 10-minute cleanup pass on untracked files before closing the task.
- Maintain a single source of truth for third-party SDK types from the start; do not let them sprawl across components.

Related: [[fammee-oracle-identity]], [[myfam-deploy-is-local-orbstack]]
