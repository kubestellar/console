# Fix: deploy-vllm-d stuck on "Pending termination" — Build and Deploy KC (#22591)

## Problem

The **Build and Deploy KC** workflow's `deploy-vllm-d` job failed again on
the `Deploy with Helm` step with:

```
level=WARN msg="upgrade failed" name=kc error="resource Deployment/kc/kc-kubestellar-console not ready. status: InProgress, message: Pending termination: 1\ncontext deadline exceeded"
Error: UPGRADE FAILED: release kc failed, and has been rolled back due to
rollback-on-failure being set: resource Deployment/kc/kc-kubestellar-console
not ready. status: InProgress, message: Pending termination: 1
context deadline exceeded
```

Both retry attempts (`MAX_ATTEMPTS=2`) failed identically, each timing out
at almost exactly 10 minutes
(run [#31977753632](https://github.com/kubestellar/console/actions/runs/31977753632)).

## Root cause

`deploy_helm()` in `.github/workflows/build-deploy.yml` (`main`, as of this
writing) still runs:

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

This is the exact same class of issue already diagnosed twice before, in
[`docs/ci/fix-22401-pvc-migration-hook-timeout.md`](fix-22401-pvc-migration-hook-timeout.md)
(#22401 / PR #22406) and
[`docs/ci/fix-22559-deploy-vllm-d-timeout.md`](fix-22559-deploy-vllm-d-timeout.md)
(#22559 / PR #22563), both of which recommended raising the Helm timeout
from `10m` to `15m` and deleting any stale `pvc-migration` hook Job before
each attempt. **Neither diff has been applied to
`.github/workflows/build-deploy.yml` on `main`** — the `--timeout 10m` line
and the missing "Delete stale pvc-migration hook Job" step are still
present. That is why `deploy-vllm-d` keeps failing in the same way.

## Fix

Apply the following patch to `.github/workflows/build-deploy.yml`
(`deploy-vllm-d` job, and `deploy-pok-prod` if it has the same `10m`
budget):

```diff
--- a/.github/workflows/build-deploy.yml
+++ b/.github/workflows/build-deploy.yml
@@ deploy-vllm-d: job timeout-minutes comment
-    # 20m was too tight: deploy_helm retries up to MAX_ATTEMPTS=2 times, each
-    # bounded by `--timeout 10m` (=20m), plus recover_release (rollback
+    # 20m was too tight: deploy_helm retries up to MAX_ATTEMPTS=2 times, each
+    # bounded by `--timeout 15m` (=30m), plus recover_release (rollback
     # --timeout 2m / uninstall --timeout 5m) and retry sleeps in between.

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

## Applying the fix

A maintainer with `workflows:write` permission must apply this diff
directly on `main` or via a PR opened with a PAT/App token that has
`workflows` scope.

Confirmed again while investigating #22591: the scanner agent's GitHub App
installation token rejects any push touching `.github/workflows/*`
(`refusing to allow a GitHub App to create or update workflow
'.github/workflows/build-deploy.yml' without 'workflows' permission`), so
this fix cannot be pushed directly by this agent — the same constraint
documented in #22401/#22406/#22559.

## References

- Issue: #22591
- Failed run: #31977753632
- Prior (unapplied) fixes for the same root cause: #22401 (PR #22406),
  #22559 (PR #22563)
