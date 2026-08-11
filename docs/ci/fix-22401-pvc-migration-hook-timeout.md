# Fix: pvc-migration Hook Timeout — Build and Deploy KC (#22401)

## Problem

The **Build and Deploy KC** workflow fails on both `deploy-vllm-d` and
`deploy-pok-prod` with:

```
Error: UPGRADE FAILED: release kc failed, and has been rolled back due to
rollback-on-failure being set: pre-upgrade hooks failed: resource
Job/.../kc-kubestellar-console-pvc-migration not ready. status: InProgress,
message: Job in progress
context deadline exceeded
```

**Root cause:** The `kc-kubestellar-console-pvc-migration` pre-upgrade Helm
hook Job has `activeDeadlineSeconds: 600` (10 minutes). Helm also has
`--timeout 10m`. Helm's timer starts *before* the hook SA/Role/RoleBinding
resources are created. By the time the Job pod schedules, pulls the
`bitnami/kubectl` image, and begins deleting PVCs (up to 180s per PVC),
the 10-minute Helm budget is already partly consumed — leaving insufficient
runway. Both deploy attempts exhaust the 10-minute window without the Job
completing.

A secondary risk: a Job that's stuck in `Running` from a *prior* failed
deploy attempt can block Helm's `before-hook-creation` delete policy if the
Job object persists (e.g., because the previous run was cancelled mid-hook).
This forces Helm to wait the full `--timeout` before even starting the new Job.

## Fix

Apply the following patch to `.github/workflows/build-deploy.yml`:

1. **Increase `--timeout` from `10m` to `15m`** in both `deploy-vllm-d` and
   `deploy-pok-prod` `Deploy with Helm` steps. This gives the pvc-migration
   hook sufficient runway to complete within Helm's budget.

2. **Add a `Delete stale pvc-migration hook Job` step** before `Deploy with
   Helm` in both deploy jobs. This force-deletes any lingering Job from a
   prior failed deploy, ensuring Helm's `before-hook-creation` policy has a
   clean slot.

### Exact diff to apply

```diff
--- a/.github/workflows/build-deploy.yml
+++ b/.github/workflows/build-deploy.yml
@@ deploy-vllm-d: after "Migrate RWO PVCs to ReadWriteMany" step, before the SCC comment

+      # Delete any leftover pvc-migration Job from a previously failed deploy
+      # attempt. Helm's before-hook-creation policy handles normal cases, but
+      # a Job stuck in Running state from a prior run can block hook creation
+      # and cause a new Helm upgrade to wait the full --timeout before failing.
+      # Explicitly deleting it here (with --grace-period=0 for fast teardown)
+      # ensures the hook slot is free before `helm upgrade --install` begins.
+      - name: Delete stale pvc-migration hook Job
+        run: |
+          JOB_NAME="kc-kubestellar-console-pvc-migration"
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

@@ deploy-pok-prod: after "Migrate RWO PVCs to ReadWriteMany" step, before the SCC comment

+      # Delete any leftover pvc-migration Job from a previously failed deploy
+      # attempt. Helm's before-hook-creation policy handles normal cases, but
+      # a Job stuck in Running state from a prior run can block hook creation
+      # and cause a new Helm upgrade to wait the full --timeout before failing.
+      # Explicitly deleting it here (with --grace-period=0 for fast teardown)
+      # ensures the hook slot is free before `helm upgrade --install` begins.
+      - name: Delete stale pvc-migration hook Job
+        run: |
+          JOB_NAME="kc-kubestellar-console-pvc-migration"
+          NAMESPACE=kubestellar-console
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

The full unified diff is in the commit that added this document.

## Applying the fix

A maintainer with `workflows:write` permission must apply the diff above to
`.github/workflows/build-deploy.yml` directly on `main` or via a PR opened
with a PAT/App token that has `workflows` scope.

The scanner agent cannot push workflow files (GitHub App tokens require an
explicit `workflows` installation permission which is not granted to this
agent's scoped token).

## References

- Failed run: <https://github.com/kubestellar/console/actions/runs/31494087457>
- Issue: #22401
- Prior similar fix: #22280
- Helm chart hook: `deploy/helm/kubestellar-console/templates/pre-upgrade-pvc-migration.yaml`
