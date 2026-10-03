# Nightly llm-d Guide E2E Silent Failure Runbook

**Repository:** `kubestellar/console`
**Applies to:** `.github/workflows/nightly-llmd-guides.yml`

---

## Scope Note

This runbook covers the case where the nightly llm-d guide E2E run reports a guide
as `✅ PASS` (in the tracking issue comment and/or the workflow's own conclusion)
even though the guide script actually failed or timed out. It is distinct from a
guide legitimately passing, and distinct from the runner being unavailable (which
the workflow already labels `⚠️ RUNNER N/A` / skipped). The exit-code propagation
bug this runbook was originally written for is fixed (see
[Current Status](#current-status)) — `✅ PASS` results are reliable again. The
remaining gap is detection-only: a real failure is correctly shown in the
tracking-issue comment but does not yet open an automated alert issue.

## Current Status

**Fixed.** [#23545](https://github.com/kubestellar/console/issues/23545) documented
that the exit-code propagation fix merged in
[#23538](https://github.com/kubestellar/console/pull/23538) (closing
[#23535](https://github.com/kubestellar/console/issues/23535)) didn't take effect
because the `report` job looked for the per-guide status file at
`results/<guide>.status` instead of the actual `results/guide-status/<guide>.status`
path `upload-artifact`/`download-artifact` produce. [#23547](https://github.com/kubestellar/console/pull/23547)
(merged 2026-09-18) corrected that one-line path, and the current workflow
confirms it: `STATUS_FILE="results/guide-status/${guide}.status"` in the `report`
job. A guide's real exit code — not the always-`success` job conclusion masked by
`run-guides`'s job-level `continue-on-error: true` — now determines whether it is
reported `✅ PASS`, `❌ FAIL`, or `❌ FAIL (timeout)`. Treat `✅ PASS` results from
this workflow as reliable again.

**Remaining follow-up gap (undelivered):** the `report` job still never `exit 1`s
when `FAILED -gt 0`, and `"Nightly llm-d Guide E2E"` is still absent from
`workflow-failure-issue.yml`'s monitored `on.workflow_run.workflows` catch-all list.
So a genuinely failing guide is now correctly flagged `❌ FAIL` in the tracking
issue comment, but the workflow run itself still shows `conclusion: success` and no
automated failure-alert issue opens — detection still requires reading the tracking
issue comment rather than relying on an alert. Filed as
[#23933](https://github.com/kubestellar/console/issues/23933) since, like #23545, the fix is
entirely inside `.github/workflows/` and cannot be delivered as a PR by this agent.

History: the original tracking issue,
[#23142](https://github.com/kubestellar/console/issues/23142), was closed as
completed once this runbook was merged, even though the underlying fix was never
applied at the time. A follow-up, [#23367](https://github.com/kubestellar/console/issues/23367),
was itself closed after only fixing this runbook's dead-tracker *reference* (PR
#23368). #23535/#23538 then shipped a fix that didn't work (#23545), and #23547
finally made it work.

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

**Historical (pre-#23547):** the downstream `report` job used to compound this by
determining each guide's displayed status by querying the *job conclusion* via the
GitHub API — not the `status` output the guide step recorded:

```bash
CONCLUSION=$(gh api ".../jobs" --jq "select(.name == \"run-guides ($guide)\") | .conclusion")
case "$CONCLUSION" in
  success) STATUS="✅ PASS" ;;
  ...
  *) STATUS="❌ FAIL" ;;
esac
```

Since the job conclusion is always `success`, every guide was unconditionally
reported `✅ PASS`. **As of [#23547](https://github.com/kubestellar/console/pull/23547)
(see [Current Status](#current-status)), the `report` job prefers the real
per-guide `guide-status/<guide>.status` file and only falls back to this
job-conclusion query when that file is missing** (e.g. an infra failure before the
guide step ran), so a genuinely failing or timed-out guide is now correctly shown
`❌ FAIL` / `❌ FAIL (timeout)`. The remaining gap is that the workflow run itself
still always shows `conclusion: success` in the Actions tab (the `report` job never
`exit 1`s) and is absent from `workflow-failure-issue.yml`'s monitored
`on.workflow_run.workflows` list — tracked in
[#23933](https://github.com/kubestellar/console/issues/23933) — so no automated
failure-alert issue opens even though the tracking-issue comment now correctly
flags the failure.

## Detecting a Silent Failure

| Signal | Where to look | Status |
|---|---|---|
| Dedicated alert issue | Issues labeled `nightly-llmd-guides:silent-failure` | Not yet available — the tracking-issue comment table (`✅ PASS`/`❌ FAIL`) is now accurate per-guide (fixed in #23547), but no automated alert issue opens on a real failure; see [#23933](https://github.com/kubestellar/console/issues/23933) |
| Workflow run log | Actions → `Nightly llm-d Guide E2E` → each `run-guides (<guide>)` job → `Execute guide: <guide>` log group | Works today, but requires manually opening every run and job |
| Tracking issue comment | The `✅ PASS`/`❌ FAIL`/`❌ FAIL (timeout)` table in the `Nightly llm-d Guide E2E Results` tracking issue | Reliable as of #23547 — reflects the real per-guide exit code, not the always-`success` job conclusion |
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
   fix, checking the tracking-issue comment's PASS/FAIL table (reliable as of
   #23547) or the log directly.
3. Correct the record in the tracking issue if a prior run's `✅ PASS` was actually
   a masked failure — this can only have happened for runs before #23547 merged
   (2026-09-18); see Triage step 4.

## Verifying Recovery

- Confirm the guide's `Execute guide: <guide>` log shows a clean run with no error
  output near the end.
- Confirm a deliberately-failing guide (e.g. via `workflow_dispatch` against a
  broken scratch script) shows `❌ FAIL` in the tracking issue comment (this part
  already works per #23547). Once [#23933](https://github.com/kubestellar/console/issues/23933)
  lands: also confirm the `report` job's own `conclusion` is `failure` and that a
  `workflow-failure-issue.yml` alert issue opens automatically.

## Proposed Fix

The exit-code propagation bug (#23142/#23535/#23538/#23545) is fixed as of #23547
— see [Current Status](#current-status). The remaining gap, filed with exact
replacement text in [#23933](https://github.com/kubestellar/console/issues/23933):
have the `report` job `exit 1` when `FAILED -gt 0`, and add
`"Nightly llm-d Guide E2E"` to the monitored `on.workflow_run.workflows` list in
`workflow-failure-issue.yml`, so a real guide failure alerts automatically instead
of only showing up in the tracking-issue comment.

A maintainer with the `workflows` GitHub App permission (or direct push access)
needs to apply this to `.github/workflows/nightly-llmd-guides.yml` and
`.github/workflows/workflow-failure-issue.yml`; it cannot be delivered as an
automated PR from this agent for the reason described in
[Current Status](#current-status).

## Recording the Incident

Use the [postmortem issue template](../../.github/ISSUE_TEMPLATE/postmortem.yaml) to
capture the timeline, impact, root cause, and follow-up actions if a masked guide
failure is found to have gone undetected in production for a significant window.
