# MTTR Badge — No Failure Alert Runbook (RESOLVED)

**Repository:** `kubestellar/console`
**Applies to:** `.github/workflows/mttr-badge.yml`

---

## Current Status

**Fixed.** `"MTTR Badge"` was added to the `workflows:` catch-all in
`.github/workflows/workflow-failure-issue.yml`, and the missing-`GIST_TOKEN` and
failed-gist-PATCH branches now call `core.setFailed(...)` instead of silently
returning (PR [#23525](https://github.com/kubestellar/console/pull/23525)). Both
a job failure and a "successful but silently skipped" badge update now surface
through the catch-all. Tracking issue
[#23268](https://github.com/kubestellar/console/issues/23268) is closed.

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

The workflow previously had no internal issue-creation-on-failure step and was
not listed in `.github/workflows/workflow-failure-issue.yml`'s `workflow_run`
catch-all. `"MTTR Badge"` is now on that list, alongside the 13 jobs already
tracked in #23144/#23230 (`upgrade-smoke.yml` and its siblings).

Failure modes that previously would have gone undetected: the GitHub search API
returning a rate-limit or transient error, `GIST_TOKEN` expiring or being
revoked, or the gist PATCH request failing. All three now fail the job (via
`core.setFailed`) and surface through the catch-all.

## Detecting a Failure

```bash
gh run list --repo kubestellar/console --workflow=mttr-badge.yml --limit 10
```

A `conclusion: failure` entry now opens/updates a tracked issue automatically
via the catch-all. Cross-check the job's log output for lines like `Gist update
failed:` or `MTTR badge update skipped: GIST_TOKEN is not set` to confirm root
cause.

## Proposed Fix (applied)

`"MTTR Badge"` (the exact `name:` field value from `mttr-badge.yml`) was added to
the `workflows:` list in `.github/workflows/workflow-failure-issue.yml`, reusing
the catch-all's existing dedup-by-title-and-label logic and
comment-on-recurring-failure behavior. The missing-`GIST_TOKEN` and
failed-gist-PATCH branches were also changed to call `core.setFailed(...)`
instead of exiting 0, so those cases surface through the same catch-all.

## Escalation

If a scheduled `mttr-badge.yml` run is found to have failed or silently skipped,
treat it as low urgency (P3) relative to the other gaps in this class — it affects
a reporting metric, not user-facing traffic or a deployment path. Confirm whether
the README badge value is stale by comparing its `message` field against a manual
recomputation, and re-run the workflow via `workflow_dispatch` once the underlying
cause (rate limit, expired `GIST_TOKEN`, etc.) is resolved.
