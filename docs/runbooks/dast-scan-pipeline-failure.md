# Nightly DAST Scan Pipeline Failure Runbook

**Repository:** `kubestellar/console`
**Applies to:** `.github/workflows/nightly-dast.yml`

---

## Scope Note

This runbook covers failures of the **DAST detection pipeline itself** (the ZAP
baseline scan or Nuclei scan crashing/erroring before producing a valid results
file). It is distinct from a legitimate `[nightly:dast-zap]` / `[nightly:dast-nuclei]`
finding issue, which means the scan ran to completion and found something. If the
workflow ran and filed (or updated) one of those finding issues, this runbook does
not apply — treat it as a real security finding instead.

## Current Status

**Fixed — with a different implementation than the "Proposed Fix" below.** PR
[#23525](https://github.com/kubestellar/console/pull/23525) (merged 2026-09-17,
closing tracking issue [#23085](https://github.com/kubestellar/console/issues/23085))
removed `continue-on-error: true` from both the `Run ZAP Baseline Scan` and `Run
Nuclei Scan` steps, so a scanner crash/timeout/action failure now fails the job/run
outright instead of being masked as "zero findings". `"Nightly DAST Security Scan"`
was also added to the `workflows:` catch-all in
`.github/workflows/workflow-failure-issue.yml`, so that job failure now
opens/updates a tracked issue automatically — no dedicated
`nightly-dast:pipeline-failure` label or standalone alert step was added. The same
PR added an `id:` to each scan step and threaded its `outcome` through to the
`Create or Close ZAP/Nuclei Issue` step, which now skips the auto-close-on-clean-scan
branch (and comments a warning instead) when the scan step itself failed — a
scanner crash can no longer auto-close a genuine open security-finding issue with a
false "resolved" message. Verified on current `master`:
`.github/workflows/nightly-dast.yml`'s scan steps carry no `continue-on-error`, and
both `steps.zap-results.outputs.scan_outcome` / `steps.nuclei-results.outputs.scan_outcome`
gate the create-or-close logic.

## Why This Could Happen Silently (historical — fixed by #23525)

Before PR #23525, both `Run ZAP Baseline Scan` and `Run Nuclei Scan` in
`nightly-dast.yml` were declared with `continue-on-error: true` so a transient
failure (container crash, network error reaching `console.kubestellar.io`, upstream
action breakage, timeout) wouldn't fail the whole scheduled run. The downstream parse
steps guarded on the results file existing (`if [ -f report_json.json ]` / `if [ -f
nuclei-results.json ] && [ -s nuclei-results.json ]`), and defaulted the count to `0`
when it was missing. That made `has_findings` come out `false` — exactly the same
value as a genuinely clean scan. This section is kept to explain the failure class the
fix addressed; `continue-on-error` is no longer present on either step.

Two compounding effects (both now closed by the `scan_outcome` gate above):

1. **No alert on scanner failure.** The job's overall conclusion is masked by
   `continue-on-error`, so the run always shows `success` in the Actions tab, with no
   signal distinguishing "scanned clean" from "scanner errored out".
2. **Existing findings can be auto-closed on a scanner crash.** The `Create or Close
   ZAP/Nuclei Issue` step, when `has_findings == false` and a tracking issue
   (`[nightly:dast-zap]` / `[nightly:dast-nuclei]`) is already open, closes it with
   `state_reason: completed` and posts a "✅ scan passed ... Auto-closing" comment. If
   the scanner crashed instead of passing, this auto-closes a genuine open
   security-finding issue with a false "resolved" message.

## Detecting a Pipeline Failure

| Signal | Where to look | Status |
|---|---|---|
| Automated failure issue | `workflow-failure-issue.yml`'s catch-all opens/updates an issue whenever `Nightly DAST Security Scan` completes with a non-success conclusion | Works today — no manual polling required |
| Workflow run log | Actions → `Nightly DAST Security Scan` → the `Run ZAP Baseline Scan` / `Run Nuclei Scan` step logs | Still useful for root-causing a reported failure |
| Missing findings pattern | No new `[nightly:dast-zap]` / `[nightly:dast-nuclei]` activity, or a previously-open finding issue closing with a "scan itself failed" warning comment instead of a false "resolved" auto-close | Secondary corroboration only — the automated failure issue above is now primary |

## Triage

1. Start from the automated failure issue opened by `workflow-failure-issue.yml`
   (or, if triaging directly, open the relevant workflow run at Actions →
   `Nightly DAST Security Scan`) and inspect the `Run ZAP Baseline Scan` / `Run
   Nuclei Scan` step logs for the failure reason (container error, network timeout
   reaching `console.kubestellar.io`, action-version breakage, etc.) — the failed
   step now fails the job/run itself (no `continue-on-error` masking it).
2. Reproduce locally:
   ```bash
   # ZAP
   docker run -t ghcr.io/zaproxy/zaproxy:stable zap-baseline.py \
     -t https://console.kubestellar.io -r report.html

   # Nuclei
   nuclei -u https://console.kubestellar.io -severity medium,high,critical -json
   ```
3. If a previously-open `[nightly:dast-zap]` or `[nightly:dast-nuclei]` issue has a
   warning comment saying the scan itself failed (rather than a clean-scan
   auto-close), leave it open and use it to track the real finding — the
   `scan_outcome` gate added in #23085/#23525 prevents the auto-close branch from
   running in that case, so no reopen action should be needed unless the gate
   itself regresses.

## Recovery

1. Fix the underlying cause (network reachability to the target, an action-version
   pin that broke, a `zap-rules.tsv`/template incompatibility).
2. Re-run via `workflow_dispatch` (with `skip_issue_creation: true` first, if you want
   to confirm the scan completes without filing/closing issues) to confirm the
   pipeline is healthy again.
3. Reopen any finding issue that was incorrectly auto-closed during the outage window
   (see Triage step 3).

## Verifying Recovery

- Confirm the next scheduled or manual run completes both scan steps without failing,
  and that `has_findings` reflects an actual parsed result (not the zero-by-default
  fallback).
- Confirm no incorrect auto-close happened on a previously-open finding issue — a
  scan-step failure should now produce a warning comment instead.
- Confirm no new automated failure issue remains open from `workflow-failure-issue.yml`
  for `Nightly DAST Security Scan`.

## Proposed Fix (superseded — kept for historical context)

The paragraph below described the originally proposed remediation before #23085 was
fixed by #23525. It was **not** applied as such; the actual fix (removing
`continue-on-error` and adding the workflow to the shared failure-issue catch-all)
achieves the same detection goal through the repo's existing generic mechanism
instead of a dedicated label/step. Kept only for how the gap was first analyzed.

Add an `if: always() && steps.<scan-id>.outcome == 'failure'` step immediately after
each scan step (requires giving each scan step an `id:`) that files/updates a
dedicated issue labeled `nightly-dast:pipeline-failure`, and skip the existing
"Create or Close" step when the scan itself failed rather than treating a missing
results file as "no findings".

## Recording the Incident

Use the [postmortem issue template](../../.github/ISSUE_TEMPLATE/postmortem.yaml) to
capture the timeline, impact, root cause, and follow-up actions once the pipeline is
confirmed healthy again and any incorrectly auto-closed finding issue has been
reopened.
