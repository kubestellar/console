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

**The exit-code propagation fix described in [Proposed Fix](#proposed-fix) is not
merged into `nightly-llmd-guides.yml`.** The `operations` agent's GitHub App token
lacks the `workflows` permission required to create or update any file under
`.github/workflows/` — a verified test push to this exact file was rejected by
GitHub before a PR could even be opened:

```
! [remote rejected] operations/test-workflow-perm-check-2 -> operations/test-workflow-perm-check-2
  (refusing to allow a GitHub App to create or update workflow
  `.github/workflows/nightly-llmd-guides.yml` without `workflows` permission)
```

Until a maintainer with that permission applies the fix manually, treat every
`✅ PASS` result from this workflow as unverified. See tracking issue
[#23142](https://github.com/kubestellar/console/issues/23142).

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
| Tracking issue comment vs. log mismatch | Compare the `✅ PASS` table in the `Nightly llm-d Guide E2E Results` tracking issue against the actual guide script output/exit code in the run log | The only reliable signal today — a suspiciously long unbroken PASS streak (9+ days, per the confirmation in issue #23142) across a live OpenShift cluster and self-hosted runner warrants manual log review |
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

In the `Run guide E2E` step, after computing `EXIT_CODE` and writing the `status`
output, add:
```bash
if [ "$EXIT_CODE" -ne 0 ]; then
  exit "$EXIT_CODE"
fi
```
so the step (and job) conclusion honestly reflects the guide's real outcome. The
job-level `continue-on-error: true` (present for a different reason — tolerating
runner unavailability without cancelling other matrix entries or failing the whole
run) will still let other guides and the `report` job proceed; only the *job
conclusion itself*, which `report` already queries, needs to become accurate.
Separately, add `"Nightly llm-d Guide E2E"` to the monitored
`on.workflow_run.workflows` list in `workflow-failure-issue.yml` — noting that the
job-level `continue-on-error` also currently makes the *workflow-level* conclusion
`success` regardless of job outcomes, so either the workflow-level setting needs
matching treatment, or the `report` job should explicitly fail
(e.g. `exit 1` when `FAILED -gt 0`) so `workflow_run` sees a real failure to alert
on. A maintainer with the `workflows` GitHub App permission (or direct push access)
needs to apply this to `.github/workflows/nightly-llmd-guides.yml` and
`.github/workflows/workflow-failure-issue.yml`; it cannot be delivered as an
automated PR from this agent for the reason described in
[Current Status](#current-status).

## Recording the Incident

Use the [postmortem issue template](../../.github/ISSUE_TEMPLATE/postmortem.yaml) to
capture the timeline, impact, root cause, and follow-up actions if a masked guide
failure is found to have gone undetected in production for a significant window.
