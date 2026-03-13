package handlers

import (
	"context"
	"log"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/k8s"
)

// mcsDefaultTimeout is the per-cluster timeout for MCS API queries.
const mcsDefaultTimeout = 15 * time.Second

// mcsWriteTimeout is the timeout for MCS write operations (create/delete).
const mcsWriteTimeout = 15 * time.Second

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
			log.Printf("internal error: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "internal server error"})
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
		log.Printf("internal error: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "internal server error"})
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
			log.Printf("internal error: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "internal server error"})
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
		log.Printf("internal error: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "internal server error"})
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
		log.Printf("internal error: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "internal server error"})
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
		log.Printf("internal error: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "internal server error"})
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
		log.Printf("internal error: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "internal server error"})
	}

	for _, imp := range imports {
		if imp.Name == name {
			return c.JSON(imp)
		}
	}

	return c.Status(404).JSON(fiber.Map{"error": "ServiceImport not found"})
}

// CreateServiceExportRequest represents the request body for creating a ServiceExport
type CreateServiceExportRequest struct {
	Cluster     string `json:"cluster"`
	Namespace   string `json:"namespace"`
	ServiceName string `json:"serviceName"`
}

// CreateServiceExport creates a new ServiceExport to export an existing service
// POST /api/mcs/exports
func (h *MCSHandlers) CreateServiceExport(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return c.Status(503).JSON(fiber.Map{"error": "Kubernetes client not available"})
	}

	var req CreateServiceExportRequest
	if err := c.BodyParser(&req); err != nil {
		log.Printf("invalid request body: %v", err)
		return c.Status(400).JSON(fiber.Map{"error": "invalid request"})
	}

	// Validate required fields
	if req.Cluster == "" {
		return c.Status(400).JSON(fiber.Map{"error": "cluster is required"})
	}
	if req.Namespace == "" {
		return c.Status(400).JSON(fiber.Map{"error": "namespace is required"})
	}
	if req.ServiceName == "" {
		return c.Status(400).JSON(fiber.Map{"error": "serviceName is required"})
	}

	ctx, cancel := context.WithTimeout(c.Context(), mcsWriteTimeout)
	defer cancel()

	// Create the ServiceExport
	if err := h.k8sClient.CreateServiceExport(ctx, req.Cluster, req.Namespace, req.ServiceName); err != nil {
		log.Printf("failed to create serviceexport: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "internal server error"})
	}

	return c.Status(201).JSON(fiber.Map{
		"message":     "ServiceExport created successfully",
		"cluster":     req.Cluster,
		"namespace":   req.Namespace,
		"serviceName": req.ServiceName,
	})
}

// DeleteServiceExport deletes a ServiceExport
// DELETE /api/mcs/exports/:cluster/:namespace/:name
func (h *MCSHandlers) DeleteServiceExport(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return c.Status(503).JSON(fiber.Map{"error": "Kubernetes client not available"})
	}

	cluster := c.Params("cluster")
	namespace := c.Params("namespace")
	name := c.Params("name")

	ctx, cancel := context.WithTimeout(c.Context(), mcsWriteTimeout)
	defer cancel()

	if err := h.k8sClient.DeleteServiceExport(ctx, cluster, namespace, name); err != nil {
		log.Printf("failed to delete serviceexport: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "internal server error"})
	}

	return c.JSON(fiber.Map{
		"message":   "ServiceExport deleted successfully",
		"cluster":   cluster,
		"namespace": namespace,
		"name":      name,
	})
}
