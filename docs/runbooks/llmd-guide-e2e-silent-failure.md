# Nightly llm-d Guide E2E Silent Failure Runbook

**Repository:** `kubestellar/console`
**Applies to:** `.github/workflows/nightly-llmd-guides.yml`

---

## Scope Note

This runbook covers the case where the nightly llm-d guide E2E run reports a guide
as `✅ PASS` (in the tracking issue comment and/or the workflow's own conclusion)
even though the guide script actually failed or timed out. It is distinct from a
guide legitimately passing, and distinct from the runner being unavailable (which
the workflow already labels `⚠️ RUNNER N/A` / skipped). Treat any report of "all
guides passed" with the same skepticism as no report at all until the underlying
gap described below is fixed.

## Current Status

**A version of the exit-code propagation fix merged in
[#23538](https://github.com/kubestellar/console/pull/23538) (closing
[#23535](https://github.com/kubestellar/console/issues/23535)), but it does not
take effect.** The `run-guides` job now writes each guide's real exit status to
`guide-status/<guide>.status` and uploads it as part of the `guide-result-<guide>`
artifact. The `report` job downloads all such artifacts merged into `results/`,
but looks for the status file at `results/<guide>.status` — missing the
`guide-status/` path segment that `upload-artifact` preserves (the artifact's
actual internal path, confirmed by downloading and inspecting a real post-fix run,
is `guide-status/<guide>.status`). That lookup always misses, so the `report` job
silently falls back to the same job-conclusion query that motivated #23535 in the
first place — which reads `success` unconditionally because `run-guides` has
job-level `continue-on-error: true`. Net effect: **every guide is still
unconditionally reported `✅ PASS` regardless of real outcome**, exactly as before
#23538 merged. The one-line fix (`results/${guide}.status` →
`results/guide-status/${guide}.status`) and two related follow-up gaps (the
`report` job never exits non-zero on failure, and `"Nightly llm-d Guide E2E"` is
still absent from `workflow-failure-issue.yml`'s catch-all) are filed with exact
replacement text in [#23545](https://github.com/kubestellar/console/issues/23545)
— filed as an issue rather than a PR because the fix is entirely inside
`.github/workflows/nightly-llmd-guides.yml`, and the `operations` agent's GitHub
App token (`contributor` tier) lacks the `workflows` permission required to push
any change under `.github/workflows/`.

Until #23545 is applied, treat every `✅ PASS` result from this workflow as
unverified. History: the original tracking issue,
[#23142](https://github.com/kubestellar/console/issues/23142), was closed as
completed once this runbook was merged, even though the underlying fix was never
applied at the time. A follow-up, [#23367](https://github.com/kubestellar/console/issues/23367),
was itself closed after only fixing this runbook's dead-tracker *reference* (PR
#23368). #23535/#23538 then shipped a fix, but — per above — it doesn't work yet.

## Why This Can Happen Silently

The `Run guide E2E` step in the `run-guides` matrix job executes each guide script
and captures its exit code, but never re-raises it:

```bash
set +e
timeout "${GUIDE_RUN_TIMEOUT_S}" bash "$SCRIPT"
EXIT_CODE=$?
set -e
...
if [ $EXIT_CODE -eq 0 ]; then
  echo "status=pass" >> "$GITHUB_OUTPUT"
elif [ $EXIT_CODE -eq 124 ]; then
  echo "status=timeout" >> "$GITHUB_OUTPUT"
else
  echo "status=fail" >> "$GITHUB_OUTPUT"
fi
```

There is no `exit "$EXIT_CODE"` (or equivalent) after this block, so the step's own
process always exits `0`. GitHub Actions therefore marks the
`run-guides (<guide>)` job `success` regardless of whether the guide actually
passed, failed, or timed out.

The downstream `report` job compounds this: it determines each guide's displayed
status by querying the *job conclusion* via the GitHub API — not the `status`
output the guide step recorded:

```bash
CONCLUSION=$(gh api ".../jobs" --jq "select(.name == \"run-guides ($guide)\") | .conclusion")
case "$CONCLUSION" in
  success) STATUS="✅ PASS" ;;
  ...
  *) STATUS="❌ FAIL" ;;
esac
```

Since the job conclusion is always `success`, every guide is unconditionally
reported `✅ PASS`, and the workflow run itself always shows `conclusion: success`
in the Actions tab. This is a stronger gap than "scanner crashed and looked like a
clean scan" (the class of issue in
[dast-scan-pipeline-failure.md](dast-scan-pipeline-failure.md)) — here a genuinely
failing or timed-out E2E guide is actively misreported as passing, with no
distinguishing signal anywhere in the pipeline. The workflow is also absent from
`workflow-failure-issue.yml`'s monitored `on.workflow_run.workflows` list, so even
if the job conclusion did reflect failure, no generic failure-alert issue would be
opened for it today.

## Detecting a Silent Failure

| Signal | Where to look | Status |
|---|---|---|
| Dedicated alert issue | Issues labeled `nightly-llmd-guides:silent-failure` | Not yet available — see [Current Status](#current-status) |
| Workflow run log | Actions → `Nightly llm-d Guide E2E` → each `run-guides (<guide>)` job → `Execute guide: <guide>` log group | Works today, but requires manually opening every run and job |
| Tracking issue comment vs. log mismatch | Compare the `✅ PASS` table in the `Nightly llm-d Guide E2E Results` tracking issue against the actual guide script output/exit code in the run log | The only reliable signal today — a suspiciously long unbroken PASS streak (9+ days, per the confirmation in the now-closed issue #23142 — see #23367) across a live OpenShift cluster and self-hosted runner warrants manual log review |
| Artifact logs | Download the `guide-result-<guide>` artifacts (retained 30 days) and check for errors that contradict a reported PASS | Available for guides that ran; not useful if the runner itself was unavailable |

## Triage

1. Open the relevant workflow run (Actions → `Nightly llm-d Guide E2E`) and expand
   the `run-guides (<guide>)` job → `Execute guide: <guide>` log group for the
   guide(s) in question. Look for the guide script's own error output near the end
   of the group — the step will show green even if the script failed.
2. Download the `guide-result-<guide>` artifact and inspect
   `scripts/llmd-guides/*.log` for errors.
3. Reproduce locally against a scratch OpenShift cluster if needed:
   ```bash
   ./scripts/llmd-guides/<guide>.sh
   echo "exit code: $?"
   ```
4. If a guide is confirmed to have actually failed despite a `✅ PASS` report,
   comment on the `Nightly llm-d Guide E2E Results` tracking issue (label
   `nightly-llmd-guides`, held open via the `hold` label) noting the discrepancy and
   the real failure, so the false-positive doesn't stand as the record for that
   date.

## Recovery

1. Fix the underlying guide/infra issue found in Triage (script bug, OpenShift
   cluster drift, dependency change, timeout too short for current cluster
   performance, etc.).
2. Re-run via `workflow_dispatch` with the specific `guide` input to confirm the
   fix, checking the log directly rather than trusting the `report` job's PASS/FAIL
   table until [Proposed Fix](#proposed-fix) lands.
3. Correct the record in the tracking issue if a prior run's `✅ PASS` was actually
   a masked failure (see Triage step 4).

## Verifying Recovery

- Confirm the guide's `Execute guide: <guide>` log shows a clean run with no error
  output near the end.
- Once [Proposed Fix](#proposed-fix) lands: confirm a deliberately-failing guide
  (e.g. via `workflow_dispatch` against a broken scratch script) actually shows
  `conclusion: failure` for its `run-guides (<guide>)` job and `❌ FAIL` in the
  tracking issue comment — i.e. the pipeline can actually detect failure, not just
  report an unbroken PASS streak.

## Proposed Fix

#23538 already took a different (and reasonable) approach than the one originally
proposed here: instead of re-raising `EXIT_CODE` in the guide step, it writes the
real per-guide result to a `guide-status/<guide>.status` file and has the `report`
job read that file instead of trusting the job conclusion. That design is sound —
it's just wired to the wrong path. The exact remaining fix, with replacement text,
is filed in [#23545](https://github.com/kubestellar/console/issues/23545):

1. **Required (makes the shipped fix actually work):** in the `report` job,
   `STATUS_FILE="results/${guide}.status"` must become
   `STATUS_FILE="results/guide-status/${guide}.status"`, matching the path
   `upload-artifact`/`download-artifact` actually produce.
2. **Follow-up (so a real failure alerts automatically once #1 lands):** have the
   `report` job `exit 1` when `FAILED -gt 0`, and add `"Nightly llm-d Guide E2E"`
   to the monitored `on.workflow_run.workflows` list in
   `workflow-failure-issue.yml`.

A maintainer with the `workflows` GitHub App permission (or direct push access)
needs to apply this to `.github/workflows/nightly-llmd-guides.yml` and
`.github/workflows/workflow-failure-issue.yml`; it cannot be delivered as an
automated PR from this agent for the reason described in
[Current Status](#current-status).

## Recording the Incident

Use the [postmortem issue template](../../.github/ISSUE_TEMPLATE/postmortem.yaml) to
capture the timeline, impact, root cause, and follow-up actions if a masked guide
failure is found to have gone undetected in production for a significant window.
