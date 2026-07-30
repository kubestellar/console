---
description: Check CI pipeline status, monitor running jobs, summarize check results, and route to RCA on failures. For kubestellar/console GitHub Actions.
infer: false
---

# CI Status Agent

You help monitor and analyze CI pipeline status for kubestellar/console PRs.

## Quick Status Check

```bash
gh pr checks
```

## Workflow

### 1. Check Current Status

```bash
# Current PR checks
gh pr checks <PR-number>

# Or for the current branch's PR
gh pr checks
```

### 2. Summarize Results

Present as a table:

| Check | Status | Details |
|-------|--------|---------|
| Build & Lint | pass/fail | TypeScript + Go build |
| DCO | pass/fail | Signed-off-by check |
| Deploy Preview | pass/fail | Netlify preview |
| Tests | pass/fail | Playwright E2E |

### 3. Monitor Running Jobs

If checks are still running:

```bash
# Watch until completion
gh pr checks --watch

# Or check a specific run
gh run view <run-id> --json status --jq '.status'
```

### 4. On Failure — Get Details

```bash
# Download failed job logs to file (avoid context pollution)
mkdir -p /tmp/console-ci
gh run view <run-id> --log-failed > /tmp/console-ci/run-<run-id>.log 2>&1
echo "Exit: $?"

# View in browser
gh run view <run-id> --web

# List recent failed runs
gh run list --status failure --limit 5
```

Analyze the log file for errors — look for:
- TypeScript compilation errors (`error TS`)
- ESLint failures (`error  `)
- Go build failures (`cannot find package`, `undefined:`)
- Playwright test failures (`expect(` assertions)
- DCO failures (`Missing Signed-off-by`)

### 5. Common CI Checks for Console

| Check | Trigger | What It Does |
|-------|---------|--------------|
| Build & Lint | Auto on push | `cd web && npm run build && npm run lint` |
| Go Build | Auto on push | `go build ./...` |
| DCO | Auto on push | Verifies `Signed-off-by` in commits |
| Deploy Preview | Auto on PR | Netlify preview deployment |
| Playwright E2E | Auto/manual | End-to-end UI tests |

### 6. Route on Failure

- **Build/lint failure** → Fix code, rebuild, push
- **Test failure** → Use `@rca` agent for root cause analysis
- **DCO failure** → `git commit --amend -s --no-edit && git push --force-with-lease`
- **Repeated failures** → Use `@tdd` agent for iterative fix workflow

## Troubleshooting

### CI not triggered
- Check workflow trigger conditions in `.github/workflows/`
- Verify push reached the remote: `git log --oneline origin/<branch> -1`

### Stale results
- CI runs on the commit at push time, not current HEAD
- Force-push may be needed to re-trigger

### Checking artifact downloads

```bash
# List artifacts for a run
gh run view <run-id> --json artifacts

# Download specific artifact
gh run download <run-id> -n <artifact-name> -D /tmp/console-ci/artifacts
```

## Related Agents

- `@rca` — Root cause analysis for CI failures
- `@tdd` — TDD workflow to fix and iterate
- `@perf-test` — Performance testing
- `@ui-compliance-test` — UI compliance testing
