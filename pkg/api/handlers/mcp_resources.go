package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	k8sErrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"

	"github.com/kubestellar/console/pkg/k8s"
)

// GetGPUNodes returns nodes with GPU resources
func (h *MCPHandlers) GetGPUNodes(c *fiber.Ctx) error {
	// Demo mode: return demo data immediately
	if isDemoMode(c) {
		return demoResponse(c, "nodes", getDemoGPUNodes())
	}

	cluster := c.Query("cluster")
	if err := mcpValidateName("cluster", cluster); err != nil {
		return err
	}

	if h.k8sClient != nil {
		// If no cluster specified, query all clusters in parallel
		if cluster == "" {
			clusters, _, err := h.k8sClient.HealthyClusters(c.Context())
			if err != nil {
				return handleK8sError(c, err)
			}

			var wg sync.WaitGroup
			var mu sync.Mutex
			allNodes := make([]k8s.GPUNode, 0)
			clusterTimeout := mcpExtendedTimeout // Increased for large GPU clusters

			clusterCtx, clusterCancel := context.WithCancel(c.Context())
			defer clusterCancel()

			for _, cl := range clusters {
				wg.Add(1)
				go func(clusterName string) {
					defer wg.Done()
					ctx, cancel := context.WithTimeout(clusterCtx, clusterTimeout)
					defer cancel()

					nodes, err := h.k8sClient.GetGPUNodes(ctx, clusterName)
					if err == nil && len(nodes) > 0 {
						mu.Lock()
						allNodes = append(allNodes, nodes...)
						mu.Unlock()
					}
				}(cl.Name)
			}

			waitWithDeadline(&wg, clusterCancel, maxResponseDeadline)
			return c.JSON(fiber.Map{"nodes": allNodes, "source": "k8s"})
		}

		ctx, cancel := context.WithTimeout(c.Context(), mcpExtendedTimeout)
		defer cancel()

		nodes, err := h.k8sClient.GetGPUNodes(ctx, cluster)
		if err != nil {
			return handleK8sError(c, err)
		}
		if nodes == nil {
			nodes = make([]k8s.GPUNode, 0)
		}
		return c.JSON(fiber.Map{"nodes": nodes, "source": "k8s"})
	}

	return c.Status(503).JSON(fiber.Map{"error": "No cluster access available"})
}

// GetGPUNodeHealth returns proactive health check results for GPU nodes
func (h *MCPHandlers) GetGPUNodeHealth(c *fiber.Ctx) error {
	if isDemoMode(c) {
		return demoResponse(c, "nodes", getDemoGPUNodeHealth())
	}

	cluster := c.Query("cluster")
	if err := mcpValidateName("cluster", cluster); err != nil {
		return err
	}

	if h.k8sClient != nil {
		if cluster == "" {
			clusters, _, err := h.k8sClient.HealthyClusters(c.Context())
			if err != nil {
				return handleK8sError(c, err)
			}

			var wg sync.WaitGroup
			var mu sync.Mutex
			allNodes := make([]k8s.GPUNodeHealthStatus, 0)
			clusterTimeout := mcpExtendedTimeout

			clusterCtx, clusterCancel := context.WithCancel(c.Context())
			defer clusterCancel()

			for _, cl := range clusters {
				wg.Add(1)
				go func(clusterName string) {
					defer wg.Done()
					ctx, cancel := context.WithTimeout(clusterCtx, clusterTimeout)
					defer cancel()

					nodes, err := h.k8sClient.GetGPUNodeHealth(ctx, clusterName)
					if err == nil && len(nodes) > 0 {
						mu.Lock()
						allNodes = append(allNodes, nodes...)
						mu.Unlock()
					}
				}(cl.Name)
			}

			waitWithDeadline(&wg, clusterCancel, maxResponseDeadline)
			return c.JSON(fiber.Map{"nodes": allNodes, "source": "k8s"})
		}

		ctx, cancel := context.WithTimeout(c.Context(), mcpExtendedTimeout)
		defer cancel()

		nodes, err := h.k8sClient.GetGPUNodeHealth(ctx, cluster)
		if err != nil {
			return handleK8sError(c, err)
		}
		if nodes == nil {
			nodes = make([]k8s.GPUNodeHealthStatus, 0)
		}
		return c.JSON(fiber.Map{"nodes": nodes, "source": "k8s"})
	}

	return c.Status(503).JSON(fiber.Map{"error": "No cluster access available"})
}

// GetGPUHealthCronJobStatus returns the installation status of the GPU health CronJob
func (h *MCPHandlers) GetGPUHealthCronJobStatus(c *fiber.Ctx) error {
	if isDemoMode(c) {
		return c.JSON(fiber.Map{"status": k8s.GPUHealthCronJobStatus{CanInstall: true}})
	}

	cluster := c.Query("cluster")
	if cluster == "" {
		return c.Status(400).JSON(fiber.Map{"error": "cluster parameter is required"})
	}
	if err := mcpValidateName("cluster", cluster); err != nil {
		return err
	}

	if h.k8sClient == nil {
		return c.Status(503).JSON(fiber.Map{"error": "No cluster access"})
	}

	ctx, cancel := context.WithTimeout(c.Context(), mcpDefaultTimeout)
	defer cancel()

	status, err := h.k8sClient.GetGPUHealthCronJobStatus(ctx, cluster)
	if err != nil {
		return handleK8sError(c, err)
	}
	return c.JSON(fiber.Map{"status": status})
}

// InstallGPUHealthCronJob installs the GPU health check CronJob on a cluster
func (h *MCPHandlers) InstallGPUHealthCronJob(c *fiber.Ctx) error {
	if isDemoMode(c) {
		return c.JSON(fiber.Map{"success": true, "message": "CronJob installed (demo mode)"})
	}

	if h.k8sClient == nil {
		return c.Status(503).JSON(fiber.Map{"error": "No cluster access"})
	}

	var body struct {
		Cluster   string `json:"cluster"`
		Namespace string `json:"namespace"`
		Schedule  string `json:"schedule"`
		Tier      int    `json:"tier"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request body"})
	}
	if body.Cluster == "" {
		return c.Status(400).JSON(fiber.Map{"error": "cluster is required"})
	}

	// Validate cron schedule format (5-field standard cron expression)
	if body.Schedule != "" && !isValidCronSchedule(body.Schedule) {
		return c.Status(400).JSON(fiber.Map{"error": "invalid cron schedule format — expected 5-field cron expression (e.g. '*/15 * * * *')"})
	}

	// Validate tier range.
	// Tier 1 — Critical, Tier 2 — Standard, Tier 3 — Full, Tier 4 — Deep (privileged).
	// Must stay in sync with the frontend TIER_OPTIONS in ProactiveGPUNodeHealthMonitor.tsx
	// and with InstallGPUHealthCronJob in pkg/k8s/client_gpu.go (issue #6110).
	const minTier = 1
	const maxTier = 4
	if body.Tier < minTier || body.Tier > maxTier {
		return c.Status(400).JSON(fiber.Map{"error": fmt.Sprintf("tier must be between %d and %d", minTier, maxTier)})
	}

	ctx, cancel := context.WithTimeout(c.Context(), mcpExtendedTimeout)
	defer cancel()

	if err := h.k8sClient.InstallGPUHealthCronJob(ctx, body.Cluster, body.Namespace, body.Schedule, body.Tier); err != nil {
		return handleK8sError(c, err)
	}

	return c.JSON(fiber.Map{"success": true, "message": fmt.Sprintf("GPU health CronJob installed on %s (tier %d)", body.Cluster, body.Tier)})
}

// UninstallGPUHealthCronJob removes the GPU health check CronJob from a cluster
func (h *MCPHandlers) UninstallGPUHealthCronJob(c *fiber.Ctx) error {
	if isDemoMode(c) {
		return c.JSON(fiber.Map{"success": true, "message": "CronJob removed (demo mode)"})
	}

	if h.k8sClient == nil {
		return c.Status(503).JSON(fiber.Map{"error": "No cluster access"})
	}

	var body struct {
		Cluster   string `json:"cluster"`
		Namespace string `json:"namespace"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request body"})
	}
	if body.Cluster == "" {
		return c.Status(400).JSON(fiber.Map{"error": "cluster is required"})
	}

	ctx, cancel := context.WithTimeout(c.Context(), mcpDefaultTimeout)
	defer cancel()

	if err := h.k8sClient.UninstallGPUHealthCronJob(ctx, body.Cluster, body.Namespace); err != nil {
		return handleK8sError(c, err)
	}

	return c.JSON(fiber.Map{"success": true, "message": fmt.Sprintf("GPU health CronJob removed from %s", body.Cluster)})
}

// GetGPUHealthCronJobResults returns the latest health check results from the ConfigMap.
// This is the endpoint used by the AlertsContext to evaluate gpu_health_cronjob conditions.
func (h *MCPHandlers) GetGPUHealthCronJobResults(c *fiber.Ctx) error {
	if isDemoMode(c) {
		return c.JSON(fiber.Map{"results": []k8s.GPUHealthCheckResult{}})
	}

	cluster := c.Query("cluster")
	if cluster == "" {
		return c.Status(400).JSON(fiber.Map{"error": "cluster parameter is required"})
	}
	if err := mcpValidateName("cluster", cluster); err != nil {
		return err
	}

	if h.k8sClient == nil {
		return c.Status(503).JSON(fiber.Map{"error": "No cluster access"})
	}

	ctx, cancel := context.WithTimeout(c.Context(), mcpDefaultTimeout)
	defer cancel()

	status, err := h.k8sClient.GetGPUHealthCronJobStatus(ctx, cluster)
	if err != nil {
		return handleK8sError(c, err)
	}
	return c.JSON(fiber.Map{"results": status.LastResults, "cluster": cluster})
}

// GetNVIDIAOperatorStatus returns NVIDIA GPU and Network operator status
func (h *MCPHandlers) GetNVIDIAOperatorStatus(c *fiber.Ctx) error {
	// Demo mode: return demo data immediately
	if isDemoMode(c) {
		return demoResponse(c, "operators", getDemoNVIDIAOperatorStatus())
	}

	cluster := c.Query("cluster")
	if err := mcpValidateName("cluster", cluster); err != nil {
		return err
	}

	if h.k8sClient != nil {
		// If no cluster specified, query all clusters in parallel
		if cluster == "" {
			clusters, _, err := h.k8sClient.HealthyClusters(c.Context())
			if err != nil {
				return handleK8sError(c, err)
			}

			var wg sync.WaitGroup
			var mu sync.Mutex
			allStatus := make([]*k8s.NVIDIAOperatorStatus, 0)
			clusterTimeout := mcpDefaultTimeout

			clusterCtx, clusterCancel := context.WithCancel(c.Context())
			defer clusterCancel()

			for _, cl := range clusters {
				wg.Add(1)
				go func(clusterName string) {
					defer wg.Done()
					ctx, cancel := context.WithTimeout(clusterCtx, clusterTimeout)
					defer cancel()

					status, err := h.k8sClient.GetNVIDIAOperatorStatus(ctx, clusterName)
					if err == nil && (status.GPUOperator != nil || status.NetworkOperator != nil) {
						mu.Lock()
						allStatus = append(allStatus, status)
						mu.Unlock()
					}
				}(cl.Name)
			}

			waitWithDeadline(&wg, clusterCancel, maxResponseDeadline)
			return c.JSON(fiber.Map{"operators": allStatus, "source": "k8s"})
		}

		ctx, cancel := context.WithTimeout(c.Context(), mcpDefaultTimeout)
		defer cancel()

		status, err := h.k8sClient.GetNVIDIAOperatorStatus(ctx, cluster)
		if err != nil {
			return handleK8sError(c, err)
		}
		return c.JSON(fiber.Map{"operators": []*k8s.NVIDIAOperatorStatus{status}, "source": "k8s"})
	}

	return c.Status(503).JSON(fiber.Map{"error": "No cluster access available"})
}

// GetConfigMaps returns ConfigMaps from clusters
func (h *MCPHandlers) GetConfigMaps(c *fiber.Ctx) error {
	// Demo mode: return demo data immediately
	if isDemoMode(c) {
		return demoResponse(c, "configmaps", getDemoConfigMaps())
	}

	cluster := c.Query("cluster")
	namespace := c.Query("namespace")

	if err := mcpValidateClusterAndNamespace(cluster, namespace); err != nil {
		return err
	}

	if h.k8sClient != nil {
		if cluster == "" {
			clusters, _, err := h.k8sClient.HealthyClusters(c.Context())
			if err != nil {
				return handleK8sError(c, err)
			}

			var wg sync.WaitGroup
			var mu sync.Mutex
			allConfigMaps := make([]k8s.ConfigMap, 0)
			clusterTimeout := mcpDefaultTimeout

			clusterCtx, clusterCancel := context.WithCancel(c.Context())
			defer clusterCancel()

			for _, cl := range clusters {
				wg.Add(1)
				go func(clusterName string) {
					defer wg.Done()
					ctx, cancel := context.WithTimeout(clusterCtx, clusterTimeout)
					defer cancel()

					configmaps, err := h.k8sClient.GetConfigMaps(ctx, clusterName, namespace)
					if err == nil && len(configmaps) > 0 {
						mu.Lock()
						allConfigMaps = append(allConfigMaps, configmaps...)
						mu.Unlock()
					}
				}(cl.Name)
			}

			waitWithDeadline(&wg, clusterCancel, maxResponseDeadline)
			return c.JSON(fiber.Map{"configmaps": allConfigMaps, "source": "k8s"})
		}

		ctx, cancel := context.WithTimeout(c.Context(), mcpDefaultTimeout)
		defer cancel()

		configmaps, err := h.k8sClient.GetConfigMaps(ctx, cluster, namespace)
		if err != nil {
			return handleK8sError(c, err)
		}
		if configmaps == nil {
			configmaps = make([]k8s.ConfigMap, 0)
		}
		return c.JSON(fiber.Map{"configmaps": configmaps, "source": "k8s"})
	}

	return c.Status(503).JSON(fiber.Map{"error": "No cluster access available"})
}

// GetSecrets returns Secrets from clusters
func (h *MCPHandlers) GetSecrets(c *fiber.Ctx) error {
	// Demo mode: return demo data immediately
	if isDemoMode(c) {
		return demoResponse(c, "secrets", getDemoSecrets())
	}

	cluster := c.Query("cluster")
	namespace := c.Query("namespace")

	if err := mcpValidateClusterAndNamespace(cluster, namespace); err != nil {
		return err
	}

	if h.k8sClient != nil {
		if cluster == "" {
			clusters, _, err := h.k8sClient.HealthyClusters(c.Context())
			if err != nil {
				return handleK8sError(c, err)
			}

			var wg sync.WaitGroup
			var mu sync.Mutex
			allSecrets := make([]k8s.Secret, 0)
			clusterTimeout := mcpDefaultTimeout

			clusterCtx, clusterCancel := context.WithCancel(c.Context())
			defer clusterCancel()

			for _, cl := range clusters {
				wg.Add(1)
				go func(clusterName string) {
					defer wg.Done()
					ctx, cancel := context.WithTimeout(clusterCtx, clusterTimeout)
					defer cancel()

					secrets, err := h.k8sClient.GetSecrets(ctx, clusterName, namespace)
					if err == nil && len(secrets) > 0 {
						mu.Lock()
						allSecrets = append(allSecrets, secrets...)
						mu.Unlock()
					}
				}(cl.Name)
			}

			waitWithDeadline(&wg, clusterCancel, maxResponseDeadline)
			return c.JSON(fiber.Map{"secrets": allSecrets, "source": "k8s"})
		}

		ctx, cancel := context.WithTimeout(c.Context(), mcpDefaultTimeout)
		defer cancel()

		secrets, err := h.k8sClient.GetSecrets(ctx, cluster, namespace)
		if err != nil {
			return handleK8sError(c, err)
		}
		if secrets == nil {
			secrets = make([]k8s.Secret, 0)
		}
		return c.JSON(fiber.Map{"secrets": secrets, "source": "k8s"})
	}

	return c.Status(503).JSON(fiber.Map{"error": "No cluster access available"})
}

// GetServiceAccounts returns ServiceAccounts from clusters
func (h *MCPHandlers) GetServiceAccounts(c *fiber.Ctx) error {
	// Demo mode: return demo data immediately
	if isDemoMode(c) {
		return demoResponse(c, "serviceAccounts", getDemoServiceAccounts())
	}

	cluster := c.Query("cluster")
	namespace := c.Query("namespace")

	if err := mcpValidateClusterAndNamespace(cluster, namespace); err != nil {
		return err
	}

	if h.k8sClient != nil {
		if cluster == "" {
			clusters, _, err := h.k8sClient.HealthyClusters(c.Context())
			if err != nil {
				return handleK8sError(c, err)
			}

			var wg sync.WaitGroup
			var mu sync.Mutex
			allServiceAccounts := make([]k8s.ServiceAccount, 0)
			clusterTimeout := mcpDefaultTimeout

			clusterCtx, clusterCancel := context.WithCancel(c.Context())
			defer clusterCancel()

			for _, cl := range clusters {
				wg.Add(1)
				go func(clusterName string) {
					defer wg.Done()
					ctx, cancel := context.WithTimeout(clusterCtx, clusterTimeout)
					defer cancel()

					serviceAccounts, err := h.k8sClient.GetServiceAccounts(ctx, clusterName, namespace)
					if err == nil && len(serviceAccounts) > 0 {
						mu.Lock()
						allServiceAccounts = append(allServiceAccounts, serviceAccounts...)
						mu.Unlock()
					}
				}(cl.Name)
			}

			waitWithDeadline(&wg, clusterCancel, maxResponseDeadline)
			return c.JSON(fiber.Map{"serviceAccounts": allServiceAccounts, "source": "k8s"})
		}

		ctx, cancel := context.WithTimeout(c.Context(), mcpDefaultTimeout)
		defer cancel()

		serviceAccounts, err := h.k8sClient.GetServiceAccounts(ctx, cluster, namespace)
		if err != nil {
			return handleK8sError(c, err)
		}
		if serviceAccounts == nil {
			serviceAccounts = make([]k8s.ServiceAccount, 0)
		}
		return c.JSON(fiber.Map{"serviceAccounts": serviceAccounts, "source": "k8s"})
	}

	return c.Status(503).JSON(fiber.Map{"error": "No cluster access available"})
}

// GetPVCs returns PersistentVolumeClaims from clusters
func (h *MCPHandlers) GetPVCs(c *fiber.Ctx) error {
	// Demo mode: return demo data immediately
	if isDemoMode(c) {
		return demoResponse(c, "pvcs", getDemoPVCs())
	}

	cluster := c.Query("cluster")
	namespace := c.Query("namespace")

	if err := mcpValidateClusterAndNamespace(cluster, namespace); err != nil {
		return err
	}

	if h.k8sClient != nil {
		if cluster == "" {
			clusters, _, err := h.k8sClient.HealthyClusters(c.Context())
			if err != nil {
				return handleK8sError(c, err)
			}

			var wg sync.WaitGroup
			var mu sync.Mutex
			allPVCs := make([]k8s.PVC, 0)
			clusterTimeout := mcpDefaultTimeout

			clusterCtx, clusterCancel := context.WithCancel(c.Context())
			defer clusterCancel()

			for _, cl := range clusters {
				wg.Add(1)
				go func(clusterName string) {
					defer wg.Done()
					ctx, cancel := context.WithTimeout(clusterCtx, clusterTimeout)
					defer cancel()

					pvcs, err := h.k8sClient.GetPVCs(ctx, clusterName, namespace)
					if err == nil && len(pvcs) > 0 {
						mu.Lock()
						allPVCs = append(allPVCs, pvcs...)
						mu.Unlock()
					}
				}(cl.Name)
			}

			waitWithDeadline(&wg, clusterCancel, maxResponseDeadline)
			return c.JSON(fiber.Map{"pvcs": allPVCs, "source": "k8s"})
		}

		ctx, cancel := context.WithTimeout(c.Context(), mcpDefaultTimeout)
		defer cancel()

		pvcs, err := h.k8sClient.GetPVCs(ctx, cluster, namespace)
		if err != nil {
			return handleK8sError(c, err)
		}
		if pvcs == nil {
			pvcs = make([]k8s.PVC, 0)
		}
		return c.JSON(fiber.Map{"pvcs": pvcs, "source": "k8s"})
	}

	return c.Status(503).JSON(fiber.Map{"error": "No cluster access available"})
}

// GetPVs returns PersistentVolumes from clusters
func (h *MCPHandlers) GetPVs(c *fiber.Ctx) error {
	// Demo mode: return demo data immediately
	if isDemoMode(c) {
		return demoResponse(c, "pvs", getDemoPVs())
	}

	cluster := c.Query("cluster")
	if err := mcpValidateName("cluster", cluster); err != nil {
		return err
	}

	if h.k8sClient != nil {
		if cluster == "" {
			clusters, _, err := h.k8sClient.HealthyClusters(c.Context())
			if err != nil {
				return handleK8sError(c, err)
			}

			var wg sync.WaitGroup
			var mu sync.Mutex
			allPVs := make([]k8s.PV, 0)
			clusterTimeout := mcpDefaultTimeout

			clusterCtx, clusterCancel := context.WithCancel(c.Context())
			defer clusterCancel()

			for _, cl := range clusters {
				wg.Add(1)
				go func(clusterName string) {
					defer wg.Done()
					ctx, cancel := context.WithTimeout(clusterCtx, clusterTimeout)
					defer cancel()

					pvs, err := h.k8sClient.GetPVs(ctx, clusterName)
					if err == nil && len(pvs) > 0 {
						mu.Lock()
						allPVs = append(allPVs, pvs...)
						mu.Unlock()
					}
				}(cl.Name)
			}

			waitWithDeadline(&wg, clusterCancel, maxResponseDeadline)
			return c.JSON(fiber.Map{"pvs": allPVs, "source": "k8s"})
		}

		ctx, cancel := context.WithTimeout(c.Context(), mcpDefaultTimeout)
		defer cancel()

		pvs, err := h.k8sClient.GetPVs(ctx, cluster)
		if err != nil {
			return handleK8sError(c, err)
		}
		if pvs == nil {
			pvs = make([]k8s.PV, 0)
		}
		return c.JSON(fiber.Map{"pvs": pvs, "source": "k8s"})
	}

	return c.Status(503).JSON(fiber.Map{"error": "No cluster access available"})
}

// GetResourceQuotas returns resource quotas from clusters
func (h *MCPHandlers) GetResourceQuotas(c *fiber.Ctx) error {
	// Demo mode: return demo data immediately
	if isDemoMode(c) {
		return demoResponse(c, "resourceQuotas", getDemoResourceQuotas())
	}

	cluster := c.Query("cluster")
	namespace := c.Query("namespace")

	if err := mcpValidateClusterAndNamespace(cluster, namespace); err != nil {
		return err
	}

	if h.k8sClient != nil {
		if cluster == "" {
			clusters, _, err := h.k8sClient.HealthyClusters(c.Context())
			if err != nil {
				return handleK8sError(c, err)
			}

			var wg sync.WaitGroup
			var mu sync.Mutex
			allQuotas := make([]k8s.ResourceQuota, 0)
			clusterTimeout := mcpDefaultTimeout

			clusterCtx, clusterCancel := context.WithCancel(c.Context())
			defer clusterCancel()

			for _, cl := range clusters {
				wg.Add(1)
				go func(clusterName string) {
					defer wg.Done()
					ctx, cancel := context.WithTimeout(clusterCtx, clusterTimeout)
					defer cancel()

					quotas, err := h.k8sClient.GetResourceQuotas(ctx, clusterName, namespace)
					if err == nil && len(quotas) > 0 {
						mu.Lock()
						allQuotas = append(allQuotas, quotas...)
						mu.Unlock()
					}
				}(cl.Name)
			}

			waitWithDeadline(&wg, clusterCancel, maxResponseDeadline)
			return c.JSON(fiber.Map{"resourceQuotas": allQuotas, "source": "k8s"})
		}

		ctx, cancel := context.WithTimeout(c.Context(), mcpDefaultTimeout)
		defer cancel()

		quotas, err := h.k8sClient.GetResourceQuotas(ctx, cluster, namespace)
		if err != nil {
			return handleK8sError(c, err)
		}
		if quotas == nil {
			quotas = make([]k8s.ResourceQuota, 0)
		}
		return c.JSON(fiber.Map{"resourceQuotas": quotas, "source": "k8s"})
	}

	return c.Status(503).JSON(fiber.Map{"error": "No cluster access available"})
}

// GetLimitRanges returns limit ranges from clusters
func (h *MCPHandlers) GetLimitRanges(c *fiber.Ctx) error {
	// Demo mode: return demo data immediately
	if isDemoMode(c) {
		return demoResponse(c, "limitRanges", getDemoLimitRanges())
	}

	cluster := c.Query("cluster")
	namespace := c.Query("namespace")

	if err := mcpValidateClusterAndNamespace(cluster, namespace); err != nil {
		return err
	}

	if h.k8sClient != nil {
		if cluster == "" {
			clusters, _, err := h.k8sClient.HealthyClusters(c.Context())
			if err != nil {
				return handleK8sError(c, err)
			}

			var wg sync.WaitGroup
			var mu sync.Mutex
			allRanges := make([]k8s.LimitRange, 0)
			clusterTimeout := mcpDefaultTimeout

			clusterCtx, clusterCancel := context.WithCancel(c.Context())
			defer clusterCancel()

			for _, cl := range clusters {
				wg.Add(1)
				go func(clusterName string) {
					defer wg.Done()
					ctx, cancel := context.WithTimeout(clusterCtx, clusterTimeout)
					defer cancel()

					ranges, err := h.k8sClient.GetLimitRanges(ctx, clusterName, namespace)
					if err == nil && len(ranges) > 0 {
						mu.Lock()
						allRanges = append(allRanges, ranges...)
						mu.Unlock()
					}
				}(cl.Name)
			}

			waitWithDeadline(&wg, clusterCancel, maxResponseDeadline)
			return c.JSON(fiber.Map{"limitRanges": allRanges, "source": "k8s"})
		}

		ctx, cancel := context.WithTimeout(c.Context(), mcpDefaultTimeout)
		defer cancel()

		ranges, err := h.k8sClient.GetLimitRanges(ctx, cluster, namespace)
		if err != nil {
			return handleK8sError(c, err)
		}
		if ranges == nil {
			ranges = make([]k8s.LimitRange, 0)
		}
		return c.JSON(fiber.Map{"limitRanges": ranges, "source": "k8s"})
	}

	return c.Status(503).JSON(fiber.Map{"error": "No cluster access available"})
}

// CreateOrUpdateResourceQuota creates or updates a ResourceQuota
func (h *MCPHandlers) CreateOrUpdateResourceQuota(c *fiber.Ctx) error {
	var req struct {
		Cluster         string            `json:"cluster"`
		Name            string            `json:"name"`
		Namespace       string            `json:"namespace"`
		Hard            map[string]string `json:"hard"`
		Labels          map[string]string `json:"labels,omitempty"`
		Annotations     map[string]string `json:"annotations,omitempty"`
		EnsureNamespace bool              `json:"ensure_namespace,omitempty"`
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request body"})
	}

	if req.Cluster == "" || req.Name == "" || req.Namespace == "" {
		return c.Status(400).JSON(fiber.Map{"error": "cluster, name, and namespace are required"})
	}
	if err := mcpValidateClusterAndNamespace(req.Cluster, req.Namespace); err != nil {
		return err
	}
	if err := mcpValidateName("name", req.Name); err != nil {
		return err
	}

	if len(req.Hard) == 0 {
		return c.Status(400).JSON(fiber.Map{"error": "At least one resource limit is required in 'hard'"})
	}

	if h.k8sClient != nil {
		ctx, cancel := context.WithTimeout(c.Context(), mcpDefaultTimeout)
		defer cancel()

		// Auto-create namespace if requested (used by GPU reservation flow)
		if req.EnsureNamespace {
			if err := h.k8sClient.EnsureNamespaceExists(ctx, req.Cluster, req.Namespace); err != nil {
				slog.Error("[MCP] failed to create namespace", "error", err)
				return c.Status(500).JSON(fiber.Map{"error": "internal server error"})
			}
		}

		spec := k8s.ResourceQuotaSpec{
			Name:        req.Name,
			Namespace:   req.Namespace,
			Hard:        req.Hard,
			Labels:      req.Labels,
			Annotations: req.Annotations,
		}

		quota, err := h.k8sClient.CreateOrUpdateResourceQuota(ctx, req.Cluster, spec)
		if err != nil {
			return handleK8sError(c, err)
		}

		return c.JSON(fiber.Map{"resourceQuota": quota, "source": "k8s"})
	}

	return c.Status(503).JSON(fiber.Map{"error": "No cluster access available"})
}

// DeleteResourceQuota deletes a ResourceQuota
func (h *MCPHandlers) DeleteResourceQuota(c *fiber.Ctx) error {
	cluster := c.Query("cluster")
	namespace := c.Query("namespace")
	name := c.Query("name")

	if cluster == "" || namespace == "" || name == "" {
		return c.Status(400).JSON(fiber.Map{"error": "cluster, namespace, and name are required"})
	}
	if err := mcpValidateClusterAndNamespace(cluster, namespace); err != nil {
		return err
	}
	if err := mcpValidateName("name", name); err != nil {
		return err
	}

	if h.k8sClient != nil {
		ctx, cancel := context.WithTimeout(c.Context(), mcpDefaultTimeout)
		defer cancel()

		err := h.k8sClient.DeleteResourceQuota(ctx, cluster, namespace, name)
		if err != nil {
			return handleK8sError(c, err)
		}

		return c.JSON(fiber.Map{"deleted": true, "name": name, "namespace": namespace, "cluster": cluster})
	}

	return c.Status(503).JSON(fiber.Map{"error": "No cluster access available"})
}

// GetPodLogs returns logs from a pod
func (h *MCPHandlers) GetPodLogs(c *fiber.Ctx) error {
	// Demo mode: return demo data immediately
	if isDemoMode(c) {
		return demoResponse(c, "logs", getDemoPodLogs())
	}

	cluster := c.Query("cluster")
	namespace := c.Query("namespace")
	pod := c.Query("pod")
	container := c.Query("container")
	tailLines := c.QueryInt("tail", 100)

	if cluster == "" || namespace == "" || pod == "" {
		return c.Status(400).JSON(fiber.Map{"error": "cluster, namespace, and pod are required"})
	}
	if err := mcpValidateClusterAndNamespace(cluster, namespace); err != nil {
		return err
	}
	if err := mcpValidateName("pod", pod); err != nil {
		return err
	}
	if err := mcpValidateName("container", container); err != nil {
		return err
	}
	if err := mcpValidatePositiveInt("tail", tailLines, mcpMaxTailLines); err != nil {
		return err
	}

	if h.k8sClient != nil {
		ctx, cancel := context.WithTimeout(c.Context(), mcpDefaultTimeout)
		defer cancel()

		logs, err := h.k8sClient.GetPodLogs(ctx, cluster, namespace, pod, container, int64(tailLines))
		if err != nil {
			return handleK8sError(c, err)
		}
		return c.JSON(fiber.Map{"logs": logs, "source": "k8s"})
	}

	return c.Status(503).JSON(fiber.Map{"error": "No cluster access available"})
}

// CallToolRequest represents a request to call an MCP tool
type CallToolRequest struct {
	Name      string                 `json:"name"`
	Arguments map[string]interface{} `json:"arguments"`
}

// AllowedOpsTools is the whitelist of kubestellar-ops tools that can be called via API
// SECURITY: Only read-only tools are allowed by default to prevent unauthorized modifications
var AllowedOpsTools = map[string]bool{
	// Cluster discovery and health
	"list_clusters":       true,
	"get_cluster_health":  true,
	"detect_cluster_type": true,
	"audit_kubeconfig":    true,

	// Read-only queries
	"get_pods":           true,
	"get_deployments":    true,
	"get_services":       true,
	"get_nodes":          true,
	"get_events":         true,
	"get_warning_events": true,
	"describe_pod":       true,
	"get_pod_logs":       true,

	// Issue detection (read-only analysis)
	"find_pod_issues":        true,
	"find_deployment_issues": true,
	"check_resource_limits":  true,
	"check_security_issues":  true,

	// RBAC queries (read-only)
	"get_roles":                   true,
	"get_cluster_roles":           true,
	"get_role_bindings":           true,
	"get_cluster_role_bindings":   true,
	"can_i":                       true,
	"analyze_subject_permissions": true,
	"describe_role":               true,

	// Upgrade checking (read-only)
	"get_cluster_version_info":    true,
	"check_olm_operator_upgrades": true,
	"check_helm_release_upgrades": true,
	"get_upgrade_prerequisites":   true,
	"get_upgrade_status":          true,

	// Ownership analysis (read-only)
	"find_resource_owners":        true,
	"check_gatekeeper":            true,
	"get_ownership_policy_status": true,
	"list_ownership_violations":   true,
}

// AllowedDeployTools is the whitelist of kubestellar-deploy tools that can be called via API
// SECURITY: Write operations require explicit allowlisting
var AllowedDeployTools = map[string]bool{
	// Read-only operations
	"get_app_instances":          true,
	"get_app_status":             true,
	"get_app_logs":               true,
	"list_cluster_capabilities":  true,
	"find_clusters_for_workload": true,
	"detect_drift":               true,
	"preview_changes":            true,

	// Write operations - disabled by default for security
	// Enable these only after proper authorization checks
	// "deploy_app":     false,
	// "scale_app":      false,
	// "patch_app":      false,
	// "sync_from_git":  false,
	// "reconcile":      false,
}

// GetWasmCloudHosts returns wasmCloud hosts from clusters
func (h *MCPHandlers) GetWasmCloudHosts(c *fiber.Ctx) error {
	// Demo mode: return demo data immediately
	if isDemoMode(c) {
		return demoResponse(c, "hosts", getWasmCloudHosts())
	}

	// For non-demo mode, we'll return an empty list for now
	// until full wasmCloud CRD integration is implemented.
	return c.JSON(fiber.Map{"hosts": []interface{}{}, "source": "k8s"})
}

// GetWasmCloudActors returns wasmCloud actors from clusters
func (h *MCPHandlers) GetWasmCloudActors(c *fiber.Ctx) error {
	// Demo mode: return demo data immediately
	if isDemoMode(c) {
		return demoResponse(c, "actors", getWasmCloudActors())
	}

	// For non-demo mode, we'll return an empty list for now
	// until full wasmCloud CRD integration is implemented.
	return c.JSON(fiber.Map{"actors": []interface{}{}, "source": "k8s"})
}

// validateToolName checks if a tool name is in the allowed list
func validateToolName(name string, allowedTools map[string]bool) error {
	if name == "" {
		return fiber.NewError(fiber.StatusBadRequest, "tool name is required")
	}

	// Check if tool is in allowlist
	allowed, exists := allowedTools[name]
	if !exists || !allowed {
		slog.Warn("[MCP] SECURITY: blocked unauthorized tool call", "tool", name)
		return fiber.NewError(fiber.StatusForbidden, "tool not allowed: "+name)
	}

	return nil
}

// CallOpsTool calls a kubestellar-ops tool
func (h *MCPHandlers) CallOpsTool(c *fiber.Ctx) error {
	if h.bridge == nil {
		return c.Status(503).JSON(fiber.Map{"error": "MCP bridge not available"})
	}

	var req CallToolRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid request body"})
	}

	// SECURITY: Validate tool name against whitelist
	if err := validateToolName(req.Name, AllowedOpsTools); err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(c.Context(), mcpDefaultTimeout)
	defer cancel()

	result, err := h.bridge.CallOpsTool(ctx, req.Name, req.Arguments)
	if err != nil {
		return handleK8sError(c, err)
	}

	return c.JSON(result)
}

// CallDeployTool calls a kubestellar-deploy tool
func (h *MCPHandlers) CallDeployTool(c *fiber.Ctx) error {
	if h.bridge == nil {
		return c.Status(503).JSON(fiber.Map{"error": "MCP bridge not available"})
	}

	var req CallToolRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid request body"})
	}

	// SECURITY: Validate tool name against whitelist
	if err := validateToolName(req.Name, AllowedDeployTools); err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(c.Context(), mcpDefaultTimeout)
	defer cancel()

	result, err := h.bridge.CallDeployTool(ctx, req.Name, req.Arguments)
	if err != nil {
		return handleK8sError(c, err)
	}

	return c.JSON(result)
}

// GetFlatcarNodes returns nodes running Flatcar Container Linux across all clusters.
// Detection is performed server-side: only nodes whose OSImage contains "flatcar"
// (case-insensitive) are included in the response.
func (h *MCPHandlers) GetFlatcarNodes(c *fiber.Ctx) error {
	// Demo mode: return representative demo data immediately
	if isDemoMode(c) {
		return demoResponse(c, "nodes", getDemoFlatcarNodes())
	}

	cluster := c.Query("cluster")
	if err := mcpValidateName("cluster", cluster); err != nil {
		return err
	}

	if h.k8sClient != nil {
		// No cluster specified → query all healthy clusters in parallel
		if cluster == "" {
			clusters, _, err := h.k8sClient.HealthyClusters(c.Context())
			if err != nil {
				return handleK8sError(c, err)
			}

			var wg sync.WaitGroup
			var mu sync.Mutex
			allNodes := make([]k8s.FlatcarNodeInfo, 0)

			clusterCtx, clusterCancel := context.WithCancel(c.Context())
			defer clusterCancel()

			for _, cl := range clusters {
				wg.Add(1)
				go func(clusterName string) {
					defer wg.Done()
					ctx, cancel := context.WithTimeout(clusterCtx, mcpDefaultTimeout)
					defer cancel()

					nodes, err := h.k8sClient.GetFlatcarNodes(ctx, clusterName)
					if err == nil && len(nodes) > 0 {
						mu.Lock()
						allNodes = append(allNodes, nodes...)
						mu.Unlock()
					}
				}(cl.Name)
			}

			waitWithDeadline(&wg, clusterCancel, maxResponseDeadline)
			return c.JSON(fiber.Map{"nodes": allNodes, "source": "k8s"})
		}

		// Single cluster query
		ctx, cancel := context.WithTimeout(c.Context(), mcpDefaultTimeout)
		defer cancel()

		nodes, err := h.k8sClient.GetFlatcarNodes(ctx, cluster)
		if err != nil {
			return handleK8sError(c, err)
		}
		return c.JSON(fiber.Map{"nodes": nodes, "source": "k8s"})
	}

	return c.Status(503).JSON(fiber.Map{"error": "No cluster access available"})
}

// GetIngresses returns Ingresses from clusters
func (h *MCPHandlers) GetIngresses(c *fiber.Ctx) error {
	// Demo mode: return demo data immediately
	if isDemoMode(c) {
		return demoResponse(c, "ingresses", getDemoIngresses())
	}

	cluster := c.Query("cluster")
	namespace := c.Query("namespace")

	if err := mcpValidateClusterAndNamespace(cluster, namespace); err != nil {
		return err
	}

	if h.k8sClient != nil {
		if cluster == "" {
			clusters, _, err := h.k8sClient.HealthyClusters(c.Context())
			if err != nil {
				return handleK8sError(c, err)
			}

			var wg sync.WaitGroup
			var mu sync.Mutex
			allItems := make([]k8s.Ingress, 0)
			clusterTimeout := mcpDefaultTimeout

			clusterCtx, clusterCancel := context.WithCancel(c.Context())
			defer clusterCancel()

			for _, cl := range clusters {
				wg.Add(1)
				go func(clusterName string) {
					defer wg.Done()
					ctx, cancel := context.WithTimeout(clusterCtx, clusterTimeout)
					defer cancel()

					items, err := h.k8sClient.GetIngresses(ctx, clusterName, namespace)
					if err == nil && len(items) > 0 {
						mu.Lock()
						allItems = append(allItems, items...)
						mu.Unlock()
					}
				}(cl.Name)
			}

			waitWithDeadline(&wg, clusterCancel, maxResponseDeadline)
			return c.JSON(fiber.Map{"ingresses": allItems, "source": "k8s"})
		}

		ctx, cancel := context.WithTimeout(c.Context(), mcpDefaultTimeout)
		defer cancel()

		items, err := h.k8sClient.GetIngresses(ctx, cluster, namespace)
		if err != nil {
			return handleK8sError(c, err)
		}
		if items == nil {
			items = make([]k8s.Ingress, 0)
		}
		return c.JSON(fiber.Map{"ingresses": items, "source": "k8s"})
	}

	return c.Status(503).JSON(fiber.Map{"error": "No cluster access available"})
}

// GetNetworkPolicies returns NetworkPolicies from clusters
func (h *MCPHandlers) GetNetworkPolicies(c *fiber.Ctx) error {
	// Demo mode: return demo data immediately
	if isDemoMode(c) {
		return demoResponse(c, "networkpolicies", getDemoNetworkPolicies())
	}

	cluster := c.Query("cluster")
	namespace := c.Query("namespace")

	if err := mcpValidateClusterAndNamespace(cluster, namespace); err != nil {
		return err
	}

	if h.k8sClient != nil {
		if cluster == "" {
			clusters, _, err := h.k8sClient.HealthyClusters(c.Context())
			if err != nil {
				return handleK8sError(c, err)
			}

			var wg sync.WaitGroup
			var mu sync.Mutex
			allItems := make([]k8s.NetworkPolicy, 0)
			clusterTimeout := mcpDefaultTimeout

			clusterCtx, clusterCancel := context.WithCancel(c.Context())
			defer clusterCancel()

			for _, cl := range clusters {
				wg.Add(1)
				go func(clusterName string) {
					defer wg.Done()
					ctx, cancel := context.WithTimeout(clusterCtx, clusterTimeout)
					defer cancel()

					items, err := h.k8sClient.GetNetworkPolicies(ctx, clusterName, namespace)
					if err == nil && len(items) > 0 {
						mu.Lock()
						allItems = append(allItems, items...)
						mu.Unlock()
					}
				}(cl.Name)
			}

			waitWithDeadline(&wg, clusterCancel, maxResponseDeadline)
			return c.JSON(fiber.Map{"networkpolicies": allItems, "source": "k8s"})
		}

		ctx, cancel := context.WithTimeout(c.Context(), mcpDefaultTimeout)
		defer cancel()

		items, err := h.k8sClient.GetNetworkPolicies(ctx, cluster, namespace)
		if err != nil {
			return handleK8sError(c, err)
		}
		if items == nil {
			items = make([]k8s.NetworkPolicy, 0)
		}
		return c.JSON(fiber.Map{"networkpolicies": items, "source": "k8s"})
	}

	return c.Status(503).JSON(fiber.Map{"error": "No cluster access available"})
}

// podNetworkStatsTimeout is the per-cluster timeout for network stats queries.
// Kept short because kubelet stats/summary can be slow on large clusters.
const podNetworkStatsTimeout = 10 * time.Second

// networkStatsPollIntervalSec is the expected frontend polling interval in seconds.
// Used to estimate per-second rates from cumulative kubelet byte counters.
const networkStatsPollIntervalSec int64 = 15

// multiTenancyLabels are the app-label values for multi-tenancy infrastructure pods
// whose network stats we want to collect.
var multiTenancyLabels = []string{"virt-launcher", "k3s", "ovnkube-node"}

// InterfaceStats describes byte-rate counters for a single network interface.
type InterfaceStats struct {
	Name          string `json:"name"`
	RxBytes       int64  `json:"rxBytes"`
	TxBytes       int64  `json:"txBytes"`
	RxBytesPerSec int64  `json:"rxBytesPerSec"`
	TxBytesPerSec int64  `json:"txBytesPerSec"`
}

// PodNetworkStats holds the network throughput data for one pod.
type PodNetworkStats struct {
	PodName    string           `json:"podName"`
	Namespace  string           `json:"namespace"`
	Component  string           `json:"component"`
	Interfaces []InterfaceStats `json:"interfaces"`
}

// classifyComponent maps a pod's app label to a topology component name.
func classifyComponent(labels map[string]string) string {
	app, ok := labels["app"]
	if !ok {
		return ""
	}
	switch {
	case app == "virt-launcher":
		return "kubevirt"
	case app == "k3s":
		return "k3s"
	case app == "ovnkube-node":
		return "ovn"
	default:
		return ""
	}
}

// GetPodNetworkStats returns network interface stats for pods with
// multi-tenancy labels (KubeVirt virt-launcher, K3s server, OVN).
// Data comes from the kubelet stats/summary API via the Kubernetes proxy.
// When stats are unavailable, the handler returns an empty list so the
// frontend can fall back to demo values.
func (h *MCPHandlers) GetPodNetworkStats(c *fiber.Ctx) error {
	// Demo mode: return realistic sample data immediately
	if isDemoMode(c) {
		return demoResponse(c, "stats", getDemoPodNetworkStats())
	}

	if h.k8sClient == nil {
		return c.Status(503).JSON(fiber.Map{"error": "No cluster access available"})
	}

	clusters, _, err := h.k8sClient.HealthyClusters(c.Context())
	if err != nil {
		slog.Error("[MCP] internal error listing healthy clusters for network stats", "error", err)
		return c.Status(500).JSON(fiber.Map{"error": "internal server error"})
	}

	var wg sync.WaitGroup
	var mu sync.Mutex
	allStats := make([]PodNetworkStats, 0)

	clusterCtx, clusterCancel := context.WithCancel(c.Context())
	defer clusterCancel()

	for _, cl := range clusters {
		wg.Add(1)
		go func(clusterName string) {
			defer wg.Done()

			ctx, cancel := context.WithTimeout(clusterCtx, podNetworkStatsTimeout)
			defer cancel()

			client, clientErr := h.k8sClient.GetClient(clusterName)
			if clientErr != nil {
				slog.Info("[MCP] network stats: cannot get client", "cluster", clusterName, "error", clientErr)
				return
			}

			// Query pods matching each multi-tenancy label in all namespaces
			for _, label := range multiTenancyLabels {
				pods, listErr := client.CoreV1().Pods("").List(ctx, metav1.ListOptions{
					LabelSelector: fmt.Sprintf("app=%s", label),
				})
				if listErr != nil {
					// 401/403 — permissions issue, skip silently
					if statusErr, ok := listErr.(*k8sErrors.StatusError); ok {
						code := statusErr.ErrStatus.Code
						if code == 401 || code == 403 {
							continue
						}
					}
					slog.Info("[MCP] network stats: list pods failed", "app", label, "cluster", clusterName, "error", listErr)
					continue
				}

				for _, pod := range pods.Items {
					component := classifyComponent(pod.Labels)
					if component == "" {
						continue
					}

					// Try kubelet stats/summary API for this pod's node
					nodeName := pod.Spec.NodeName
					if nodeName == "" {
						continue
					}

					ifaceStats := fetchPodInterfaceStats(ctx, client, nodeName, pod.Namespace, pod.Name)
					if len(ifaceStats) == 0 {
						continue
					}

					stat := PodNetworkStats{
						PodName:    pod.Name,
						Namespace:  pod.Namespace,
						Component:  component,
						Interfaces: ifaceStats,
					}

					mu.Lock()
					allStats = append(allStats, stat)
					mu.Unlock()
				}
			}
		}(cl.Name)
	}

	waitWithDeadline(&wg, clusterCancel, maxResponseDeadline)
	return c.JSON(fiber.Map{"stats": allStats, "source": "k8s"})
}

// kubeletStatsSummary is a minimal representation of the kubelet /stats/summary response.
// We only extract the pod-level network interface data.
type kubeletStatsSummary struct {
	Pods []kubeletPodStats `json:"pods"`
}

type kubeletPodStats struct {
	PodRef struct {
		Name      string `json:"name"`
		Namespace string `json:"namespace"`
	} `json:"podRef"`
	Network *kubeletNetworkStats `json:"network,omitempty"`
}

type kubeletNetworkStats struct {
	Interfaces []kubeletInterfaceStats `json:"interfaces"`
}

type kubeletInterfaceStats struct {
	Name    string `json:"name"`
	RxBytes *int64 `json:"rxBytes,omitempty"`
	TxBytes *int64 `json:"txBytes,omitempty"`
}

// fetchPodInterfaceStats queries the kubelet stats/summary API via the Kubernetes
// API server proxy and extracts per-interface byte counters for the given pod.
// Returns an empty slice if the kubelet endpoint is unavailable or the pod is not found.
func fetchPodInterfaceStats(
	ctx context.Context,
	client kubernetes.Interface,
	nodeName, podNamespace, podName string,
) []InterfaceStats {
	// Proxy request: GET /api/v1/nodes/{node}/proxy/stats/summary
	raw, err := client.CoreV1().RESTClient().Get().
		AbsPath(fmt.Sprintf("/api/v1/nodes/%s/proxy/stats/summary", nodeName)).
		DoRaw(ctx)
	if err != nil {
		// Don't log 401/403 — this is expected on locked-down clusters
		return nil
	}

	var summary kubeletStatsSummary
	if jsonErr := json.Unmarshal(raw, &summary); jsonErr != nil {
		slog.Error("[MCP] network stats: failed to parse kubelet summary", "node", nodeName, "error", jsonErr)
		return nil
	}

	// Find the target pod in the summary
	for _, ps := range summary.Pods {
		if ps.PodRef.Name == podName && ps.PodRef.Namespace == podNamespace && ps.Network != nil {
			result := make([]InterfaceStats, 0, len(ps.Network.Interfaces))
			for _, iface := range ps.Network.Interfaces {
				var rxBytes, txBytes int64
				if iface.RxBytes != nil {
					rxBytes = *iface.RxBytes
				}
				if iface.TxBytes != nil {
					txBytes = *iface.TxBytes
				}
				result = append(result, InterfaceStats{
					Name:    iface.Name,
					RxBytes: rxBytes,
					TxBytes: txBytes,
					// Rate estimation: the kubelet stats/summary gives cumulative
					// byte counters, not per-second rates. The frontend computes
					// deltas between successive polls.  We provide a rough estimate
					// here by dividing by the expected poll interval.
					RxBytesPerSec: rxBytes / networkStatsPollIntervalSec,
					TxBytesPerSec: txBytes / networkStatsPollIntervalSec,
				})
			}
			return result
		}
	}

	return nil
}

// GetResourceYAML returns the YAML representation of a Kubernetes resource.
// This is a stub handler — full resource YAML retrieval requires dynamic client
// support which will be added in a future iteration. For now, it returns an
// empty yaml field so the frontend can gracefully fall back to demo YAML.
func (h *MCPHandlers) GetResourceYAML(c *fiber.Ctx) error {
	if isDemoMode(c) {
		return c.JSON(fiber.Map{"yaml": "", "source": "demo"})
	}

	return c.JSON(fiber.Map{"yaml": "", "source": "stub"})
}
