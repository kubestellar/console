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

// NamespaceHandler handles namespace read operations.
//
// Namespace and RoleBinding WRITE operations were removed in #7993 Phases 1.5
// and 2 — they now run under the user's kubeconfig via kc-agent's
// `/namespaces` and `/rolebindings` handlers instead of the backend's pod
// ServiceAccount. See pkg/agent/server_http.go.
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
	// SECURITY (#7485): namespace listing exposes cluster structure; require a
	// valid console role (viewer or above).
	if err := requireViewerOrAbove(c, h.store); err != nil {
		return err
	}

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
