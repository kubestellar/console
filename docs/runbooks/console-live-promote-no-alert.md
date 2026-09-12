# Console Live Promote — Failure Alert Runbook

**Repository:** `kubestellar/console`
**Applies to:** `.github/workflows/console-live-promote.yml`

---

## Current Status

**Correction (this session):** this file previously claimed `console-live-promote.yml`
had *no* failure notification of any kind, and tracking issue
[#23193](https://github.com/kubestellar/console/issues/23193) repeated that claim.
That claim was **incorrect**. A dedicated alert workflow,
`.github/workflows/console-live-promote-failure-issue.yml`, already exists (present
on `main` since at least 2026-09-02, i.e. *before* #23193 was filed on 2026-09-05). It
triggers on `workflow_run: [Console Live Promote, Console Live macOS Canary]` /
`completed`, downloads the canary evidence artifacts, and creates or updates a
`[console-live][...]`-titled issue via
`.github/scripts/console-live-promote-failure-issue.cjs` whenever the conclusion is
`failure`, `cancelled`, or `timed_out`.

Verified by listing recent runs of that alert workflow — it ran and completed
successfully for every `Console Live Promote` / `Console Live macOS Canary` failure
across 2026-09-04 through 2026-09-07 (the exact window #23193 claimed had *no*
notification), matching the alert workflow's dedup-by-signature logic (it updates an
existing open issue rather than always opening a new one, which is why the
`[console-live][...]`-titled issue list looks sparse — see e.g. the
`[ci-maintainer]`-filed #23186 and historical `[console-live][canary-blocked]` issues
such as #21087 and #20593).

**Correction (2026-09-12, issue #23336): the previous "no further action is needed"
line above was wrong.** The automatic `helm rollback` described below only fires for
two of the four failure classes the workflow can hit — `steps.deploy_live.outcome`/
`steps.live_smoke.outcome == 'failure'` and `steps.session_smoke.outcome ==
'failure'`. Neither rollback step's `if:` condition references
`steps.live_semantic.outcome`, and there is no rollback step at all after the
"Run live semantic tests against selected target" or "Run live browser matrix
against selected target" steps. Confirmed by inspecting
`.github/workflows/console-live-promote.yml` (rollback steps around lines 751 and
816; no matching step follows lines 826/863) and by the run history: the
`live_semantic` step has failed on every one of the last 30 scheduled runs
(2026-09-01 through 2026-09-12, ~11 days, every ~12h) with **no rollback attempted
in any of them** — the broken candidate has stayed live throughout. See #23336 for
the exact fix (an additional rollback step keyed on
`steps.live_semantic.outcome == 'failure'`); this agent cannot merge that change
itself because it touches a workflow file.

For the still-open part of the original finding (`stale.yml` / "Stale Issues" has
no equivalent alert), see `docs/runbooks/stale-workflow-no-alert.md`.

## Why This Matters

`console-live-promote.yml` ("Console Live Promote") runs every 12 hours
(`cron: '17 */12 * * *'`) and deploys the current `main` candidate to the **public**
`console-live` environment before running live canary tests against it. On a failed
*deploy or session-smoke* it automatically runs `helm rollback` to restore the
previous release — but **not** on a failed semantic-test or browser-matrix run (see
the Current Status correction above), so a bad candidate can and does stay live in
that case. The dedicated alert workflow described above ensures a failed promotion
(rolled back or not) is also tracked in an issue, not just silently retried on the
next 12h cycle.

## Detecting a Failure Today

```bash
gh run list --repo kubestellar/console --workflow=console-live-promote.yml --limit 10
gh run list --repo kubestellar/console --workflow=console-live-promote-failure-issue.yml --limit 10
```

The second command shows whether the alert workflow itself ran and succeeded for a
given promotion failure. If the alert workflow run failed or is missing for a known
promotion failure, that (not the promotion workflow) is the gap to investigate.

## Escalation

If a scheduled `console-live-promote.yml` run is found to have failed, check which
step failed. For `deploy_live`/`live_smoke`/`session_smoke` failures, check whether
the automatic `helm rollback` succeeded (search the run log for `live-rollback.log`
contents). If rollback also failed, treat as a P1: the public `console-live`
environment may be running a broken candidate. If rollback succeeded, it is still a
P2 — investigate why the candidate failed its live canary tests.

**For `live_semantic` (or browser-matrix) failures, there is currently no rollback
step at all — treat as a P1 immediately**, since the broken candidate is guaranteed
to still be live (see #23336 for the fix and current incident status). Separately,
confirm the alert workflow (`console-live-promote-failure-issue.yml`) created/updated
an issue as expected; if it did not, that indicates a regression in the alert
mechanism itself and should be filed as a new, distinct finding.
