# Fix: deploy-vllm-d stuck on "Pending termination" — Build and Deploy KC (#22559)

## Problem

The **Build and Deploy KC** workflow's `deploy-vllm-d` job fails on the
`Deploy with Helm` step with:

```
level=WARN msg="upgrade failed" name=kc error="resource Deployment/kc/kc-kubestellar-console not ready. status: InProgress, message: Pending termination: 1\ncontext deadline exceeded"
Error: UPGRADE FAILED: release kc failed, and has been rolled back due to
rollback-on-failure being set: resource Deployment/kc/kc-kubestellar-console
not ready. status: InProgress, message: Pending termination: 1
context deadline exceeded
```

Both retry attempts (`MAX_ATTEMPTS=2`) fail identically, each timing out at
almost exactly 10 minutes
(runs [#31904854137](https://github.com/kubestellar/console/actions/runs/31904854137),
[#31904857098](https://github.com/kubestellar/console/actions/runs/31904857098),
[#31913009175](https://github.com/kubestellar/console/actions/runs/31913009175)).

## Root cause

`deploy_helm()` in `.github/workflows/build-deploy.yml` still runs:

```
helm upgrade --install kc ./deploy/helm/kubestellar-console \
  ...
  --atomic \
  --cleanup-on-fail \
  --timeout 10m
```

That single 10-minute Helm budget has to cover the pre-upgrade
`pvc-migration` hook Job, the RWO→RWX PVC migration check, **and** the
actual Deployment rolling update (chart's `RollingUpdate` strategy is
`maxSurge: 1, maxUnavailable: 0`, so the old pod is only removed once the
new one is ready). With so little runway left by the time the rollout
starts, the old pod is still mid-`Terminating` (`Pending termination: 1`)
when Helm's wait deadline is hit, so `--atomic` rolls the release back and
the job fails — this is not a code regression in the app, it is the
upgrade timing out.

This is the exact same class of issue already diagnosed in
[`docs/ci/fix-22401-pvc-migration-hook-timeout.md`](fix-22401-pvc-migration-hook-timeout.md)
(for #22401 / PR #22406), which recommended raising the Helm timeout from
`10m` to `15m` and deleting any stale `pvc-migration` hook Job before each
attempt. **That diff was never applied to `.github/workflows/build-deploy.yml`**
— `git blame` shows the `--timeout 10m` line is unchanged since 2026-08-11
(commit `4c16005`), and there is still no `Delete stale pvc-migration hook
Job` step before `Deploy with Helm`. That is why `deploy-vllm-d` keeps
failing in the same way.

## Fix

Apply the following patch to `.github/workflows/build-deploy.yml`
(`deploy-vllm-d` job, and `deploy-pok-prod` if it has the same `10m`
budget):

```diff
--- a/.github/workflows/build-deploy.yml
+++ b/.github/workflows/build-deploy.yml
@@ deploy-vllm-d: after "Migrate RWO PVCs to ReadWriteMany" step, before the SCC comment

+      # Delete any leftover pvc-migration Job from a previously failed deploy
+      # attempt. Helm's before-hook-creation policy handles normal cases, but
+      # a Job stuck in Running state from a prior run can block hook creation
+      # and cause a new Helm upgrade to wait the full --timeout before failing.
+      - name: Delete stale pvc-migration hook Job
+        run: |
+          JOB_NAME="${{ env.HELM_RELEASE_NAME }}-kubestellar-console-pvc-migration"
+          NAMESPACE=kc
+          if kubectl get job "$JOB_NAME" -n "$NAMESPACE" &>/dev/null; then
+            echo "Found stale pvc-migration Job — deleting before Helm upgrade..."
+            kubectl delete job "$JOB_NAME" -n "$NAMESPACE" --grace-period=0 --force 2>/dev/null || true
+            kubectl wait --for=delete job/"$JOB_NAME" -n "$NAMESPACE" --timeout=30s 2>/dev/null || true
+            echo "Stale pvc-migration Job removed."
+          else
+            echo "No stale pvc-migration Job found."
+          fi
+
       # #6344 / #6353: OpenShift SCC ...
       - name: Deploy with Helm
         run: |
           ...
-              --timeout 10m
+              --timeout 15m
           }
```

Also update the `timeout-minutes: 45` comment on the `deploy-vllm-d` job to
reflect the new `2 * 15m` retry budget (plus recover/rollback/sleep
overhead) if the job-level timeout needs to grow accordingly.

## Applying the fix

A maintainer with `workflows:write` permission must apply this diff
directly on `main` or via a PR opened with a PAT/App token that has
`workflows` scope.

Confirmed while investigating #22559: the scanner agent's GitHub App
installation token rejects any push touching `.github/workflows/*`
(`refusing to allow a GitHub App to create or update workflow ... without
'workflows' permission`), so this fix cannot be pushed directly by this
agent — the same constraint documented in #22401/#22406.

## References

- Issue: #22559
- Failed runs: #31904854137, #31904857098, #31913009175
- Prior (unapplied) fix for the same root cause: #22401, PR #22406,
  `docs/ci/fix-22401-pvc-migration-hook-timeout.md`
