# `deploy.sh.sha256` Checksum Update — No Failure Alert Runbook (RESOLVED)

**Repository:** `kubestellar/console`
**Applies to:** `.github/workflows/deploy-checksum.yml`

---

## Current Status

**Fixed.** `deploy-checksum.yml`'s `update-checksum` job now has a
self-contained `if: failure()` step (the same pattern used by
`console-app-smoke.yml`) that opens/dedupes a `priority/critical`,
`deploy-checksum-failure`-labeled issue, and the job was granted
`issues: write` alongside the `contents: write` it already had. A failed
checksum regeneration or push is no longer invisible outside the Actions
tab. Tracking issue
[#24053](https://github.com/kubestellar/console/issues/24053) is closed.
The "Why The Catch-All Doesn't Help As-Is" and "Detecting Drift Today"
sections below are kept for historical reference and as a manual fallback
if the failure-alert step itself is ever suspected of not firing.

## Why This Matters

`deploy.sh` documents a security-conscious install path for users who don't
want to blindly pipe a downloaded script into `bash`:

```bash
curl -sSL https://raw.githubusercontent.com/kubestellar/console/main/deploy.sh -o deploy.sh
curl -sSL https://raw.githubusercontent.com/kubestellar/console/main/deploy.sh.sha256 -o deploy.sh.sha256
sha256sum -c deploy.sh.sha256
bash deploy.sh
```

`deploy-checksum.yml` is the only thing keeping `deploy.sh.sha256` in sync
with `deploy.sh`: it runs on every push to `main` that touches `deploy.sh`,
regenerates the checksum, and commits it back. If that commit/push step fails
silently (branch protection rejecting a direct push, a race with another
concurrent push to `main`, a transient permissions problem, etc.), the
checksum file goes stale and **every user who follows the documented
verification steps gets a `sha256sum: FAILED` mismatch** — or, worse, doesn't
check the exit code and proceeds anyway, defeating the purpose of the
checksum. There is currently no automated signal that this has happened; the
drift would only surface when a user reports it or a maintainer happens to
diff the two files.

## Why The Catch-All Doesn't Help As-Is

`.github/workflows/workflow-failure-issue.yml`'s `workflow_run` trigger only
opens an issue when:

```yaml
if: >-
  github.event.workflow_run.conclusion == 'failure' &&
  (github.event.workflow_run.event == 'schedule' ||
   github.event.workflow_run.event == 'workflow_dispatch' ||
   (github.event.workflow_run.name == 'Build and Deploy KC' &&
    github.event.workflow_run.head_branch == 'main'))
```

`deploy-checksum.yml` runs on `push`, not `schedule`/`workflow_dispatch`, and
it isn't `Build and Deploy KC`. Simply adding its `name:` to the catch-all's
`workflows:` list (the fix used for every other gap in this runbook
directory) would be a no-op here — the `if:` condition would still filter the
event out. This workflow needs either its own `if: failure()` alert step
(the pattern already used by `auth-login-smoke.yml` and
`console-app-smoke.yml`), or a dedicated `(name == '...' && event == 'push' &&
head_branch == 'main')` clause added to the catch-all's condition.

## Detecting Drift Today

```bash
curl -sSL https://raw.githubusercontent.com/kubestellar/console/main/deploy.sh | sha256sum
cat <(curl -sSL https://raw.githubusercontent.com/kubestellar/console/main/deploy.sh.sha256)
```

If the two hashes don't match, the checksum is stale. Also check for a recent
failed run:

```bash
gh run list --repo kubestellar/console --workflow=deploy-checksum.yml --limit 10
```

## Proposed Fix

~~Add a self-contained `if: failure()` step to `deploy-checksum.yml`'s
`update-checksum` job (same pattern as `console-app-smoke.yml`), and grant
the job `issues: write`. This workflow lives under `.github/workflows/`,
which this agent's token cannot push to — applying the diff requires a
maintainer or an `ISSUES_PRS_MERGE`-tier agent.~~ Applied — see "Current
Status" above.

## Escalation

Treat a confirmed stale `deploy.sh.sha256` as `priority/critical`: it breaks
a documented security verification step for every new cluster install via
the `curl | sha256sum -c | bash` path until fixed. Regenerate manually with
`sha256sum deploy.sh > deploy.sh.sha256` and push directly if the workflow
itself is broken.
