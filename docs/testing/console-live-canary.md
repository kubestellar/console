# Console Live Canary

`console-live.kubestellar.io` is a project-owned regression target for catching UI, live-data, auth, and browser regressions before they reach real users. It is not a fast PR check. The scheduled loop updates the live test site from the current `main` image, verifies deployment and auth boundaries, then runs deeper live canary tests that create actionable issues when UI or data regressions are found.

## Operating Model

- Schedule: every 12 hours.
- Manual trigger: available through the `Console Live Promote` workflow.
- Image source: `CONSOLE_LIVE_IMAGE_REPOSITORY`, defaulting to `ghcr.io/kubestellar/console`.
- Rollback policy: rollback only for deployment, HTTPS, `/api/me`, OAuth redirect, or signed-session smoke failures.
- UI/data/browser failures: remain deployed and create or update issues with screenshots, traces, route evidence, and reproduction commands.

## Required GitHub Configuration

Create a GitHub environment named `console-live`.

Required secrets:

- `CONSOLE_LIVE_KUBECONFIG_B64`
- `KUBECONFIG_B64`
- `CONSOLE_LIVE_OAUTH_CLIENT_ID`
- `CONSOLE_LIVE_OAUTH_CLIENT_SECRET`
- `CONSOLE_LIVE_JWT_SECRET`
- `CONSOLE_LIVE_TEST_USER_ID`
- `CONSOLE_LIVE_TEST_GITHUB_LOGIN`

Required vars:

- `CONSOLE_LIVE_URL`
- `CONSOLE_LIVE_HOST`
- `CONSOLE_LIVE_IMAGE_REPOSITORY`
- `CONSOLE_LIVE_ALLOWED_GITHUB_LOGINS`
- `CONSOLE_LIVE_ADMIN_GITHUB_LOGINS`
- `CONSOLE_LIVE_TEST_USER_ROLE`
- `LIVE_CLUSTER_CONTEXTS`
- `LIVE_CLUSTER_EXPECTED_CONTEXTS`
- `LIVE_CLUSTER_EXPECTED_READY_NODES`
- `LIVE_CANARY_ROUTE_DELAY_MS`
- `LIVE_CANARY_PHASE_COOLDOWN_MS`

## OAuth And Canary Account

The OAuth app must be owned by project maintainers.

- Homepage URL: `https://console-live.kubestellar.io`
- Callback URL: `https://console-live.kubestellar.io/auth/callback`
- The canary GitHub account must be project-owned.
- The canary login must be included in `CONSOLE_LIVE_ALLOWED_GITHUB_LOGINS`.
- The account should log in once interactively so the live database has a real user record.
- CI uses short-lived signed cookies after that initial login, which avoids interactive 2FA during scheduled tests.

## Kubernetes Requirements

The deploy kubeconfig should be scoped to the `kubestellar-console-live` namespace and must support Helm upgrades for the live release.

The groundtruth kubeconfig should be read-only and must support `get`, `list`, and `watch` for:

- nodes
- namespaces
- pods
- deployments
- events

`LIVE_CLUSTER_CONTEXTS` must match the contexts in the groundtruth kubeconfig. `LIVE_CLUSTER_EXPECTED_CONTEXTS` and `LIVE_CLUSTER_EXPECTED_READY_NODES` must describe the expected project-owned live cluster state.

## Issue Loop

When a canary run fails, `Console Live Promote Failure Issue` downloads sanitized artifacts and creates or updates one issue per failure signature. Matching open issues receive an update/comment. Matching closed issues receive a recurrence comment and remain closed.

Issues are intended to be AI-agent actionable. They should include:

- failure classification,
- failed route/control/invariant,
- expected UI/API/groundtruth values,
- actual UI/API/groundtruth values,
- screenshot/trace/artifact links,
- likely files to inspect,
- reproduction command,
- explicit instruction to fix code rather than update baselines unless the failure is an approved visual change.

## Manual Run

Use `workflow_dispatch` on `Console Live Promote`.

- Leave `candidate_tag` empty to use the default `main` image.
- Set `candidate_tag` or `candidate_sha` only when validating a specific candidate image.
- Keep `promoteProduction=true` for the normal test-site loop.
- Use `promoteProduction=false` only for a private canary dry run.

Use `Console Live macOS Canary` for focused macOS/WebKit popup checks. The synthetic litmus input should stay disabled except when validating the detector itself.
