# AI-Assisted Development: Quality Assurance

KubeStellar Console uses AI tools (GitHub Copilot, Claude Code) to accelerate development. This document explains how layered feedback loops prevent AI-generated code from introducing regressions.

## The Concern

AI-generated code can produce regressions that are harder to catch than human mistakes — code that compiles but is subtly wrong, tests that pass by weakening assertions, refactors that shift behavior without adding value. We take this seriously.

Our approach: **fast feedback loops at every stage** so problems surface before they compound.

## Feedback Loops

### Loop 1: Before Commit (Developer Machine)

| Signal | What It Catches | Latency |
|--------|----------------|---------|
| `npm run build` (TypeScript) | Type errors, missing imports, broken JSX | ~30 seconds |
| `npm run lint` (ESLint) | Style violations, unsafe patterns, unused imports | ~10 seconds |
| `go build ./...` | Go compilation errors | ~5 seconds |
| **5 post-build safety checks** | Vendor corruption, missing chunks, MSW leak, bundle size regression, HTML integrity | <1 second (scans built files) |

The post-build checks (`web/scripts/check-vendor-safety.mjs`) run automatically after every `npm run build` — no separate step needed.

### Loop 2: PR Checks (Before Merge)

Every PR — human or AI — triggers these checks. Maintainers review results before merging.

| Check | What It Catches |
|-------|----------------|
| **TypeScript + Go build** | Compilation errors across both codebases |
| **nil-safety** (nilaway) | New nil-pointer dereferences in Go. Ratcheted baseline — existing violations allowed, new ones blocked. |
| **ts-null-safety** | Unsafe optional chaining (`.data.join()` without guard) |
| **array-safety** | Unguarded `.map()`, `.filter()`, `.join()`, `for...of` on potentially undefined arrays (3 patterns, ratcheted baseline) |
| **AI quality checks** | 5 ratcheted antipattern detectors (see below) |
| **API contract verification** | Starts a demo backend, verifies HTTP endpoint response shapes |
| **Playwright E2E** | End-to-end browser tests against the built frontend |
| **Coverage gate** | 80% line coverage on modified files |
| **TTFI performance** | Time-To-First-Interaction regression on dashboard cards |
| **Helm lint + kubeconform** | Kubernetes manifest validation (on deploy/ changes) |
| **CodeQL** | Security scanning: XSS, injection, auth bypass |
| **DCO** | Developer Certificate of Origin on all commits |
| **Copilot code review** | Automated review comments on every PR (suggestions, not blocking) |

### AI Antipattern Checks (Ratcheted Baselines)

Part of Loop 2. These target patterns AI tools commonly generate. Each has a baseline count — the PR fails only if violations **increase**, allowing gradual cleanup without blocking unrelated PRs. Suppress false positives with `// ai-quality-ignore`.

| Pattern | What It Catches | Baseline |
|---------|----------------|----------|
| **Magic numbers in timers** | `setTimeout(fn, 5000)` instead of named constants | 8 |
| **No-op test assertions** | `expect(true).toBe(true)` — AI weakens assertions instead of fixing code | 5 |
| **Hardcoded route strings** | `'/settings'` instead of `ROUTES.SETTINGS` | 2 |
| **Cards missing unified controls** | Card components without `useCardLoadingState` | 1 |
| **Non-localized strings** | `title="Some Text"` instead of `title={t('key')}` | 167 |

### Loop 3: Post-Merge (Production Verification)

After every merge to `main` that touches `web/` or `pkg/`:

1. Waits for Netlify to deploy the merged code to `console.kubestellar.io`
2. Selects Playwright tests based on the issue labels and changed file paths (`web/e2e/spec-map.json`)
3. Runs those tests against the **live production site**
4. **On failure**: reopens the original issue, creates a regression issue, assigns Copilot to auto-fix

This is the loop that catches problems the PR checks missed — the code compiled and passed tests locally, but doesn't work correctly when deployed.

### Loop 4: Continuous Monitoring (Catches Gradual Degradation)

| Signal | Frequency | Feedback |
|--------|-----------|----------|
| **Coverage hourly** | Every hour | Full test suite across 12 shards. Alerts if coverage drops >5%. |
| **Auto-QA** | 4x daily | 8-layer quality audit: build, lint, resilience, NFR coverage, flicker, security, accessibility, performance. Creates max 3 issues per run. |
| **Nightly dashboard health** | Daily | Tests all 30+ dashboard routes. Detects console errors, blank pages, unhandled exceptions. |
| **Nightly test suite** | Daily | gosec, gitleaks, trivy, semgrep, unit tests. Tracks trends across runs. |
| **Playwright nightly** | Daily | Cross-browser (Firefox, WebKit) E2E for key user flows |
| **GA4 error tracking** | Real-time | `ksc_error` events from production users — runtime crashes, chunk load failures, unhandled rejections |

### Loop 5: User and Community Feedback

| Signal | Feedback |
|--------|----------|
| **GitHub Issues** | Bug reports from users, filed via the Console UI or directly |
| **Copilot review comments** | Automated code review on every merged PR — checked by maintainers for valid findings |
| **TAG-Security review** | External security experts reviewing the self-assessment ([cncf/toc#2106](https://github.com/cncf/toc/pull/2106)) |
| **GA4 analytics** | User engagement, error rates, feature adoption — surfaces UX problems before they become bug reports |

## How the Loops Reinforce Each Other

When a problem gets past one loop, the next loop catches it — and the response is to strengthen the earlier loop:

**Example (April 2, 2026):**

1. **Loop 1 missed it**: AI PR #4239 added Vite `define` rules. `npm run build` passed (the crash is runtime-only).
2. **Loop 2 missed it**: PR checks passed — TypeScript compiles fine, the corruption is in the vendor bundle at runtime.
3. **Loop 5 caught it**: User reported blank page on `console.kubestellar.io` within 15 minutes.
4. **Fix shipped**: PR #4248 removed the bad `define` rules. A pre-existing TypeScript error blocked Netlify deploy (PR #4253 fixed it). Production restored in ~45 minutes.
5. **Loop 1 strengthened**: Added a post-build check (`check-vendor-safety.mjs`) that scans vendor bundles for `void 0(` calls. This class of bug now fails at `npm run build` — it can't reach Loop 2.

The check was added manually by a maintainer, not auto-generated. The pattern is: when a regression class is identified, a maintainer adds an automated check to the earliest possible loop.

## What This Means

- **AI doesn't get a free pass.** Every AI-generated PR triggers the same checks as human PRs. There is no bypass.
- **Checks are advisory, not hard blocks.** There are no GitHub required status checks configured. Maintainers review check results and make the merge decision. This is intentional — some legitimate PRs touch areas not covered by existing tests.
- **The check suite grows from incidents.** When a regression class is identified, a new check is added. The 5 post-build safety checks, post-merge Playwright verification, and nil-safety ratcheting all exist because of specific past incidents.
- **Monitoring catches what gates miss.** Hourly coverage, 4x daily QA, nightly E2E, and real-time GA4 error tracking provide continuous feedback on production quality — not just at PR time.

## Contributing

All contributions — human or AI-assisted — trigger the same checks. See [CONTRIBUTING.md](../CONTRIBUTING.md) for development setup and conventions.
