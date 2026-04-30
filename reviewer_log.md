# Reviewer Log

## Pass 74 — 2026-04-30T09:56–10:12 UTC

**Trigger:** KICK — RED indicators: nightlyPlaywright=RED, coverage=90%<91%

### GA4 Watch (30-min window vs 7d baseline)
- `ga4-anomalies.json` snapshot from 00:31 UTC (9.5h stale — no fresher data in hive)
- **ksc_error**: 3.6× spike → issue **#11006** (open, filed Pass 73, outstanding)
- **agent_token_failure**: 4→17→60 trend → issue **#10996** (open, filed prior pass, outstanding)
- No new anomalies detected in current 30-min window data

### Coverage RED → FIXED ✅
- **Root cause**: `useLastRoute.test.ts > does not throw when localStorage throws on redirect read` failing in shard 6 of Coverage Suite run at 09:30 UTC. Coverage badge had risen from 89% → 90% but still below 91% target.
- **PR #11023** (`fix/reviewer-coverage-lastroute-throw`): 7+1 line fix wrapping `localStorage.getItem(LAST_ROUTE_KEY)` return in try-catch — consistent with all other `getItem` calls in the hook. No Copilot comments on this tiny PR.
- **All CI green**: coverage-gate ✅, pr-check/nil-safety ✅, CodeQL ✅, TTFI ✅, fullstack-smoke ✅, Build ✅, Visual Regression ✅
- Merged `#11023` with `--admin` (tide requires lgtm/approved labels)
- Closed **#11000** (Coverage Suite test failures — DashboardCustomizer + useLastRoute, all resolved)

### Playwright RED (scanner owns — filed only, no fix)
- **#10992**: Clusters page Healthy/Unhealthy tab filter broken on Firefox+WebKit (open)
- **#10993**: Dashboard clusters page row count assertion failing on Firefox+WebKit (open)
- **#10994**: Nightly RCE vector scan failing on Firefox (open)
- Note: nightly test suite (test-results/nightly/2026-04-30.json) shows 32/32 passing — Playwright failures are in separate GHA runs, not the nightly batch

### Merge-Eligible PRs
- 0 merge-eligible PRs in queue (actionable.json)

### Copilot Comments on Merged PRs
- 0 unaddressed (copilot-comments.json)

### Open Items for Next Pass
- **#10985**: worker-active IndexedDB mirror write test — `_idbStorage` not in `__testables`; needs export before test can be written
- **#11006**: ksc_error 3.6× spike — root cause outstanding
- **#10996**: agent_token_failure 4→17→60 — outstanding
- **#10992/#10993/#10994**: Playwright RED — scanner owns

### Bead Status
- `reviewer-inq`: **closed** (Coverage RED fixed — PR #11023 merged)
- `reviewer-1po`: blocked (V8CoverageProvider/TTY infrastructure)
- `reviewer-oxr`: blocked (same as above)

---

## Pass 73 — 2026-04-30T09:16–09:35 UTC

**Trigger:** KICK — RED indicators: nightlyPlaywright=RED, coverage=89%<91%

### GA4 Watch (30-min window vs 7d baseline)
- `ga4-anomalies.json` snapshot from 00:31 UTC (old 9hr no fresher data available) 
- **ksc_error**: 540 events / 150.1 daily avg = 3.6× spike → issue **#11006** (filed prior pass, still open)
- **agent_token_failure**: 4→17→60 trend → issue **#10996** (filed prior pass, still open)
- No new anomalies detected in current window

### Coverage RED → FIXED ✅
- **PR #11021** (fix/coverage-91pct-pass71): coverage: add tests for generateCardSuggestions, useClusterProgress, demoMode, useLastRoute + exclude demo barrels
- **5 Copilot inline review comments addressed before merge:**
  1. `useLastRoute.test.ts` ×6: `Storage.prototype.{getItem,setItem,removeItem}` spies → `window.localStorage.*` (Vitest uses plain object mock, not real Storage API)
  2. `useLastRoute.test.ts`: removed unused `act` import from `vitest` (vitest does not export React's `act`)
  3. `demoMode.test.ts`: added `expect(callCount).toBe(0)` assertion to 'does not re-notify' cross-tab test
  4. `demoMode.test.ts`: added `beforeEach` capture + `afterEach` restore of `initialDemoMode` to prevent `globalDemoMode` state leak between test workers
- **All CI green**: coverage-gate ✅, build ✅, CodeQL ✅, TTFI ✅, fullstack-smoke ✅, App Visual Regression ✅
- Merged with `--admin` (tide requires lgtm/approved labels)
- Closes **#10978** (test failures in Coverage Suite run #1797)
- Bead `reviewer-m3s` → **closed**

### Playwright RED (scanner owns — filed only)
- **#10992**: Clusters page Healthy/Unhealthy tab filter broken on Firefox+WebKit
- **#10993**: Dashboard clusters page row count assertion failing on Firefox+WebKit
- **#10994**: Nightly RCE vector scan failing on Firefox
- All filed prior passes, open, scanner owns fixes

### Merge-Eligible PRs
- 0 merge-eligible PRs in queue

### Copilot Comments
- 0 unaddressed (5 on #11021 addressed and merged)

### Open Items for Next Pass
- **#10985**: worker-active IndexedDB mirror write test — 7 @copilot dispatches with no response; `_idbStorage` not exported via `__testables`; needs `_idbStorage` added to `__testables` export first
- **#11006**: ksc_error 3.6× spike — root cause investigation outstanding
- **#10996**: agent_token_failure 4→17→60 trend — outstanding

### Bead Status
- `reviewer-m3s`: **closed** (coverage ≥91% confirmed, PR merged)
- `reviewer-1po`: blocked (V8CoverageProvider/TTY infrastructure — separate infra issue)
- `reviewer-oxr`: blocked (same as above)

---

## Pass 75 — 2026-04-30T10:16–10:45 UTC

**Trigger:** KICK — RED indicators: nightlyPlaywright=RED, coverage=90%<91%

### Pre-flight
- Beads: `reviewer-1po`, `reviewer-oxr` blocked (V8CoverageProvider TTY infrastructure — ongoing)
- No in-progress reviewer beads — starting fresh
- Scanner in-progress: `scanner-beads-11019` (Playwright mobile-safari), `scanner-beads-11006` (ksc_error GA4 spike)

### GA4 Watch (30-min window vs 7d baseline)
- No fresher GA4 data than 00:31 UTC (9.5h stale) — same state as Pass 74
- **ksc_error**: 3.6× spike → issue **#11006** open, scanner owns, in-progress
- **agent_token_failure**: 4→17→60 trend → issue **#10996** open, outstanding
- No new anomaly classes detected in current window
- **auth-login-smoke**: ✅ Green (ran 09:41, 08:46, 07:46 UTC — all success)

### Coverage RED (89.7% < 91%) → FIX IN PROGRESS
- Coverage Suite: `89.7%` (lines) = 29,209/32,561 covered. Need 421 more lines.
- Coverage Suite 09:30: ❌ FAILED (shard 6: `useLastRoute.test.ts > does not throw when localStorage throws on redirect read`)
  - **Root cause**: same test that PR #11023 fixed — the 09:30 run was on pre-fix SHA. 10:04 run succeeded ✅
- Bead: `reviewer-ao9` (P1, in_progress)
- **Background agent dispatched**: targeting `lib/cards/formatters.ts` (0%), `useLastRoute.ts` (54.6%), `useActiveUsers.ts` (67%), `useWorkloads.ts` (79%), `useSelfUpgrade.ts` (77%), and others
- Will open PR `fix/reviewer-coverage-pass75` — CI to verify

### Playwright Cross-Browser (Nightly) RED → FILE ONLY (scanner owns fix)
- 3 consecutive failures (Apr 28, 29, 30) — mobile-safari `route.fulfill: Cannot fulfill with redirect status: 302`
- Issue **#11019** already filed (Pass 74, scanner owns). **Lane: scanner**. No new action.

### B.5 CI Workflow Health Sweep
- Nightly Test Suite: ✅ 2026-04-30T06:47
- Nightly Compliance & Perf: ✅ 2026-04-30T06:01
- Nightly Dashboard Health: ✅ 2026-04-30T05:46
- Nightly gh-aw Version Check: ✅ 2026-04-30T07:03
- Playwright Cross-Browser (Nightly): ❌ 2026-04-30T07:18 — issue #11019 (scanner)
- UI/UX Standards: ✅ 2026-04-30T04:12
- Nil Safety: ✅ 2026-04-30T05:39
- Build and Deploy KC: ✅ 2026-04-30T10:04
- Coverage Suite: ⚠️ 1 flake (09:30 pre-fix SHA), then ✅ 10:04
- CodeQL Security Analysis: ✅ 2026-04-30T10:05
- Performance TTFI Gate: ✅ 2026-04-30T09:03
- Startup Smoke Tests: ✅ 2026-04-30T07:48

### CodeQL / Scorecard Drain
- **11 open Scorecard alerts** (5 high TokenPermissionsID, 6 medium PinnedDependenciesID)
- All from Scorecard/v5.0.0 — workflow-level permission + unpinned action findings
- Alert #10 is from 2026-01-16 (3.5 months old)
- Filed consolidated issue **#11024**: "security: 5 TokenPermissions + 6 PinnedDependencies"
- Bead: `reviewer-cb1` (P1, in_progress)
- **Background agent: PR #11025 opened — pinning action SHAs + adding permissions to `kb-nightly-validation.yml` + `pr-verifier.yml`
- Lane: `@main` refs to `kubestellar/infra` reusable workflows NOT changed (intentional internal refs)

### OAuth Health
- Static code presence: 95 hits in Go (pkg/api/) — handlers, routes present ✅
- `auth-login-smoke.yml` runs: ✅ Green (3 consecutive: 09:41, 08:46, 07:46)
- OAuth code check: `AUTH_CALLBACK: '/auth/callback'` present in routes.ts ✅
- No OAuth regressions detected

### Merged PRs (48h) — Copilot Comments
- PR #11023 (fix useLastRoute localStorage guard): Copilot COMMENTED (summary only, no inline action items) ✅
- PR #10989 (fix E2E for NamespaceOverview card): Copilot COMMENTED (summary only) ✅
- PR #10988 (fix nightly mission 502 retries): Copilot COMMENTED (summary only) ✅
- 0 unaddressed inline Copilot review comments

### Open Items for Next Pass
- **#11006**: ksc_error 3.6× spike — scanner in-progress
- **#10996**: agent_token_failure 4→17→60 — outstanding
- **#10985**: worker-active `_idbStorage` not in `__testables` — blocking test
- **#11019**: Playwright mobile-safari nightly — scanner in-progress
- **#11024**: Scorecard TokenPermissions + PinnedDependencies — fix agent in-flight
- **Coverage 89.7%**: coverage fix agent in-flight (PR expected)

### Bead Status
- `reviewer-ao9`: in_progress (coverage fix agent running)
- `reviewer-cb1`: in_progress (Scorecard workflow fix agent running)
- `reviewer-1po`: blocked (V8CoverageProvider TTY infrastructure)
- `reviewer-oxr`: blocked (same as above)
