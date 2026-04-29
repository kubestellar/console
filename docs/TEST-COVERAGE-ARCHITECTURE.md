# Test Coverage Architecture — KubeStellar Console

> Reference document for the **AI-Driven Test Coverage Architect** LFX mentorship
> ([#4189](https://github.com/kubestellar/console/issues/4189)).
> It describes the current test infrastructure, how coverage is measured,
> known gaps, and how mentees (or any contributor) can improve coverage.

---

## Table of Contents

1. [Current Test Infrastructure](#current-test-infrastructure)
2. [Coverage Tracking Methodology](#coverage-tracking-methodology)
3. [Coverage Gaps and Improvement Opportunities](#coverage-gaps-and-improvement-opportunities)
4. [AI-Driven Test Generation Approach](#ai-driven-test-generation-approach)
5. [Mentee Onboarding Guide](#mentee-onboarding-guide)

---

## Current Test Infrastructure

### Unit / Component Tests — Vitest

| Aspect | Detail |
|--------|--------|
| Runner | [Vitest](https://vitest.dev/) v4 with `@vitejs/plugin-react` |
| Coverage | `@vitest/coverage-v8` (V8 native instrumentation) |
| Libraries | `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom` |
| Config | `web/vite.config.ts` → `test` section |
| Run | `cd web && npm test` (watch) or `npm run test:coverage` (single run with coverage) |
| Sharding | CI runs 12 parallel shards (`--shard=N/12`) to fit in 7 GB runner memory |

Unit tests live in `web/src/test/` and cover:

- **Card loading standards** — every card component follows the `useCache` → `useCardLoadingState` contract
- **Card factory validation** — card registry integrity
- **API contract tests** — backend response shapes
- **Auth contract tests** — JWT flow assertions
- **UI/UX standards** — no magic numbers, concurrent mutation safety
- **Route smoke tests** — every route mounts without error
- **E2E assertion audit** — meta-test ensuring E2E specs contain real assertions

### E2E Tests — Playwright

| Aspect | Detail |
|--------|--------|
| Runner | [Playwright](https://playwright.dev/) v1.59+ |
| Browsers | Chromium, Firefox, WebKit |
| Spec count | ~95 spec files across multiple suites |
| Base URL | `http://localhost:5174` (frontend) / `http://localhost:8080` (backend) |

E2E tests are organized into purpose-specific directories:

```
web/e2e/
├── compliance/          # Automated compliance audits
│   ├── a11y-compliance.spec.ts        # WCAG accessibility checks (axe-core)
│   ├── card-cache-compliance.spec.ts  # IndexedDB cache contract
│   ├── card-loading-compliance.spec.ts# Loading skeleton → data flow
│   ├── error-resilience.spec.ts       # Graceful degradation under failures
│   ├── i18n-compliance.spec.ts        # All strings use t() / no raw text
│   ├── interaction-compliance.spec.ts # Click, hover, keyboard behavior
│   └── security-compliance.spec.ts    # XSS, CSP, sensitive-data checks
├── perf/                # Performance budgets
│   ├── all-cards-ttfi.spec.ts         # Time-to-first-interactive per card
│   ├── dashboard-perf.spec.ts         # Dashboard load < budget
│   ├── dashboard-nav.spec.ts          # Navigation timing
│   └── react-commits.spec.ts         # Excessive re-render detection
├── visual/              # Visual regression (screenshot comparison)
│   ├── app-visual-regression.spec.ts
│   └── visual-regression.spec.ts
├── nightly/             # Nightly-only deep tests
│   ├── dashboard-health.spec.ts
│   ├── page-coverage.spec.ts          # Ensures every route is visited
│   ├── react-render-errors.spec.ts
│   └── rce-vector-scan.spec.ts        # Security: detects RCE patterns
├── ai-ml/               # AI/ML dashboard cards
├── benchmarks/          # Performance benchmarks
├── deploy/              # Deploy workflow tests
└── *.spec.ts            # Feature-level E2E (Dashboard, Settings, Events, etc.)
```

### E2E Coverage Collection

The console supports **E2E code coverage** via Istanbul instrumentation:

1. `VITE_COVERAGE=true` enables `vite-plugin-istanbul` at build time.
2. Playwright tests run against the instrumented build.
3. Istanbul JSON output is written to `.nyc_output/`.
4. `npm run coverage:report` (`scripts/coverage-report.mjs`) merges shard
   data and generates text, HTML, and LCOV reports.

### Visual Regression

- Config: `web/e2e/visual/app-visual.config.ts`
- Baselines committed alongside code
- Update: `npm run test:visual:update`
- Verify: `npm run test:visual`

### CI Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `coverage-gate.yml` | PR (src changes) | Smoke coverage on modified files; threshold **91 %** |
| `coverage-hourly.yml` | Push to main | Full 12-shard coverage suite; updates README badge |
| `coverage-weekly-review.yml` | Schedule | Weekly trend analysis |
| `fullstack-e2e.yml` | PR / manual | Full-stack Playwright run (Go backend + frontend) |
| `nightly-test-suite.yml` | Schedule | Nightly deep tests (health, page coverage, RCE scan) |
| `go-test.yml` | PR | Go unit tests (`pkg/`, `cmd/`) |
| `helm-test.yml` | PR | Helm chart lint + template test |

---

## Coverage Tracking Methodology

### How the 91 % Threshold Is Measured

Coverage is computed by **Vitest + `@vitest/coverage-v8`** using V8's built-in
code-coverage instrumentation. The pipeline:

1. **Shard tests** — `vitest run --coverage --shard=N/12` across 12 parallel
   runners to stay within memory limits.
2. **Merge** — Each shard produces an Istanbul-format JSON file. The merge step
   combines them into a single coverage map.
3. **Report** — `scripts/coverage-report.mjs` reads from `.nyc_output/`,
   generates text/HTML/LCOV, and extracts the **statements** percentage.
4. **Gate** — `coverage-gate.yml` compares the percentage to
   `COVERAGE_THRESHOLD: 91`. PRs that reduce coverage below this number are
   annotated with a failing check.

The threshold covers **statement coverage** on all `web/src/**/*.{ts,tsx}` files
(excluding `*.test.*`, `*.spec.*`, and the `src/test/` directory).

### E2E Coverage (Supplementary)

E2E coverage is measured separately via Istanbul instrumentation
(`vite-plugin-istanbul`). It captures which frontend code paths are exercised
during Playwright runs but is **not** part of the PR gate today. It is used
for gap analysis and trend tracking.

---

## Coverage Gaps and Improvement Opportunities

### Known Gaps

| Area | Current State | Opportunity |
|------|---------------|-------------|
| **Card components** | ~30+ card types; not all have dedicated unit tests | Generate per-card tests validating loading → data → error states |
| **Drill-down views** | Views in `components/drilldown/views/` lack tests | Add interaction tests for open/close, prop passing, navigation stack |
| **Hook edge cases** | `useCached*` hooks tested for contract but not failure modes | Test exponential backoff, stale-while-revalidate timing, IndexedDB fallback |
| **Go API handlers** | `go-test.yml` exists but handler coverage is sparse | Table-driven tests for each Fiber handler (happy path + auth + error) |
| **Netlify Functions** | No automated tests | Mirror Go handler tests for `web/netlify/functions/*.mts` |
| **Theme switching** | 15+ themes; only visual regression on default | Parameterized visual tests across all themes |
| **Mobile / responsive** | Playwright runs desktop viewport only | Add `mobile` project with 375 × 812 viewport |
| **Demo ↔ live mode transitions** | Partially covered | Test mode toggle mid-session (cache invalidation, badge appearance) |

### Flaky Test Stabilization

The issue notes that existing Playwright tests are flaky and not CI-blocking.
Common causes:

- **Timing** — `waitForTimeout()` instead of locator-based waits
- **Port conflicts** — dev server startup race conditions
- **Network mocking** — MSW handlers not matching new API routes
- **State leakage** — tests sharing browser context or localStorage

Stabilization should follow this priority:

1. Replace `waitForTimeout` with `expect(locator).toBeVisible({ timeout })`.
2. Use `test.describe.serial()` only when ordering is required; prefer isolation.
3. Add MSW passthrough rules for any new Netlify Functions.
4. Run flaky-test detection nightly and auto-file issues (see `nightly-test-suite.yml`).

---

## AI-Driven Test Generation Approach

The mentorship (#4189) envisions AI coding agents as the primary tool for
scaling test coverage. The approach has three pillars:

### 1. Autonomous Test PR Generation

A GitHub Actions workflow detects untested new components in PRs:

```
PR opened → detect new/changed components without test files
         → AI agent generates test file
         → opens companion test PR
```

**Implementation sketch:**

- `on: pull_request` triggers a job that diffs `web/src/components/` against
  `web/src/test/` and `web/e2e/`.
- For each untested component, the workflow invokes an AI coding agent with a
  prompt containing the component source, the project's test conventions
  (from `CLAUDE.md` / `AGENTS.md`), and the expected test shape.
- The agent produces a test file committed to a new branch and opens a draft PR
  referencing the original.

### 2. Nightly Test Health Workflow

A scheduled workflow runs the full test suite, identifies flaky tests, and
auto-files issues:

```
Nightly → run full Playwright + Vitest suite (3 retries)
       → parse results for tests that pass-then-fail (flaky)
       → auto-file GitHub issue per flaky test with reproduction steps
       → update coverage trend dashboard
```

This builds on the existing `nightly-test-suite.yml` and
`coverage-weekly-review.yml` workflows.

### 3. Coverage Regression Gate

Already partially implemented (`coverage-gate.yml` with 91 % threshold).
Enhancements:

- **Per-file coverage** — flag individual files that drop below 80 %.
- **New-code coverage** — require ≥ 90 % on lines added in the PR.
- **PR comment** — post a coverage diff table (files added/removed/changed)
  directly on the PR.

---

## Mentee Onboarding Guide

### Prerequisites

- Node.js 22+, Go 1.22+, Git
- AI coding agent subscription (Claude Code, Copilot, Cursor, or equivalent)
- Basic familiarity with React, TypeScript, Playwright, and GitHub Actions

### Getting Started

```bash
# 1. Clone and install
git clone https://github.com/kubestellar/console.git
cd console/web
npm ci
npx playwright install --with-deps

# 2. Start the console in demo mode (no cluster needed)
cd ..
./start-dev.sh

# 3. Run existing tests to establish a baseline
cd web
npm run test:coverage          # Vitest unit + coverage
npm run test:e2e:ui-compliance # Playwright compliance suite
npm run test:visual            # Visual regression
```

### Key Files to Read First

| File | Why |
|------|-----|
| `CLAUDE.md` | Canonical project conventions (test patterns, card rules, array safety) |
| `AGENTS.md` | AI agent entry point — points to `CLAUDE.md` |
| `web/vite.config.ts` | Vitest + Istanbul coverage configuration |
| `web/e2e/compliance/` | Best examples of well-structured Playwright tests |
| `web/src/test/card-loading-standard.test.ts` | Card contract test pattern |
| `.github/workflows/coverage-gate.yml` | How coverage is enforced in CI |
| `web/scripts/coverage-report.mjs` | How coverage reports are generated |

### Writing Your First Test

1. **Pick an untested card** — browse `web/src/components/cards/` and check
   whether a corresponding `*.test.ts` exists in `web/src/test/`.
2. **Follow the contract** — every card test should verify:
   - Renders loading skeleton when `isLoading` is true
   - Renders data when `isLoading` is false and `data` is non-empty
   - Shows demo badge when `isDemoData` is true
   - Handles `undefined` / empty data without crashing (array safety)
3. **Use the AI agent** — paste the component source + this checklist into your
   agent and ask it to generate the test file.
4. **Run and verify** — `npm run test:coverage` should show the new file
   contributing to overall coverage.

### Contribution Workflow

```bash
git checkout -b test/card-xyz-coverage
# ... write or generate tests ...
cd web && npm run test:coverage   # verify locally
git add . && git commit -s -m "🌱 Add tests for XyzCard"
git push origin test/card-xyz-coverage
# Open PR with body starting with "Fixes #4189" (or "Part of #4189")
```

### Weekly Milestones (Suggested)

| Week | Focus |
|------|-------|
| 1–2 | Environment setup, read codebase, run existing tests, fix 3 flaky tests |
| 3–4 | Write card component tests for 10 untested cards |
| 5–6 | Build autonomous test-PR-generation workflow |
| 7–8 | Add per-file coverage gate and PR comment bot |
| 9–10 | Nightly health workflow + flaky test auto-filing |
| 11–12 | Final coverage push, documentation, community call presentation |

---

## Further Reading

- [Playwright best practices](https://playwright.dev/docs/best-practices)
- [Vitest coverage guide](https://vitest.dev/guide/coverage)
- [Istanbul.js](https://istanbul.js.org/) — the coverage library under the hood
- [KubeStellar docs](https://docs.kubestellar.io/) — project context
- [LFX Mentorship program](https://mentorship.lfx.linuxfoundation.org/) — application portal
