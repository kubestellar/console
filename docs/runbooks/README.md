# Runbook Index — kubestellar/console

This directory holds incident-response runbooks for the console's own
operational surfaces (health endpoints, scheduled canaries/scans, and
alerting mechanics). None of these are linked from a single place elsewhere
in the repo, so this index exists purely for discoverability during an
on-call triage — start here if you don't already know which runbook applies.

See [`docs/SLO.md`](../SLO.md) for the SLIs/SLOs these runbooks support, and
[`docs/INCIDENT-RESPONSE.md`](../INCIDENT-RESPONSE.md) for the overall
incident process.

| Runbook | Applies to |
|---|---|
| [`backend-health-degraded.md`](backend-health-degraded.md) | `GET /health`, `GET /healthz`, `GET /watchdog/ready` reporting `degraded`/`not_ready` |
| [`bot-roundtrip-failures.md`](bot-roundtrip-failures.md) | `.github/workflows/console-app-roundtrip.yml` (nightly bot-attribution check) |
| [`incident-response-automation-missing.md`](incident-response-automation-missing.md) | `docs/INCIDENT-RESPONSE.md` automation gaps |
| [`upgrade-smoke-no-alert.md`](upgrade-smoke-no-alert.md) | `.github/workflows/upgrade-smoke.yml` (In-Place Upgrade Smoke canary) |
| [`console-live-promote-no-alert.md`](console-live-promote-no-alert.md) | `.github/workflows/console-live-promote.yml` |
| [`stale-workflow-no-alert.md`](stale-workflow-no-alert.md) | `.github/workflows/stale.yml` |
| [`scheduled-workflow-alert-gap-remaining.md`](scheduled-workflow-alert-gap-remaining.md) | Remaining scheduled workflows sharing the same no-failure-alert gap class |
| [`codeql-scheduled-scan-alert-gap.md`](codeql-scheduled-scan-alert-gap.md) | `.github/workflows/codeql.yml`, `.github/workflows/workflow-failure-issue.yml` |
| [`dast-scan-pipeline-failure.md`](dast-scan-pipeline-failure.md) | `.github/workflows/nightly-dast.yml` (nightly ZAP/Nuclei DAST scan) |
| [`mttr-badge-no-alert.md`](mttr-badge-no-alert.md) | `.github/workflows/mttr-badge.yml` |
| [`acmm-level-monitor-no-alert.md`](acmm-level-monitor-no-alert.md) | `.github/workflows/acmm-level-monitor.yml` |
| [`llmd-guide-e2e-silent-failure.md`](llmd-guide-e2e-silent-failure.md) | `.github/workflows/nightly-llmd-guides.yml` |
| [`ga4-regression-no-alert.md`](ga4-regression-no-alert.md) | `.github/workflows/ga4-error-regression.yml`, `.github/workflows/ga4-mobile-monitor.yml` |

## Adding a new runbook

Add the file to this directory, then add a row to the table above so it's
discoverable without a full-repo search.
