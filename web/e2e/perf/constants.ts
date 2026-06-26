/**
 * Shared constants for perf regression tests.
 *
 * Any named literal used by a perf spec (budgets, settle times, signal slugs)
 * belongs here so the assertions, the JSON result file, and the reusable
 * auto-issue workflow all agree on the same values.
 */

// Max number of React commits allowed during a SPA navigation. The post-fix
// measurement (after #6161 stabilized AuthProvider value + #6178 seeded the
// demo token so the perf spec doesn't measure auth-revalidate noise) is 13
// commits for a real /clusters navigation. Budget is set to 35 — that's the
// observed 31 (2026-04-26 CI measurement) plus 4 commits of headroom for
// legitimate growth (new cards, SSE streams), while still catching any
// regression that pushes us back toward the ~461-commit cascade tracked
// by #6149.
export const PERF_BUDGET_NAVIGATION_COMMITS = 35

// How long to let the UI settle after a navigation before we snapshot
// the commit counter. 2s is enough for cached dashboards + router transitions
// without turning the test into a long-poll.
export const NAVIGATION_SETTLE_MS = 2_000

// Window size (ms) over which we measure the IDLE commit-per-second rate. The
// test waits this long after the dashboard has fully settled, with no user
// input, then divides commit count by IDLE_SAMPLE_WINDOW_MS / 1000.
//
// 15s is a deliberate choice: long enough to average out one-off cluster
// poll responses (#6201), short enough to keep the perf workflow under 5min
// total runtime.
export const IDLE_SAMPLE_WINDOW_MS = 15_000

// Max React commits per second allowed during idle on the dashboard. Local
// dev measurement against a kc-agent + real clusters is ~3.6 commits/sec
// (with React StrictMode dev double-render baked in, so the production cost
// is ~1.8/sec). Budget is set to 8 commits/sec — generous headroom over the
// observed baseline so legitimate growth (more cards, websocket events) is
// allowed, while a regression that introduces a 1-second-tick cascade (the
// pattern that previously bit us in #6149 and the post-#6184 followup
// hunt 2026-04-10) gets caught immediately. The cascade I removed in
// PR #6184 (`useNowTick` in ServiceStatus) ALONE was firing once per
// second per visible service card, so this budget would have flagged it.
export const PERF_BUDGET_IDLE_COMMITS_PER_SEC = 8

// Signal slugs — must be unique across every perf workflow. These are used
// verbatim in the perf-result.json file and as the `[perf-regression] <slug>`
// de-dupe key in the auto-issue script.
export const PERF_SIGNAL_REACT_COMMITS_NAV = 'react-commits-navigation'
export const PERF_SIGNAL_REACT_COMMITS_IDLE = 'react-commits-idle'

// Where specs drop their result JSON. The reusable workflow reads this exact
// path via the PERF_RESULT_JSON env var.
export const PERF_RESULT_PATH = 'web/perf-result.json'
