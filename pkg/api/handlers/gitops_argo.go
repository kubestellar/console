package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os/exec"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/api/v1alpha1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func (h *GitOpsHandlers) ListHelmHistory(c *fiber.Ctx) error {
	cluster := c.Query("cluster")
	release := c.Query("release")
	namespace := c.Query("namespace")

	if release == "" {
		// Return empty history instead of 400 — callers may query before
		// their data context has finished hydrating (e.g. on React mount).
		return c.JSON(fiber.Map{"history": []HelmHistoryEntry{}})
	}

	// SECURITY: Validate all user-supplied params before passing to helm CLI
	for field, val := range map[string]string{"cluster": cluster, "release": release, "namespace": namespace} {
		if err := validateK8sName(val, field); err != nil {
			return c.Status(400).JSON(fiber.Map{"error": err.Error()})
		}
	}

	// Note: helm history doesn't support -A (all namespaces) flag
	// If namespace not provided, helm will search in the default namespace
	// The frontend should pass the namespace from the release data
	args := []string{"history", release, "--output", "json", "--max", "20"}
	if namespace != "" {
		args = append(args, "-n", namespace)
	}
	if cluster != "" {
		args = append(args, "--kube-context", cluster)
	}

	ctx, cancel := context.WithTimeout(c.Context(), gitopsDefaultTimeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, "helm", args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		slog.Warn("[GitOps] helm history failed", "release", release, "error", err, "stderr", stderr.String())
		return c.JSON(fiber.Map{"history": []HelmHistoryEntry{}, "error": stderr.String()})
	}

	history := make([]HelmHistoryEntry, 0)
	if err := json.Unmarshal(stdout.Bytes(), &history); err != nil {
		slog.Warn("[GitOps] failed to parse helm history output", "release", release, "error", err)
		return c.JSON(fiber.Map{"history": []HelmHistoryEntry{}, "error": "failed to parse history"})
	}

	return c.JSON(fiber.Map{"history": history})
}

// GetHelmValues returns the values of a specific Helm release
func (h *GitOpsHandlers) GetHelmValues(c *fiber.Ctx) error {
	cluster := c.Query("cluster")
	release := c.Query("release")
	namespace := c.Query("namespace")

	if release == "" {
		return c.Status(400).JSON(fiber.Map{"error": "release parameter is required"})
	}

	// SECURITY: Validate all user-supplied params before passing to helm CLI
	for field, val := range map[string]string{"cluster": cluster, "release": release, "namespace": namespace} {
		if err := validateK8sName(val, field); err != nil {
			return c.Status(400).JSON(fiber.Map{"error": err.Error()})
		}
	}

	// If namespace not provided, look it up from helm list (with timeout)
	if namespace == "" {
		lookupCtx, lookupCancel := context.WithTimeout(c.Context(), gitopsLookupTimeout)
		defer lookupCancel()
		namespace = h.findReleaseNamespace(lookupCtx, cluster, release)
	}

	args := []string{"get", "values", release, "--output", "json"}
	if namespace != "" {
		args = append(args, "-n", namespace)
	}
	if cluster != "" {
		args = append(args, "--kube-context", cluster)
	}

	ctx, cancel := context.WithTimeout(c.Context(), gitopsDefaultTimeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, "helm", args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		slog.Warn("[GitOps] helm get values failed", "release", release, "error", err, "stderr", stderr.String())
		return c.JSON(fiber.Map{"values": map[string]interface{}{}, "error": stderr.String()})
	}

	var values map[string]interface{}
	if err := json.Unmarshal(stdout.Bytes(), &values); err != nil {
		// If JSON fails, return as raw YAML string
		return c.JSON(fiber.Map{"values": stdout.String(), "format": "yaml"})
	}

	// Handle null (no custom values) - return empty object instead
	if values == nil {
		values = map[string]interface{}{}
	}

	return c.JSON(fiber.Map{"values": values, "format": "json"})
}

// findReleaseNamespace finds the namespace for a release by listing all releases
func (h *GitOpsHandlers) findReleaseNamespace(ctx context.Context, cluster, releaseName string) string {
	releases := h.getHelmReleasesForCluster(ctx, cluster)
	for _, r := range releases {
		if r.Name == releaseName {
			return r.Namespace
		}
	}
	return ""
}

// ============================================================================
// Helm Write Operations
// ============================================================================

// helmOperationTimeout is the server-side ceiling for detached helm write
// operations. #6592: helm install/upgrade/uninstall/rollback must complete
// even when the HTTP client disconnects mid-flight, so we run them in a
// context that's decoupled from the Fiber request context. Must be generous
// enough for large charts with many hooks/CRDs to finish, yet bounded so a
// wedged helm subprocess can't run forever.
const helmOperationTimeout = 10 * time.Minute

// detachedHelmContext returns a context suitable for state-mutating helm
// subprocesses (install, upgrade, uninstall, rollback). The returned context
// has these semantics:
//
//   - Values (trace IDs, logging tags, any other ctx.Value lookups) are
//     inherited from the request context via context.WithoutCancel.
//   - Cancellation is NOT inherited: when the client disconnects and the
//     request context is cancelled, the helm subprocess keeps running.
//     Otherwise a user closing their browser tab mid-install would SIGKILL
//     the helm process and orphan the release in `pending-install`,
//     deadlocking future operations on that namespace until the release
//     lock is cleared manually.
//   - The request context's deadline is NOT inherited either — context.WithoutCancel
//     strips both cancellation and deadline. We then wrap the detached
//     context in context.WithTimeout(helmOperationTimeout) so the detached
//     operation still has a server-side ceiling independent of whatever
//     deadline the client set.
//
// #6600: an earlier version of this comment incorrectly claimed WithoutCancel
// preserves "deadlines-as-values" from the request context. It does not —
// WithoutCancel preserves only Value lookups and explicitly drops both
// cancellation and any deadline.
//
// Read-only operations (helm ls, helm get, helm history, helm template) must
// NOT use this helper — they should remain bound to the request context so a
// disconnected client cancels the work promptly. See #6592.
func detachedHelmContext(c *fiber.Ctx) (context.Context, context.CancelFunc) {
	return context.WithTimeout(
		context.WithoutCancel(c.UserContext()),
		helmOperationTimeout,
	)
}

// RollbackHelmRelease, UninstallHelmRelease, and UpgradeHelmRelease were
// removed in #7993 Phase 4 — these user-initiated helm operations now run
// through kc-agent at /helm/rollback, /helm/uninstall, /helm/upgrade under
// the user's kubeconfig instead of the backend pod ServiceAccount. See
// pkg/agent/server_helm.go. The associated request-body types
// (HelmRollbackRequest, HelmUninstallRequest, HelmUpgradeRequest) were
// backend-private and went with the handlers.

// ============================================================================
// ArgoCD Endpoints
// ============================================================================

// argocdQueryTimeout is the timeout for querying ArgoCD Application CRDs across clusters
const argocdQueryTimeout = 15 * time.Second

// ListArgoApplications returns all ArgoCD Application resources across all clusters.
// GET /api/gitops/argocd/applications
// Query params: ?cluster=<name> (optional, filter by cluster)
func (h *GitOpsHandlers) ListArgoApplications(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return c.Status(503).JSON(fiber.Map{
			"error":      "Kubernetes client not configured",
			"isDemoData": true,
		})
	}

	ctx, cancel := context.WithTimeout(c.Context(), argocdQueryTimeout)
	defer cancel()

	appList, err := h.k8sClient.ListArgoApplications(ctx)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{
			"error":      fmt.Sprintf("Failed to list ArgoCD applications: %v", err),
			"isDemoData": true,
		})
	}

	// Optional cluster filter
	clusterFilter := c.Query("cluster")
	if clusterFilter != "" {
		filtered := make([]interface{}, 0)
		for _, app := range appList.Items {
			if app.Cluster == clusterFilter {
				filtered = append(filtered, app)
			}
		}
		return c.JSON(fiber.Map{
			"items":      filtered,
			"totalCount": len(filtered),
			"isDemoData": false,
		})
	}

	return c.JSON(fiber.Map{
		"items":      appList.Items,
		"totalCount": appList.TotalCount,
		"isDemoData": false,
	})
}

// GetArgoHealthSummary returns aggregated health status counts for all ArgoCD applications.
// GET /api/gitops/argocd/health
func (h *GitOpsHandlers) GetArgoHealthSummary(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return c.Status(503).JSON(fiber.Map{
			"error":      "Kubernetes client not configured",
			"isDemoData": true,
		})
	}

	ctx, cancel := context.WithTimeout(c.Context(), argocdQueryTimeout)
	defer cancel()

	appList, err := h.k8sClient.ListArgoApplications(ctx)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{
			"error":      fmt.Sprintf("Failed to list ArgoCD applications: %v", err),
			"isDemoData": true,
		})
	}

	// Aggregate health statuses
	summary := fiber.Map{
		"healthy":     0,
		"degraded":    0,
		"progressing": 0,
		"missing":     0,
		"unknown":     0,
	}

	for _, app := range appList.Items {
		switch app.HealthStatus {
		case "Healthy":
			summary["healthy"] = summary["healthy"].(int) + 1
		case "Degraded":
			summary["degraded"] = summary["degraded"].(int) + 1
		case "Progressing":
			summary["progressing"] = summary["progressing"].(int) + 1
		case "Missing":
			summary["missing"] = summary["missing"].(int) + 1
		default:
			summary["unknown"] = summary["unknown"].(int) + 1
		}
	}

	return c.JSON(fiber.Map{
		"stats":      summary,
		"isDemoData": false,
	})
}

// GetArgoSyncSummary returns aggregated sync status counts for all ArgoCD applications.
// GET /api/gitops/argocd/sync
func (h *GitOpsHandlers) GetArgoSyncSummary(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return c.Status(503).JSON(fiber.Map{
			"error":      "Kubernetes client not configured",
			"isDemoData": true,
		})
	}

	ctx, cancel := context.WithTimeout(c.Context(), argocdQueryTimeout)
	defer cancel()

	appList, err := h.k8sClient.ListArgoApplications(ctx)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{
			"error":      fmt.Sprintf("Failed to list ArgoCD applications: %v", err),
			"isDemoData": true,
		})
	}

	// Aggregate sync statuses
	summary := fiber.Map{
		"synced":    0,
		"outOfSync": 0,
		"unknown":   0,
	}

	for _, app := range appList.Items {
		switch app.SyncStatus {
		case "Synced":
			summary["synced"] = summary["synced"].(int) + 1
		case "OutOfSync":
			summary["outOfSync"] = summary["outOfSync"].(int) + 1
		default:
			summary["unknown"] = summary["unknown"].(int) + 1
		}
	}

	return c.JSON(fiber.Map{
		"stats":      summary,
		"isDemoData": false,
	})
}

// TriggerArgoSync was removed in #7993 Phase 4 — this user-initiated
// operation now runs through kc-agent at POST /argocd/sync under the user's
// kubeconfig. See pkg/agent/server_argocd.go#handleArgoCDSync.

// discoverArgoServerURL discovers the ArgoCD API server URL via K8s Service lookup
func (h *GitOpsHandlers) discoverArgoServerURL(ctx context.Context, cluster string) string {
	clientset, err := h.k8sClient.GetClient(cluster)
	if err != nil {
		slog.Warn("[ArgoCD] server discovery failed: cannot get client", "cluster", cluster, "error", err)
		return ""
	}

	// Look for the argocd-server service in common namespaces
	namespaces := []string{"argocd", "argo-cd", "gitops"}
	for _, ns := range namespaces {
		svc, err := clientset.CoreV1().Services(ns).Get(ctx, "argocd-server", metav1.GetOptions{})
		if err == nil {
			if len(svc.Spec.Ports) > 0 {
				// Use cluster-internal DNS: <service>.<namespace>.svc
				return fmt.Sprintf("https://%s.%s.svc:%d", svc.Name, svc.Namespace, svc.Spec.Ports[0].Port)
			} else {
				slog.Warn("[ArgoCD] server discovery: argocd-server service has no ports", "namespace", ns)
			}
		}
	}
	slog.Info("[ArgoCD] server discovery: argocd-server service not found", "cluster", cluster)
	return ""
}

// ListArgoApplicationSets returns all ArgoCD ApplicationSet resources across all clusters.
// GET /api/gitops/argocd/applicationsets
// Query params: ?cluster=<name> (optional, filter by cluster)
func (h *GitOpsHandlers) ListArgoApplicationSets(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return c.Status(503).JSON(fiber.Map{
			"error":      "Kubernetes client not configured",
			"isDemoData": true,
		})
	}

	ctx, cancel := context.WithTimeout(c.Context(), argocdQueryTimeout)
	defer cancel()

	appSetList, err := h.k8sClient.ListArgoApplicationSets(ctx)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{
			"error":      fmt.Sprintf("Failed to list ArgoCD ApplicationSets: %v", err),
			"isDemoData": true,
		})
	}

	// Optional cluster filter
	clusterFilter := c.Query("cluster")
	if clusterFilter != "" {
		filtered := make([]v1alpha1.ArgoApplicationSet, 0)
		for _, appSet := range appSetList.Items {
			if appSet.Cluster == clusterFilter {
				filtered = append(filtered, appSet)
			}
		}
		return c.JSON(fiber.Map{
			"items":      filtered,
			"totalCount": len(filtered),
			"isDemoData": false,
		})
	}

	return c.JSON(fiber.Map{
		"items":      appSetList.Items,
		"totalCount": appSetList.TotalCount,
		"isDemoData": false,
	})
}

// GetArgoStatus reports whether ArgoCD is detected on any connected cluster.
// GET /api/gitops/argocd/status
func (h *GitOpsHandlers) GetArgoStatus(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return c.JSON(fiber.Map{
			"detected": false,
			"clusters": []interface{}{},
		})
	}

	ctx, cancel := context.WithTimeout(c.Context(), argocdQueryTimeout)
	defer cancel()

	// Check for Application CRDs
	appList, _ := h.k8sClient.ListArgoApplications(ctx)
	appSetList, _ := h.k8sClient.ListArgoApplicationSets(ctx)

	// Build per-cluster detection
	clusterMap := make(map[string]*v1alpha1.ArgoClusterStatus)

	if appList != nil {
		for _, app := range appList.Items {
			if _, ok := clusterMap[app.Cluster]; !ok {
				clusterMap[app.Cluster] = &v1alpha1.ArgoClusterStatus{Name: app.Cluster}
			}
			clusterMap[app.Cluster].HasApplications = true
		}
	}

	if appSetList != nil {
		for _, appSet := range appSetList.Items {
			if _, ok := clusterMap[appSet.Cluster]; !ok {
				clusterMap[appSet.Cluster] = &v1alpha1.ArgoClusterStatus{Name: appSet.Cluster}
			}
			clusterMap[appSet.Cluster].HasApplicationSets = true
		}
	}

	clusters := make([]v1alpha1.ArgoClusterStatus, 0, len(clusterMap))
	for _, cs := range clusterMap {
		clusters = append(clusters, *cs)
	}

	return c.JSON(fiber.Map{
		"detected": len(clusters) > 0,
		"clusters": clusters,
	})
}
