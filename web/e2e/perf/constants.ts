/**
 * Shared constants for perf regression tests.
 *
 * Any named literal used by a perf spec (budgets, settle times, signal slugs)
 * belongs here so the assertions, the JSON result file, and the reusable
 * auto-issue workflow all agree on the same values.
 */

// Max number of React commits allowed during a SPA navigation. 50 is a
// generous ceiling — a healthy route change should be well under 20. The
// current (buggy) count is ~461 (tracked by #6149); this is the gate that
// flips red when the regression reappears.
export const PERF_BUDGET_NAVIGATION_COMMITS = 50

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
