---
name: dashboard-filter-overflow-lesson
description: Overflow in UI controls may signal duplication, not just layout breakage
metadata:
  type: feedback
---

When fixing UI overflow, check for duplicate controls before adding breakpoints or shrinking elements.

In the MyFam dashboard, the date filter overflowed because it contained `เดือนนี้ / เดือนที่แล้ว / ปีนี้ / ทั้งหมด` presets *and* start/end inputs, while the page already had a month nav (`‹ เดือน › เดือนนี้`) serving the same purpose. Removing the presets solved the overflow more cleanly than any CSS tweak.

**Why**: duplicated controls force more content into the same space and compete for the user's mental model.

**How to apply**:
1. When a component overflows, list all controls in the same surface.
2. Identify controls that serve the same user goal.
3. Remove or merge duplicates, then fix any remaining layout with CSS.
4. Order remaining controls by priority; date/global filters should usually come first.
5. Verify visually at the target viewport — build/test/typecheck are not enough for UI work.
