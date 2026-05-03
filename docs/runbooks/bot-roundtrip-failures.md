# Runbook: `kubestellar-console-bot` Roundtrip Failures

This runbook covers triage of the nightly `Console App Roundtrip`
workflow (`.github/workflows/console-app-roundtrip.yml`). The workflow
creates a throwaway issue via the `kubestellar-console-bot` GitHub App
and verifies GitHub attributes the result to the App so the rewards
classifier can distinguish console-submitted issues from ones opened
directly on github.com.

When the workflow fails it opens (or reuses) an issue labelled
`console-app-roundtrip-failure` / `priority/critical` /
`ai-needs-human`. That issue is the entry point for this runbook.

## What the workflow checks

Two independent signals, in order of authority:

1. **Primary — `issue.user.login` equals `kubestellar-console-bot[bot]`.**
   GitHub stamps `.user` from the auth token that made the POST. A
   regular user cannot forge the `[bot]` suffix. If this check fails,
   the App itself is broken or misconfigured.
2. **Secondary — `issue.performed_via_github_app.slug` equals
   `kubestellar-console-bot`.** This is the older field the rewards
   classifier historically read. It is now emitted as a **warning
   only** — GitHub has a long-standing quirk of returning `null` for
   this field on bot-authored issues even when `.user` is correct
   (see issue #9875).

A missing `performed_via_github_app` does NOT fail the roundtrip.
Only a mismatched `.user.login` does.

## Failure phases and what to do

### Phase 1 — Label bootstrap failed

Symptom in the run log:

```
::error::Failed to create label 'test/auto-delete' — HTTP <code>
```

Expected HTTP codes:

- `201` — label created by this run.
- `422` — another run created the label between our GET and POST; the
  workflow treats this as success (idempotent).
- Anything else — real failure.

Triage:

1. Visit `https://github.com/kubestellar/console/labels` and confirm
   `test/auto-delete` exists.
2. If it does not exist, create it manually with color `ededed` and
   description
   `Ephemeral label for console-app-roundtrip; tagged issues auto-close and auto-lock.`
3. Re-run the workflow.

### Phase 2 — Credential exchange failed

Symptom:

```
::error::Failed to obtain installation token
```

Triage:

1. Check the three secrets on `kubestellar/console`:
   - `KUBESTELLAR_CONSOLE_APP_ID`
   - `KUBESTELLAR_CONSOLE_APP_INSTALLATION_ID`
   - `KUBESTELLAR_CONSOLE_APP_PRIVATE_KEY`

   Run:
   ```bash
   unset GITHUB_TOKEN && gh secret list --repo kubestellar/console \
     | grep KUBESTELLAR_CONSOLE_APP
   ```

2. In GitHub → `kubestellar` org → Settings → GitHub Apps, open the
   `kubestellar-console-bot` App:
   - Confirm the App is not suspended.
   - Confirm the private key has not expired or been revoked.
   - Confirm the installation on `kubestellar/console` is still
     active with `Issues: Read & write`.

3. If the private key was rotated, update the
   `KUBESTELLAR_CONSOLE_APP_PRIVATE_KEY` repo secret. Re-run the
   workflow.

### Phase 3 — Issue creation failed

Symptom:

```
::error::Issue creation failed — HTTP <code>
```

Common codes:

- `403` — App lacks `issues: write` on the target repo, or the App
  was uninstalled. Re-install the App on the repo and re-run.
- `404` — target repo does not exist or is private and the App has
  no access. Confirm `TEST_REPO_OWNER` and `TEST_REPO_NAME` in the
  workflow env.
- `422` — label the workflow asked to apply (`test/auto-delete`) does
  not exist, or body/title is malformed. Fall back to Phase 1.

### Phase 4 — Primary attribution check failed

Symptom:

```
::error::Attribution contract violated — issue.user.login mismatch
  expected: 'kubestellar-console-bot[bot]'
  got:      '<something-else>'
```

This means the App did successfully create the issue but GitHub
attributed it to a different user. Either:

- The App was renamed. Update `EXPECTED_USER_LOGIN` and
  `EXPECTED_SLUG` env in `.github/workflows/console-app-roundtrip.yml`
  to the new slug (and open a follow-up PR to align
  `DefaultConsoleAppSlug` in `pkg/api/handlers/github_app_auth.go`).
- The installation token credential does not belong to the expected
  App. Re-check the three `KUBESTELLAR_CONSOLE_APP_*` secrets; they
  may point at a different App now.
- `EXPECTED_USER_LOGIN` is out of sync with `EXPECTED_SLUG`. The
  convention is `<slug>[bot]`; update both together.

### Phase 4.5 — Secondary check warning

Symptom (non-fatal, workflow still succeeds):

```
::warning::performed_via_github_app is null on issue #<N>
```

This is a known GitHub API quirk and is not actionable by itself. If
the warning persists for more than two weeks across multiple App
installations, open an upstream ticket with GitHub Support referencing:

- Issue number created by the workflow run (the run log has it).
- The response body from the `GET /repos/.../issues/<N>` call made by
  the workflow with `GITHUB_TOKEN` — showing `.user.login` is a bot
  but `.performed_via_github_app` is null.

The rewards classifier (`pkg/api/handlers/rewards.go`
`isConsoleAppSubmitted`) currently reads `performed_via_github_app`.
If GitHub permanently drops that field, switch the classifier to read
`.user.login` as its primary signal as a follow-up PR; the attribution
enforcement gate in production is a Phase 2 rollout and is currently
disabled (no `CONSOLE_APP_ATTRIBUTION_CUTOFF` env var set), so a
missing field does not currently affect points.

## Re-running the workflow

```bash
unset GITHUB_TOKEN && gh workflow run console-app-roundtrip.yml \
  --repo kubestellar/console
```

Then watch:

```bash
unset GITHUB_TOKEN && gh run list --repo kubestellar/console \
  --workflow=console-app-roundtrip.yml --limit 3
```

## Closing the failure issue

Once the workflow passes one full run, close the
`console-app-roundtrip-failure` issue manually. The workflow does not
auto-close it because a single green run is not enough evidence to
retire a known-broken signal — wait for two consecutive greens in a row.
