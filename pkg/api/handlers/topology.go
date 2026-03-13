package handlers

import (
	"fmt"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/api/v1alpha1"
	"github.com/kubestellar/console/pkg/k8s"
)

// TopologyHandlers handles service topology API endpoints
type TopologyHandlers struct {
	k8sClient *k8s.MultiClusterClient
	hub       *Hub
}

// NewTopologyHandlers creates a new topology handlers instance
func NewTopologyHandlers(k8sClient *k8s.MultiClusterClient, hub *Hub) *TopologyHandlers {
	return &TopologyHandlers{
		k8sClient: k8sClient,
		hub:       hub,
	}
}

// TopologyNode represents a node in the service topology graph
type TopologyNode struct {
	ID        string                 `json:"id"`
	Type      string                 `json:"type"`
	Label     string                 `json:"label"`
	Cluster   string                 `json:"cluster"`
	Namespace string                 `json:"namespace,omitempty"`
	Metadata  map[string]interface{} `json:"metadata,omitempty"`
	Health    string                 `json:"health"`
}

// TopologyEdge represents an edge in the service topology graph
type TopologyEdge struct {
	ID       string                 `json:"id"`
	Source   string                 `json:"source"`
	Target   string                 `json:"target"`
	Type     string                 `json:"type"`
	Label    string                 `json:"label,omitempty"`
	Metadata map[string]interface{} `json:"metadata,omitempty"`
	Health   string                 `json:"health"`
	Animated bool                   `json:"animated"`
}

// TopologyGraph represents the complete service topology
type TopologyGraph struct {
	Nodes       []TopologyNode `json:"nodes"`
	Edges       []TopologyEdge `json:"edges"`
	Clusters    []string       `json:"clusters"`
	LastUpdated int64          `json:"lastUpdated"`
}

// TopologyClusterSummary provides cluster-level summary
type TopologyClusterSummary struct {
	Name         string `json:"name"`
	NodeCount    int    `json:"nodeCount"`
	ServiceCount int    `json:"serviceCount"`
	GatewayCount int    `json:"gatewayCount"`
	ExportCount  int    `json:"exportCount"`
	ImportCount  int    `json:"importCount"`
	Health       string `json:"health"`
}

// GetTopology returns the service topology graph
// GET /api/topology
func (h *TopologyHandlers) GetTopology(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return c.Status(503).JSON(fiber.Map{"error": "Kubernetes client not available"})
	}

	ctx := c.Context()

	// Collect data from all sources
	exports, _ := h.k8sClient.ListServiceExports(ctx)
	imports, _ := h.k8sClient.ListServiceImports(ctx)
	gateways, _ := h.k8sClient.ListGateways(ctx)
	httpRoutes, _ := h.k8sClient.ListHTTPRoutes(ctx)

	// Build the topology graph
	graph := h.buildTopologyGraph(exports, imports, gateways, httpRoutes)

	// Build cluster summaries
	clusterSummaries := h.buildClusterSummaries(exports, imports, gateways)

	// Calculate stats
	healthyEdges := 0
	degradedEdges := 0
	for _, edge := range graph.Edges {
		if edge.Health == "healthy" {
			healthyEdges++
		} else if edge.Health == "degraded" || edge.Health == "unhealthy" {
			degradedEdges++
		}
	}

	return c.JSON(fiber.Map{
		"graph":    graph,
		"clusters": clusterSummaries,
		"stats": fiber.Map{
			"totalNodes":          len(graph.Nodes),
			"totalEdges":          len(graph.Edges),
			"healthyConnections":  healthyEdges,
			"degradedConnections": degradedEdges,
		},
	})
}

// buildTopologyGraph builds the topology graph from collected resources
func (h *TopologyHandlers) buildTopologyGraph(
	exports *v1alpha1.ServiceExportList,
	imports *v1alpha1.ServiceImportList,
	gateways *v1alpha1.GatewayList,
	httpRoutes *v1alpha1.HTTPRouteList,
) TopologyGraph {
	nodes := make([]TopologyNode, 0)
	edges := make([]TopologyEdge, 0)
	clusterSet := make(map[string]bool)
	nodeIndex := make(map[string]bool)

	// Add cluster nodes
	if exports != nil {
		for _, exp := range exports.Items {
			clusterSet[exp.Cluster] = true
		}
	}
	if imports != nil {
		for _, imp := range imports.Items {
			clusterSet[imp.Cluster] = true
			if imp.SourceCluster != "" {
				clusterSet[imp.SourceCluster] = true
			}
		}
	}
	if gateways != nil {
		for _, gw := range gateways.Items {
			clusterSet[gw.Cluster] = true
		}
	}

	// Create cluster nodes
	for cluster := range clusterSet {
		nodeID := fmt.Sprintf("cluster:%s", cluster)
		if !nodeIndex[nodeID] {
			nodes = append(nodes, TopologyNode{
				ID:      nodeID,
				Type:    "cluster",
				Label:   cluster,
				Cluster: cluster,
				Health:  "healthy",
			})
			nodeIndex[nodeID] = true
		}
	}

	// Add service export nodes and edges
	if exports != nil {
		for _, exp := range exports.Items {
			serviceID := fmt.Sprintf("service:%s:%s:%s", exp.Cluster, exp.Namespace, exp.Name)
			if !nodeIndex[serviceID] {
				health := "healthy"
				if exp.Status == v1alpha1.ServiceExportStatusFailed {
					health = "unhealthy"
				} else if exp.Status == v1alpha1.ServiceExportStatusPending {
					health = "degraded"
				}

				nodes = append(nodes, TopologyNode{
					ID:        serviceID,
					Type:      "service",
					Label:     exp.Name,
					Cluster:   exp.Cluster,
					Namespace: exp.Namespace,
					Metadata: map[string]interface{}{
						"status":    string(exp.Status),
						"exported":  true,
						"serviceNa": exp.ServiceName,
					},
					Health: health,
				})
				nodeIndex[serviceID] = true
			}

			// Add edge from service to cluster
			clusterID := fmt.Sprintf("cluster:%s", exp.Cluster)
			edgeID := fmt.Sprintf("edge:%s->%s", serviceID, clusterID)
			edges = append(edges, TopologyEdge{
				ID:       edgeID,
				Source:   serviceID,
				Target:   clusterID,
				Type:     "internal",
				Health:   "healthy",
				Animated: false,
			})
		}
	}

	// Add service import nodes and cross-cluster edges
	if imports != nil {
		for _, imp := range imports.Items {
			serviceID := fmt.Sprintf("service:%s:%s:%s", imp.Cluster, imp.Namespace, imp.Name)
			if !nodeIndex[serviceID] {
				health := "healthy"
				if imp.Endpoints == 0 {
					health = "degraded"
				}

				nodes = append(nodes, TopologyNode{
					ID:        serviceID,
					Type:      "service",
					Label:     imp.Name,
					Cluster:   imp.Cluster,
					Namespace: imp.Namespace,
					Metadata: map[string]interface{}{
						"imported":      true,
						"sourceCluster": imp.SourceCluster,
						"dnsName":       imp.DNSName,
						"endpoints":     imp.Endpoints,
						"type":          string(imp.Type),
					},
					Health: health,
				})
				nodeIndex[serviceID] = true
			}

			// Add cross-cluster edge from source to destination
			if imp.SourceCluster != "" {
				sourceServiceID := fmt.Sprintf("service:%s:%s:%s", imp.SourceCluster, imp.Namespace, imp.Name)
				if nodeIndex[sourceServiceID] {
					edgeID := fmt.Sprintf("mcs:%s->%s", sourceServiceID, serviceID)
					health := "healthy"
					if imp.Endpoints == 0 {
						health = "degraded"
					}
					edges = append(edges, TopologyEdge{
						ID:     edgeID,
						Source: sourceServiceID,
						Target: serviceID,
						Type:   "mcs-export",
						Label:  "MCS",
						Metadata: map[string]interface{}{
							"endpoints": imp.Endpoints,
							"dnsName":   imp.DNSName,
						},
						Health:   health,
						Animated: imp.Endpoints > 0,
					})
				}
			}
		}
	}

	// Add gateway nodes
	if gateways != nil {
		for _, gw := range gateways.Items {
			gwID := fmt.Sprintf("gateway:%s:%s:%s", gw.Cluster, gw.Namespace, gw.Name)
			if !nodeIndex[gwID] {
				health := "healthy"
				if gw.Status == v1alpha1.GatewayStatusNotAccepted {
					health = "unhealthy"
				} else if gw.Status == v1alpha1.GatewayStatusPending {
					health = "degraded"
				}

				nodes = append(nodes, TopologyNode{
					ID:        gwID,
					Type:      "gateway",
					Label:     gw.Name,
					Cluster:   gw.Cluster,
					Namespace: gw.Namespace,
					Metadata: map[string]interface{}{
						"gatewayClass":  gw.GatewayClass,
						"status":        string(gw.Status),
						"addresses":     gw.Addresses,
						"attachedRoutes": gw.AttachedRoutes,
					},
					Health: health,
				})
				nodeIndex[gwID] = true
			}
		}
	}

	// Add HTTPRoute edges
	if httpRoutes != nil {
		for _, route := range httpRoutes.Items {
			for _, parentRef := range route.ParentRefs {
				if parentRef.Kind == "Gateway" || parentRef.Kind == "" {
					ns := parentRef.Namespace
					if ns == "" {
						ns = route.Namespace
					}
					gwID := fmt.Sprintf("gateway:%s:%s:%s", route.Cluster, ns, parentRef.Name)
					routeID := fmt.Sprintf("route:%s:%s:%s", route.Cluster, route.Namespace, route.Name)

					if nodeIndex[gwID] {
						edgeID := fmt.Sprintf("http:%s->%s", gwID, routeID)
						health := "healthy"
						if route.Status == v1alpha1.HTTPRouteStatusNotAccepted {
							health = "unhealthy"
						}

						edges = append(edges, TopologyEdge{
							ID:     edgeID,
							Source: gwID,
							Target: routeID,
							Type:   "http-route",
							Label:  route.Name,
							Metadata: map[string]interface{}{
								"hostnames": route.Hostnames,
							},
							Health:   health,
							Animated: true,
						})
					}
				}
			}
		}
	}

	clusters := make([]string, 0, len(clusterSet))
	for cluster := range clusterSet {
		clusters = append(clusters, cluster)
	}

	return TopologyGraph{
		Nodes:       nodes,
		Edges:       edges,
		Clusters:    clusters,
		LastUpdated: 0, // Will be set by caller
	}
}

// buildClusterSummaries builds per-cluster summaries
func (h *TopologyHandlers) buildClusterSummaries(
	exports *v1alpha1.ServiceExportList,
	imports *v1alpha1.ServiceImportList,
	gateways *v1alpha1.GatewayList,
) []TopologyClusterSummary {
	clusterData := make(map[string]*TopologyClusterSummary)

	// Count exports per cluster
	if exports != nil {
		for _, exp := range exports.Items {
			if _, ok := clusterData[exp.Cluster]; !ok {
				clusterData[exp.Cluster] = &TopologyClusterSummary{
					Name:   exp.Cluster,
					Health: "healthy",
				}
			}
			clusterData[exp.Cluster].ExportCount++
			clusterData[exp.Cluster].ServiceCount++
		}
	}

	// Count imports per cluster
	if imports != nil {
		for _, imp := range imports.Items {
			if _, ok := clusterData[imp.Cluster]; !ok {
				clusterData[imp.Cluster] = &TopologyClusterSummary{
					Name:   imp.Cluster,
					Health: "healthy",
				}
			}
			clusterData[imp.Cluster].ImportCount++
		}
	}

	// Count gateways per cluster
	if gateways != nil {
		for _, gw := range gateways.Items {
			if _, ok := clusterData[gw.Cluster]; !ok {
				clusterData[gw.Cluster] = &TopologyClusterSummary{
					Name:   gw.Cluster,
					Health: "healthy",
				}
			}
			clusterData[gw.Cluster].GatewayCount++
		}
	}

	// Build slice
	summaries := make([]TopologyClusterSummary, 0, len(clusterData))
	for _, summary := range clusterData {
		summary.NodeCount = summary.ServiceCount + summary.GatewayCount
		summaries = append(summaries, *summary)
	}

	return summaries
}
