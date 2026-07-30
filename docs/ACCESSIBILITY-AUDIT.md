# Accessibility Audit — KubeStellar Console

**Date:** July 2025
**Standard:** WCAG 2.1 Level AA
**Scope:** `web/src/` frontend React/TypeScript codebase
**Related Issue:** [#4072 — CNCF Incubation Readiness Tracker](https://github.com/kubestellar/console/issues/4072)

---

## Executive Summary

This audit evaluates the KubeStellar Console frontend against WCAG 2.1 AA criteria.
The application already demonstrates several strong accessibility practices — semantic
landmarks, focus traps in modals, live regions for dynamic content, and a skip-to-content
link. The findings below identify areas that still need remediation.

### Scorecard

| Area | Status |
|------|--------|
| Document language (`lang`) | ✅ Pass |
| Viewport meta tag | ✅ Pass |
| Skip-to-content link | ✅ Pass |
| Landmark regions (`<main>`, `<nav>`, `<aside>`) | ✅ Pass |
| Modal focus traps | ✅ Pass |
| Live regions for toasts / loading | ✅ Pass |
| Keyboard navigation (menus, dropdowns) | ✅ Pass |
| Icon-only button labels | ❌ Needs work |
| Clickable non-interactive elements | ❌ Needs work |
| Table semantics (`scope`, `<caption>`) | ❌ Needs work |
| Color contrast (hardcoded values) | ⚠️ Needs review |
| Heading hierarchy | ⚠️ Needs review |

---

## Critical Findings

Issues that block keyboard-only or screen-reader users from completing tasks.

### C-1 Icon-only pagination buttons lack `aria-label`

**WCAG:** 4.1.2 Name, Role, Value
**Status:** ✅ Fixed in this PR

| File | Lines |
|------|-------|
| `web/src/lib/unified/card/visualizations/ListVisualization.tsx` | 200–215 |
| `web/src/lib/unified/card/visualizations/TableVisualization.tsx` | 212–227 |

Pagination buttons contain only `<ChevronLeft />` / `<ChevronRight />` icons with no
accessible name. Screen readers announce them as unlabelled buttons.

**Remediation:** Added `aria-label="Previous page"` / `aria-label="Next page"`.

### C-2 Clickable table rows missing keyboard access

**WCAG:** 2.1.1 Keyboard
**Status:** ✅ Fixed in this PR

| File | Line |
|------|------|
| `web/src/components/compliance/RiskRegisterDashboard.tsx` | 243 |

`<tr>` elements with `onClick` handlers lack `role`, `tabIndex`, and `onKeyDown`,
making them unreachable via keyboard.

**Remediation:** Added `tabIndex={0}`, `role="row"` (existing semantic), and
`onKeyDown` handler for Enter/Space activation.

### C-3 Clickable stat blocks missing keyboard access

**WCAG:** 2.1.1 Keyboard
**Status:** ✅ Fixed in this PR

| File | Line |
|------|------|
| `web/src/components/ui/StatsOverview.tsx` | 232–240 |

When `isClickable` is true, the `<div>` receives `onClick` but no `role="button"`,
`tabIndex={0}`, or `onKeyDown` handler.

**Remediation:** Added conditional keyboard attributes when the stat block is clickable.

### C-4 Clickable list rows missing keyboard access

**WCAG:** 2.1.1 Keyboard
**Status:** ✅ Fixed in this PR

| File | Line |
|------|------|
| `web/src/lib/unified/card/visualizations/ListVisualization.tsx` | 293–299 |

Row `<div>` elements with conditional `onClick` lack keyboard support.

**Remediation:** Added conditional `role="button"`, `tabIndex={0}`, and `onKeyDown`.

---

## Major Findings

Issues that significantly degrade the experience for assistive technology users.

### M-1 Table headers lack `scope` attribute

**WCAG:** 1.3.1 Info and Relationships

All `<th>` elements across the codebase (50+ tables) are missing `scope="col"` or
`scope="row"`. Screen readers cannot determine header–cell relationships.

**Files affected (sample):**
- `web/src/components/charts/DataTable.tsx`
- `web/src/components/cards/ClusterComparison.tsx`
- `web/src/components/compliance/RiskRegisterDashboard.tsx`
- `web/src/components/compliance/RiskMatrixDashboard.tsx`
- `web/src/components/compliance/SIEMDashboard.tsx`

**Recommended fix:** Add `scope="col"` to column headers, `scope="row"` to row headers.

### M-2 No `<caption>` on data tables

**WCAG:** 1.3.1 Info and Relationships

Zero `<caption>` elements found. Tables lack programmatic descriptions, forcing
screen-reader users to infer purpose from surrounding context.

**Recommended fix:** Add `<caption className="sr-only">` with a concise table
description, or use `aria-label` / `aria-labelledby` on the `<table>` element.

### M-3 Inline SVG icons missing `aria-hidden`

**WCAG:** 4.1.2 Name, Role, Value

Decorative SVG elements in `web/src/components/events/Events.tsx` (lines 73–84) and
elsewhere lack `aria-hidden="true"`, causing screen readers to announce meaningless
path data.

**Recommended fix:** Add `aria-hidden="true"` to all decorative SVGs, or
`role="img"` with `aria-label` to meaningful ones.

### M-4 Icon-only links lack accessible names

**WCAG:** 2.4.4 Link Purpose

Links containing only icons or colored dots (no visible text) are missing `aria-label`:

| File | Line |
|------|------|
| `web/src/components/cards/pipelines/NightlyReleasePulse.tsx` | 121, 138, 252, 380 |
| `web/src/components/cards/ACMMRecommendations.tsx` | 198 |
| `web/src/components/cards/llmd/NightlyE2EStatus.tsx` | 290, 706 |

**Recommended fix:** Add `aria-label` describing the link destination/action.

### M-5 Form inputs without associated labels

**WCAG:** 1.3.1 Info and Relationships, 4.1.2 Name, Role, Value

| File | Line | Element |
|------|------|---------|
| `web/src/lib/unified/card/visualizations/ListVisualization.tsx` | 132 | Sort `<select>` |
| `web/src/lib/cards/CardComponents.tsx` | 246 | Search `<input>` |

Placeholder text alone is not a substitute for a `<label>` or `aria-label`.

**Recommended fix:** Add `aria-label` to each input, or associate a visible/sr-only
`<label>`.

### M-6 Clickable `<tr>` in DrasiResultsTable missing keyboard support

**WCAG:** 2.1.1 Keyboard

| File | Line |
|------|------|
| `web/src/components/cards/drasi/DrasiResultsTable.tsx` | 161 |

Same pattern as C-2 — `<tr onClick>` without `tabIndex` or `onKeyDown`.

**Recommended fix:** Add `tabIndex={0}` and `onKeyDown` handler for Enter/Space.

---

## Minor Findings

Issues that reduce usability but do not fully block task completion.

### m-1 Heading hierarchy gaps

**WCAG:** 1.3.1 Info and Relationships

Several pages jump heading levels (e.g., `<h3>` without a preceding `<h2>`, `<h4>`
without `<h3>`):

| File | Lines | Issue |
|------|-------|-------|
| `web/src/pages/FromHeadlamp.tsx` | 308, 353 | `<h3>` / `<h4>` without parent levels |
| `web/src/components/compliance/AirGapDashboard.tsx` | 227, 257, 288 | Orphaned `<h3>` |
| `web/src/components/alerts/AlertRuleEditor.tsx` | 344, 568, 762 | `<h4>` without `<h3>` |

**Recommended fix:** Restructure headings to maintain sequential order, or use
`aria-level` when visual design requires a different size.

### m-2 Hardcoded color values in widget code generator

**WCAG:** 1.4.3 Contrast (Minimum)

`web/src/lib/widgets/codeGenerator.ts` uses inline hex colors (`#9ca3af`, `#64748b`,
`#4b5563`) that may fail the 4.5:1 contrast ratio against dark backgrounds.

**Recommended fix:** Replace with design tokens or Tailwind classes that respect the
theme system.

### m-3 `disabled:opacity-50` on already-muted text

**WCAG:** 1.4.3 Contrast (Minimum)

212+ files apply `disabled:opacity-50` to elements using `text-muted-foreground`. The
compounded opacity reduction can push contrast well below 4.5:1.

**Recommended fix:** Use explicit disabled-state colors (e.g., `disabled:text-gray-500`)
instead of opacity reduction.

### m-4 Color-only status indicators

**WCAG:** 1.4.1 Use of Color

Status indicators in `web/src/lib/widgets/codeGenerator.ts` (line 231) use red/green
coloring as the sole differentiator between failing/passing states.

**Recommended fix:** Add text labels, icons, or patterns alongside color to convey
status.

### m-5 Generic alt text on images

**WCAG:** 1.1.1 Non-text Content

`web/src/components/dashboard/cardFactoryTemplatesT2.ts` (line 343) uses `alt="Card image"`
instead of a descriptive alternative.

**Recommended fix:** Use context-specific alt text describing the image content.

### m-6 `aria-modal` conditionally set on AlertBadge dialog

**WCAG:** 4.1.2 Name, Role, Value

`web/src/components/ui/AlertBadge.tsx` (line 271) sets `aria-modal={isMobile}`.
Dialogs should always declare `aria-modal="true"` when they have a backdrop.

**Recommended fix:** Set `aria-modal="true"` unconditionally when the component
renders as a dialog with an overlay.

---

## What's Already Working Well

These patterns should be preserved and extended to new components:

1. **Skip-to-content link** — `Layout.tsx` (line 387–392)
2. **Semantic landmarks** — `<main id="main-content">`, `<nav>`, `<aside>` in Layout and Sidebar
3. **Modal focus traps** — `useModalFocusTrap` hook in `lib/modals/useModalNavigation.ts`
4. **Keyboard navigation** — Arrow keys in menus, dropdowns, and modal tabs
5. **Live regions** — `role="status"` and `aria-live` on Toast, RefreshIndicator, CardWrapper
6. **Focus indicators** — `focus-visible:ring` used consistently (256 instances) as replacement for outline
7. **Accessible status component** — `components/ui/AccessibleStatus.tsx` with `role="status"`
8. **Conditional keyboard attributes** — `CardComponents.tsx` (line 510) properly adds `role`, `tabIndex`, `onKeyDown` when elements are clickable

---

## Recommended Remediation Roadmap

| Priority | Items | Effort |
|----------|-------|--------|
| **P0 — Ship blocker** | C-1 through C-4 (fixed in this PR) | Done |
| **P1 — Next sprint** | M-1, M-2 (table scope/caption), M-3 (SVG aria-hidden), M-5 (form labels) | ~2 days |
| **P2 — Backlog** | M-4, M-6, m-1 through m-6 | ~3 days |
| **P3 — Ongoing** | Automated axe-core / Playwright a11y checks in CI | ~1 day setup |

### Suggested CI Integration

Add an automated accessibility check to the CI pipeline:

```bash
npx playwright test --grep "accessibility"
# or
npx @axe-core/cli http://localhost:5174 --tags wcag2a,wcag2aa
```

This prevents new WCAG regressions from landing in main.
