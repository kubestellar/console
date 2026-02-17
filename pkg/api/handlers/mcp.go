package handlers

import (
	"context"
	"log"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/mcp"
)

// maxResponseDeadline is the maximum time any multi-cluster REST handler will
// wait before returning whatever data has been collected. This is a fallback
// for when SSE streaming is not used. Set to 30s to allow healthy clusters
// time to respond (offline clusters are now skipped via HealthyClusters).
const maxResponseDeadline = 30 * time.Second

// mcpHealthTimeout is the timeout for multi-cluster health check aggregation.
const mcpHealthTimeout = 60 * time.Second

// mcpDefaultTimeout is the per-cluster timeout for standard MCP data fetches.
const mcpDefaultTimeout = 15 * time.Second

// mcpExtendedTimeout is the per-cluster timeout for heavier MCP operations
// (e.g. deployments, GPU queries) that may need extra time.
const mcpExtendedTimeout = 30 * time.Second

// waitWithDeadline waits for all goroutines in wg to finish, but returns
// early if the deadline is reached. Goroutines that haven't finished
// continue running in the background (their results are simply not
// included in the current response). Returns true if the deadline was
// hit (partial results), false if all goroutines completed in time.
func waitWithDeadline(wg *sync.WaitGroup, deadline time.Duration) bool {
	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()
	select {
	case <-done:
		return false
	case <-time.After(deadline):
		return true
	}
}

// MCPHandlers handles MCP-related API endpoints
type MCPHandlers struct {
	bridge    *mcp.Bridge
	k8sClient *k8s.MultiClusterClient
}

// NewMCPHandlers creates a new MCP handlers instance
func NewMCPHandlers(bridge *mcp.Bridge, k8sClient *k8s.MultiClusterClient) *MCPHandlers {
	return &MCPHandlers{
		bridge:    bridge,
		k8sClient: k8sClient,
	}
}

// GetStatus returns the MCP bridge status
func (h *MCPHandlers) GetStatus(c *fiber.Ctx) error {
	status := fiber.Map{
		"k8sClient": h.k8sClient != nil,
	}

	if h.bridge != nil {
		bridgeStatus := h.bridge.Status()
		status["mcpBridge"] = bridgeStatus
	} else {
		status["mcpBridge"] = fiber.Map{"available": false}
	}

	return c.JSON(status)
}

// GetOpsTools returns available kubestellar-ops tools
func (h *MCPHandlers) GetOpsTools(c *fiber.Ctx) error {
	if h.bridge == nil {
		return c.Status(503).JSON(fiber.Map{"error": "MCP bridge not available"})
	}

	tools := h.bridge.GetOpsTools()
	return c.JSON(fiber.Map{"tools": tools})
}

// GetDeployTools returns available kubestellar-deploy tools
func (h *MCPHandlers) GetDeployTools(c *fiber.Ctx) error {
	if h.bridge == nil {
		return c.Status(503).JSON(fiber.Map{"error": "MCP bridge not available"})
	}

	tools := h.bridge.GetDeployTools()
	return c.JSON(fiber.Map{"tools": tools})
}

// ListClusters returns all discovered clusters with health data
func (h *MCPHandlers) ListClusters(c *fiber.Ctx) error {
	// Demo mode: return demo data immediately without trying real clusters
	if isDemoMode(c) {
		return demoResponse(c, "clusters", getDemoClusters())
	}

	// Try MCP bridge first if available
	if h.bridge != nil {
		clusters, err := h.bridge.ListClusters(c.Context())
		if err == nil && len(clusters) > 0 {
			return c.JSON(fiber.Map{"clusters": clusters, "source": "mcp"})
		}
		log.Printf("MCP bridge ListClusters failed, falling back to k8s client: %v", err)
	}

	// Fall back to direct k8s client
	if h.k8sClient != nil {
		clusters, err := h.k8sClient.ListClusters(c.Context())
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}

		// Enrich with cached health data only — never block on live health
		// checks here. The background health refresh (or explicit
		// /api/mcp/health/all calls) populates the cache asynchronously.
		healthMap := h.k8sClient.GetCachedHealth()
		for i := range clusters {
			if health, ok := healthMap[clusters[i].Name]; ok {
				clusters[i].Healthy = health.Healthy
				clusters[i].NodeCount = health.NodeCount
				clusters[i].PodCount = health.PodCount
			}
		}

		// Kick off a background health refresh so subsequent calls get fresh data
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), mcpHealthTimeout)
			defer cancel()
			h.k8sClient.GetAllClusterHealth(ctx)
		}()

		return c.JSON(fiber.Map{"clusters": clusters, "source": "k8s"})
	}

	return c.Status(503).JSON(fiber.Map{"error": "No cluster access available"})
}

// GetClusterHealth returns health for a specific cluster
func (h *MCPHandlers) GetClusterHealth(c *fiber.Ctx) error {
	cluster := c.Params("cluster")

	// Demo mode: return demo data immediately
	if isDemoMode(c) {
		return c.JSON(getDemoClusterHealth(cluster))
	}

	// Try MCP bridge first if available
	if h.bridge != nil {
		health, err := h.bridge.GetClusterHealth(c.Context(), cluster)
		if err == nil {
			return c.JSON(health)
		}
		log.Printf("MCP bridge GetClusterHealth failed, falling back: %v", err)
	}

	// Fall back to direct k8s client
	if h.k8sClient != nil {
		health, err := h.k8sClient.GetClusterHealth(c.Context(), cluster)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
		return c.JSON(health)
	}

	return c.Status(503).JSON(fiber.Map{"error": "No cluster access available"})
}

// GetAllClusterHealth returns health for all clusters
func (h *MCPHandlers) GetAllClusterHealth(c *fiber.Ctx) error {
	// Demo mode: return demo data immediately
	if isDemoMode(c) {
		return demoResponse(c, "health", getDemoAllClusterHealth())
	}

	// Use direct k8s client for this as it's more efficient
	if h.k8sClient != nil {
		health, err := h.k8sClient.GetAllClusterHealth(c.Context())
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
		return c.JSON(fiber.Map{"health": health})
	}

	return c.Status(503).JSON(fiber.Map{"error": "No cluster access available"})
}

// GetPods returns pods for a namespace/cluster
func (h *MCPHandlers) GetPods(c *fiber.Ctx) error {
	// Demo mode: return demo data immediately
	if isDemoMode(c) {
		return demoResponse(c, "pods", getDemoPods())
	}

	cluster := c.Query("cluster")
	namespace := c.Query("namespace")
	labelSelector := c.Query("labelSelector")

	// Try MCP bridge first for its richer functionality
	if h.bridge != nil {
		pods, err := h.bridge.GetPods(c.Context(), cluster, namespace, labelSelector)
		if err == nil {
			return c.JSON(fiber.Map{"pods": pods, "source": "mcp"})
		}
		log.Printf("MCP bridge GetPods failed, falling back: %v", err)
	}

	// Fall back to direct k8s client
	if h.k8sClient != nil {
		// If no cluster specified, query all clusters in parallel
		if cluster == "" {
			clusters, _, err := h.k8sClient.HealthyClusters(c.Context())
			if err != nil {
				return c.Status(500).JSON(fiber.Map{"error": err.Error()})
			}

			var wg sync.WaitGroup
			var mu sync.Mutex
			var allPods []k8s.PodInfo
			clusterTimeout := mcpExtendedTimeout

			for _, cl := range clusters {
				wg.Add(1)
				go func(clusterName string) {
					defer wg.Done()
					ctx, cancel := context.WithTimeout(c.Context(), clusterTimeout)
					defer cancel()

					pods, err := h.k8sClient.GetPods(ctx, clusterName, namespace)
					if err == nil && len(pods) > 0 {
						mu.Lock()
						allPods = append(allPods, pods...)
						mu.Unlock()
					}
				}(cl.Name)
			}

			waitWithDeadline(&wg, maxResponseDeadline)
			return c.JSON(fiber.Map{"pods": allPods, "source": "k8s"})
		}

		pods, err := h.k8sClient.GetPods(c.Context(), cluster, namespace)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
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

	// Try MCP bridge first
	if h.bridge != nil {
		issues, err := h.bridge.FindPodIssues(c.Context(), cluster, namespace)
		if err == nil {
			return c.JSON(fiber.Map{"issues": issues, "source": "mcp"})
		}
		log.Printf("MCP bridge FindPodIssues failed, falling back: %v", err)
	}

	// Fall back to direct k8s client
	if h.k8sClient != nil {
		// If no cluster specified, query all clusters in parallel
		if cluster == "" {
			clusters, _, err := h.k8sClient.HealthyClusters(c.Context())
			if err != nil {
				return c.Status(500).JSON(fiber.Map{"error": err.Error()})
			}

			var wg sync.WaitGroup
			var mu sync.Mutex
			var allIssues []k8s.PodIssue
			clusterTimeout := mcpExtendedTimeout

			for _, cl := range clusters {
				wg.Add(1)
				go func(clusterName string) {
					defer wg.Done()
					ctx, cancel := context.WithTimeout(c.Context(), clusterTimeout)
					defer cancel()

					issues, err := h.k8sClient.FindPodIssues(ctx, clusterName, namespace)
					if err == nil && len(issues) > 0 {
						mu.Lock()
						allIssues = append(allIssues, issues...)
						mu.Unlock()
					}
				}(cl.Name)
			}

			waitWithDeadline(&wg, maxResponseDeadline)
			return c.JSON(fiber.Map{"issues": allIssues, "source": "k8s"})
		}

		issues, err := h.k8sClient.FindPodIssues(c.Context(), cluster, namespace)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
		return c.JSON(fiber.Map{"issues": issues, "source": "k8s"})
	}

	return c.Status(503).JSON(fiber.Map{"error": "No cluster access available"})
}

// GetGPUNodes returns nodes with GPU resources
func (h *MCPHandlers) GetGPUNodes(c *fiber.Ctx) error {
	// Demo mode: return demo data immediately
	if isDemoMode(c) {
		return demoResponse(c, "nodes", getDemoGPUNodes())
	}

	cluster := c.Query("cluster")

	if h.k8sClient != nil {
		// If no cluster specified, query all clusters in parallel
		if cluster == "" {
			clusters, _, err := h.k8sClient.HealthyClusters(c.Context())
			if err != nil {
				return c.Status(500).JSON(fiber.Map{"error": err.Error()})
			}

			var wg sync.WaitGroup
			var mu sync.Mutex
			var allNodes []k8s.GPUNode
			clusterTimeout := mcpExtendedTimeout // Increased for large GPU clusters

			for _, cl := range clusters {
				wg.Add(1)
				go func(clusterName string) {
					defer wg.Done()
					ctx, cancel := context.WithTimeout(c.Context(), clusterTimeout)
					defer cancel()

					nodes, err := h.k8sClient.GetGPUNodes(ctx, clusterName)
					if err == nil && len(nodes) > 0 {
						mu.Lock()
						allNodes = append(allNodes, nodes...)
						mu.Unlock()
					}
				}(cl.Name)
			}

			waitWithDeadline(&wg, maxResponseDeadline)
			return c.JSON(fiber.Map{"nodes": allNodes, "source": "k8s"})
		}

		nodes, err := h.k8sClient.GetGPUNodes(c.Context(), cluster)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
		return c.JSON(fiber.Map{"nodes": nodes, "source": "k8s"})
	}

	return c.Status(503).JSON(fiber.Map{"error": "No cluster access available"})
}

// GetNVIDIAOperatorStatus returns NVIDIA GPU and Network operator status
func (h *MCPHandlers) GetNVIDIAOperatorStatus(c *fiber.Ctx) error {
	// Demo mode: return demo data immediately
	if isDemoMode(c) {
		return demoResponse(c, "operators", getDemoNVIDIAOperatorStatus())
	}

	cluster := c.Query("cluster")

	if h.k8sClient != nil {
		// If no cluster specified, query all clusters in parallel
		if cluster == "" {
			clusters, _, err := h.k8sClient.HealthyClusters(c.Context())
			if err != nil {
				return c.Status(500).JSON(fiber.Map{"error": err.Error()})
			}

			var wg sync.WaitGroup
			var mu sync.Mutex
			var allStatus []*k8s.NVIDIAOperatorStatus
			clusterTimeout := mcpDefaultTimeout

			for _, cl := range clusters {
				wg.Add(1)
				go func(clusterName string) {
					defer wg.Done()
					ctx, cancel := context.WithTimeout(c.Context(), clusterTimeout)
					defer cancel()

					status, err := h.k8sClient.GetNVIDIAOperatorStatus(ctx, clusterName)
					if err == nil && (status.GPUOperator != nil || status.NetworkOperator != nil) {
						mu.Lock()
						allStatus = append(allStatus, status)
						mu.Unlock()
					}
				}(cl.Name)
			}

			waitWithDeadline(&wg, maxResponseDeadline)
			return c.JSON(fiber.Map{"operators": allStatus, "source": "k8s"})
		}

		status, err := h.k8sClient.GetNVIDIAOperatorStatus(c.Context(), cluster)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
		return c.JSON(fiber.Map{"operator": status, "source": "k8s"})
	}

	return c.Status(503).JSON(fiber.Map{"error": "No cluster access available"})
}

// GetNodes returns detailed node information
func (h *MCPHandlers) GetNodes(c *fiber.Ctx) error {
	// Demo mode: return demo data immediately
	if isDemoMode(c) {
		return demoResponse(c, "nodes", getDemoNodes())
	}

	cluster := c.Query("cluster")

	if h.k8sClient != nil {
		// If no cluster specified, query all clusters in parallel
		if cluster == "" {
			clusters, _, err := h.k8sClient.HealthyClusters(c.Context())
			if err != nil {
				return c.Status(500).JSON(fiber.Map{"error": err.Error()})
			}

			var wg sync.WaitGroup
			var mu sync.Mutex
			var allNodes []k8s.NodeInfo
			clusterTimeout := mcpDefaultTimeout

			for _, cl := range clusters {
				wg.Add(1)
				go func(clusterName string) {
					defer wg.Done()
					ctx, cancel := context.WithTimeout(c.Context(), clusterTimeout)
					defer cancel()

					nodes, err := h.k8sClient.GetNodes(ctx, clusterName)
					if err == nil && len(nodes) > 0 {
						mu.Lock()
						allNodes = append(allNodes, nodes...)
						mu.Unlock()
					}
				}(cl.Name)
			}

			waitWithDeadline(&wg, maxResponseDeadline)
			return c.JSON(fiber.Map{"nodes": allNodes, "source": "k8s"})
		}

		nodes, err := h.k8sClient.GetNodes(c.Context(), cluster)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
		return c.JSON(fiber.Map{"nodes": nodes, "source": "k8s"})
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

	// Fall back to direct k8s client
	if h.k8sClient != nil {
		// If no cluster specified, query all clusters in parallel
		if cluster == "" {
			clusters, _, err := h.k8sClient.HealthyClusters(c.Context())
			if err != nil {
				return c.Status(500).JSON(fiber.Map{"error": err.Error()})
			}

			var wg sync.WaitGroup
			var mu sync.Mutex
			var allIssues []k8s.DeploymentIssue
			clusterTimeout := mcpDefaultTimeout

			for _, cl := range clusters {
				wg.Add(1)
				go func(clusterName string) {
					defer wg.Done()
					ctx, cancel := context.WithTimeout(c.Context(), clusterTimeout)
					defer cancel()

					issues, err := h.k8sClient.FindDeploymentIssues(ctx, clusterName, namespace)
					if err == nil && len(issues) > 0 {
						mu.Lock()
						allIssues = append(allIssues, issues...)
						mu.Unlock()
					}
				}(cl.Name)
			}

			waitWithDeadline(&wg, maxResponseDeadline)
			return c.JSON(fiber.Map{"issues": allIssues, "source": "k8s"})
		}

		issues, err := h.k8sClient.FindDeploymentIssues(c.Context(), cluster, namespace)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
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

	if h.k8sClient != nil {
		// If no cluster specified, query all clusters in parallel
		if cluster == "" {
			clusters, _, err := h.k8sClient.HealthyClusters(c.Context())
			if err != nil {
				return c.Status(500).JSON(fiber.Map{"error": err.Error()})
			}

			var wg sync.WaitGroup
			var mu sync.Mutex
			var allDeployments []k8s.Deployment
			clusterTimeout := mcpDefaultTimeout

			for _, cl := range clusters {
				wg.Add(1)
				go func(clusterName string) {
					defer wg.Done()
					ctx, cancel := context.WithTimeout(c.Context(), clusterTimeout)
					defer cancel()

					deployments, err := h.k8sClient.GetDeployments(ctx, clusterName, namespace)
					if err == nil && len(deployments) > 0 {
						mu.Lock()
						allDeployments = append(allDeployments, deployments...)
						mu.Unlock()
					}
				}(cl.Name)
			}

			waitWithDeadline(&wg, maxResponseDeadline)
			return c.JSON(fiber.Map{"deployments": allDeployments, "source": "k8s"})
		}

		deployments, err := h.k8sClient.GetDeployments(c.Context(), cluster, namespace)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
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

	if h.k8sClient != nil {
		if cluster == "" {
			clusters, _, err := h.k8sClient.HealthyClusters(c.Context())
			if err != nil {
				return c.Status(500).JSON(fiber.Map{"error": err.Error()})
			}

			var wg sync.WaitGroup
			var mu sync.Mutex
			var allServices []k8s.Service
			clusterTimeout := mcpDefaultTimeout

			for _, cl := range clusters {
				wg.Add(1)
				go func(clusterName string) {
					defer wg.Done()
					ctx, cancel := context.WithTimeout(c.Context(), clusterTimeout)
					defer cancel()

					services, err := h.k8sClient.GetServices(ctx, clusterName, namespace)
					if err == nil && len(services) > 0 {
						mu.Lock()
						allServices = append(allServices, services...)
						mu.Unlock()
					}
				}(cl.Name)
			}

			waitWithDeadline(&wg, maxResponseDeadline)
			return c.JSON(fiber.Map{"services": allServices, "source": "k8s"})
		}

		services, err := h.k8sClient.GetServices(c.Context(), cluster, namespace)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
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

	if h.k8sClient != nil {
		if cluster == "" {
			clusters, _, err := h.k8sClient.HealthyClusters(c.Context())
			if err != nil {
				return c.Status(500).JSON(fiber.Map{"error": err.Error()})
			}

			var wg sync.WaitGroup
			var mu sync.Mutex
			var allJobs []k8s.Job
			clusterTimeout := mcpDefaultTimeout

			for _, cl := range clusters {
				wg.Add(1)
				go func(clusterName string) {
					defer wg.Done()
					ctx, cancel := context.WithTimeout(c.Context(), clusterTimeout)
					defer cancel()

					jobs, err := h.k8sClient.GetJobs(ctx, clusterName, namespace)
					if err == nil && len(jobs) > 0 {
						mu.Lock()
						allJobs = append(allJobs, jobs...)
						mu.Unlock()
					}
				}(cl.Name)
			}

			waitWithDeadline(&wg, maxResponseDeadline)
			return c.JSON(fiber.Map{"jobs": allJobs, "source": "k8s"})
		}

		jobs, err := h.k8sClient.GetJobs(c.Context(), cluster, namespace)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
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

	if h.k8sClient != nil {
		if cluster == "" {
			clusters, _, err := h.k8sClient.HealthyClusters(c.Context())
			if err != nil {
				return c.Status(500).JSON(fiber.Map{"error": err.Error()})
			}

			var wg sync.WaitGroup
			var mu sync.Mutex
			var allHPAs []k8s.HPA
			clusterTimeout := mcpDefaultTimeout

			for _, cl := range clusters {
				wg.Add(1)
				go func(clusterName string) {
					defer wg.Done()
					ctx, cancel := context.WithTimeout(c.Context(), clusterTimeout)
					defer cancel()

					hpas, err := h.k8sClient.GetHPAs(ctx, clusterName, namespace)
					if err == nil && len(hpas) > 0 {
						mu.Lock()
						allHPAs = append(allHPAs, hpas...)
						mu.Unlock()
					}
				}(cl.Name)
			}

			waitWithDeadline(&wg, maxResponseDeadline)
			return c.JSON(fiber.Map{"hpas": allHPAs, "source": "k8s"})
		}

		hpas, err := h.k8sClient.GetHPAs(c.Context(), cluster, namespace)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
		return c.JSON(fiber.Map{"hpas": hpas, "source": "k8s"})
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

	if h.k8sClient != nil {
		if cluster == "" {
			clusters, _, err := h.k8sClient.HealthyClusters(c.Context())
			if err != nil {
				return c.Status(500).JSON(fiber.Map{"error": err.Error()})
			}

			var wg sync.WaitGroup
			var mu sync.Mutex
			var allConfigMaps []k8s.ConfigMap
			clusterTimeout := mcpDefaultTimeout

			for _, cl := range clusters {
				wg.Add(1)
				go func(clusterName string) {
					defer wg.Done()
					ctx, cancel := context.WithTimeout(c.Context(), clusterTimeout)
					defer cancel()

					configmaps, err := h.k8sClient.GetConfigMaps(ctx, clusterName, namespace)
					if err == nil && len(configmaps) > 0 {
						mu.Lock()
						allConfigMaps = append(allConfigMaps, configmaps...)
						mu.Unlock()
					}
				}(cl.Name)
			}

			waitWithDeadline(&wg, maxResponseDeadline)
			return c.JSON(fiber.Map{"configmaps": allConfigMaps, "source": "k8s"})
		}

		configmaps, err := h.k8sClient.GetConfigMaps(c.Context(), cluster, namespace)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
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

	if h.k8sClient != nil {
		if cluster == "" {
			clusters, _, err := h.k8sClient.HealthyClusters(c.Context())
			if err != nil {
				return c.Status(500).JSON(fiber.Map{"error": err.Error()})
			}

			var wg sync.WaitGroup
			var mu sync.Mutex
			var allSecrets []k8s.Secret
			clusterTimeout := mcpDefaultTimeout

			for _, cl := range clusters {
				wg.Add(1)
				go func(clusterName string) {
					defer wg.Done()
					ctx, cancel := context.WithTimeout(c.Context(), clusterTimeout)
					defer cancel()

					secrets, err := h.k8sClient.GetSecrets(ctx, clusterName, namespace)
					if err == nil && len(secrets) > 0 {
						mu.Lock()
						allSecrets = append(allSecrets, secrets...)
						mu.Unlock()
					}
				}(cl.Name)
			}

			waitWithDeadline(&wg, maxResponseDeadline)
			return c.JSON(fiber.Map{"secrets": allSecrets, "source": "k8s"})
		}

		secrets, err := h.k8sClient.GetSecrets(c.Context(), cluster, namespace)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
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

	if h.k8sClient != nil {
		if cluster == "" {
			clusters, _, err := h.k8sClient.HealthyClusters(c.Context())
			if err != nil {
				return c.Status(500).JSON(fiber.Map{"error": err.Error()})
			}

			var wg sync.WaitGroup
			var mu sync.Mutex
			var allServiceAccounts []k8s.ServiceAccount
			clusterTimeout := mcpDefaultTimeout

			for _, cl := range clusters {
				wg.Add(1)
				go func(clusterName string) {
					defer wg.Done()
					ctx, cancel := context.WithTimeout(c.Context(), clusterTimeout)
					defer cancel()

					serviceAccounts, err := h.k8sClient.GetServiceAccounts(ctx, clusterName, namespace)
					if err == nil && len(serviceAccounts) > 0 {
						mu.Lock()
						allServiceAccounts = append(allServiceAccounts, serviceAccounts...)
						mu.Unlock()
					}
				}(cl.Name)
			}

			waitWithDeadline(&wg, maxResponseDeadline)
			return c.JSON(fiber.Map{"serviceAccounts": allServiceAccounts, "source": "k8s"})
		}

		serviceAccounts, err := h.k8sClient.GetServiceAccounts(c.Context(), cluster, namespace)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
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

	if h.k8sClient != nil {
		if cluster == "" {
			clusters, _, err := h.k8sClient.HealthyClusters(c.Context())
			if err != nil {
				return c.Status(500).JSON(fiber.Map{"error": err.Error()})
			}

			var wg sync.WaitGroup
			var mu sync.Mutex
			var allPVCs []k8s.PVC
			clusterTimeout := mcpDefaultTimeout

			for _, cl := range clusters {
				wg.Add(1)
				go func(clusterName string) {
					defer wg.Done()
					ctx, cancel := context.WithTimeout(c.Context(), clusterTimeout)
					defer cancel()

					pvcs, err := h.k8sClient.GetPVCs(ctx, clusterName, namespace)
					if err == nil && len(pvcs) > 0 {
						mu.Lock()
						allPVCs = append(allPVCs, pvcs...)
						mu.Unlock()
					}
				}(cl.Name)
			}

			waitWithDeadline(&wg, maxResponseDeadline)
			return c.JSON(fiber.Map{"pvcs": allPVCs, "source": "k8s"})
		}

		pvcs, err := h.k8sClient.GetPVCs(c.Context(), cluster, namespace)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
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

	if h.k8sClient != nil {
		if cluster == "" {
			clusters, _, err := h.k8sClient.HealthyClusters(c.Context())
			if err != nil {
				return c.Status(500).JSON(fiber.Map{"error": err.Error()})
			}

			var wg sync.WaitGroup
			var mu sync.Mutex
			var allPVs []k8s.PV
			clusterTimeout := mcpDefaultTimeout

			for _, cl := range clusters {
				wg.Add(1)
				go func(clusterName string) {
					defer wg.Done()
					ctx, cancel := context.WithTimeout(c.Context(), clusterTimeout)
					defer cancel()

					pvs, err := h.k8sClient.GetPVs(ctx, clusterName)
					if err == nil && len(pvs) > 0 {
						mu.Lock()
						allPVs = append(allPVs, pvs...)
						mu.Unlock()
					}
				}(cl.Name)
			}

			waitWithDeadline(&wg, maxResponseDeadline)
			return c.JSON(fiber.Map{"pvs": allPVs, "source": "k8s"})
		}

		pvs, err := h.k8sClient.GetPVs(c.Context(), cluster)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
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

	if h.k8sClient != nil {
		if cluster == "" {
			clusters, _, err := h.k8sClient.HealthyClusters(c.Context())
			if err != nil {
				return c.Status(500).JSON(fiber.Map{"error": err.Error()})
			}

			var wg sync.WaitGroup
			var mu sync.Mutex
			var allQuotas []k8s.ResourceQuota
			clusterTimeout := mcpDefaultTimeout

			for _, cl := range clusters {
				wg.Add(1)
				go func(clusterName string) {
					defer wg.Done()
					ctx, cancel := context.WithTimeout(c.Context(), clusterTimeout)
					defer cancel()

					quotas, err := h.k8sClient.GetResourceQuotas(ctx, clusterName, namespace)
					if err == nil && len(quotas) > 0 {
						mu.Lock()
						allQuotas = append(allQuotas, quotas...)
						mu.Unlock()
					}
				}(cl.Name)
			}

			waitWithDeadline(&wg, maxResponseDeadline)
			return c.JSON(fiber.Map{"resourceQuotas": allQuotas, "source": "k8s"})
		}

		quotas, err := h.k8sClient.GetResourceQuotas(c.Context(), cluster, namespace)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
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

	if h.k8sClient != nil {
		if cluster == "" {
			clusters, _, err := h.k8sClient.HealthyClusters(c.Context())
			if err != nil {
				return c.Status(500).JSON(fiber.Map{"error": err.Error()})
			}

			var wg sync.WaitGroup
			var mu sync.Mutex
			var allRanges []k8s.LimitRange
			clusterTimeout := mcpDefaultTimeout

			for _, cl := range clusters {
				wg.Add(1)
				go func(clusterName string) {
					defer wg.Done()
					ctx, cancel := context.WithTimeout(c.Context(), clusterTimeout)
					defer cancel()

					ranges, err := h.k8sClient.GetLimitRanges(ctx, clusterName, namespace)
					if err == nil && len(ranges) > 0 {
						mu.Lock()
						allRanges = append(allRanges, ranges...)
						mu.Unlock()
					}
				}(cl.Name)
			}

			waitWithDeadline(&wg, maxResponseDeadline)
			return c.JSON(fiber.Map{"limitRanges": allRanges, "source": "k8s"})
		}

		ranges, err := h.k8sClient.GetLimitRanges(c.Context(), cluster, namespace)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
		return c.JSON(fiber.Map{"limitRanges": ranges, "source": "k8s"})
	}

	return c.Status(503).JSON(fiber.Map{"error": "No cluster access available"})
}

// CreateOrUpdateResourceQuota creates or updates a ResourceQuota
func (h *MCPHandlers) CreateOrUpdateResourceQuota(c *fiber.Ctx) error {
	var req struct {
		Cluster     string            `json:"cluster"`
		Name        string            `json:"name"`
		Namespace   string            `json:"namespace"`
		Hard        map[string]string `json:"hard"`
		Labels      map[string]string `json:"labels,omitempty"`
		Annotations map[string]string `json:"annotations,omitempty"`
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request body"})
	}

	if req.Cluster == "" || req.Name == "" || req.Namespace == "" {
		return c.Status(400).JSON(fiber.Map{"error": "cluster, name, and namespace are required"})
	}

	if len(req.Hard) == 0 {
		return c.Status(400).JSON(fiber.Map{"error": "At least one resource limit is required in 'hard'"})
	}

	if h.k8sClient != nil {
		spec := k8s.ResourceQuotaSpec{
			Name:        req.Name,
			Namespace:   req.Namespace,
			Hard:        req.Hard,
			Labels:      req.Labels,
			Annotations: req.Annotations,
		}

		quota, err := h.k8sClient.CreateOrUpdateResourceQuota(c.Context(), req.Cluster, spec)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
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

	if h.k8sClient != nil {
		err := h.k8sClient.DeleteResourceQuota(c.Context(), cluster, namespace, name)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
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

	if h.k8sClient != nil {
		logs, err := h.k8sClient.GetPodLogs(c.Context(), cluster, namespace, pod, container, int64(tailLines))
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
		return c.JSON(fiber.Map{"logs": logs, "source": "k8s"})
	}

	return c.Status(503).JSON(fiber.Map{"error": "No cluster access available"})
}

// GetEvents returns events from clusters
func (h *MCPHandlers) GetEvents(c *fiber.Ctx) error {
	// Demo mode: return demo data immediately
	if isDemoMode(c) {
		return demoResponse(c, "events", getDemoEvents())
	}

	cluster := c.Query("cluster")
	namespace := c.Query("namespace")
	limit := c.QueryInt("limit", 50)

	// Try MCP bridge first
	if h.bridge != nil {
		events, err := h.bridge.GetEvents(c.Context(), cluster, namespace, limit)
		if err == nil {
			return c.JSON(fiber.Map{"events": events, "source": "mcp"})
		}
		log.Printf("MCP bridge GetEvents failed, falling back: %v", err)
	}

	// Fall back to direct k8s client
	if h.k8sClient != nil {
		// If no cluster specified, query deduplicated clusters in parallel with timeout
		if cluster == "" {
			// Use deduplicated clusters to avoid querying the same physical cluster
			// via multiple kubeconfig contexts (e.g. "vllm-d" and its long OpenShift name)
			clusters, _, err := h.k8sClient.HealthyClusters(c.Context())
			if err != nil {
				return c.Status(500).JSON(fiber.Map{"error": err.Error()})
			}

			perClusterLimit := limit / len(clusters)
			if perClusterLimit < 10 {
				perClusterLimit = 10
			}

			// Query clusters in parallel with 5 second timeout per cluster
			var wg sync.WaitGroup
			var mu sync.Mutex
			var allEvents []k8s.Event
			clusterTimeout := mcpDefaultTimeout

			for _, cl := range clusters {
				wg.Add(1)
				go func(clusterName string) {
					defer wg.Done()
					ctx, cancel := context.WithTimeout(c.Context(), clusterTimeout)
					defer cancel()

					events, err := h.k8sClient.GetEvents(ctx, clusterName, namespace, perClusterLimit)
					if err == nil && len(events) > 0 {
						mu.Lock()
						allEvents = append(allEvents, events...)
						mu.Unlock()
					}
				}(cl.Name)
			}

			waitWithDeadline(&wg, maxResponseDeadline)

			// Sort by timestamp (most recent first) and limit total
			if len(allEvents) > limit {
				allEvents = allEvents[:limit]
			}
			return c.JSON(fiber.Map{"events": allEvents, "source": "k8s"})
		}

		events, err := h.k8sClient.GetEvents(c.Context(), cluster, namespace, limit)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
		return c.JSON(fiber.Map{"events": events, "source": "k8s", "cluster": cluster})
	}

	return c.Status(503).JSON(fiber.Map{"error": "No cluster access available"})
}

// GetWarningEvents returns warning events from clusters
func (h *MCPHandlers) GetWarningEvents(c *fiber.Ctx) error {
	// Demo mode: return demo data immediately
	if isDemoMode(c) {
		return demoResponse(c, "events", getDemoWarningEvents())
	}

	cluster := c.Query("cluster")
	namespace := c.Query("namespace")
	limit := c.QueryInt("limit", 50)

	// Try MCP bridge first
	if h.bridge != nil {
		events, err := h.bridge.GetWarningEvents(c.Context(), cluster, namespace, limit)
		if err == nil {
			return c.JSON(fiber.Map{"events": events, "source": "mcp"})
		}
		log.Printf("MCP bridge GetWarningEvents failed, falling back: %v", err)
	}

	// Fall back to direct k8s client
	if h.k8sClient != nil {
		// If no cluster specified, query deduplicated clusters in parallel
		if cluster == "" {
			clusters, _, err := h.k8sClient.HealthyClusters(c.Context())
			if err != nil {
				return c.Status(500).JSON(fiber.Map{"error": err.Error()})
			}

			perClusterLimit := limit / len(clusters)
			if perClusterLimit < 10 {
				perClusterLimit = 10
			}

			var wg sync.WaitGroup
			var mu sync.Mutex
			var allEvents []k8s.Event
			clusterTimeout := mcpDefaultTimeout

			for _, cl := range clusters {
				wg.Add(1)
				go func(clusterName string) {
					defer wg.Done()
					ctx, cancel := context.WithTimeout(c.Context(), clusterTimeout)
					defer cancel()

					events, err := h.k8sClient.GetWarningEvents(ctx, clusterName, namespace, perClusterLimit)
					if err == nil && len(events) > 0 {
						mu.Lock()
						allEvents = append(allEvents, events...)
						mu.Unlock()
					}
				}(cl.Name)
			}

			waitWithDeadline(&wg, maxResponseDeadline)

			// Limit total
			if len(allEvents) > limit {
				allEvents = allEvents[:limit]
			}
			return c.JSON(fiber.Map{"events": allEvents, "source": "k8s"})
		}

		events, err := h.k8sClient.GetWarningEvents(c.Context(), cluster, namespace, limit)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
		return c.JSON(fiber.Map{"events": events, "source": "k8s", "cluster": cluster})
	}

	return c.Status(503).JSON(fiber.Map{"error": "No cluster access available"})
}

// CheckSecurityIssues returns security misconfigurations
func (h *MCPHandlers) CheckSecurityIssues(c *fiber.Ctx) error {
	// Demo mode: return demo data immediately
	if isDemoMode(c) {
		return demoResponse(c, "issues", getDemoSecurityIssues())
	}

	cluster := c.Query("cluster")
	namespace := c.Query("namespace")

	// Fall back to direct k8s client
	if h.k8sClient != nil {
		// If no cluster specified, query all clusters in parallel
		if cluster == "" {
			clusters, _, err := h.k8sClient.HealthyClusters(c.Context())
			if err != nil {
				return c.Status(500).JSON(fiber.Map{"error": err.Error()})
			}

			var wg sync.WaitGroup
			var mu sync.Mutex
			var allIssues []k8s.SecurityIssue
			clusterTimeout := mcpDefaultTimeout

			for _, cl := range clusters {
				wg.Add(1)
				go func(clusterName string) {
					defer wg.Done()
					ctx, cancel := context.WithTimeout(c.Context(), clusterTimeout)
					defer cancel()

					issues, err := h.k8sClient.CheckSecurityIssues(ctx, clusterName, namespace)
					if err == nil && len(issues) > 0 {
						mu.Lock()
						allIssues = append(allIssues, issues...)
						mu.Unlock()
					}
				}(cl.Name)
			}

			waitWithDeadline(&wg, maxResponseDeadline)
			return c.JSON(fiber.Map{"issues": allIssues, "source": "k8s"})
		}

		issues, err := h.k8sClient.CheckSecurityIssues(c.Context(), cluster, namespace)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
		return c.JSON(fiber.Map{"issues": issues, "source": "k8s"})
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
	"get_pods":            true,
	"get_deployments":     true,
	"get_services":        true,
	"get_nodes":           true,
	"get_events":          true,
	"get_warning_events":  true,
	"describe_pod":        true,
	"get_pod_logs":        true,

	// Issue detection (read-only analysis)
	"find_pod_issues":        true,
	"find_deployment_issues": true,
	"check_resource_limits":  true,
	"check_security_issues":  true,

	// RBAC queries (read-only)
	"get_roles":                    true,
	"get_cluster_roles":            true,
	"get_role_bindings":            true,
	"get_cluster_role_bindings":    true,
	"can_i":                        true,
	"analyze_subject_permissions":  true,
	"describe_role":                true,

	// Upgrade checking (read-only)
	"get_cluster_version_info":     true,
	"check_olm_operator_upgrades":  true,
	"check_helm_release_upgrades":  true,
	"get_upgrade_prerequisites":    true,
	"get_upgrade_status":           true,

	// Ownership analysis (read-only)
	"find_resource_owners":         true,
	"check_gatekeeper":             true,
	"get_ownership_policy_status":  true,
	"list_ownership_violations":    true,
}

// AllowedDeployTools is the whitelist of kubestellar-deploy tools that can be called via API
// SECURITY: Write operations require explicit allowlisting
var AllowedDeployTools = map[string]bool{
	// Read-only operations
	"get_app_instances":        true,
	"get_app_status":           true,
	"get_app_logs":             true,
	"list_cluster_capabilities": true,
	"find_clusters_for_workload": true,
	"detect_drift":             true,
	"preview_changes":          true,

	// Write operations - disabled by default for security
	// Enable these only after proper authorization checks
	// "deploy_app":     false,
	// "scale_app":      false,
	// "patch_app":      false,
	// "sync_from_git":  false,
	// "reconcile":      false,
}

// validateToolName checks if a tool name is in the allowed list
func validateToolName(name string, allowedTools map[string]bool) error {
	if name == "" {
		return fiber.NewError(fiber.StatusBadRequest, "tool name is required")
	}

	// Check if tool is in allowlist
	allowed, exists := allowedTools[name]
	if !exists || !allowed {
		log.Printf("SECURITY: Blocked attempt to call unauthorized tool: %s", name)
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

	result, err := h.bridge.CallOpsTool(c.Context(), req.Name, req.Arguments)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
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

	result, err := h.bridge.CallDeployTool(c.Context(), req.Name, req.Arguments)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(result)
}
