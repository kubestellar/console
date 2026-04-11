package handlers

import (
	"context"
	"log/slog"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/store"
)

// rbacAnalysisTimeout is the timeout for RBAC analysis queries on large clusters.
const rbacAnalysisTimeout = 60 * time.Second

// rbacDefaultTimeout is the per-cluster timeout for standard RBAC queries.
const rbacDefaultTimeout = 15 * time.Second

// rbacWriteTimeout is the timeout for RBAC write operations.
const rbacWriteTimeout = 15 * time.Second

// parseUUID parses a UUID string
func parseUUID(s string) (uuid.UUID, error) {
	return uuid.Parse(s)
}

// RBACHandler handles RBAC and user management operations
type RBACHandler struct {
	store     store.Store
	k8sClient *k8s.MultiClusterClient
}

// NewRBACHandler creates a new RBAC handler
func NewRBACHandler(s store.Store, k8sClient *k8s.MultiClusterClient) *RBACHandler {
	return &RBACHandler{store: s, k8sClient: k8sClient}
}

// ListConsoleUsers returns all console users.
// SECURITY: Restricted to admin users to prevent non-admin users from
// enumerating all user records (#5458).
func (h *RBACHandler) ListConsoleUsers(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	currentUser, err := h.store.GetUser(userID)
	if err != nil || currentUser == nil {
		return fiber.NewError(fiber.StatusUnauthorized, "Unauthorized")
	}

	if currentUser.Role != models.UserRoleAdmin {
		slog.Warn("[rbac] SECURITY: non-admin attempted to list all users",
			"user_id", currentUser.ID,
			"github_login", currentUser.GitHubLogin)
		return fiber.NewError(fiber.StatusForbidden, "Admin access required")
	}

	// #6595: bound the read. ?limit=&offset= follow the same contract as the
	// feedback list endpoints (see parsePageParams). Absent limit → store
	// default; malformed/oversized limit → HTTP 400.
	limit, offset, err := parsePageParams(c)
	if err != nil {
		return err
	}

	users, err := h.store.ListUsers(limit, offset)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to list users")
	}
	return c.JSON(users)
}

// UpdateUserRole updates a user's role (admin only)
func (h *RBACHandler) UpdateUserRole(c *fiber.Ctx) error {
	// Check if current user is admin
	currentUserID := middleware.GetUserID(c)
	currentUser, err := h.store.GetUser(currentUserID)
	if err != nil || currentUser == nil || currentUser.Role != models.UserRoleAdmin {
		return fiber.NewError(fiber.StatusForbidden, "Admin access required")
	}

	targetUserID := c.Params("id")
	if targetUserID == "" {
		return fiber.NewError(fiber.StatusBadRequest, "User ID required")
	}

	var req models.UpdateUserRoleRequest
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid request body")
	}

	// Validate role
	if req.Role != models.UserRoleAdmin && req.Role != models.UserRoleEditor && req.Role != models.UserRoleViewer {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid role")
	}

	// Parse target user ID
	targetID, err := parseUUID(targetUserID)
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid user ID")
	}

	// Prevent removing own admin role
	if targetID == currentUserID && req.Role != models.UserRoleAdmin {
		return fiber.NewError(fiber.StatusBadRequest, "Cannot remove your own admin role")
	}

	if err := h.store.UpdateUserRole(targetID, string(req.Role)); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to update user role")
	}

	return c.JSON(fiber.Map{"success": true})
}

// DeleteConsoleUser deletes a user (admin only)
func (h *RBACHandler) DeleteConsoleUser(c *fiber.Ctx) error {
	// Check if current user is admin
	currentUserID := middleware.GetUserID(c)
	currentUser, err := h.store.GetUser(currentUserID)
	if err != nil || currentUser == nil || currentUser.Role != models.UserRoleAdmin {
		return fiber.NewError(fiber.StatusForbidden, "Admin access required")
	}

	targetUserID := c.Params("id")
	if targetUserID == "" {
		return fiber.NewError(fiber.StatusBadRequest, "User ID required")
	}

	targetID, err := parseUUID(targetUserID)
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid user ID")
	}

	// Prevent deleting self
	if targetID == currentUserID {
		return fiber.NewError(fiber.StatusBadRequest, "Cannot delete your own account")
	}

	if err := h.store.DeleteUser(targetID); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to delete user")
	}

	return c.JSON(fiber.Map{"success": true})
}

// GetUserManagementSummary returns an overview of users.
// SECURITY: Restricted to admin users to prevent non-admin users from
// reading user counts and permission summaries (#5459).
func (h *RBACHandler) GetUserManagementSummary(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	currentUser, err := h.store.GetUser(userID)
	if err != nil || currentUser == nil {
		return fiber.NewError(fiber.StatusUnauthorized, "Unauthorized")
	}

	if currentUser.Role != models.UserRoleAdmin {
		slog.Warn("[rbac] SECURITY: non-admin attempted to read user-management summary",
			"user_id", currentUser.ID,
			"github_login", currentUser.GitHubLogin)
		return fiber.NewError(fiber.StatusForbidden, "Admin access required")
	}

	summary := models.UserManagementSummary{}

	// Count console users by role
	admins, editors, viewers, err := h.store.CountUsersByRole()
	if err == nil {
		summary.ConsoleUsers.Total = admins + editors + viewers
		summary.ConsoleUsers.Admins = admins
		summary.ConsoleUsers.Editors = editors
		summary.ConsoleUsers.Viewers = viewers
	}

	// Count K8s service accounts (if k8s client is available)
	if h.k8sClient != nil {
		ctx, cancel := context.WithTimeout(c.Context(), rbacDefaultTimeout)
		defer cancel()

		total, clusters, err := h.k8sClient.CountServiceAccountsAllClusters(ctx)
		if err == nil {
			summary.K8sServiceAccounts.Total = total
			summary.K8sServiceAccounts.Clusters = clusters
		}

		// Get current user permissions
		perms, err := h.k8sClient.GetAllClusterPermissions(ctx)
		if err == nil {
			summary.CurrentUserPermissions = perms
		}
	}

	return c.JSON(summary)
}

// ListK8sServiceAccounts returns service accounts from clusters.
// SECURITY: Restricted to admin users to prevent non-admin users from
// enumerating cluster RBAC information (#4713).
func (h *RBACHandler) ListK8sServiceAccounts(c *fiber.Ctx) error {
	// Require admin role to list service accounts across clusters
	userID := middleware.GetUserID(c)
	currentUser, err := h.store.GetUser(userID)
	if err != nil || currentUser == nil || currentUser.Role != models.UserRoleAdmin {
		return fiber.NewError(fiber.StatusForbidden, "Admin access required to list service accounts")
	}

	if h.k8sClient == nil {
		return fiber.NewError(fiber.StatusServiceUnavailable, "Kubernetes client not available")
	}

	cluster := c.Query("cluster")
	namespace := c.Query("namespace")

	ctx, cancel := context.WithTimeout(c.Context(), rbacDefaultTimeout)
	defer cancel()

	if cluster != "" {
		// Get SAs from specific cluster
		sas, err := h.k8sClient.ListServiceAccounts(ctx, cluster, namespace)
		if err != nil {
			slog.Error("[RBAC] failed to list service accounts", "error", err)
			return fiber.NewError(fiber.StatusInternalServerError, "internal server error")
		}
		return c.JSON(sas)
	}

	// Get SAs from all clusters
	clusters, _, err := h.k8sClient.HealthyClusters(ctx)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to list clusters")
	}

	allSAs := make([]models.K8sServiceAccount, 0)
	for _, cl := range clusters {
		sas, err := h.k8sClient.ListServiceAccounts(ctx, cl.Name, namespace)
		if err != nil {
			continue // Skip clusters we can't access
		}
		allSAs = append(allSAs, sas...)
	}

	return c.JSON(allSAs)
}

// ListK8sRoles returns roles from clusters.
// SECURITY: Restricted to admin users to prevent non-admin users from
// enumerating Kubernetes roles (#5460).
func (h *RBACHandler) ListK8sRoles(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	currentUser, err := h.store.GetUser(userID)
	if err != nil || currentUser == nil {
		return fiber.NewError(fiber.StatusUnauthorized, "Unauthorized")
	}

	if currentUser.Role != models.UserRoleAdmin {
		slog.Warn("[rbac] SECURITY: non-admin attempted to list Kubernetes roles",
			"user_id", currentUser.ID,
			"github_login", currentUser.GitHubLogin)
		return fiber.NewError(fiber.StatusForbidden, "Admin access required")
	}

	if h.k8sClient == nil {
		return fiber.NewError(fiber.StatusServiceUnavailable, "Kubernetes client not available")
	}

	cluster := c.Query("cluster")
	namespace := c.Query("namespace")
	includeSystem := c.Query("includeSystem") == "true"

	ctx, cancel := context.WithTimeout(c.Context(), rbacDefaultTimeout)
	defer cancel()

	if cluster != "" {
		// Get roles from specific cluster
		roles := make([]models.K8sRole, 0)
		if namespace != "" {
			nsRoles, err := h.k8sClient.ListRoles(ctx, cluster, namespace)
			if err != nil {
				return fiber.NewError(fiber.StatusInternalServerError, "Failed to list roles")
			}
			roles = append(roles, nsRoles...)
		}
		clusterRoles, err := h.k8sClient.ListClusterRoles(ctx, cluster, includeSystem)
		if err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Failed to list cluster roles")
		}
		roles = append(roles, clusterRoles...)
		return c.JSON(roles)
	}

	// Return error if no cluster specified
	return fiber.NewError(fiber.StatusBadRequest, "Cluster parameter required")
}

// ListK8sRoleBindings returns role bindings from clusters.
// SECURITY: Restricted to admin users to prevent non-admin users from
// enumerating role bindings (#5461).
func (h *RBACHandler) ListK8sRoleBindings(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	currentUser, err := h.store.GetUser(userID)
	if err != nil || currentUser == nil {
		return fiber.NewError(fiber.StatusUnauthorized, "Unauthorized")
	}

	if currentUser.Role != models.UserRoleAdmin {
		slog.Warn("[rbac] SECURITY: non-admin attempted to list role bindings",
			"user_id", currentUser.ID,
			"github_login", currentUser.GitHubLogin)
		return fiber.NewError(fiber.StatusForbidden, "Admin access required")
	}

	if h.k8sClient == nil {
		return fiber.NewError(fiber.StatusServiceUnavailable, "Kubernetes client not available")
	}

	cluster := c.Query("cluster")
	namespace := c.Query("namespace")
	includeSystem := c.Query("includeSystem") == "true"

	ctx, cancel := context.WithTimeout(c.Context(), rbacDefaultTimeout)
	defer cancel()

	if cluster == "" {
		return fiber.NewError(fiber.StatusBadRequest, "Cluster parameter required")
	}

	bindings := make([]models.K8sRoleBinding, 0)

	if namespace != "" {
		nsBindings, err := h.k8sClient.ListRoleBindings(ctx, cluster, namespace)
		if err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Failed to list role bindings")
		}
		bindings = append(bindings, nsBindings...)
	}

	clusterBindings, err := h.k8sClient.ListClusterRoleBindings(ctx, cluster, includeSystem)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to list cluster role bindings")
	}
	bindings = append(bindings, clusterBindings...)

	return c.JSON(bindings)
}

// GetClusterPermissions returns current user's permissions on clusters
func (h *RBACHandler) GetClusterPermissions(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return fiber.NewError(fiber.StatusServiceUnavailable, "Kubernetes client not available")
	}

	ctx, cancel := context.WithTimeout(c.Context(), rbacDefaultTimeout)
	defer cancel()

	cluster := c.Query("cluster")

	if cluster != "" {
		perms, err := h.k8sClient.GetClusterPermissions(ctx, cluster)
		if err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Failed to get permissions")
		}
		return c.JSON(perms)
	}

	// Get permissions for all clusters
	perms, err := h.k8sClient.GetAllClusterPermissions(ctx)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to get permissions")
	}
	return c.JSON(perms)
}

// CreateServiceAccount creates a new service account (cluster-admin only)
func (h *RBACHandler) CreateServiceAccount(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return fiber.NewError(fiber.StatusServiceUnavailable, "Kubernetes client not available")
	}

	var req models.CreateServiceAccountRequest
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid request body")
	}

	if req.Name == "" || req.Namespace == "" || req.Cluster == "" {
		return fiber.NewError(fiber.StatusBadRequest, "Name, namespace, and cluster are required")
	}

	ctx, cancel := context.WithTimeout(c.Context(), rbacWriteTimeout)
	defer cancel()

	// Check if user has cluster-admin access
	isAdmin, err := h.k8sClient.CheckClusterAdminAccess(ctx, req.Cluster)
	if err != nil || !isAdmin {
		return fiber.NewError(fiber.StatusForbidden, "Cluster admin access required")
	}

	sa, err := h.k8sClient.CreateServiceAccount(ctx, req.Cluster, req.Namespace, req.Name)
	if err != nil {
		slog.Error("[RBAC] failed to create service account", "error", err)
		return fiber.NewError(fiber.StatusInternalServerError, "internal server error")
	}

	return c.JSON(sa)
}

// CreateRoleBinding creates a new role binding (cluster-admin only)
func (h *RBACHandler) CreateRoleBinding(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return fiber.NewError(fiber.StatusServiceUnavailable, "Kubernetes client not available")
	}

	var req models.CreateRoleBindingRequest
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid request body")
	}

	if req.Name == "" || req.Cluster == "" || req.RoleName == "" || req.SubjectName == "" {
		return fiber.NewError(fiber.StatusBadRequest, "Missing required fields")
	}

	ctx, cancel := context.WithTimeout(c.Context(), rbacWriteTimeout)
	defer cancel()

	// Check if user has cluster-admin access
	isAdmin, err := h.k8sClient.CheckClusterAdminAccess(ctx, req.Cluster)
	if err != nil || !isAdmin {
		return fiber.NewError(fiber.StatusForbidden, "Cluster admin access required")
	}

	if err := h.k8sClient.CreateRoleBinding(ctx, req); err != nil {
		slog.Error("[RBAC] failed to create role binding", "error", err)
		return fiber.NewError(fiber.StatusInternalServerError, "internal server error")
	}

	return c.JSON(fiber.Map{"success": true})
}

// ListK8sUsers returns all unique users/subjects from role bindings.
// SECURITY: Restricted to admin users to prevent non-admin users from
// enumerating Kubernetes subjects (#5462).
func (h *RBACHandler) ListK8sUsers(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	currentUser, err := h.store.GetUser(userID)
	if err != nil || currentUser == nil {
		return fiber.NewError(fiber.StatusUnauthorized, "Unauthorized")
	}

	if currentUser.Role != models.UserRoleAdmin {
		slog.Warn("[rbac] SECURITY: non-admin attempted to list Kubernetes subjects",
			"user_id", currentUser.ID,
			"github_login", currentUser.GitHubLogin)
		return fiber.NewError(fiber.StatusForbidden, "Admin access required")
	}

	if h.k8sClient == nil {
		return fiber.NewError(fiber.StatusServiceUnavailable, "Kubernetes client not available")
	}

	cluster := c.Query("cluster")
	if cluster == "" {
		return fiber.NewError(fiber.StatusBadRequest, "Cluster parameter required")
	}

	ctx, cancel := context.WithTimeout(c.Context(), rbacDefaultTimeout)
	defer cancel()

	users, err := h.k8sClient.GetAllK8sUsers(ctx, cluster)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to list K8s users")
	}

	return c.JSON(users)
}

// ListOpenShiftUsers returns all OpenShift users (users.user.openshift.io) from a cluster.
// SECURITY: Restricted to admin users to prevent non-admin users from
// enumerating OpenShift users (#5463).
func (h *RBACHandler) ListOpenShiftUsers(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	currentUser, err := h.store.GetUser(userID)
	if err != nil || currentUser == nil {
		return fiber.NewError(fiber.StatusUnauthorized, "Unauthorized")
	}

	if currentUser.Role != models.UserRoleAdmin {
		slog.Warn("[rbac] SECURITY: non-admin attempted to list OpenShift users",
			"user_id", currentUser.ID,
			"github_login", currentUser.GitHubLogin)
		return fiber.NewError(fiber.StatusForbidden, "Admin access required")
	}

	if h.k8sClient == nil {
		return fiber.NewError(fiber.StatusServiceUnavailable, "Kubernetes client not available")
	}

	cluster := c.Query("cluster")
	if cluster == "" {
		return fiber.NewError(fiber.StatusBadRequest, "Cluster parameter required")
	}

	// Use a longer timeout for this query as large clusters can be slow
	ctx, cancel := context.WithTimeout(context.Background(), rbacAnalysisTimeout)
	defer cancel()

	users, err := h.k8sClient.ListOpenShiftUsers(ctx, cluster)
	if err != nil {
		slog.Error("[RBAC] failed to list openshift users", "error", err)
		return fiber.NewError(fiber.StatusInternalServerError, "internal server error")
	}

	return c.JSON(users)
}

// GetPermissionsSummary returns permission summaries for all clusters.
// SECURITY: Restricted to admin users to prevent non-admin users from
// reading per-cluster permission summaries (#5465).
func (h *RBACHandler) GetPermissionsSummary(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	currentUser, err := h.store.GetUser(userID)
	if err != nil || currentUser == nil {
		return fiber.NewError(fiber.StatusUnauthorized, "Unauthorized")
	}

	if currentUser.Role != models.UserRoleAdmin {
		slog.Warn("[rbac] SECURITY: non-admin attempted to read permissions summary",
			"user_id", currentUser.ID,
			"github_login", currentUser.GitHubLogin)
		return fiber.NewError(fiber.StatusForbidden, "Admin access required")
	}

	if h.k8sClient == nil {
		return fiber.NewError(fiber.StatusServiceUnavailable, "Kubernetes client not available")
	}

	ctx, cancel := context.WithTimeout(c.Context(), rbacAnalysisTimeout)
	defer cancel()

	summaries, err := h.k8sClient.GetAllPermissionsSummaries(ctx)
	if err != nil {
		slog.Error("[RBAC] failed to get permissions summary", "error", err)
		return fiber.NewError(fiber.StatusInternalServerError, "internal server error")
	}

	// Convert to map format for API response
	response := models.PermissionsSummaryResponse{
		Clusters: make(map[string]models.ClusterPermissionsSummary),
	}

	for _, summary := range summaries {
		response.Clusters[summary.Cluster] = models.ClusterPermissionsSummary{
			IsClusterAdmin:       summary.IsClusterAdmin,
			CanListNodes:         summary.CanListNodes,
			CanListNamespaces:    summary.CanListNamespaces,
			CanCreateNamespaces:  summary.CanCreateNamespaces,
			CanManageRBAC:        summary.CanManageRBAC,
			CanViewSecrets:       summary.CanViewSecrets,
			AccessibleNamespaces: summary.AccessibleNamespaces,
		}
	}

	return c.JSON(response)
}

// CheckCanI checks if the current user can perform an action
func (h *RBACHandler) CheckCanI(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return fiber.NewError(fiber.StatusServiceUnavailable, "Kubernetes client not available")
	}

	var req models.CanIRequest
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid request body")
	}

	if req.Cluster == "" || req.Verb == "" || req.Resource == "" {
		return fiber.NewError(fiber.StatusBadRequest, "Cluster, verb, and resource are required")
	}

	ctx, cancel := context.WithTimeout(c.Context(), rbacDefaultTimeout)
	defer cancel()

	result, err := h.k8sClient.CheckCanI(ctx, req.Cluster, req)
	if err != nil {
		slog.Error("[RBAC] failed to check permission", "error", err)
		return fiber.NewError(fiber.StatusInternalServerError, "internal server error")
	}

	return c.JSON(models.CanIResponse{
		Allowed: result.Allowed,
		Reason:  result.Reason,
	})
}
