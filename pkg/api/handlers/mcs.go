package handlers

import (
	"context"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/k8s"
)

// mcsDefaultTimeout is the per-cluster timeout for MCS API queries.
const mcsDefaultTimeout = 15 * time.Second

// MCSHandlers handles Multi-Cluster Service API endpoints
type MCSHandlers struct {
	k8sClient *k8s.MultiClusterClient
	hub       *Hub
}

// NewMCSHandlers creates a new MCS handlers instance
func NewMCSHandlers(k8sClient *k8s.MultiClusterClient, hub *Hub) *MCSHandlers {
	return &MCSHandlers{
		k8sClient: k8sClient,
		hub:       hub,
	}
}

// ListServiceExports returns all ServiceExport resources across clusters
// GET /api/mcs/exports
func (h *MCSHandlers) ListServiceExports(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return c.Status(503).JSON(fiber.Map{"error": "Kubernetes client not available"})
	}

	// Optional filters
	cluster := c.Query("cluster")
	namespace := c.Query("namespace")

	ctx, cancel := context.WithTimeout(c.Context(), mcsDefaultTimeout)
	defer cancel()

	if cluster != "" {
		// Get exports for specific cluster
		exports, err := h.k8sClient.ListServiceExportsForCluster(ctx, cluster, namespace)
		if err != nil {
			return handleK8sError(c, err)
		}
		return c.JSON(fiber.Map{
			"items":      exports,
			"totalCount": len(exports),
			"cluster":    cluster,
		})
	}

	// Get exports across all clusters
	list, err := h.k8sClient.ListServiceExports(ctx)
	if err != nil {
		return handleK8sError(c, err)
	}

	return c.JSON(list)
}

// ListServiceImports returns all ServiceImport resources across clusters
// GET /api/mcs/imports
func (h *MCSHandlers) ListServiceImports(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return c.Status(503).JSON(fiber.Map{"error": "Kubernetes client not available"})
	}

	// Optional filters
	cluster := c.Query("cluster")
	namespace := c.Query("namespace")

	ctx, cancel := context.WithTimeout(c.Context(), mcsDefaultTimeout)
	defer cancel()

	if cluster != "" {
		// Get imports for specific cluster
		imports, err := h.k8sClient.ListServiceImportsForCluster(ctx, cluster, namespace)
		if err != nil {
			return handleK8sError(c, err)
		}
		return c.JSON(fiber.Map{
			"items":      imports,
			"totalCount": len(imports),
			"cluster":    cluster,
		})
	}

	// Get imports across all clusters
	list, err := h.k8sClient.ListServiceImports(ctx)
	if err != nil {
		return handleK8sError(c, err)
	}

	return c.JSON(list)
}

// GetMCSStatus returns the MCS availability status for all clusters
// GET /api/mcs/status
func (h *MCSHandlers) GetMCSStatus(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return c.Status(503).JSON(fiber.Map{"error": "Kubernetes client not available"})
	}

	ctx, cancel := context.WithTimeout(c.Context(), mcsDefaultTimeout)
	defer cancel()

	clusters, _, err := h.k8sClient.HealthyClusters(ctx)
	if err != nil {
		return handleK8sError(c, err)
	}

	type clusterMCSStatus struct {
		Cluster      string `json:"cluster"`
		MCSAvailable bool   `json:"mcsAvailable"`
	}

	status := make([]clusterMCSStatus, 0, len(clusters))
	for _, cluster := range clusters {
		available := h.k8sClient.IsMCSAvailable(ctx, cluster.Name)
		status = append(status, clusterMCSStatus{
			Cluster:      cluster.Name,
			MCSAvailable: available,
		})
	}

	return c.JSON(fiber.Map{
		"clusters": status,
	})
}

// GetServiceExport returns a specific ServiceExport
// GET /api/mcs/exports/:cluster/:namespace/:name
func (h *MCSHandlers) GetServiceExport(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return c.Status(503).JSON(fiber.Map{"error": "Kubernetes client not available"})
	}

	cluster := c.Params("cluster")
	namespace := c.Params("namespace")
	name := c.Params("name")

	ctx, cancel := context.WithTimeout(c.Context(), mcsDefaultTimeout)
	defer cancel()

	exports, err := h.k8sClient.ListServiceExportsForCluster(ctx, cluster, namespace)
	if err != nil {
		return handleK8sError(c, err)
	}

	for _, export := range exports {
		if export.Name == name {
			return c.JSON(export)
		}
	}

	return c.Status(404).JSON(fiber.Map{"error": "ServiceExport not found"})
}

// GetServiceImport returns a specific ServiceImport
// GET /api/mcs/imports/:cluster/:namespace/:name
func (h *MCSHandlers) GetServiceImport(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return c.Status(503).JSON(fiber.Map{"error": "Kubernetes client not available"})
	}

	cluster := c.Params("cluster")
	namespace := c.Params("namespace")
	name := c.Params("name")

	ctx, cancel := context.WithTimeout(c.Context(), mcsDefaultTimeout)
	defer cancel()

	imports, err := h.k8sClient.ListServiceImportsForCluster(ctx, cluster, namespace)
	if err != nil {
		return handleK8sError(c, err)
	}

	for _, imp := range imports {
		if imp.Name == name {
			return c.JSON(imp)
		}
	}

	return c.Status(404).JSON(fiber.Map{"error": "ServiceImport not found"})
}

// CreateServiceExport and DeleteServiceExport were removed in #7993 Phase 1.5
// PR B. These handlers ran via the backend pod ServiceAccount, violating the
// architectural rule that user-initiated k8s mutations must run under the
// caller's own kubeconfig. They had no frontend consumer (grep confirmed),
// so removing them is a clean delete. The equivalent kc-agent route is
// POST/DELETE /serviceexports (see pkg/agent/server_http.go
// handleServiceExportsHTTP) for any future MCS export management UI.
