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

**Correction (2026-09-12, issue #23336 — now fixed):** Issue #23336 reported that
the automatic `helm rollback` only fired for two of the four failure classes the
workflow could hit (deploy/smoke/session only). The `live_semantic` and
`live_browser_matrix` failures had no rollback steps. This was fixed by PR #23520
(merged 2026-09-17). Verified on current `main` (`.github/workflows/console-live-promote.yml`):
all four failure classes are now covered by rollback conditions:
- Line 752: `steps.deploy_live.outcome == 'failure'` OR `steps.live_smoke.outcome == 'failure'`
- Line 817: `steps.session_smoke.outcome == 'failure'`
- Line 853: `steps.live_semantic.outcome == 'failure'`
- Line 912: `steps.live_browser_matrix.outcome == 'failure'`

For the still-open part of the original finding (`stale.yml` / "Stale Issues" has
no equivalent alert), see `docs/runbooks/stale-workflow-no-alert.md`.

## Why This Matters

`console-live-promote.yml` ("Console Live Promote") runs every 12 hours
(`cron: '17 */12 * * *'`) and deploys the current `main` candidate to the **public**
`console-live` environment before running live canary tests against it. On failures
in any of the four test/deployment stages (deploy, smoke, session-smoke, semantic,
browser-matrix), it automatically runs `helm rollback` to restore the previous release.
The dedicated alert workflow described above ensures a failed promotion (rolled back or
not) is also tracked in an issue, not just silently retried on the next 12h cycle.

## Detecting a Failure Today

```bash
gh run list --repo kubestellar/console --workflow=console-live-promote.yml --limit 10
gh run list --repo kubestellar/console --workflow=console-live-promote-failure-issue.yml --limit 10
```

The second command shows whether the alert workflow itself ran and succeeded for a
given promotion failure. If the alert workflow run failed or is missing for a known
promotion failure, that (not the promotion workflow) is the gap to investigate.

## Recurring semantic 429/503 failures (#24736)

Do not infer MCP pod exhaustion from the HTTP status alone. The authenticated API
has a shared limiter in `pkg/api/routes_auth.go` (2,000 requests/minute, a
`Retry-After: 60` rejection). A single Playwright worker still allows each page to
fan out across clusters and dashboard cards. Authentication/storage failures and
upstream routing can also return 503; distinguish these using response bodies,
traces and server logs before changing capacity or limits.

Run [41200746066](https://github.com/kubestellar/console/actions/runs/41200746066)
passed the deployments UI/data assertions, then failed the final network check on
six GET 503s: replicasets and HPAs for all three CI clusters. This proves a
network-gate failure, not its infrastructure cause. The earlier shell-rendering
failure remains a separate symptom; retries must not replace shell or groundtruth
assertions.

The live API helper retries only GET reads returning 429/503, at most three
attempts, with exponential backoff, jitter and five-second request timeouts.
`Retry-After` seconds and HTTP dates are respected; delays over five seconds remain
failures rather than being retried early. The final network check probes distinct
failed app-origin API reads sequentially within a shared 30-second budget. Only a
2xx JSON response from the **same path and query** proves recovery. Persistent
errors, mutations, other status codes, and failed UI/data invariants still fail
the gate. Original network errors remain in evidence, and probe status histories
and Retry-After values are written to `test-results/reports/live-routes.json` as
`live-api-transient-recovery`, including when the test passes.

For the next scheduled runs:

1. Compare `live-api-transient-recovery` entries with the trace's original failed
   responses and `network.requestCountsByEndpoint` / `network.rateLimitEvents` in
   the failure evidence. Look for a shared limiter window versus endpoint-specific
   failures; a green recovered run is not evidence that the underlying cause is fixed.
2. Correlate the failure timestamps with the existing workflow's pod logs and
   rollout diagnostics. Have an authorized operator inspect CPU/memory throttling,
   restarts, API limiter keying, and Kubernetes API latency when those metrics are
   not available in artifacts. Do not change replica counts, limits, or ingress
   policy merely to make the smoke gate green.
3. Keep #24736 open until consecutive scheduled runs establish whether failures
   recover and the repeated capacity/rate-limit signature has been explained.
   Escalate persistent failures with the exact endpoint, cluster, status history,
   Retry-After and timestamp rather than filing another unrelated one-off fix.

## Escalation

If a scheduled `console-live-promote.yml` run is found to have failed, check which
step failed. For any failure class (`deploy_live`, `live_smoke`, `session_smoke`,
`live_semantic`, or `live_browser_matrix`), check whether the automatic `helm rollback`
succeeded (search the run log for `live-rollback.log` contents). If rollback also
failed, treat as a P1: the public `console-live` environment may be running a broken
candidate. If rollback succeeded, it is still a P2 — investigate why the candidate
failed its live canary tests.

Separately, confirm the alert workflow (`console-live-promote-failure-issue.yml`)
created/updated an issue as expected; if it did not, that indicates a regression in
the alert mechanism itself and should be filed as a new, distinct finding.
