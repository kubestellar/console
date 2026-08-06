# Auto-Retry Transient CI Failures

This document describes the `auto-retry-transient-failures.yml` workflow
that should be added to `.github/workflows/` to automatically retry
known-transient GitHub Actions infrastructure failures.

## Problem

GitHub-hosted runner outages ("Service Unavailable" resolving action
download info, or a job "not acquired by Runner after multiple attempts")
occasionally fail main-branch runs. These are not code bugs — retrying
the same commit against fresh runners typically succeeds. See #22271.

## Workflow content

```yaml
name: Auto-Retry Transient CI Failures

on:
  workflow_run:
    workflows:
      - "Build and Deploy KC"
      - "Coverage Suite"
    types:
      - completed

permissions: read-all

jobs:
  retry:
    permissions:
      actions: write
    runs-on: ubuntu-latest
    timeout-minutes: 5
    if: >-
      github.event.workflow_run.event == 'push' &&
      github.event.workflow_run.head_branch == 'main' &&
      github.event.workflow_run.run_attempt == 1 &&
      contains(fromJSON('["failure", "cancelled"]'), github.event.workflow_run.conclusion)
    steps:
      - name: Check for known transient CI infrastructure signatures
        id: check
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          REPOSITORY: ${{ github.repository }}
          RUN_ID: ${{ github.event.workflow_run.id }}
        run: |
          LOG=$(gh run view "$RUN_ID" --repo "$REPOSITORY" --log-failed 2>&1 || true)
          if echo "$LOG" | grep -qE \
            'Failed to resolve action download info|Service Unavailable|was not acquired by Runner'; then
            echo "transient=true" >> "$GITHUB_OUTPUT"
          else
            echo "transient=false" >> "$GITHUB_OUTPUT"
          fi
      - name: Rerun failed jobs
        if: steps.check.outputs.transient == 'true'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          REPOSITORY: ${{ github.repository }}
          RUN_ID: ${{ github.event.workflow_run.id }}
          WORKFLOW_NAME: ${{ github.event.workflow_run.name }}
        run: |
          echo "::notice::${WORKFLOW_NAME} run ${RUN_ID} failed with a known-transient CI infrastructure error — rerunning failed jobs."
          gh run rerun "$RUN_ID" --repo "$REPOSITORY" --failed
```

## coverage-hourly.yml fix

Change line 275 of `.github/workflows/coverage-hourly.yml`:

```diff
-        if: steps.failures.outputs.count == '0' && needs.test-shard.result != 'failure'
+        if: steps.failures.outputs.count == '0' && needs.test-shard.result == 'success'
```
