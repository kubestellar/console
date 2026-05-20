package handlers

import (
	"context"
	"fmt"
	"log/slog"
	"strings"

	"github.com/kubestellar/console/pkg/api/v1alpha1"
	"github.com/kubestellar/console/pkg/k8s"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// reconcileDeployment handles the full lifecycle of deploying a workload to
// target clusters. It:
//  1. Resolves the ManagedWorkload referenced by workloadRef
//  2. Resolves target clusters (from targetGroupRef or targetClusters)
//  3. Deploys manifests to each target cluster via the multi-cluster client
//  4. Updates WorkloadDeployment.Status with per-cluster progress
//  5. Persists terminal state (Complete / Failed) — no retry on failure
func (h *ConsolePersistenceHandlers) reconcileDeployment(ctx context.Context, wd *v1alpha1.WorkloadDeployment) {
	slog.Info("[ConsolePersistence] reconciling deployment",
		"namespace", wd.Namespace, "name", wd.Name)

	// statusCtx is decoupled from the reconcile context so that status writes
	// succeed even when reconcileCtx times out or is cancelled.
	statusCtx := context.WithoutCancel(ctx)

	// Helper: persist status update, logging on error. Captures the returned
	// resourceVersion so subsequent updates don't conflict.
	updateStatus := func(wd *v1alpha1.WorkloadDeployment) {
		client, _, err := h.persistenceStore.GetActiveClient(statusCtx)
		if err != nil {
			slog.Error("[reconcile] failed to get client for status update", "error", err)
			return
		}
		persistence := k8s.NewConsolePersistence(client)
		updated, err := persistence.UpdateWorkloadDeploymentStatus(statusCtx, wd)
		if err != nil {
			slog.Error("[reconcile] failed to update deployment status",
				"name", wd.Name, "error", err)
			return
		}
		// Propagate the new resourceVersion so the next update won't hit a
		// 409 Conflict from the API server.
		wd.ResourceVersion = updated.ResourceVersion
	}

	// Transition to InProgress
	wd.Status.Phase = "InProgress"
	updateStatus(wd)

	// ---- Step 1: Resolve the referenced ManagedWorkload ----
	workload, err := h.resolveManagedWorkload(ctx, wd)
	if err != nil {
		slog.Error("[reconcile] failed to resolve ManagedWorkload",
			"name", wd.Name, "error", err)
		h.setTerminalStatus(wd, "Failed", "Failed to resolve ManagedWorkload", updateStatus)
		return
	}

	// ---- Step 2: Resolve target clusters ----
	targets, err := h.resolveTargetClusters(ctx, wd)
	if err != nil {
		slog.Error("[reconcile] failed to resolve target clusters",
			"name", wd.Name, "error", err)
		h.setTerminalStatus(wd, "Failed", "Failed to resolve target clusters", updateStatus)
		return
	}
	if len(targets) == 0 {
		h.setTerminalStatus(wd, "Failed", "No target clusters resolved", updateStatus)
		return
	}

	// Initialize per-cluster statuses
	wd.Status.ClusterStatuses = make([]v1alpha1.ClusterRolloutStatus, len(targets))
	for i, cluster := range targets {
		wd.Status.ClusterStatuses[i] = v1alpha1.ClusterRolloutStatus{
			Cluster: cluster,
			Phase:   "Pending",
		}
	}
	wd.Status.Progress = fmt.Sprintf("0/%d clusters", len(targets))
	updateStatus(wd)

	// ---- Step 3: Deploy to each target cluster ----
	deployer := h.deployer
	if deployer == nil && h.k8sClient != nil {
		deployer = h.k8sClient
	}
	if deployer == nil {
		slog.Error("[reconcile] k8sClient is nil, cannot deploy workload", "name", wd.Name)
		// Mark every cluster as Failed so ClusterStatuses are consistent with
		// the terminal Failed phase (not left in Pending).
		now := metav1.Now()
		for i := range wd.Status.ClusterStatuses {
			wd.Status.ClusterStatuses[i].Phase = "Failed"
			wd.Status.ClusterStatuses[i].Message = "Multi-cluster client not configured"
			wd.Status.ClusterStatuses[i].CompletedAt = &now
		}
		wd.Status.Progress = fmt.Sprintf("0/%d clusters", len(targets))
		h.setTerminalStatus(wd, "Failed", "Internal error: multi-cluster client not configured", updateStatus)
		return
	}

	ref := workload.Spec.WorkloadRef
	replicas := int32(0)
	if workload.Spec.Replicas != nil {
		replicas = *workload.Spec.Replicas
	}

	deployOpts := &k8s.DeployOptions{
		DeployedBy: "console-reconciler",
	}

	result, err := deployer.DeployWorkload(
		ctx,
		workload.Spec.SourceCluster,
		workload.Spec.SourceNamespace,
		ref.Name,
		targets,
		replicas,
		deployOpts,
	)

	// ---- Step 4: Map deploy results to per-cluster statuses ----
	deployedSet := make(map[string]bool)
	failedSet := make(map[string]bool)

	if result != nil {
		for _, c := range result.DeployedTo {
			deployedSet[c] = true
		}
		for _, c := range result.FailedClusters {
			failedSet[c] = true
		}
	} else if err != nil {
		// If DeployWorkload itself returned an error with no result,
		// mark all clusters as failed.
		for _, c := range targets {
			failedSet[c] = true
		}
	}

	now := metav1.Now()
	succeededCount := 0
	failedCount := 0

	for i := range wd.Status.ClusterStatuses {
		cs := &wd.Status.ClusterStatuses[i]
		cs.CompletedAt = &now
		if deployedSet[cs.Cluster] {
			cs.Phase = "Complete"
			cs.Progress = "100%"
			cs.Message = "Deployed successfully"
			succeededCount++
		} else if failedSet[cs.Cluster] {
			cs.Phase = "Failed"
			cs.Progress = "0%"
			if err != nil {
				slog.Error("[reconcile] cluster deployment failed",
					"cluster", cs.Cluster, "name", wd.Name, "error", err)
			}
			cs.Message = "Deployment failed"
			failedCount++
		} else {
			// Not in either list — cluster was in targets but not reported by
			// DeployWorkload in either deployedTo or failedClusters. Flag as
			// NotProcessed (distinct from intentional skip) so operators can
			// investigate why deployment logic missed this cluster (#7186).
			cs.Phase = "NotProcessed"
			cs.Message = "Cluster was targeted but not processed by deployer — possible deployment logic gap"
		}
	}

	wd.Status.Progress = fmt.Sprintf("%d/%d clusters", succeededCount, len(targets))

	// ---- Step 5: Determine terminal phase ----
	if failedCount == 0 {
		h.setTerminalStatus(wd, "Complete",
			fmt.Sprintf("All %d clusters deployed successfully", succeededCount), updateStatus)
	} else if succeededCount > 0 {
		// Partial success — still mark as Failed so clients know action is needed,
		// but the message explains partial success.
		h.setTerminalStatus(wd, "Failed",
			fmt.Sprintf("Partial deployment: %d succeeded, %d failed", succeededCount, failedCount), updateStatus)
	} else {
		if err != nil {
			slog.Error("[reconcile] all clusters failed",
				"name", wd.Name, "failedCount", failedCount, "error", err)
		}
		h.setTerminalStatus(wd, "Failed",
			fmt.Sprintf("All %d clusters failed", failedCount), updateStatus)
	}
}

// setTerminalStatus sets the deployment to a terminal phase (Complete/Failed),
// records a completion timestamp and a history entry, then persists the status.
func (h *ConsolePersistenceHandlers) setTerminalStatus(
	wd *v1alpha1.WorkloadDeployment,
	phase, message string,
	updateFn func(*v1alpha1.WorkloadDeployment),
) {
	now := metav1.Now()
	wd.Status.Phase = phase
	wd.Status.CompletedAt = &now

	// Compute next revision number
	nextRevision := 1
	for _, entry := range wd.Status.History {
		if entry.Revision >= nextRevision {
			nextRevision = entry.Revision + 1
		}
	}

	wd.Status.History = append(wd.Status.History, v1alpha1.DeploymentHistoryEntry{
		Revision:    nextRevision,
		StartedAt:   wd.Status.StartedAt,
		CompletedAt: &now,
		Phase:       phase,
		Message:     message,
	})

	slog.Info("[reconcile] deployment reached terminal state",
		"name", wd.Name, "phase", phase, "message", message)
	updateFn(wd)
}

// resolveManagedWorkload fetches the ManagedWorkload referenced by the
// WorkloadDeployment's spec.workloadRef.
func (h *ConsolePersistenceHandlers) resolveManagedWorkload(
	ctx context.Context, wd *v1alpha1.WorkloadDeployment,
) (*v1alpha1.ManagedWorkload, error) {
	client, _, err := h.persistenceStore.GetActiveClient(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get persistence client: %w", err)
	}
	persistence := k8s.NewConsolePersistence(client)

	// Resolve namespace: use the ref's namespace if set, otherwise the
	// deployment's own namespace.
	ns := wd.Spec.WorkloadRef.Namespace
	if ns == "" {
		ns = wd.Namespace
	}

	workload, err := persistence.GetManagedWorkload(ctx, ns, wd.Spec.WorkloadRef.Name)
	if err != nil {
		return nil, fmt.Errorf("ManagedWorkload %s/%s not found: %w",
			ns, wd.Spec.WorkloadRef.Name, err)
	}
	if workload == nil {
		return nil, fmt.Errorf("ManagedWorkload %s/%s does not exist",
			ns, wd.Spec.WorkloadRef.Name)
	}
	return workload, nil
}

// resolveTargetClusters determines the set of target clusters for a
// WorkloadDeployment by looking at spec.targetClusters and
// spec.targetGroupRef. Explicit clusters take precedence; if a
// targetGroupRef is also provided its matched clusters are merged in.
func (h *ConsolePersistenceHandlers) resolveTargetClusters(
	ctx context.Context, wd *v1alpha1.WorkloadDeployment,
) ([]string, error) {
	clusterSet := make(map[string]bool)

	// Add explicit target clusters
	for _, c := range wd.Spec.TargetClusters {
		clusterSet[c] = true
	}

	// #7180/#7199 — Warn when both targetClusters and targetGroupRef are
	// specified. The two sources are merged silently which can lead to
	// unexpected clusters being included in the deployment.
	if len(wd.Spec.TargetClusters) > 0 && wd.Spec.TargetGroupRef != nil && wd.Spec.TargetGroupRef.Name != "" {
		slog.Warn("[reconcile] WorkloadDeployment specifies both targetClusters and targetGroupRef — clusters will be merged",
			"name", wd.Name, "namespace", wd.Namespace,
			"explicitClusters", strings.Join(wd.Spec.TargetClusters, ","),
			"groupRef", wd.Spec.TargetGroupRef.Name)
	}

	// Resolve from ClusterGroup if referenced
	if wd.Spec.TargetGroupRef != nil && wd.Spec.TargetGroupRef.Name != "" {
		client, _, err := h.persistenceStore.GetActiveClient(ctx)
		if err != nil {
			return nil, fmt.Errorf("failed to get persistence client: %w", err)
		}
		persistence := k8s.NewConsolePersistence(client)

		ns := wd.Spec.TargetGroupRef.Namespace
		if ns == "" {
			ns = wd.Namespace
		}

		group, err := persistence.GetClusterGroup(ctx, ns, wd.Spec.TargetGroupRef.Name)
		if err != nil {
			return nil, fmt.Errorf("ClusterGroup %s/%s not found: %w",
				ns, wd.Spec.TargetGroupRef.Name, err)
		}
		if group == nil {
			return nil, fmt.Errorf("ClusterGroup %s/%s does not exist",
				ns, wd.Spec.TargetGroupRef.Name)
		}

		// Re-evaluate the group to get fresh cluster matches
		matched := h.evaluateClusterGroup(ctx, group)
		for _, c := range matched {
			clusterSet[c] = true
		}
	}

	result := make([]string, 0, len(clusterSet))
	for c := range clusterSet {
		result = append(result, c)
	}
	return result, nil
}
