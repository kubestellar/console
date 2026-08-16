# Fix: Build and Deploy KC — deploy-vllm-d Helm timeout (recurring #22579)

## Problem

The **Build and Deploy KC** workflow's `deploy-vllm-d` job is failing
again with the same "Pending termination" timeout error documented in
[`docs/ci/fix-22559-deploy-vllm-d-timeout.md`](fix-22559-deploy-vllm-d-timeout.md)
(issue #22559). Issue #22579 is another recurrence because the
recommended patch from #22559 was never applied to the workflow file.

```
Error: UPGRADE FAILED: release kc failed, and has been rolled back due to
rollback-on-failure being set: resource Deployment/kc/kc-kubestellar-console
not ready. status: InProgress, message: Pending termination: 1
context deadline exceeded
```

## Root cause

Identical to #22401 / #22559: `.github/workflows/build-deploy.yml`
`deploy_helm()` still uses `--timeout 10m`. The fix documented in
`docs/ci/fix-22559-deploy-vllm-d-timeout.md` has not been applied.

## Fix

Apply the patch described in
[`docs/ci/fix-22559-deploy-vllm-d-timeout.md`](fix-22559-deploy-vllm-d-timeout.md)
— the required diff is unchanged:

1. Add a **"Delete stale pvc-migration hook Job"** step before
   **"Deploy with Helm"** in the `deploy-vllm-d` job.
2. Change `--timeout 10m` → `--timeout 15m` in `deploy_helm()`.

```diff
--- a/.github/workflows/build-deploy.yml
+++ b/.github/workflows/build-deploy.yml
@@ After "Migrate RWO PVCs to ReadWriteMany", before SCC comment block @@

+      # Delete any leftover pvc-migration Job from a previously failed deploy
+      # attempt. Helm's before-hook-creation policy handles normal cases, but
+      # a Job stuck in Running state from a prior run blocks hook creation and
+      # causes the next Helm upgrade to wait the full --timeout before failing.
+      # (#22401 / #22559 / #22579)
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
       # #6344 / #6353: OpenShift SCC allocates a namespace-specific UID
       # range and rejects pods whose runAsUser falls outside that range.
       - name: Deploy with Helm
         run: |
           deploy_helm() {
             helm upgrade --install ${{ env.HELM_RELEASE_NAME }} ./deploy/helm/kubestellar-console \
               ...
-              --timeout 10m
+              --timeout 15m
           }
```

## Applying the fix

A maintainer with `workflows:write` permission must apply this diff
directly on `main` or via a PR opened with a PAT/App token that has the
`workflows` scope.

The scanner agent's GitHub App installation token cannot push
`.github/workflows/*` changes (`refusing to allow a GitHub App to create
or update workflow ... without 'workflows' permission`).

## References

- Issue: #22579 (this recurrence)
- Prior occurrences: #22401 (PR #22406), #22559 (PR #22563)
- Fix doc for the same root cause: `docs/ci/fix-22559-deploy-vllm-d-timeout.md`
