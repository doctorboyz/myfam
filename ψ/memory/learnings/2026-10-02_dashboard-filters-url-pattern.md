# Dashboard filters as URL params — pure helper pattern

**Date**: 2026-10-02
**Project**: myfam
**Context**: Dashboard UX upgrade (tabs, drill-down links, refresh-proof filters)

## The lesson

Making dashboard filters survive refresh and powering cross-page links (uncategorized chip, category drill-down, "ดูทั้งหมด") needs only one pure module — `filtersToParams` / `paramsToFilters` in `src/lib/filters-url.ts` — not component-level plumbing.

Three details that made it work cleanly:

1. **Dates round-trip as Bangkok `YYYY-MM-DD`** via `getBangkokDateString`, parsed with `new Date(...)` — same pattern the existing date-input handler uses, and `getFilteredTransactions` normalizes with `setHours()`. No new timezone math.
2. **An explicit "all" range needs a marker.** `{start: null, end: null}` is indistinguishable from "no params", so serialize it as `range=all` — otherwise a "ทั้งหมด" filter silently reverts to the default month on refresh.
3. **Reuse existing pseudo-IDs.** The uncategorized drill-down is just `?categories=__none__` (`UNCATEGORIZED_FILTER`) — the filter engine already understands it; no API or state changes.

Also: recharts accepts `var(--token)` strings for fills/strokes (they land in SVG presentation attributes, which modern browsers resolve against CSS vars) — one `--chart-*` token set + one dark-mode override themes every chart instead of per-chart hex.

## Why it matters

Any filterable page in a PWA benefits: links from summary tiles/chips land the target page pre-filtered, refresh and back-nav keep state, and the cost is ~60 lines of pure, testable code instead of framework machinery.