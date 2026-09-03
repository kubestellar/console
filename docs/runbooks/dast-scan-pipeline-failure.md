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

**The `Alert on scan failure` companion step described below is not merged into
`nightly-dast.yml`.** The `operations` agent's GitHub App token lacks the `workflows`
permission required to create or update any file under `.github/workflows/` — a
verified test push to this exact file was rejected by GitHub before a PR could even
be opened:

```
! [remote rejected] operations/test-workflow-perm-check -> operations/test-workflow-perm-check
  (refusing to allow a GitHub App to create or update workflow
  `.github/workflows/nightly-dast.yml` without `workflows` permission)
```

Until a maintainer with that permission applies the step manually (see the
[Proposed Fix](#proposed-fix) diff below), a crash in either scan step still produces
a **green** workflow run and is indistinguishable from a clean scan. Use the "Missing
findings pattern" signal in the table below as the only currently-working detection
method. See tracking issue [#23085](https://github.com/kubestellar/console/issues/23085).

## Why This Can Happen Silently

Both `Run ZAP Baseline Scan` and `Run Nuclei Scan` in `nightly-dast.yml` are declared
with `continue-on-error: true` so a transient failure (container crash, network error
reaching `console.kubestellar.io`, upstream action breakage, timeout) doesn't fail the
whole scheduled run. The downstream parse steps then guard on the results file
existing (`if [ -f report_json.json ]` / `if [ -f nuclei-results.json ] && [ -s
nuclei-results.json ]`), and default the count to `0` when it's missing. That makes
`has_findings` come out `false` — exactly the same value as a genuinely clean scan.

Two compounding effects:

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
| Dedicated alert issue | Issues labeled `nightly-dast:pipeline-failure` | Not yet available — see [Current Status](#current-status) |
| Workflow run log | Actions → `Nightly DAST Security Scan` → the `Run ZAP Baseline Scan` / `Run Nuclei Scan` step logs | Works today, but requires manually checking every run |
| Missing findings pattern | No new `[nightly:dast-zap]` / `[nightly:dast-nuclei]` activity, or a previously-open finding issue closing with no genuinely fixed root cause | The only reliable signal today |

## Triage

1. Open the relevant workflow run (Actions → `Nightly DAST Security Scan`) and inspect
   the `Run ZAP Baseline Scan` / `Run Nuclei Scan` step logs for the failure reason
   (container error, network timeout reaching `console.kubestellar.io`, action-version
   breakage, etc.) — the step's red ❌ marker is visible in the logs even though
   `continue-on-error: true` keeps the job green.
2. Reproduce locally:
   ```bash
   # ZAP
   docker run -t ghcr.io/zaproxy/zaproxy:stable zap-baseline.py \
     -t https://console.kubestellar.io -r report.html

   # Nuclei
   nuclei -u https://console.kubestellar.io -severity medium,high,critical -json
   ```
3. If a previously-open `[nightly:dast-zap]` or `[nightly:dast-nuclei]` issue was
   auto-closed on the same date as the failed run, **reopen it** — the "Auto-closing"
   comment does not distinguish a real clean scan from a crash, and closing on a
   crash removes tracking for a genuine unresolved finding.

## Recovery

1. Fix the underlying cause (network reachability to the target, an action-version
   pin that broke, a `zap-rules.tsv`/template incompatibility).
2. Re-run via `workflow_dispatch` (with `skip_issue_creation: true` first, if you want
   to confirm the scan completes without filing/closing issues) to confirm the
   pipeline is healthy again.
3. Reopen any finding issue that was incorrectly auto-closed during the outage window
   (see Triage step 3).

## Verifying Recovery

- Confirm the next scheduled or manual run completes the scan step without failing,
  and that `has_findings` reflects an actual parsed result (not the zero-by-default
  fallback).
- Confirm no incorrect auto-close happened on a previously-open finding issue.

## Proposed Fix

Add an `if: always() && steps.<scan-id>.outcome == 'failure'` step immediately after
each scan step (requires giving each scan step an `id:`) that files/updates a
dedicated issue labeled `nightly-dast:pipeline-failure`, and skip the existing
"Create or Close" step when the scan itself failed rather than treating a missing
results file as "no findings". A maintainer with the `workflows` GitHub App
permission (or push access) needs to apply this directly to
`.github/workflows/nightly-dast.yml`; it cannot be delivered as an automated PR from
this agent for the reason described in [Current Status](#current-status).

## Recording the Incident

Use the [postmortem issue template](../../.github/ISSUE_TEMPLATE/postmortem.yaml) to
capture the timeline, impact, root cause, and follow-up actions once the pipeline is
confirmed healthy again and any incorrectly auto-closed finding issue has been
reopened.
