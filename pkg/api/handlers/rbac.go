package handlers

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"golang.org/x/sync/errgroup"

	"github.com/kubestellar/console/pkg/api/audit"
	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/store"
)

// rbacAnalysisTimeout is the timeout for RBAC analysis queries on large clusters.
const rbacAnalysisTimeout = 60 * time.Second

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

// ListConsoleUsers returns a page of console users. Supports limit/offset
// query params via parsePageParams (#6595); a response may therefore be a
// partial page. Absent limit yields the store default page size.
//
// SECURITY: Restricted to admin users to prevent non-admin users from
// enumerating all user records (#5458).
func (h *RBACHandler) ListConsoleUsers(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	currentUser, err := h.store.GetUser(c.UserContext(), userID)
	if err != nil || currentUser == nil {
		return fiber.NewError(fiber.StatusUnauthorized, "Unauthorized")
	}

	if currentUser.Role != models.UserRoleAdmin {
		audit.Log(c, audit.ActionUnauthorizedAttempt, "endpoint", "/api/users", "non-admin list attempt")
		return fiber.NewError(fiber.StatusForbidden, "Admin access required")
	}

	// #6595: bound the read. ?limit=&offset= follow the same contract as the
	// feedback list endpoints (see parsePageParams). Absent limit → store
	// default; malformed/oversized limit → HTTP 400.
	limit, offset, err := parsePageParams(c)
	if err != nil {
		return err
	}

	users, err := h.store.ListUsers(c.UserContext(), limit, offset)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to list users")
	}
	return c.JSON(users)
}

// UpdateUserRole updates a user's role (admin only)
func (h *RBACHandler) UpdateUserRole(c *fiber.Ctx) error {
	// Check if current user is admin
	currentUserID := middleware.GetUserID(c)
	currentUser, err := h.store.GetUser(c.UserContext(), currentUserID)
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

	// Fetch old role for audit trail before mutating.
	oldRole := "unknown"
	if target, err := h.store.GetUser(c.UserContext(), targetID); err == nil && target != nil {
		oldRole = string(target.Role)
	}

	if err := h.store.UpdateUserRole(c.UserContext(), targetID, string(req.Role)); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to update user role")
	}

	audit.Log(c, audit.ActionUpdateRole, "user", targetUserID,
		fmt.Sprintf("%s->%s", oldRole, string(req.Role)))

	return c.JSON(fiber.Map{"success": true})
}

// DeleteConsoleUser deletes a user (admin only)
func (h *RBACHandler) DeleteConsoleUser(c *fiber.Ctx) error {
	// Check if current user is admin
	currentUserID := middleware.GetUserID(c)
	currentUser, err := h.store.GetUser(c.UserContext(), currentUserID)
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

	if err := h.store.DeleteUser(c.UserContext(), targetID); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to delete user")
	}

	audit.Log(c, audit.ActionDeleteUser, "user", targetUserID)

	return c.JSON(fiber.Map{"success": true})
}

// GetUserManagementSummary returns an overview of users.
// SECURITY: Restricted to admin users to prevent non-admin users from
// reading user counts and permission summaries (#5459).
func (h *RBACHandler) GetUserManagementSummary(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	currentUser, err := h.store.GetUser(c.UserContext(), userID)
	if err != nil || currentUser == nil {
		return fiber.NewError(fiber.StatusUnauthorized, "Unauthorized")
	}

	if currentUser.Role != models.UserRoleAdmin {
		audit.Log(c, audit.ActionUnauthorizedAttempt, "endpoint", "/api/users/summary", "non-admin summary attempt")
		return fiber.NewError(fiber.StatusForbidden, "Admin access required")
	}

	summary := models.UserManagementSummary{}

	// Count console users by role
	admins, editors, viewers, err := h.store.CountUsersByRole(c.UserContext())
	if err == nil {
		summary.ConsoleUsers.Total = admins + editors + viewers
		summary.ConsoleUsers.Admins = admins
		summary.ConsoleUsers.Editors = editors
		summary.ConsoleUsers.Viewers = viewers
	}

	// Count K8s service accounts (if k8s client is available)
	if h.k8sClient != nil {
		ctx, cancel := context.WithTimeout(c.Context(), k8s.RBACDefaultTimeout)
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
	currentUser, err := h.store.GetUser(c.UserContext(), userID)
	if err != nil || currentUser == nil || currentUser.Role != models.UserRoleAdmin {
		return fiber.NewError(fiber.StatusForbidden, "Admin access required to list service accounts")
	}

	if h.k8sClient == nil {
		return errNoClusterAccess(c)
	}

	cluster := c.Query("cluster")
	namespace := c.Query("namespace")

	ctx, cancel := context.WithTimeout(c.Context(), k8s.RBACDefaultTimeout)
	defer cancel()

	if cluster != "" {
		// Get SAs from specific cluster
		sas, err := h.k8sClient.ListServiceAccounts(ctx, cluster, namespace)
		if err != nil {
			slog.Warn("[RBAC] failed to list service accounts", "error", err)
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
	clusterErrors := make(map[string]string)
	var mu sync.Mutex

	// Fan out across clusters in parallel (#7969). Concurrency is bounded by
	// the shared per-cluster HTTP/1.1 connection budget established in
	// PR #7765 so we do not oversubscribe the transport pool.
	g, gctx := errgroup.WithContext(ctx)
	g.SetLimit(defaultClusterFanoutConcurrency)

	for _, cl := range clusters {
		clusterName := cl.Name
		g.Go(func() error {
			sas, err := h.k8sClient.ListServiceAccounts(gctx, clusterName, namespace)
			if err != nil {
				mu.Lock()
				clusterErrors[clusterName] = err.Error()
				mu.Unlock()
				return nil
			}
			mu.Lock()
			allSAs = append(allSAs, sas...)
			mu.Unlock()
			return nil
		})
	}
	_ = g.Wait() // per-cluster errors are non-fatal and collected in clusterErrors.

	// Match the WebhookListResponse shape from admission_webhooks.go (#7967):
	// include per-cluster errors alongside successful results so the UI can
	// surface partial failures instead of silently dropping clusters.
	return c.JSON(fiber.Map{
		"serviceAccounts": allSAs,
		"errors":          clusterErrorsOrNil(clusterErrors),
	})
}

// clusterErrorsOrNil returns nil when the map is empty so JSON callers get
// `null` (omitted by `omitempty`) instead of `{}`, matching the
// WebhookListResponse.Errors convention in admission_webhooks.go.
func clusterErrorsOrNil(m map[string]string) map[string]string {
	if len(m) == 0 {
		return nil
	}
	return m
}

// ListK8sRoles returns roles from clusters.
// SECURITY: Restricted to admin users to prevent non-admin users from
// enumerating Kubernetes roles (#5460).
func (h *RBACHandler) ListK8sRoles(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	currentUser, err := h.store.GetUser(c.UserContext(), userID)
	if err != nil || currentUser == nil {
		return fiber.NewError(fiber.StatusUnauthorized, "Unauthorized")
	}

	if currentUser.Role != models.UserRoleAdmin {
		audit.Log(c, audit.ActionUnauthorizedAttempt, "endpoint", "/api/k8s/roles", "non-admin role list attempt")
		return fiber.NewError(fiber.StatusForbidden, "Admin access required")
	}

	if h.k8sClient == nil {
		return errNoClusterAccess(c)
	}

	cluster := c.Query("cluster")
	namespace := c.Query("namespace")
	includeSystem := c.Query("includeSystem") == "true"

	ctx, cancel := context.WithTimeout(c.Context(), k8s.RBACDefaultTimeout)
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
	currentUser, err := h.store.GetUser(c.UserContext(), userID)
	if err != nil || currentUser == nil {
		return fiber.NewError(fiber.StatusUnauthorized, "Unauthorized")
	}

	if currentUser.Role != models.UserRoleAdmin {
		audit.Log(c, audit.ActionUnauthorizedAttempt, "endpoint", "/api/k8s/rolebindings", "non-admin role-binding list attempt")
		return fiber.NewError(fiber.StatusForbidden, "Admin access required")
	}

	if h.k8sClient == nil {
		return errNoClusterAccess(c)
	}

	cluster := c.Query("cluster")
	namespace := c.Query("namespace")
	includeSystem := c.Query("includeSystem") == "true"

	ctx, cancel := context.WithTimeout(c.Context(), k8s.RBACDefaultTimeout)
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

// NOTE: GetClusterPermissions moved to kc-agent (#7993 Phase 6). The frontend
// now GETs ${LOCAL_AGENT_HTTP_URL}/rbac/permissions so the
// SelfSubjectAccessReview runs under the user's kubeconfig instead of the
// backend pod ServiceAccount when console is deployed in-cluster. Route in
// pkg/agent/server_rbac.go.

// NOTE: CreateServiceAccount and CreateRoleBinding moved to kc-agent
// (#7993 Phase 1.5 PR A). The frontend now POSTs to
// ${LOCAL_AGENT_HTTP_URL}/serviceaccounts and
// ${LOCAL_AGENT_HTTP_URL}/rolebindings so these mutations run under the
// user's kubeconfig instead of the backend pod's ServiceAccount. The shared
// pkg/k8s MultiClusterClient.CreateServiceAccount and
// MultiClusterClient.CreateRoleBinding methods stay — kc-agent uses them.

// ListK8sUsers returns all unique users/subjects from role bindings.
// SECURITY: Restricted to admin users to prevent non-admin users from
// enumerating Kubernetes subjects (#5462).
func (h *RBACHandler) ListK8sUsers(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	currentUser, err := h.store.GetUser(c.UserContext(), userID)
	if err != nil || currentUser == nil {
		return fiber.NewError(fiber.StatusUnauthorized, "Unauthorized")
	}

	if currentUser.Role != models.UserRoleAdmin {
		audit.Log(c, audit.ActionUnauthorizedAttempt, "endpoint", "/api/k8s/users", "non-admin subject list attempt")
		return fiber.NewError(fiber.StatusForbidden, "Admin access required")
	}

	if h.k8sClient == nil {
		return errNoClusterAccess(c)
	}

	cluster := c.Query("cluster")
	if cluster == "" {
		return fiber.NewError(fiber.StatusBadRequest, "Cluster parameter required")
	}

	ctx, cancel := context.WithTimeout(c.Context(), k8s.RBACDefaultTimeout)
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
	currentUser, err := h.store.GetUser(c.UserContext(), userID)
	if err != nil || currentUser == nil {
		return fiber.NewError(fiber.StatusUnauthorized, "Unauthorized")
	}

	if currentUser.Role != models.UserRoleAdmin {
		audit.Log(c, audit.ActionUnauthorizedAttempt, "endpoint", "/api/k8s/openshift-users", "non-admin OpenShift user list attempt")
		return fiber.NewError(fiber.StatusForbidden, "Admin access required")
	}

	if h.k8sClient == nil {
		return errNoClusterAccess(c)
	}

	cluster := c.Query("cluster")
	if cluster == "" {
		return fiber.NewError(fiber.StatusBadRequest, "Cluster parameter required")
	}

	ctx, cancel := context.WithTimeout(c.Context(), rbacAnalysisTimeout)
	defer cancel()

	users, err := h.k8sClient.ListOpenShiftUsers(ctx, cluster)
	if err != nil {
		slog.Warn("[RBAC] failed to list openshift users", "error", err)
		return fiber.NewError(fiber.StatusInternalServerError, "internal server error")
	}

	return c.JSON(users)
}

// NOTE: GetPermissionsSummary and CheckCanI moved to kc-agent (#7993 Phase 6).
// The frontend now calls ${LOCAL_AGENT_HTTP_URL}/permissions/summary and
// ${LOCAL_AGENT_HTTP_URL}/rbac/can-i so SelfSubjectAccessReviews run under
// the user's kubeconfig instead of the backend pod ServiceAccount when
// console is deployed in-cluster. Routes in pkg/agent/server_rbac.go.
