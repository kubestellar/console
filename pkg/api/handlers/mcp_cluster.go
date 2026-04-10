package handlers

import (
	"context"
	"log/slog"
	"sync"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/k8s"
)

// ListClusters returns all discovered clusters with health data
func (h *MCPHandlers) ListClusters(c *fiber.Ctx) error {
	// Demo mode: return demo data immediately without trying real clusters
	if isDemoMode(c) {
		return demoResponse(c, "clusters", getDemoClusters())
	}

	ctx, cancel := context.WithTimeout(c.Context(), mcpDefaultTimeout)
	defer cancel()

	// Try MCP bridge first if available
	if h.bridge != nil {
		clusters, err := h.bridge.ListClusters(ctx)
		if err == nil && len(clusters) > 0 {
			return c.JSON(fiber.Map{"clusters": clusters, "source": "mcp"})
		}
		slog.Error("[MCP] bridge ListClusters failed, falling back to k8s client", "error", err)
	}

	// Fall back to direct k8s client
	if h.k8sClient != nil {
		clusters, err := h.k8sClient.ListClusters(ctx)
		if err != nil {
			return handleK8sError(c, err)
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
				// Surface the stale-kubeconfig signal: a cluster that has
				// a health cache entry but has never been successfully
				// reached (empty LastSeen) drives the "never connected"
				// warning banner in the Clusters page (#5921).
				if !health.Reachable && health.LastSeen == "" {
					clusters[i].NeverConnected = true
				}
			} else {
				// No health data collected yet (e.g. immediately after boot).
				// Signal "initializing" rather than falsely reporting Unhealthy.
				clusters[i].HealthUnknown = true
			}
		}

		// Kick off a background health refresh so subsequent calls get fresh data
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), mcpHealthTimeout)
			defer cancel()
			h.k8sClient.GetAllClusterHealth(ctx)
		}()

		if clusters == nil {
			clusters = make([]k8s.ClusterInfo, 0)
		}
		return c.JSON(fiber.Map{"clusters": clusters, "source": "k8s"})
	}

	return c.Status(503).JSON(fiber.Map{"error": "No cluster access available"})
}

// GetClusterHealth returns health for a specific cluster
func (h *MCPHandlers) GetClusterHealth(c *fiber.Ctx) error {
	cluster := c.Params("cluster")
	if err := mcpValidateName("cluster", cluster); err != nil {
		return err
	}

	// Demo mode: return demo data immediately
	if isDemoMode(c) {
		return c.JSON(getDemoClusterHealth(cluster))
	}

	ctx, cancel := context.WithTimeout(c.Context(), mcpDefaultTimeout)
	defer cancel()

	// Try MCP bridge first if available
	if h.bridge != nil {
		health, err := h.bridge.GetClusterHealth(ctx, cluster)
		if err == nil {
			return c.JSON(health)
		}
		slog.Error("[MCP] bridge GetClusterHealth failed, falling back", "error", err)
	}

	// Fall back to direct k8s client
	if h.k8sClient != nil {
		health, err := h.k8sClient.GetClusterHealth(ctx, cluster)
		if err != nil {
			return handleK8sError(c, err)
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
		ctx, cancel := context.WithTimeout(c.Context(), mcpHealthTimeout)
		defer cancel()

		health, err := h.k8sClient.GetAllClusterHealth(ctx)
		if err != nil {
			return handleK8sError(c, err)
		}
		return c.JSON(fiber.Map{"health": health})
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
			allNodes := make([]k8s.NodeInfo, 0)
			clusterTimeout := mcpDefaultTimeout
			var errTracker clusterErrorTracker

			clusterCtx, clusterCancel := context.WithCancel(c.Context())
			defer clusterCancel()

			for _, cl := range clusters {
				wg.Add(1)
				go func(clusterName string) {
					defer wg.Done()
					ctx, cancel := context.WithTimeout(clusterCtx, clusterTimeout)
					defer cancel()

					nodes, err := h.k8sClient.GetNodes(ctx, clusterName)
					if err != nil {
						errTracker.add(clusterName, err)
					} else if len(nodes) > 0 {
						mu.Lock()
						allNodes = append(allNodes, nodes...)
						mu.Unlock()
					}
				}(cl.Name)
			}

			waitWithDeadline(&wg, clusterCancel, maxResponseDeadline)
			return c.JSON(errTracker.annotate(fiber.Map{"nodes": allNodes, "source": "k8s"}))
		}

		ctx, cancel := context.WithTimeout(c.Context(), mcpDefaultTimeout)
		defer cancel()

		nodes, err := h.k8sClient.GetNodes(ctx, cluster)
		if err != nil {
			return handleK8sError(c, err)
		}
		if nodes == nil {
			nodes = make([]k8s.NodeInfo, 0)
		}
		return c.JSON(fiber.Map{"nodes": nodes, "source": "k8s"})
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

	if err := mcpValidateClusterAndNamespace(cluster, namespace); err != nil {
		return err
	}
	if err := mcpValidatePositiveInt("limit", limit, mcpMaxEventLimit); err != nil {
		return err
	}

	// Try MCP bridge first
	if h.bridge != nil {
		ctx, cancel := context.WithTimeout(c.Context(), mcpDefaultTimeout)
		defer cancel()

		events, err := h.bridge.GetEvents(ctx, cluster, namespace, limit)
		if err == nil {
			return c.JSON(fiber.Map{"events": events, "source": "mcp"})
		}
		slog.Error("[MCP] bridge GetEvents failed, falling back", "error", err)
	}

	// Fall back to direct k8s client
	if h.k8sClient != nil {
		// If no cluster specified, query deduplicated clusters in parallel with timeout
		if cluster == "" {
			// Use deduplicated clusters to avoid querying the same physical cluster
			// via multiple kubeconfig contexts (e.g. "vllm-d" and its long OpenShift name)
			clusters, _, err := h.k8sClient.HealthyClusters(c.Context())
			if err != nil {
				return handleK8sError(c, err)
			}

			if len(clusters) == 0 {
				return c.JSON(fiber.Map{"events": []k8s.Event{}, "source": "k8s"})
			}

			perClusterLimit := limit / len(clusters)
			if perClusterLimit < 10 {
				perClusterLimit = 10
			}

			// Query clusters in parallel with 5 second timeout per cluster
			var wg sync.WaitGroup
			var mu sync.Mutex
			allEvents := make([]k8s.Event, 0)
			clusterTimeout := mcpDefaultTimeout
			var errTracker clusterErrorTracker

			clusterCtx, clusterCancel := context.WithCancel(c.Context())
			defer clusterCancel()

			for _, cl := range clusters {
				wg.Add(1)
				go func(clusterName string) {
					defer wg.Done()
					ctx, cancel := context.WithTimeout(clusterCtx, clusterTimeout)
					defer cancel()

					events, err := h.k8sClient.GetEvents(ctx, clusterName, namespace, perClusterLimit)
					if err != nil {
						errTracker.add(clusterName, err)
					} else if len(events) > 0 {
						mu.Lock()
						allEvents = append(allEvents, events...)
						mu.Unlock()
					}
				}(cl.Name)
			}

			waitWithDeadline(&wg, clusterCancel, maxResponseDeadline)

			// Sort by LastSeen parsed as time (most recent first).
			// Lexicographic string compare is unreliable across timezones
			// and empty values (see issue #6043).
			k8s.SortEventsByLastSeenDesc(allEvents)
			if len(allEvents) > limit {
				allEvents = allEvents[:limit]
			}
			return c.JSON(errTracker.annotate(fiber.Map{"events": allEvents, "source": "k8s"}))
		}

		ctx, cancel := context.WithTimeout(c.Context(), mcpDefaultTimeout)
		defer cancel()

		events, err := h.k8sClient.GetEvents(ctx, cluster, namespace, limit)
		if err != nil {
			return handleK8sError(c, err)
		}
		if events == nil {
			events = make([]k8s.Event, 0)
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

	if err := mcpValidateClusterAndNamespace(cluster, namespace); err != nil {
		return err
	}
	if err := mcpValidatePositiveInt("limit", limit, mcpMaxEventLimit); err != nil {
		return err
	}

	// Try MCP bridge first
	if h.bridge != nil {
		ctx, cancel := context.WithTimeout(c.Context(), mcpDefaultTimeout)
		defer cancel()

		events, err := h.bridge.GetWarningEvents(ctx, cluster, namespace, limit)
		if err == nil {
			return c.JSON(fiber.Map{"events": events, "source": "mcp"})
		}
		slog.Error("[MCP] bridge GetWarningEvents failed, falling back", "error", err)
	}

	// Fall back to direct k8s client
	if h.k8sClient != nil {
		// If no cluster specified, query deduplicated clusters in parallel
		if cluster == "" {
			clusters, _, err := h.k8sClient.HealthyClusters(c.Context())
			if err != nil {
				return handleK8sError(c, err)
			}

			if len(clusters) == 0 {
				return c.JSON(fiber.Map{"events": []k8s.Event{}, "source": "k8s"})
			}

			perClusterLimit := limit / len(clusters)
			if perClusterLimit < 10 {
				perClusterLimit = 10
			}

			var wg sync.WaitGroup
			var mu sync.Mutex
			allEvents := make([]k8s.Event, 0)
			clusterTimeout := mcpDefaultTimeout
			var errTracker clusterErrorTracker

			clusterCtx, clusterCancel := context.WithCancel(c.Context())
			defer clusterCancel()

			for _, cl := range clusters {
				wg.Add(1)
				go func(clusterName string) {
					defer wg.Done()
					ctx, cancel := context.WithTimeout(clusterCtx, clusterTimeout)
					defer cancel()

					events, err := h.k8sClient.GetWarningEvents(ctx, clusterName, namespace, perClusterLimit)
					if err != nil {
						errTracker.add(clusterName, err)
					} else if len(events) > 0 {
						mu.Lock()
						allEvents = append(allEvents, events...)
						mu.Unlock()
					}
				}(cl.Name)
			}

			waitWithDeadline(&wg, clusterCancel, maxResponseDeadline)

			// Sort by LastSeen parsed as time (most recent first).
			// Lexicographic string compare is unreliable across timezones
			// and empty values (see issue #6043).
			k8s.SortEventsByLastSeenDesc(allEvents)
			if len(allEvents) > limit {
				allEvents = allEvents[:limit]
			}
			return c.JSON(errTracker.annotate(fiber.Map{"events": allEvents, "source": "k8s"}))
		}

		ctx, cancel := context.WithTimeout(c.Context(), mcpDefaultTimeout)
		defer cancel()

		events, err := h.k8sClient.GetWarningEvents(ctx, cluster, namespace, limit)
		if err != nil {
			return handleK8sError(c, err)
		}
		if events == nil {
			events = make([]k8s.Event, 0)
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
			allIssues := make([]k8s.SecurityIssue, 0)
			clusterTimeout := mcpDefaultTimeout
			var errTracker clusterErrorTracker

			clusterCtx, clusterCancel := context.WithCancel(c.Context())
			defer clusterCancel()

			for _, cl := range clusters {
				wg.Add(1)
				go func(clusterName string) {
					defer wg.Done()
					ctx, cancel := context.WithTimeout(clusterCtx, clusterTimeout)
					defer cancel()

					issues, err := h.k8sClient.CheckSecurityIssues(ctx, clusterName, namespace)
					if err != nil {
						errTracker.add(clusterName, err)
					} else if len(issues) > 0 {
						mu.Lock()
						allIssues = append(allIssues, issues...)
						mu.Unlock()
					}
				}(cl.Name)
			}

			waitWithDeadline(&wg, clusterCancel, maxResponseDeadline)
			return c.JSON(errTracker.annotate(fiber.Map{"issues": allIssues, "source": "k8s"}))
		}

		ctx, cancel := context.WithTimeout(c.Context(), mcpDefaultTimeout)
		defer cancel()

		issues, err := h.k8sClient.CheckSecurityIssues(ctx, cluster, namespace)
		if err != nil {
			return handleK8sError(c, err)
		}
		if issues == nil {
			issues = make([]k8s.SecurityIssue, 0)
		}
		return c.JSON(fiber.Map{"issues": issues, "source": "k8s"})
	}

	return c.Status(503).JSON(fiber.Map{"error": "No cluster access available"})
}
