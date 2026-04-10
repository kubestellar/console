package handlers

import (
	"context"
	"log/slog"
	"sync"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/api/v1alpha1"
	"github.com/kubestellar/console/pkg/k8s"
)

// GetPods returns pods for a namespace/cluster
func (h *MCPHandlers) GetPods(c *fiber.Ctx) error {
	// Demo mode: return demo data immediately
	if isDemoMode(c) {
		return demoResponse(c, "pods", getDemoPods())
	}

	cluster := c.Query("cluster")
	namespace := c.Query("namespace")
	labelSelector := c.Query("labelSelector")

	if err := mcpValidateClusterAndNamespace(cluster, namespace); err != nil {
		return err
	}
	if err := mcpValidateLabelSelector(labelSelector); err != nil {
		return err
	}

	// Try MCP bridge first for its richer functionality
	if h.bridge != nil {
		ctx, cancel := context.WithTimeout(c.Context(), mcpDefaultTimeout)
		defer cancel()

		pods, err := h.bridge.GetPods(ctx, cluster, namespace, labelSelector)
		if err == nil {
			return c.JSON(fiber.Map{"pods": pods, "source": "mcp"})
		}
		slog.Error("[MCP] bridge GetPods failed, falling back", "error", err)
	}

	// Fall back to direct k8s client
	if h.k8sClient != nil {
		// If no cluster specified, query all clusters in parallel
		if cluster == "" {
			clusters, _, err := h.k8sClient.HealthyClusters(c.Context())
			if err != nil {
				return handleK8sError(c, err)
			}

			var wg sync.WaitGroup
			var mu sync.Mutex
			allPods := make([]k8s.PodInfo, 0)
			clusterTimeout := mcpExtendedTimeout
			var errTracker clusterErrorTracker

			clusterCtx, clusterCancel := context.WithCancel(c.Context())
			defer clusterCancel()

			for _, cl := range clusters {
				wg.Add(1)
				go func(clusterName string) {
					defer wg.Done()
					ctx, cancel := context.WithTimeout(clusterCtx, clusterTimeout)
					defer cancel()

					pods, err := h.k8sClient.GetPods(ctx, clusterName, namespace)
					if err != nil {
						errTracker.add(clusterName, err)
					} else if len(pods) > 0 {
						mu.Lock()
						allPods = append(allPods, pods...)
						mu.Unlock()
					}
				}(cl.Name)
			}

			waitWithDeadline(&wg, clusterCancel, maxResponseDeadline)
			return c.JSON(errTracker.annotate(fiber.Map{"pods": allPods, "source": "k8s"}))
		}

		ctx, cancel := context.WithTimeout(c.Context(), mcpDefaultTimeout)
		defer cancel()

		pods, err := h.k8sClient.GetPods(ctx, cluster, namespace)
		if err != nil {
			return handleK8sError(c, err)
		}
		if pods == nil {
			pods = make([]k8s.PodInfo, 0)
		}
		return c.JSON(fiber.Map{"pods": pods, "source": "k8s"})
	}

	return c.Status(503).JSON(fiber.Map{"error": "No cluster access available"})
}

// FindPodIssues returns pods with issues
func (h *MCPHandlers) FindPodIssues(c *fiber.Ctx) error {
	// Demo mode: return demo data immediately
	if isDemoMode(c) {
		return demoResponse(c, "issues", getDemoPodIssues())
	}

	cluster := c.Query("cluster")
	namespace := c.Query("namespace")

	if err := mcpValidateClusterAndNamespace(cluster, namespace); err != nil {
		return err
	}

	// Try MCP bridge first
	if h.bridge != nil {
		ctx, cancel := context.WithTimeout(c.Context(), mcpDefaultTimeout)
		defer cancel()

		issues, err := h.bridge.FindPodIssues(ctx, cluster, namespace)
		if err == nil {
			return c.JSON(fiber.Map{"issues": issues, "source": "mcp"})
		}
		slog.Error("[MCP] bridge FindPodIssues failed, falling back", "error", err)
	}

	// Fall back to direct k8s client
	if h.k8sClient != nil {
		// If no cluster specified, query all clusters in parallel
		if cluster == "" {
			clusters, _, err := h.k8sClient.HealthyClusters(c.Context())
			if err != nil {
				return handleK8sError(c, err)
			}

			var wg sync.WaitGroup
			var mu sync.Mutex
			allIssues := make([]k8s.PodIssue, 0)
			clusterTimeout := mcpExtendedTimeout

			clusterCtx, clusterCancel := context.WithCancel(c.Context())
			defer clusterCancel()

			for _, cl := range clusters {
				wg.Add(1)
				go func(clusterName string) {
					defer wg.Done()
					ctx, cancel := context.WithTimeout(clusterCtx, clusterTimeout)
					defer cancel()

					issues, err := h.k8sClient.FindPodIssues(ctx, clusterName, namespace)
					if err == nil && len(issues) > 0 {
						mu.Lock()
						allIssues = append(allIssues, issues...)
						mu.Unlock()
					}
				}(cl.Name)
			}

			waitWithDeadline(&wg, clusterCancel, maxResponseDeadline)
			return c.JSON(fiber.Map{"issues": allIssues, "source": "k8s"})
		}

		ctx, cancel := context.WithTimeout(c.Context(), mcpDefaultTimeout)
		defer cancel()

		issues, err := h.k8sClient.FindPodIssues(ctx, cluster, namespace)
		if err != nil {
			return handleK8sError(c, err)
		}
		if issues == nil {
			issues = make([]k8s.PodIssue, 0)
		}
		return c.JSON(fiber.Map{"issues": issues, "source": "k8s"})
	}

	return c.Status(503).JSON(fiber.Map{"error": "No cluster access available"})
}

// FindDeploymentIssues returns deployments with issues
func (h *MCPHandlers) FindDeploymentIssues(c *fiber.Ctx) error {
	// Demo mode: return demo data immediately
	if isDemoMode(c) {
		return demoResponse(c, "issues", getDemoDeploymentIssues())
	}

	cluster := c.Query("cluster")
	namespace := c.Query("namespace")

	if err := mcpValidateClusterAndNamespace(cluster, namespace); err != nil {
		return err
	}

	// Fall back to direct k8s client
	if h.k8sClient != nil {
		// If no cluster specified, query all clusters in parallel
		if cluster == "" {
			clusters, _, err := h.k8sClient.HealthyClusters(c.Context())
			if err != nil {
				return handleK8sError(c, err)
			}

			var wg sync.WaitGroup
			var mu sync.Mutex
			allIssues := make([]k8s.DeploymentIssue, 0)
			clusterTimeout := mcpDefaultTimeout

			clusterCtx, clusterCancel := context.WithCancel(c.Context())
			defer clusterCancel()

			for _, cl := range clusters {
				wg.Add(1)
				go func(clusterName string) {
					defer wg.Done()
					ctx, cancel := context.WithTimeout(clusterCtx, clusterTimeout)
					defer cancel()

					issues, err := h.k8sClient.FindDeploymentIssues(ctx, clusterName, namespace)
					if err == nil && len(issues) > 0 {
						mu.Lock()
						allIssues = append(allIssues, issues...)
						mu.Unlock()
					}
				}(cl.Name)
			}

			waitWithDeadline(&wg, clusterCancel, maxResponseDeadline)
			return c.JSON(fiber.Map{"issues": allIssues, "source": "k8s"})
		}

		ctx, cancel := context.WithTimeout(c.Context(), mcpDefaultTimeout)
		defer cancel()
		issues, err := h.k8sClient.FindDeploymentIssues(ctx, cluster, namespace)
		if err != nil {
			return handleK8sError(c, err)
		}
		if issues == nil {
			issues = make([]k8s.DeploymentIssue, 0)
		}
		return c.JSON(fiber.Map{"issues": issues, "source": "k8s"})
	}

	return c.Status(503).JSON(fiber.Map{"error": "No cluster access available"})
}

// GetDeployments returns deployments with rollout status
func (h *MCPHandlers) GetDeployments(c *fiber.Ctx) error {
	// Demo mode: return demo data immediately
	if isDemoMode(c) {
		return demoResponse(c, "deployments", getDemoDeployments())
	}

	cluster := c.Query("cluster")
	namespace := c.Query("namespace")

	if err := mcpValidateClusterAndNamespace(cluster, namespace); err != nil {
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
			allDeployments := make([]k8s.Deployment, 0)
			clusterTimeout := mcpDefaultTimeout

			clusterCtx, clusterCancel := context.WithCancel(c.Context())
			defer clusterCancel()

			for _, cl := range clusters {
				wg.Add(1)
				go func(clusterName string) {
					defer wg.Done()
					ctx, cancel := context.WithTimeout(clusterCtx, clusterTimeout)
					defer cancel()

					deployments, err := h.k8sClient.GetDeployments(ctx, clusterName, namespace)
					if err == nil && len(deployments) > 0 {
						mu.Lock()
						allDeployments = append(allDeployments, deployments...)
						mu.Unlock()
					}
				}(cl.Name)
			}

			waitWithDeadline(&wg, clusterCancel, maxResponseDeadline)
			return c.JSON(fiber.Map{"deployments": allDeployments, "source": "k8s"})
		}

		ctx, cancel := context.WithTimeout(c.Context(), mcpDefaultTimeout)
		defer cancel()
		deployments, err := h.k8sClient.GetDeployments(ctx, cluster, namespace)
		if err != nil {
			return handleK8sError(c, err)
		}
		if deployments == nil {
			deployments = make([]k8s.Deployment, 0)
		}
		return c.JSON(fiber.Map{"deployments": deployments, "source": "k8s"})
	}

	return c.Status(503).JSON(fiber.Map{"error": "No cluster access available"})
}

// GetServices returns services from clusters
func (h *MCPHandlers) GetServices(c *fiber.Ctx) error {
	// Demo mode: return demo data immediately
	if isDemoMode(c) {
		return demoResponse(c, "services", getDemoServices())
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
			allServices := make([]k8s.Service, 0)
			// clusterCounts represents every cluster we contacted, even
			// those that returned zero services. Issue #6154: clusters
			// with zero services used to be completely omitted from the
			// aggregation response, which caused the frontend to think
			// the cluster did not exist rather than displaying "0
			// services". We now always include the cluster with its
			// service count.
			clusterCounts := make(map[string]int, len(clusters))
			for _, cl := range clusters {
				clusterCounts[cl.Name] = 0
			}
			clusterTimeout := mcpDefaultTimeout

			clusterCtx, clusterCancel := context.WithCancel(c.Context())
			defer clusterCancel()

			for _, cl := range clusters {
				wg.Add(1)
				go func(clusterName string) {
					defer wg.Done()
					ctx, cancel := context.WithTimeout(clusterCtx, clusterTimeout)
					defer cancel()

					services, err := h.k8sClient.GetServices(ctx, clusterName, namespace)
					if err != nil {
						return
					}
					mu.Lock()
					// Record the per-cluster count even when zero so
					// the response always represents every cluster.
					clusterCounts[clusterName] = len(services)
					if len(services) > 0 {
						allServices = append(allServices, services...)
					}
					mu.Unlock()
				}(cl.Name)
			}

			waitWithDeadline(&wg, clusterCancel, maxResponseDeadline)

			// Serialize per-cluster counts as a stable slice so the
			// frontend can iterate it without worrying about map
			// ordering.
			type clusterServiceCount struct {
				Cluster  string `json:"cluster"`
				Services int    `json:"services"`
			}
			counts := make([]clusterServiceCount, 0, len(clusters))
			for _, cl := range clusters {
				counts = append(counts, clusterServiceCount{
					Cluster:  cl.Name,
					Services: clusterCounts[cl.Name],
				})
			}
			return c.JSON(fiber.Map{
				"services":      allServices,
				"clusterCounts": counts,
				"source":        "k8s",
			})
		}

		ctx, cancel := context.WithTimeout(c.Context(), mcpDefaultTimeout)
		defer cancel()

		services, err := h.k8sClient.GetServices(ctx, cluster, namespace)
		if err != nil {
			return handleK8sError(c, err)
		}
		if services == nil {
			services = make([]k8s.Service, 0)
		}
		return c.JSON(fiber.Map{"services": services, "source": "k8s"})
	}

	return c.Status(503).JSON(fiber.Map{"error": "No cluster access available"})
}

// GetJobs returns jobs from clusters
func (h *MCPHandlers) GetJobs(c *fiber.Ctx) error {
	// Demo mode: return demo data immediately
	if isDemoMode(c) {
		return demoResponse(c, "jobs", getDemoJobs())
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
			allJobs := make([]k8s.Job, 0)
			clusterTimeout := mcpDefaultTimeout

			clusterCtx, clusterCancel := context.WithCancel(c.Context())
			defer clusterCancel()

			for _, cl := range clusters {
				wg.Add(1)
				go func(clusterName string) {
					defer wg.Done()
					ctx, cancel := context.WithTimeout(clusterCtx, clusterTimeout)
					defer cancel()

					jobs, err := h.k8sClient.GetJobs(ctx, clusterName, namespace)
					if err == nil && len(jobs) > 0 {
						mu.Lock()
						allJobs = append(allJobs, jobs...)
						mu.Unlock()
					}
				}(cl.Name)
			}

			waitWithDeadline(&wg, clusterCancel, maxResponseDeadline)
			return c.JSON(fiber.Map{"jobs": allJobs, "source": "k8s"})
		}

		ctx, cancel := context.WithTimeout(c.Context(), mcpDefaultTimeout)
		defer cancel()

		jobs, err := h.k8sClient.GetJobs(ctx, cluster, namespace)
		if err != nil {
			return handleK8sError(c, err)
		}
		if jobs == nil {
			jobs = make([]k8s.Job, 0)
		}
		return c.JSON(fiber.Map{"jobs": jobs, "source": "k8s"})
	}

	return c.Status(503).JSON(fiber.Map{"error": "No cluster access available"})
}

// GetHPAs returns HPAs from clusters
func (h *MCPHandlers) GetHPAs(c *fiber.Ctx) error {
	// Demo mode: return demo data immediately
	if isDemoMode(c) {
		return demoResponse(c, "hpas", getDemoHPAs())
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
			allHPAs := make([]k8s.HPA, 0)
			clusterTimeout := mcpDefaultTimeout

			clusterCtx, clusterCancel := context.WithCancel(c.Context())
			defer clusterCancel()

			for _, cl := range clusters {
				wg.Add(1)
				go func(clusterName string) {
					defer wg.Done()
					ctx, cancel := context.WithTimeout(clusterCtx, clusterTimeout)
					defer cancel()

					hpas, err := h.k8sClient.GetHPAs(ctx, clusterName, namespace)
					if err == nil && len(hpas) > 0 {
						mu.Lock()
						allHPAs = append(allHPAs, hpas...)
						mu.Unlock()
					}
				}(cl.Name)
			}

			waitWithDeadline(&wg, clusterCancel, maxResponseDeadline)
			return c.JSON(fiber.Map{"hpas": allHPAs, "source": "k8s"})
		}

		ctx, cancel := context.WithTimeout(c.Context(), mcpDefaultTimeout)
		defer cancel()

		hpas, err := h.k8sClient.GetHPAs(ctx, cluster, namespace)
		if err != nil {
			return handleK8sError(c, err)
		}
		if hpas == nil {
			hpas = make([]k8s.HPA, 0)
		}
		return c.JSON(fiber.Map{"hpas": hpas, "source": "k8s"})
	}

	return c.Status(503).JSON(fiber.Map{"error": "No cluster access available"})
}

// GetReplicaSets returns ReplicaSets from clusters
func (h *MCPHandlers) GetReplicaSets(c *fiber.Ctx) error {
	// Demo mode: return demo data immediately
	if isDemoMode(c) {
		return demoResponse(c, "replicasets", getDemoReplicaSets())
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
			allItems := make([]k8s.ReplicaSet, 0)
			clusterTimeout := mcpDefaultTimeout

			clusterCtx, clusterCancel := context.WithCancel(c.Context())
			defer clusterCancel()

			for _, cl := range clusters {
				wg.Add(1)
				go func(clusterName string) {
					defer wg.Done()
					ctx, cancel := context.WithTimeout(clusterCtx, clusterTimeout)
					defer cancel()

					items, err := h.k8sClient.GetReplicaSets(ctx, clusterName, namespace)
					if err == nil && len(items) > 0 {
						mu.Lock()
						allItems = append(allItems, items...)
						mu.Unlock()
					}
				}(cl.Name)
			}

			waitWithDeadline(&wg, clusterCancel, maxResponseDeadline)
			return c.JSON(fiber.Map{"replicasets": allItems, "source": "k8s"})
		}

		ctx, cancel := context.WithTimeout(c.Context(), mcpDefaultTimeout)
		defer cancel()

		items, err := h.k8sClient.GetReplicaSets(ctx, cluster, namespace)
		if err != nil {
			return handleK8sError(c, err)
		}
		if items == nil {
			items = make([]k8s.ReplicaSet, 0)
		}
		return c.JSON(fiber.Map{"replicasets": items, "source": "k8s"})
	}

	return c.Status(503).JSON(fiber.Map{"error": "No cluster access available"})
}

// GetStatefulSets returns StatefulSets from clusters
func (h *MCPHandlers) GetStatefulSets(c *fiber.Ctx) error {
	// Demo mode: return demo data immediately
	if isDemoMode(c) {
		return demoResponse(c, "statefulsets", getDemoStatefulSets())
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
			allItems := make([]k8s.StatefulSet, 0)
			clusterTimeout := mcpDefaultTimeout

			clusterCtx, clusterCancel := context.WithCancel(c.Context())
			defer clusterCancel()

			for _, cl := range clusters {
				wg.Add(1)
				go func(clusterName string) {
					defer wg.Done()
					ctx, cancel := context.WithTimeout(clusterCtx, clusterTimeout)
					defer cancel()

					items, err := h.k8sClient.GetStatefulSets(ctx, clusterName, namespace)
					if err == nil && len(items) > 0 {
						mu.Lock()
						allItems = append(allItems, items...)
						mu.Unlock()
					}
				}(cl.Name)
			}

			waitWithDeadline(&wg, clusterCancel, maxResponseDeadline)
			return c.JSON(fiber.Map{"statefulsets": allItems, "source": "k8s"})
		}

		ctx, cancel := context.WithTimeout(c.Context(), mcpDefaultTimeout)
		defer cancel()

		items, err := h.k8sClient.GetStatefulSets(ctx, cluster, namespace)
		if err != nil {
			return handleK8sError(c, err)
		}
		if items == nil {
			items = make([]k8s.StatefulSet, 0)
		}
		return c.JSON(fiber.Map{"statefulsets": items, "source": "k8s"})
	}

	return c.Status(503).JSON(fiber.Map{"error": "No cluster access available"})
}

// GetDaemonSets returns DaemonSets from clusters
func (h *MCPHandlers) GetDaemonSets(c *fiber.Ctx) error {
	// Demo mode: return demo data immediately
	if isDemoMode(c) {
		return demoResponse(c, "daemonsets", getDemoDaemonSets())
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
			allItems := make([]k8s.DaemonSet, 0)
			clusterTimeout := mcpDefaultTimeout

			clusterCtx, clusterCancel := context.WithCancel(c.Context())
			defer clusterCancel()

			for _, cl := range clusters {
				wg.Add(1)
				go func(clusterName string) {
					defer wg.Done()
					ctx, cancel := context.WithTimeout(clusterCtx, clusterTimeout)
					defer cancel()

					items, err := h.k8sClient.GetDaemonSets(ctx, clusterName, namespace)
					if err == nil && len(items) > 0 {
						mu.Lock()
						allItems = append(allItems, items...)
						mu.Unlock()
					}
				}(cl.Name)
			}

			waitWithDeadline(&wg, clusterCancel, maxResponseDeadline)
			return c.JSON(fiber.Map{"daemonsets": allItems, "source": "k8s"})
		}

		ctx, cancel := context.WithTimeout(c.Context(), mcpDefaultTimeout)
		defer cancel()

		items, err := h.k8sClient.GetDaemonSets(ctx, cluster, namespace)
		if err != nil {
			return handleK8sError(c, err)
		}
		if items == nil {
			items = make([]k8s.DaemonSet, 0)
		}
		return c.JSON(fiber.Map{"daemonsets": items, "source": "k8s"})
	}

	return c.Status(503).JSON(fiber.Map{"error": "No cluster access available"})
}

// GetCronJobs returns CronJobs from clusters
func (h *MCPHandlers) GetCronJobs(c *fiber.Ctx) error {
	// Demo mode: return demo data immediately
	if isDemoMode(c) {
		return demoResponse(c, "cronjobs", getDemoCronJobs())
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
			allItems := make([]k8s.CronJob, 0)
			clusterTimeout := mcpDefaultTimeout

			clusterCtx, clusterCancel := context.WithCancel(c.Context())
			defer clusterCancel()

			for _, cl := range clusters {
				wg.Add(1)
				go func(clusterName string) {
					defer wg.Done()
					ctx, cancel := context.WithTimeout(clusterCtx, clusterTimeout)
					defer cancel()

					items, err := h.k8sClient.GetCronJobs(ctx, clusterName, namespace)
					if err == nil && len(items) > 0 {
						mu.Lock()
						allItems = append(allItems, items...)
						mu.Unlock()
					}
				}(cl.Name)
			}

			waitWithDeadline(&wg, clusterCancel, maxResponseDeadline)
			return c.JSON(fiber.Map{"cronjobs": allItems, "source": "k8s"})
		}

		ctx, cancel := context.WithTimeout(c.Context(), mcpDefaultTimeout)
		defer cancel()

		items, err := h.k8sClient.GetCronJobs(ctx, cluster, namespace)
		if err != nil {
			return handleK8sError(c, err)
		}
		if items == nil {
			items = make([]k8s.CronJob, 0)
		}
		return c.JSON(fiber.Map{"cronjobs": items, "source": "k8s"})
	}

	return c.Status(503).JSON(fiber.Map{"error": "No cluster access available"})
}

// GetWorkloads returns an aggregate view of workloads (Deployments, StatefulSets,
// DaemonSets) from clusters. This is the non-streaming counterpart of
// GetWorkloadsStream, used by the widget export system (/api/mcp/workloads).
func (h *MCPHandlers) GetWorkloads(c *fiber.Ctx) error {
	if isDemoMode(c) {
		return demoResponse(c, "workloads", getDemoWorkloads())
	}

	if h.k8sClient == nil {
		return c.Status(503).JSON(fiber.Map{"error": "No cluster access available"})
	}

	cluster := c.Query("cluster")
	namespace := c.Query("namespace")
	workloadType := c.Query("type")

	if err := mcpValidateClusterAndNamespace(cluster, namespace); err != nil {
		return err
	}
	if err := mcpValidateWorkloadType(workloadType); err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(c.Context(), maxResponseDeadline)
	defer cancel()

	list, err := h.k8sClient.ListWorkloads(ctx, cluster, namespace, workloadType)
	if err != nil {
		slog.Error("[MCP] internal error listing workloads", "error", err)
		return c.Status(500).JSON(fiber.Map{"error": "internal server error"})
	}

	var workloads []v1alpha1.Workload
	if list == nil || list.Items == nil {
		workloads = make([]v1alpha1.Workload, 0)
	} else {
		workloads = list.Items
	}

	return c.JSON(fiber.Map{"workloads": workloads, "source": "k8s"})
}
