package k8s

import (
	"context"
	"fmt"

	"github.com/kubestellar/console/pkg/models"
	"golang.org/x/sync/errgroup"
	authv1 "k8s.io/api/authorization/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// CheckClusterAdminAccess checks if the current user has cluster-admin access
func (m *MultiClusterClient) CheckClusterAdminAccess(ctx context.Context, contextName string) (bool, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return false, err
	}

	// Use SelfSubjectAccessReview to check if user can do anything
	review := &authv1.SelfSubjectAccessReview{
		Spec: authv1.SelfSubjectAccessReviewSpec{
			ResourceAttributes: &authv1.ResourceAttributes{
				Verb:     "*",
				Resource: "*",
				Group:    "*",
			},
		},
	}

	result, err := client.AuthorizationV1().SelfSubjectAccessReviews().Create(ctx, review, metav1.CreateOptions{})
	if err != nil {
		return false, err
	}

	return result.Status.Allowed, nil
}

// CheckPermission checks if the current user can perform an action
func (m *MultiClusterClient) CheckPermission(ctx context.Context, contextName, verb, resource, namespace string) (bool, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return false, err
	}

	review := &authv1.SelfSubjectAccessReview{
		Spec: authv1.SelfSubjectAccessReviewSpec{
			ResourceAttributes: &authv1.ResourceAttributes{
				Verb:      verb,
				Resource:  resource,
				Namespace: namespace,
			},
		},
	}

	result, err := client.AuthorizationV1().SelfSubjectAccessReviews().Create(ctx, review, metav1.CreateOptions{})
	if err != nil {
		return false, err
	}

	return result.Status.Allowed, nil
}

// CheckPodExecPermissionForUser runs a SubjectAccessReview against the target
// cluster's apiserver asking whether the end user (identified by `username`
// plus optional group memberships) is allowed to `create` on
// `pods/exec` for a specific pod in a namespace.
//
// Why SAR (not SelfSAR):
// The backend's clientset authenticates to the target cluster as the pod
// ServiceAccount (or whatever identity the loaded kubeconfig carries), not as
// the logged-in console user. A SelfSubjectAccessReview therefore reflects
// the pod SA's permissions, which is exactly the privilege-escalation path
// described in issue #8120. SubjectAccessReview lets us ask the apiserver
// about a *different* user — the end user whose JWT we just validated — so
// the authorization decision is made by Kubernetes RBAC against the user's
// own subject, not against the backend SA.
//
// Fail-closed semantics: the caller MUST treat (false, nil) AND any non-nil
// error as a denial. A SAR request that errors out (apiserver unreachable,
// permission to create SARs denied, etc.) is returned verbatim so the caller
// can log it; the caller must not open the exec stream in either case.
func (m *MultiClusterClient) CheckPodExecPermissionForUser(
	ctx context.Context,
	contextName, username string,
	groups []string,
	namespace, podName string,
) (bool, string, error) {
	if username == "" {
		// Fail-closed: a missing user identity must never authorize an exec.
		return false, "missing user identity", nil
	}
	if namespace == "" || podName == "" {
		return false, "missing namespace or pod name", nil
	}

	client, err := m.GetClient(contextName)
	if err != nil {
		return false, "", err
	}

	review := &authv1.SubjectAccessReview{
		Spec: authv1.SubjectAccessReviewSpec{
			User:   username,
			Groups: groups,
			ResourceAttributes: &authv1.ResourceAttributes{
				Verb:        podExecVerb,
				Resource:    podExecResource,
				Subresource: podExecSubresource,
				Namespace:   namespace,
				Name:        podName,
			},
		},
	}

	result, err := client.AuthorizationV1().SubjectAccessReviews().Create(ctx, review, metav1.CreateOptions{})
	if err != nil {
		return false, "", fmt.Errorf("failed to perform pods/exec SubjectAccessReview: %w", err)
	}

	return result.Status.Allowed, result.Status.Reason, nil
}

// GetClusterPermissions returns the current user's permissions on a cluster
func (m *MultiClusterClient) GetClusterPermissions(ctx context.Context, contextName string) (*models.ClusterPermissions, error) {
	perms := &models.ClusterPermissions{
		Cluster: contextName,
	}

	// Check cluster-admin
	isAdmin, err := m.CheckClusterAdminAccess(ctx, contextName)
	if err == nil {
		perms.IsClusterAdmin = isAdmin
	}

	// Check specific permissions
	canCreateSA, _ := m.CheckPermission(ctx, contextName, "create", "serviceaccounts", "")
	perms.CanCreateSA = canCreateSA

	canManageRBAC, _ := m.CheckPermission(ctx, contextName, "create", "rolebindings", "")
	perms.CanManageRBAC = canManageRBAC

	canViewSecrets, _ := m.CheckPermission(ctx, contextName, "get", "secrets", "")
	perms.CanViewSecrets = canViewSecrets

	return perms, nil
}

// GetAllClusterPermissions returns permissions for all clusters
func (m *MultiClusterClient) GetAllClusterPermissions(ctx context.Context) ([]models.ClusterPermissions, error) {
	clusters, err := m.ListClusters(ctx)
	if err != nil {
		return nil, err
	}

	result := make([]models.ClusterPermissions, len(clusters))

	g, gctx := errgroup.WithContext(ctx)
	g.SetLimit(maxConcurrentClusterRBACQueries)

	for i, cluster := range clusters {
		i, cluster := i, cluster // capture per-iteration
		g.Go(func() error {
			clusterCtx, cancel := context.WithTimeout(gctx, perClusterRBACTimeout)
			defer cancel()

			perms, err := m.GetClusterPermissions(clusterCtx, cluster.Name)
			if err != nil {
				// Partial info on error — same contract as the old code.
				result[i] = models.ClusterPermissions{Cluster: cluster.Name}
				return nil
			}
			result[i] = *perms
			return nil
		})
	}

	_ = g.Wait()

	return result, nil
}

// CheckCanI performs a SelfSubjectAccessReview and returns detailed result
func (m *MultiClusterClient) CheckCanI(ctx context.Context, contextName string, req models.CanIRequest) (*CanIResult, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	review := &authv1.SelfSubjectAccessReview{
		Spec: authv1.SelfSubjectAccessReviewSpec{
			ResourceAttributes: &authv1.ResourceAttributes{
				Verb:        req.Verb,
				Resource:    req.Resource,
				Namespace:   req.Namespace,
				Group:       req.Group,
				Subresource: req.Subresource,
				Name:        req.Name,
			},
		},
	}

	result, err := client.AuthorizationV1().SelfSubjectAccessReviews().Create(ctx, review, metav1.CreateOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to perform access review: %w", err)
	}

	return &CanIResult{
		Allowed: result.Status.Allowed,
		Reason:  result.Status.Reason,
	}, nil
}

// GetPermissionsSummary returns a comprehensive permission summary for a cluster
func (m *MultiClusterClient) GetPermissionsSummary(ctx context.Context, contextName string) (*PermissionsSummary, error) {
	summary := &PermissionsSummary{
		Cluster: contextName,
	}

	// Check cluster-admin access
	isAdmin, err := m.CheckClusterAdminAccess(ctx, contextName)
	if err == nil {
		summary.IsClusterAdmin = isAdmin
	}

	// Check specific permissions
	canListNodes, _ := m.CheckPermission(ctx, contextName, "list", "nodes", "")
	summary.CanListNodes = canListNodes

	canListNS, _ := m.CheckPermission(ctx, contextName, "list", "namespaces", "")
	summary.CanListNamespaces = canListNS

	canCreateNS, _ := m.CheckPermission(ctx, contextName, "create", "namespaces", "")
	summary.CanCreateNamespaces = canCreateNS

	canManageRBAC, _ := m.CheckPermission(ctx, contextName, "create", "rolebindings", "")
	summary.CanManageRBAC = canManageRBAC

	canViewSecrets, _ := m.CheckPermission(ctx, contextName, "get", "secrets", "")
	summary.CanViewSecrets = canViewSecrets

	// Get accessible namespaces
	if canListNS {
		namespaces, err := m.listAllNamespaces(ctx, contextName)
		if err == nil {
			summary.AccessibleNamespaces = namespaces
		}
	} else {
		// Try to find namespaces user can access by checking common ones
		accessible, _ := m.getAccessibleNamespaces(ctx, contextName)
		summary.AccessibleNamespaces = accessible
	}

	return summary, nil
}

// GetAllPermissionsSummaries returns permission summaries for all clusters.
//
// Previously this iterated clusters sequentially: N clusters × 5 RBAC probes
// × up-to-45s-per-cluster meant a 10-cluster fleet could block the UI for
// minutes when even one cluster was slow (#6487). The fan-out now:
//
//   - runs per-cluster probes concurrently with errgroup
//   - caps concurrency at maxConcurrentClusterRBACQueries so a large fleet
//     doesn't hammer every apiserver at once
//   - enforces perClusterRBACTimeout as an inner cap so one slow cluster
//     can't consume the caller's entire budget
//   - preserves the "partial info on error" contract: a failed cluster still
//     appears in the result with just its Cluster field set, so callers can
//     distinguish "no info" from "cluster missing"
//
// Results are written by index into a preallocated slice so cluster order
// matches the input listing (no nondeterminism from scheduler race).
func (m *MultiClusterClient) GetAllPermissionsSummaries(ctx context.Context) ([]PermissionsSummary, error) {
	clusters, err := m.ListClusters(ctx)
	if err != nil {
		return nil, err
	}

	summaries := make([]PermissionsSummary, len(clusters))

	g, gctx := errgroup.WithContext(ctx)
	g.SetLimit(maxConcurrentClusterRBACQueries)

	for i, cluster := range clusters {
		i, cluster := i, cluster // capture per-iteration
		g.Go(func() error {
			clusterCtx, cancel := context.WithTimeout(gctx, perClusterRBACTimeout)
			defer cancel()

			summary, err := m.GetPermissionsSummary(clusterCtx, cluster.Name)
			if err != nil {
				// Partial info on error — same contract as the old code.
				summaries[i] = PermissionsSummary{Cluster: cluster.Name}
				return nil
			}
			summaries[i] = *summary
			return nil
		})
	}

	// None of the goroutines return a non-nil error (we swallow per-cluster
	// failures into partial summaries above), so g.Wait() only surfaces
	// context cancellation. Ignore by design — a cancelled parent context
	// will already have propagated into the per-cluster calls and produced
	// partial entries.
	_ = g.Wait()

	return summaries, nil
}
