package handlers

import (
	"context"
	"log/slog"
	"time"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/store"
)

// nsDefaultTimeout is the per-cluster timeout for namespace queries.
const nsDefaultTimeout = 15 * time.Second

// nsWriteTimeout is the timeout for namespace write operations.
const nsWriteTimeout = 15 * time.Second

// NamespaceHandler handles namespace management operations
type NamespaceHandler struct {
	store     store.Store
	k8sClient *k8s.MultiClusterClient
}

// NewNamespaceHandler creates a new namespace handler
func NewNamespaceHandler(s store.Store, k8sClient *k8s.MultiClusterClient) *NamespaceHandler {
	return &NamespaceHandler{store: s, k8sClient: k8sClient}
}

// ListNamespaces returns namespaces for a cluster
func (h *NamespaceHandler) ListNamespaces(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return fiber.NewError(fiber.StatusServiceUnavailable, "Kubernetes client not available")
	}

	cluster := c.Query("cluster")
	if cluster == "" {
		return fiber.NewError(fiber.StatusBadRequest, "Cluster parameter required")
	}

	ctx, cancel := context.WithTimeout(c.Context(), nsDefaultTimeout)
	defer cancel()

	namespaces, err := h.k8sClient.ListNamespacesWithDetails(ctx, cluster)
	if err != nil {
		slog.Error("[Namespaces] failed to list namespaces", "error", err)
		return fiber.NewError(fiber.StatusInternalServerError, "internal server error")
	}

	return c.JSON(namespaces)
}

// CreateNamespace creates a new namespace
func (h *NamespaceHandler) CreateNamespace(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return fiber.NewError(fiber.StatusServiceUnavailable, "Kubernetes client not available")
	}

	// Check if current user is console admin
	currentUserID := middleware.GetUserID(c)
	currentUser, err := h.store.GetUser(currentUserID)
	if err != nil || currentUser == nil || currentUser.Role != models.UserRoleAdmin {
		return fiber.NewError(fiber.StatusForbidden, "Console admin access required")
	}

	var req models.CreateNamespaceRequest
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid request body")
	}

	if req.Cluster == "" || req.Name == "" {
		return fiber.NewError(fiber.StatusBadRequest, "Cluster and name are required")
	}

	ctx, cancel := context.WithTimeout(c.Context(), nsWriteTimeout)
	defer cancel()

	// Check if user has cluster-admin access on the target cluster
	isAdmin, err := h.k8sClient.CheckClusterAdminAccess(ctx, req.Cluster)
	if err != nil || !isAdmin {
		return fiber.NewError(fiber.StatusForbidden, "Cluster admin access required on target cluster")
	}

	ns, err := h.k8sClient.CreateNamespace(ctx, req.Cluster, req.Name, req.Labels)
	if err != nil {
		slog.Error("[Namespaces] failed to create namespace", "error", err)
		return fiber.NewError(fiber.StatusInternalServerError, "internal server error")
	}

	return c.JSON(fiber.Map{
		"success":   true,
		"namespace": ns,
	})
}

// DeleteNamespace deletes a namespace
func (h *NamespaceHandler) DeleteNamespace(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return fiber.NewError(fiber.StatusServiceUnavailable, "Kubernetes client not available")
	}

	// Check if current user is console admin
	currentUserID := middleware.GetUserID(c)
	currentUser, err := h.store.GetUser(currentUserID)
	if err != nil || currentUser == nil || currentUser.Role != models.UserRoleAdmin {
		return fiber.NewError(fiber.StatusForbidden, "Console admin access required")
	}

	cluster := c.Query("cluster")
	name := c.Params("name")
	if cluster == "" || name == "" {
		return fiber.NewError(fiber.StatusBadRequest, "Cluster and namespace name are required")
	}

	ctx, cancel := context.WithTimeout(c.Context(), nsWriteTimeout)
	defer cancel()

	// Check if user has cluster-admin access on the target cluster
	isAdmin, err := h.k8sClient.CheckClusterAdminAccess(ctx, cluster)
	if err != nil || !isAdmin {
		return fiber.NewError(fiber.StatusForbidden, "Cluster admin access required on target cluster")
	}

	if err := h.k8sClient.DeleteNamespace(ctx, cluster, name); err != nil {
		slog.Error("[Namespaces] failed to delete namespace", "error", err)
		return fiber.NewError(fiber.StatusInternalServerError, "internal server error")
	}

	return c.JSON(fiber.Map{"success": true})
}

// GetNamespaceAccess returns role bindings for a namespace.
// SECURITY: Restricted to admin users to prevent non-admin users from
// enumerating namespace access and binding subjects (#5466).
func (h *NamespaceHandler) GetNamespaceAccess(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	currentUser, err := h.store.GetUser(userID)
	if err != nil || currentUser == nil {
		return fiber.NewError(fiber.StatusUnauthorized, "Unauthorized")
	}

	if currentUser.Role != models.UserRoleAdmin {
		slog.Warn("[rbac] SECURITY: non-admin attempted to read namespace access",
			"user_id", currentUser.ID,
			"github_login", currentUser.GitHubLogin)
		return fiber.NewError(fiber.StatusForbidden, "Admin access required")
	}

	if h.k8sClient == nil {
		return fiber.NewError(fiber.StatusServiceUnavailable, "Kubernetes client not available")
	}

	cluster := c.Query("cluster")
	name := c.Params("name")
	if cluster == "" || name == "" {
		return fiber.NewError(fiber.StatusBadRequest, "Cluster and namespace name are required")
	}

	ctx, cancel := context.WithTimeout(c.Context(), nsDefaultTimeout)
	defer cancel()

	bindings, err := h.k8sClient.ListRoleBindings(ctx, cluster, name)
	if err != nil {
		slog.Error("[Namespaces] failed to list role bindings", "error", err)
		return fiber.NewError(fiber.StatusInternalServerError, "internal server error")
	}

	// Convert to access list format
	accessList := make([]models.NamespaceAccessEntry, 0)
	for _, binding := range bindings {
		for _, subject := range binding.Subjects {
			accessList = append(accessList, models.NamespaceAccessEntry{
				BindingName: binding.Name,
				SubjectKind: string(subject.Kind),
				SubjectName: subject.Name,
				SubjectNS:   subject.Namespace,
				RoleName:    binding.RoleName,
				RoleKind:    binding.RoleKind,
			})
		}
	}

	return c.JSON(fiber.Map{
		"namespace": name,
		"cluster":   cluster,
		"bindings":  accessList,
	})
}

// GrantNamespaceAccess grants access to a user/group/SA on a namespace
func (h *NamespaceHandler) GrantNamespaceAccess(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return fiber.NewError(fiber.StatusServiceUnavailable, "Kubernetes client not available")
	}

	// Check if current user is console admin
	currentUserID := middleware.GetUserID(c)
	currentUser, err := h.store.GetUser(currentUserID)
	if err != nil || currentUser == nil || currentUser.Role != models.UserRoleAdmin {
		return fiber.NewError(fiber.StatusForbidden, "Console admin access required")
	}

	namespace := c.Params("name")
	if namespace == "" {
		return fiber.NewError(fiber.StatusBadRequest, "Namespace name required")
	}

	var req models.GrantNamespaceAccessRequest
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid request body")
	}

	if req.Cluster == "" || req.SubjectKind == "" || req.SubjectName == "" {
		return fiber.NewError(fiber.StatusBadRequest, "Cluster, subjectKind, and subjectName are required")
	}

	// Default to admin role if not specified
	if req.Role == "" {
		req.Role = "admin"
	}

	ctx, cancel := context.WithTimeout(c.Context(), nsWriteTimeout)
	defer cancel()

	// Check if user has cluster-admin access on the target cluster
	isAdmin, err := h.k8sClient.CheckClusterAdminAccess(ctx, req.Cluster)
	if err != nil || !isAdmin {
		return fiber.NewError(fiber.StatusForbidden, "Cluster admin access required on target cluster")
	}

	bindingName, err := h.k8sClient.GrantNamespaceAccess(ctx, req.Cluster, namespace, req)
	if err != nil {
		slog.Error("[Namespaces] failed to grant access", "error", err)
		return fiber.NewError(fiber.StatusInternalServerError, "internal server error")
	}

	return c.JSON(fiber.Map{
		"success":     true,
		"roleBinding": bindingName,
	})
}

// RevokeNamespaceAccess removes a role binding
func (h *NamespaceHandler) RevokeNamespaceAccess(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return fiber.NewError(fiber.StatusServiceUnavailable, "Kubernetes client not available")
	}

	// Check if current user is console admin
	currentUserID := middleware.GetUserID(c)
	currentUser, err := h.store.GetUser(currentUserID)
	if err != nil || currentUser == nil || currentUser.Role != models.UserRoleAdmin {
		return fiber.NewError(fiber.StatusForbidden, "Console admin access required")
	}

	namespace := c.Params("name")
	bindingName := c.Params("binding")
	cluster := c.Query("cluster")

	if cluster == "" || namespace == "" || bindingName == "" {
		return fiber.NewError(fiber.StatusBadRequest, "Cluster, namespace, and binding name are required")
	}

	ctx, cancel := context.WithTimeout(c.Context(), nsWriteTimeout)
	defer cancel()

	// Check if user has cluster-admin access on the target cluster
	isAdmin, err := h.k8sClient.CheckClusterAdminAccess(ctx, cluster)
	if err != nil || !isAdmin {
		return fiber.NewError(fiber.StatusForbidden, "Cluster admin access required on target cluster")
	}

	if err := h.k8sClient.DeleteRoleBinding(ctx, cluster, namespace, bindingName, false); err != nil {
		slog.Error("[Namespaces] failed to revoke access", "error", err)
		return fiber.NewError(fiber.StatusInternalServerError, "internal server error")
	}

	return c.JSON(fiber.Map{"success": true})
}
