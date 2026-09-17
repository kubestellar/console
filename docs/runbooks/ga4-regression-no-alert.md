# GA4 Error Rate Regression / Mobile Traffic Monitor — No Failure Alert Runbook (RESOLVED)

**Repository:** `kubestellar/console`
**Applies to:** `.github/workflows/ga4-error-regression.yml`,
`.github/workflows/ga4-mobile-monitor.yml`

---

## Current Status

**Fixed.** `"GA4 Error Rate Regression"` and `"GA4 Mobile Traffic Monitor"` were
added to the `workflows:` catch-all in
`.github/workflows/workflow-failure-issue.yml` (PR
[#23521](https://github.com/kubestellar/console/pull/23521)), so a scheduled
failure of either workflow now opens/updates a tracked issue automatically.
Tracking issue [#23377](https://github.com/kubestellar/console/issues/23377) is
closed. The detection commands below remain a useful manual fallback.

## Why This Matters

`ga4-error-regression.yml` ("GA4 Error Rate Regression", weekly `cron: '0 9 * * 1'`)
and `ga4-mobile-monitor.yml` ("GA4 Mobile Traffic Monitor", daily
`cron: '15 8 * * *'`) each run their entire check — GA4 Data API auth, data fetch,
threshold comparison, and issue-creation-on-anomaly-detected — inside a single
script step, with no separate `if: failure()` step to alert if that step itself
throws or exits non-zero before reaching its own detection logic.

Neither workflow name previously appeared in
`.github/workflows/workflow-failure-issue.yml`'s `workflows:` catch-all list
(which at the time covered only `"GA4 Error Monitor"`, a different, hourly
workflow defined in `ga4-error-monitor.yml`). Both are now included, closing
the same gap class as #23144 (upgrade-smoke + 12 others), #23119 (CodeQL),
#23193 (Stale Issues), #23235 (ACMM Level Monitor job errors), and #23268
(MTTR Badge) — all now also resolved.

Failure modes that would go undetected today: `GA4_SERVICE_ACCOUNT_KEY` or
`GA4_PROPERTY_ID` secret rotation/expiry, a GA4 Data API rate-limit or schema
change, or a `googleapis` dependency install failure. Per the mobile monitor's own
header comment, a March 2026 render-loop regression already caused a 19-day
undetected mobile-traffic collapse before this monitor existed — a silent failure
of the monitor itself would reopen exactly that blind spot.

## Detecting a Failure Today

Until the fix lands, check manually:

```bash
gh run list --repo kubestellar/console --workflow=ga4-error-regression.yml --limit 10
gh run list --repo kubestellar/console --workflow=ga4-mobile-monitor.yml --limit 10
```

A `conclusion: failure` entry with `event: schedule` in either command means a
scheduled check failed with no automated notification having been sent.

## Proposed Fix (applied)

`"GA4 Error Rate Regression"` and `"GA4 Mobile Traffic Monitor"` (the exact
`name:` field values) were added to the `workflows:` list in
`.github/workflows/workflow-failure-issue.yml`, reusing the catch-all's
existing dedup-by-title-and-label and comment-on-recurring-failure logic.

## Escalation

Treat a confirmed silent failure of `ga4-mobile-monitor.yml` as higher urgency
(mobile traffic collapse has direct precedent, see "Why This Matters" above) than
`ga4-error-regression.yml`, which duplicates coverage already provided by the
hourly `ga4-error-monitor.yml`. Re-run via `workflow_dispatch` once the underlying
cause (secret rotation, GA4 API contract change, etc.) is resolved.
