# Incident Response Playbook — Missing Automation Runbook

**Repository:** `kubestellar/console`
**Applies to:** `docs/INCIDENT-RESPONSE.md`

---

## Current Status

**None of the automation the incident-response SLA depends on is merged.** The
`operations` agent's GitHub App token lacks the `workflows` permission required to
create or update any file under `.github/workflows/` (verified in prior sessions
against `nightly-dast.yml` and `upgrade-smoke.yml`; see
`docs/runbooks/upgrade-smoke-no-alert.md`). Naming an actual on-call rotation also
requires maintainer input this agent cannot supply. Until a maintainer applies the
fixes below, the "Main Branch Build Recovery SLA" has no automated trigger and no
named owner. See tracking issue
[#23265](https://github.com/kubestellar/console/issues/23265).

## Why This Matters

`docs/INCIDENT-RESPONSE.md` defines a 4-hour recovery SLA for a broken main branch,
an escalation matrix, and a "Build Sheriff" weekly-rotation role responsible for the
SLA clock. All three of the following are assumed to exist by that doc but do not:

1. **`.github/on-call-schedule.yml`** — referenced twice (as the rotation source of
   truth and as the SLA owner) but never created; both references are still
   literally marked "(to be created)".
2. **The `main-broken` label** — the doc says this is auto-applied to the last
   merged PR when main CI fails. It does not exist in the repo's label list.
3. **A Slack-posting / label-applying workflow step** — the doc's "Detection
   (Automated)" section says a bot posts to `#kubestellar-dev` and pings the build
   sheriff. No workflow in `.github/workflows/` references `main-broken`,
   `kubestellar-dev`, or `kubestellar-maintainers`. (`docs/ALERT_NOTIFICATIONS.md`
   documents a real Slack-webhook feature, but it's a user-configurable *product*
   notification channel for cluster/GPU alerts — unrelated to CI build health.)

Without these, a broken main branch today produces only a red ❌ in the Actions tab:
no automated notification, no label, and no named owner for the 4-hour clock the
rest of the playbook (escalation matrix, circuit breaker, post-mortem step) is built
on.

## Detecting The Gap Today

```bash
# Confirm no on-call schedule file exists:
test -f .github/on-call-schedule.yml && echo "exists" || echo "MISSING"

# Confirm no main-broken label exists:
gh label list --repo kubestellar/console --search main-broken

# Confirm no workflow references the label or the CI Slack channels:
grep -rln "main-broken\|kubestellar-dev\|kubestellar-maintainers" .github/workflows/*.yml
```

An empty result from the last two commands (as of this writing) means the SLA in
`docs/INCIDENT-RESPONSE.md` still has no working trigger.

## Proposed Fix

1. A maintainer creates `.github/on-call-schedule.yml` naming the actual current
   Build Sheriff rotation (this is a personnel/process decision the `operations`
   agent cannot make).
2. Create the `main-broken` label (`gh label create main-broken ...`).
3. Add a workflow step, gated on the main-branch build/test jobs with
   `if: failure()`, that applies the label and opens/updates an incident-tracking
   issue — reusing the same create-or-update-issue pattern already implemented in
   `.github/workflows/workflow-failure-issue.yml` (search-by-title-and-label, then
   comment on repeat failures instead of opening duplicates).
4. Either wire the existing product Slack-webhook feature
   (`docs/ALERT_NOTIFICATIONS.md`) to a CI-health channel, or edit
   `docs/INCIDENT-RESPONSE.md` §"Detection (Automated)" to stop describing
   automation that doesn't exist, so the doc doesn't overstate current coverage
   until the wiring lands.

## Escalation

If main branch breaks and no automated notification or label appears within a few
minutes of the failing run completing, treat the "Automated Detection" step of
`docs/INCIDENT-RESPONSE.md` as **not yet implemented** — do not wait for a
notification that will not arrive. Manually open an incident issue and follow the
rest of the playbook's manual triage/escalation steps.
