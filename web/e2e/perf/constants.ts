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
// commits for a real /clusters navigation. Budget is set to 20 — that's the
// observed 13 plus 7 commits of headroom for legitimate growth, while still
// catching any regression that pushes us back toward the ~461-commit cascade
// tracked by #6149.
export const PERF_BUDGET_NAVIGATION_COMMITS = 20

// How long to let the UI settle after a navigation before we snapshot
// the commit counter. 2s is enough for cached dashboards + router transitions
// without turning the test into a long-poll.
export const NAVIGATION_SETTLE_MS = 2_000

// Signal slugs — must be unique across every perf workflow. These are used
// verbatim in the perf-result.json file and as the `[perf-regression] <slug>`
// de-dupe key in the auto-issue script.
export const PERF_SIGNAL_REACT_COMMITS_NAV = 'react-commits-navigation'

// Where specs drop their result JSON. The reusable workflow reads this exact
// path via the PERF_RESULT_JSON env var.
export const PERF_RESULT_PATH = 'web/perf-result.json'
