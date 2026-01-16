package handlers

import (
	"log"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/mcp"
)

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

// GetOpsTools returns available klaude-ops tools
func (h *MCPHandlers) GetOpsTools(c *fiber.Ctx) error {
	if h.bridge == nil {
		return c.Status(503).JSON(fiber.Map{"error": "MCP bridge not available"})
	}

	tools := h.bridge.GetOpsTools()
	return c.JSON(fiber.Map{"tools": tools})
}

// GetDeployTools returns available klaude-deploy tools
func (h *MCPHandlers) GetDeployTools(c *fiber.Ctx) error {
	if h.bridge == nil {
		return c.Status(503).JSON(fiber.Map{"error": "MCP bridge not available"})
	}

	tools := h.bridge.GetDeployTools()
	return c.JSON(fiber.Map{"tools": tools})
}

// ListClusters returns all discovered clusters with health data
func (h *MCPHandlers) ListClusters(c *fiber.Ctx) error {
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

		// Enrich with health data (parallel fetch)
		healthData, _ := h.k8sClient.GetAllClusterHealth(c.Context())
		healthMap := make(map[string]*k8s.ClusterHealth)
		for i := range healthData {
			healthMap[healthData[i].Cluster] = &healthData[i]
		}

		// Merge health data into clusters
		for i := range clusters {
			if health, ok := healthMap[clusters[i].Name]; ok {
				clusters[i].Healthy = health.Healthy
				clusters[i].NodeCount = health.NodeCount
				clusters[i].PodCount = health.PodCount
			}
		}

		return c.JSON(fiber.Map{"clusters": clusters, "source": "k8s"})
	}

	return c.Status(503).JSON(fiber.Map{"error": "No cluster access available"})
}

// GetClusterHealth returns health for a specific cluster
func (h *MCPHandlers) GetClusterHealth(c *fiber.Ctx) error {
	cluster := c.Params("cluster")

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
	if h.k8sClient != nil && cluster != "" {
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
		// If no cluster specified, query all clusters
		if cluster == "" {
			clusters, err := h.k8sClient.ListClusters(c.Context())
			if err != nil {
				return c.Status(500).JSON(fiber.Map{"error": err.Error()})
			}
			var allIssues []k8s.PodIssue
			for _, cl := range clusters {
				issues, err := h.k8sClient.FindPodIssues(c.Context(), cl.Name, namespace)
				if err == nil {
					allIssues = append(allIssues, issues...)
				}
			}
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
	cluster := c.Query("cluster")

	if h.k8sClient != nil {
		// If no cluster specified, query all clusters
		if cluster == "" {
			clusters, err := h.k8sClient.ListClusters(c.Context())
			if err != nil {
				return c.Status(500).JSON(fiber.Map{"error": err.Error()})
			}
			var allNodes []k8s.GPUNode
			for _, cl := range clusters {
				nodes, err := h.k8sClient.GetGPUNodes(c.Context(), cl.Name)
				if err == nil {
					allNodes = append(allNodes, nodes...)
				}
			}
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

// FindDeploymentIssues returns deployments with issues
func (h *MCPHandlers) FindDeploymentIssues(c *fiber.Ctx) error {
	cluster := c.Query("cluster")
	namespace := c.Query("namespace")

	// Fall back to direct k8s client
	if h.k8sClient != nil {
		// If no cluster specified, query all clusters
		if cluster == "" {
			clusters, err := h.k8sClient.ListClusters(c.Context())
			if err != nil {
				return c.Status(500).JSON(fiber.Map{"error": err.Error()})
			}
			var allIssues []k8s.DeploymentIssue
			for _, cl := range clusters {
				issues, err := h.k8sClient.FindDeploymentIssues(c.Context(), cl.Name, namespace)
				if err == nil {
					allIssues = append(allIssues, issues...)
				}
			}
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
	cluster := c.Query("cluster")
	namespace := c.Query("namespace")

	if h.k8sClient != nil {
		// If no cluster specified, query all clusters
		if cluster == "" {
			clusters, err := h.k8sClient.ListClusters(c.Context())
			if err != nil {
				return c.Status(500).JSON(fiber.Map{"error": err.Error()})
			}
			var allDeployments []k8s.Deployment
			for _, cl := range clusters {
				deployments, err := h.k8sClient.GetDeployments(c.Context(), cl.Name, namespace)
				if err == nil {
					allDeployments = append(allDeployments, deployments...)
				}
			}
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

// GetEvents returns events from a cluster
func (h *MCPHandlers) GetEvents(c *fiber.Ctx) error {
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
		// If no cluster specified, query first available cluster
		if cluster == "" {
			clusters, err := h.k8sClient.ListClusters(c.Context())
			if err != nil || len(clusters) == 0 {
				return c.JSON(fiber.Map{"events": []k8s.Event{}, "source": "k8s"})
			}
			// Get events from current context cluster
			for _, cl := range clusters {
				if cl.IsCurrent {
					cluster = cl.Name
					break
				}
			}
			if cluster == "" {
				cluster = clusters[0].Name
			}
		}

		events, err := h.k8sClient.GetEvents(c.Context(), cluster, namespace, limit)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
		return c.JSON(fiber.Map{"events": events, "source": "k8s", "cluster": cluster})
	}

	return c.Status(503).JSON(fiber.Map{"error": "No cluster access available"})
}

// GetWarningEvents returns warning events from a cluster
func (h *MCPHandlers) GetWarningEvents(c *fiber.Ctx) error {
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
		// If no cluster specified, query first available cluster
		if cluster == "" {
			clusters, err := h.k8sClient.ListClusters(c.Context())
			if err != nil || len(clusters) == 0 {
				return c.JSON(fiber.Map{"events": []k8s.Event{}, "source": "k8s"})
			}
			for _, cl := range clusters {
				if cl.IsCurrent {
					cluster = cl.Name
					break
				}
			}
			if cluster == "" {
				cluster = clusters[0].Name
			}
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
	cluster := c.Query("cluster")
	namespace := c.Query("namespace")

	if h.k8sClient != nil {
		// If no cluster specified, query all clusters
		if cluster == "" {
			clusters, err := h.k8sClient.ListClusters(c.Context())
			if err != nil {
				return c.Status(500).JSON(fiber.Map{"error": err.Error()})
			}
			var allIssues []k8s.SecurityIssue
			for _, cl := range clusters {
				issues, err := h.k8sClient.CheckSecurityIssues(c.Context(), cl.Name, namespace)
				if err == nil {
					allIssues = append(allIssues, issues...)
				}
			}
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

// CallOpsTool calls a klaude-ops tool
func (h *MCPHandlers) CallOpsTool(c *fiber.Ctx) error {
	if h.bridge == nil {
		return c.Status(503).JSON(fiber.Map{"error": "MCP bridge not available"})
	}

	var req CallToolRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid request body"})
	}

	result, err := h.bridge.CallOpsTool(c.Context(), req.Name, req.Arguments)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(result)
}

// CallDeployTool calls a klaude-deploy tool
func (h *MCPHandlers) CallDeployTool(c *fiber.Ctx) error {
	if h.bridge == nil {
		return c.Status(503).JSON(fiber.Map{"error": "MCP bridge not available"})
	}

	var req CallToolRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid request body"})
	}

	result, err := h.bridge.CallDeployTool(c.Context(), req.Name, req.Arguments)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(result)
}
