# MTTR Badge — No Failure Alert Runbook

**Repository:** `kubestellar/console`
**Applies to:** `.github/workflows/mttr-badge.yml`

---

## Current Status

**No workflow-level alerting change is merged.** The `operations` agent's GitHub App
token lacks the `workflows` permission required to create or update any file under
`.github/workflows/` (verified in prior sessions against `nightly-dast.yml`,
`upgrade-smoke.yml`, and `stale.yml`; the same constraint applies here). Until a
maintainer with that permission adds the fix described below, a failure of this
workflow produces **no notification of any kind** — only a red run in the Actions
tab.

## Why This Matters

`mttr-badge.yml` ("MTTR Badge") runs hourly (`cron: '17 * * * *'`) via
`workflow_dispatch`-compatible `actions/github-script`. It queries the GitHub search
API for merged PRs, correlates each to the issue it closed via a `Fixes #N` /
`Closes #N` reference, computes median/avg/p90 recovery time in minutes, and PATCHes
a public Shields.io endpoint badge gist (`BADGE_GIST_ID`).

That badge is displayed at the top of [`README.md`](../../README.md) as the
project's public Mean-Time-To-Resolution indicator, and SLO 5 in
[`SLO.md`](../SLO.md) ties the underlying recovery-time SLI to the 4-hour target
defined in [`INCIDENT-RESPONSE.md`](../INCIDENT-RESPONSE.md). Unlike most of the
scheduled jobs already tracked in #23144/#23230 (whose failure only hides a test or
scan result), a silent failure here leaves a **public, community-visible metric**
frozen at its last successfully computed value — anyone reading the README badge
would see a stale MTTR number with no indication it stopped updating, potentially
understating (or overstating) actual incident-response performance indefinitely.

The workflow has no internal issue-creation-on-failure step, and it is not listed in
`.github/workflows/workflow-failure-issue.yml`'s `workflow_run` catch-all
(`workflows:` list currently covers Release, Build and Deploy KC, Nightly Compliance
& Perf, Nightly Dashboard Health, Nightly gh-aw Version Check, Playwright
Cross-Browser (Nightly), Card Loading Standard, Startup Smoke Tests, Auto-QA
Agent/Tuner, Nil Safety, GA4 Error Monitor, OpenSSF Scorecard, Weekly Coverage
Review). It is also distinct from the 13 jobs already tracked in #23144/#23230
(`upgrade-smoke.yml` and its 12 siblings) — none of those lists include
`mttr-badge.yml`.

Failure modes that would go undetected today: the GitHub search API returning a
rate-limit or transient error, `GIST_TOKEN` expiring or being revoked, or the gist
PATCH request failing (the script only `console.log`s a message and returns on a
non-OK gist response — it does not fail the job or raise).

## Detecting a Failure Today

Until the fix lands, check manually:

```bash
gh run list --repo kubestellar/console --workflow=mttr-badge.yml --limit 10
```

A `conclusion: failure` entry means the scheduled badge-update run failed with no
automated notification having been sent. Note that a **successful** run can still
silently skip the badge update (e.g. `GIST_TOKEN` unset, gist PATCH non-OK, or no
`Fixes`/`Closes` refs found in the last 100 merged PRs) — those cases exit 0 and
won't show as a failed run at all; cross-check the job's log output for lines like
`Gist update failed:` or `No GIST_TOKEN — skipping badge update`.

## Proposed Fix

Add `"MTTR Badge"` (the exact `name:` field value from `mttr-badge.yml`) to the
`workflows:` list in `.github/workflows/workflow-failure-issue.yml`. This is the
smallest change: it reuses the catch-all's existing dedup-by-title-and-label logic
and comment-on-recurring-failure behavior, requiring no new code path. No other
change to `mttr-badge.yml` itself is needed for the *job-failure* case.

Separately, a maintainer may want to make the "successful but silently skipped"
cases above (missing `GIST_TOKEN`, non-OK gist PATCH) fail the job explicitly
(e.g. `core.setFailed(...)`) so they surface through the same catch-all once wired
up, instead of exiting 0.

## Escalation

If a scheduled `mttr-badge.yml` run is found to have failed or silently skipped,
treat it as low urgency (P3) relative to the other gaps in this class — it affects
a reporting metric, not user-facing traffic or a deployment path. Confirm whether
the README badge value is stale by comparing its `message` field against a manual
recomputation, and re-run the workflow via `workflow_dispatch` once the underlying
cause (rate limit, expired `GIST_TOKEN`, etc.) is resolved.
