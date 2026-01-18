package k8s

import (
	"context"
	"fmt"
	"time"

	authv1 "k8s.io/api/authorization/v1"
	corev1 "k8s.io/api/core/v1"
	rbacv1 "k8s.io/api/rbac/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/kubestellar/console/pkg/models"
)

// ListServiceAccounts returns all service accounts in a cluster
func (m *MultiClusterClient) ListServiceAccounts(ctx context.Context, contextName, namespace string) ([]models.K8sServiceAccount, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	sas, err := client.CoreV1().ServiceAccounts(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []models.K8sServiceAccount
	for _, sa := range sas.Items {
		var secrets []string
		for _, s := range sa.Secrets {
			secrets = append(secrets, s.Name)
		}

		// Get roles bound to this SA
		roles, _ := m.getServiceAccountRoles(ctx, contextName, sa.Namespace, sa.Name)

		result = append(result, models.K8sServiceAccount{
			Name:      sa.Name,
			Namespace: sa.Namespace,
			Cluster:   contextName,
			Secrets:   secrets,
			Roles:     roles,
			CreatedAt: sa.CreationTimestamp.Format(time.RFC3339),
		})
	}

	return result, nil
}

// getServiceAccountRoles returns the roles bound to a service account
func (m *MultiClusterClient) getServiceAccountRoles(ctx context.Context, contextName, namespace, saName string) ([]string, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	var roles []string

	// Check RoleBindings in the same namespace
	rbs, err := client.RbacV1().RoleBindings(namespace).List(ctx, metav1.ListOptions{})
	if err == nil {
		for _, rb := range rbs.Items {
			for _, subject := range rb.Subjects {
				if subject.Kind == "ServiceAccount" && subject.Name == saName && subject.Namespace == namespace {
					roles = append(roles, rb.RoleRef.Name)
				}
			}
		}
	}

	// Check ClusterRoleBindings
	crbs, err := client.RbacV1().ClusterRoleBindings().List(ctx, metav1.ListOptions{})
	if err == nil {
		for _, crb := range crbs.Items {
			for _, subject := range crb.Subjects {
				if subject.Kind == "ServiceAccount" && subject.Name == saName && subject.Namespace == namespace {
					roles = append(roles, crb.RoleRef.Name+" (cluster)")
				}
			}
		}
	}

	return roles, nil
}

// ListRoles returns all Roles in a namespace
func (m *MultiClusterClient) ListRoles(ctx context.Context, contextName, namespace string) ([]models.K8sRole, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	roles, err := client.RbacV1().Roles(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []models.K8sRole
	for _, role := range roles.Items {
		result = append(result, models.K8sRole{
			Name:      role.Name,
			Namespace: role.Namespace,
			Cluster:   contextName,
			IsCluster: false,
			RuleCount: len(role.Rules),
		})
	}

	return result, nil
}

// ListClusterRoles returns all ClusterRoles
func (m *MultiClusterClient) ListClusterRoles(ctx context.Context, contextName string, includeSystem bool) ([]models.K8sRole, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	roles, err := client.RbacV1().ClusterRoles().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []models.K8sRole
	for _, role := range roles.Items {
		// Skip system roles unless requested
		if !includeSystem && isSystemRole(role.Name) {
			continue
		}

		result = append(result, models.K8sRole{
			Name:      role.Name,
			Cluster:   contextName,
			IsCluster: true,
			RuleCount: len(role.Rules),
		})
	}

	return result, nil
}

// isSystemRole checks if a role name is a system role
func isSystemRole(name string) bool {
	systemPrefixes := []string{
		"system:",
		"kubeadm:",
		"calico-",
		"cilium-",
	}
	for _, prefix := range systemPrefixes {
		if len(name) >= len(prefix) && name[:len(prefix)] == prefix {
			return true
		}
	}
	return false
}

// ListRoleBindings returns all RoleBindings in a namespace
func (m *MultiClusterClient) ListRoleBindings(ctx context.Context, contextName, namespace string) ([]models.K8sRoleBinding, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	rbs, err := client.RbacV1().RoleBindings(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []models.K8sRoleBinding
	for _, rb := range rbs.Items {
		binding := models.K8sRoleBinding{
			Name:      rb.Name,
			Namespace: rb.Namespace,
			Cluster:   contextName,
			IsCluster: false,
			RoleName:  rb.RoleRef.Name,
			RoleKind:  rb.RoleRef.Kind,
		}

		for _, subject := range rb.Subjects {
			binding.Subjects = append(binding.Subjects, struct {
				Kind      models.K8sSubjectKind `json:"kind"`
				Name      string                `json:"name"`
				Namespace string                `json:"namespace,omitempty"`
			}{
				Kind:      models.K8sSubjectKind(subject.Kind),
				Name:      subject.Name,
				Namespace: subject.Namespace,
			})
		}

		result = append(result, binding)
	}

	return result, nil
}

// ListClusterRoleBindings returns all ClusterRoleBindings
func (m *MultiClusterClient) ListClusterRoleBindings(ctx context.Context, contextName string, includeSystem bool) ([]models.K8sRoleBinding, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	crbs, err := client.RbacV1().ClusterRoleBindings().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []models.K8sRoleBinding
	for _, crb := range crbs.Items {
		// Skip system bindings unless requested
		if !includeSystem && isSystemRole(crb.Name) {
			continue
		}

		binding := models.K8sRoleBinding{
			Name:      crb.Name,
			Cluster:   contextName,
			IsCluster: true,
			RoleName:  crb.RoleRef.Name,
			RoleKind:  crb.RoleRef.Kind,
		}

		for _, subject := range crb.Subjects {
			binding.Subjects = append(binding.Subjects, struct {
				Kind      models.K8sSubjectKind `json:"kind"`
				Name      string                `json:"name"`
				Namespace string                `json:"namespace,omitempty"`
			}{
				Kind:      models.K8sSubjectKind(subject.Kind),
				Name:      subject.Name,
				Namespace: subject.Namespace,
			})
		}

		result = append(result, binding)
	}

	return result, nil
}

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

// CreateServiceAccount creates a new ServiceAccount
func (m *MultiClusterClient) CreateServiceAccount(ctx context.Context, contextName, namespace, name string) (*models.K8sServiceAccount, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	sa := &corev1.ServiceAccount{
		ObjectMeta: metav1.ObjectMeta{
			Name:      name,
			Namespace: namespace,
		},
	}

	created, err := client.CoreV1().ServiceAccounts(namespace).Create(ctx, sa, metav1.CreateOptions{})
	if err != nil {
		return nil, err
	}

	return &models.K8sServiceAccount{
		Name:      created.Name,
		Namespace: created.Namespace,
		Cluster:   contextName,
		CreatedAt: created.CreationTimestamp.Format(time.RFC3339),
	}, nil
}

// CreateRoleBinding creates a new RoleBinding
func (m *MultiClusterClient) CreateRoleBinding(ctx context.Context, req models.CreateRoleBindingRequest) error {
	client, err := m.GetClient(req.Cluster)
	if err != nil {
		return err
	}

	subject := rbacv1.Subject{
		Kind:      string(req.SubjectKind),
		Name:      req.SubjectName,
		Namespace: req.SubjectNS,
	}
	if req.SubjectKind == models.K8sSubjectServiceAccount {
		subject.APIGroup = ""
	} else {
		subject.APIGroup = "rbac.authorization.k8s.io"
	}

	if req.IsCluster {
		crb := &rbacv1.ClusterRoleBinding{
			ObjectMeta: metav1.ObjectMeta{
				Name: req.Name,
			},
			RoleRef: rbacv1.RoleRef{
				APIGroup: "rbac.authorization.k8s.io",
				Kind:     req.RoleKind,
				Name:     req.RoleName,
			},
			Subjects: []rbacv1.Subject{subject},
		}
		_, err = client.RbacV1().ClusterRoleBindings().Create(ctx, crb, metav1.CreateOptions{})
	} else {
		rb := &rbacv1.RoleBinding{
			ObjectMeta: metav1.ObjectMeta{
				Name:      req.Name,
				Namespace: req.Namespace,
			},
			RoleRef: rbacv1.RoleRef{
				APIGroup: "rbac.authorization.k8s.io",
				Kind:     req.RoleKind,
				Name:     req.RoleName,
			},
			Subjects: []rbacv1.Subject{subject},
		}
		_, err = client.RbacV1().RoleBindings(req.Namespace).Create(ctx, rb, metav1.CreateOptions{})
	}

	return err
}

// DeleteServiceAccount deletes a ServiceAccount
func (m *MultiClusterClient) DeleteServiceAccount(ctx context.Context, contextName, namespace, name string) error {
	client, err := m.GetClient(contextName)
	if err != nil {
		return err
	}

	return client.CoreV1().ServiceAccounts(namespace).Delete(ctx, name, metav1.DeleteOptions{})
}

// DeleteRoleBinding deletes a RoleBinding or ClusterRoleBinding
func (m *MultiClusterClient) DeleteRoleBinding(ctx context.Context, contextName, namespace, name string, isCluster bool) error {
	client, err := m.GetClient(contextName)
	if err != nil {
		return err
	}

	if isCluster {
		return client.RbacV1().ClusterRoleBindings().Delete(ctx, name, metav1.DeleteOptions{})
	}
	return client.RbacV1().RoleBindings(namespace).Delete(ctx, name, metav1.DeleteOptions{})
}

// GetAllClusterPermissions returns permissions for all clusters
func (m *MultiClusterClient) GetAllClusterPermissions(ctx context.Context) ([]models.ClusterPermissions, error) {
	clusters, err := m.ListClusters(ctx)
	if err != nil {
		return nil, err
	}

	var result []models.ClusterPermissions
	for _, cluster := range clusters {
		perms, err := m.GetClusterPermissions(ctx, cluster.Name)
		if err != nil {
			// Include error info in the result
			result = append(result, models.ClusterPermissions{
				Cluster: cluster.Name,
			})
			continue
		}
		result = append(result, *perms)
	}

	return result, nil
}

// CountServiceAccountsAllClusters returns total SA count across all clusters
func (m *MultiClusterClient) CountServiceAccountsAllClusters(ctx context.Context) (int, []string, error) {
	clusters, err := m.ListClusters(ctx)
	if err != nil {
		return 0, nil, err
	}

	total := 0
	var clusterNames []string
	for _, cluster := range clusters {
		sas, err := m.ListServiceAccounts(ctx, cluster.Name, "")
		if err != nil {
			continue
		}
		// Don't count system service accounts
		for _, sa := range sas {
			if sa.Namespace != "kube-system" && sa.Namespace != "kube-public" && sa.Namespace != "kube-node-lease" {
				total++
			}
		}
		clusterNames = append(clusterNames, cluster.Name)
	}

	return total, clusterNames, nil
}

// GetAllK8sUsers returns all unique users/subjects across role bindings
func (m *MultiClusterClient) GetAllK8sUsers(ctx context.Context, contextName string) ([]models.K8sUser, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	seen := make(map[string]bool)
	var users []models.K8sUser

	// From RoleBindings
	rbs, err := client.RbacV1().RoleBindings("").List(ctx, metav1.ListOptions{})
	if err == nil {
		for _, rb := range rbs.Items {
			for _, subject := range rb.Subjects {
				key := fmt.Sprintf("%s/%s/%s", subject.Kind, subject.Name, subject.Namespace)
				if !seen[key] {
					seen[key] = true
					users = append(users, models.K8sUser{
						Kind:      models.K8sSubjectKind(subject.Kind),
						Name:      subject.Name,
						Namespace: subject.Namespace,
						Cluster:   contextName,
					})
				}
			}
		}
	}

	// From ClusterRoleBindings
	crbs, err := client.RbacV1().ClusterRoleBindings().List(ctx, metav1.ListOptions{})
	if err == nil {
		for _, crb := range crbs.Items {
			for _, subject := range crb.Subjects {
				key := fmt.Sprintf("%s/%s/%s", subject.Kind, subject.Name, subject.Namespace)
				if !seen[key] {
					seen[key] = true
					users = append(users, models.K8sUser{
						Kind:      models.K8sSubjectKind(subject.Kind),
						Name:      subject.Name,
						Namespace: subject.Namespace,
						Cluster:   contextName,
					})
				}
			}
		}
	}

	return users, nil
}

// CanIResult represents the result of a permission check with details
type CanIResult struct {
	Allowed bool   `json:"allowed"`
	Reason  string `json:"reason,omitempty"`
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

// PermissionsSummary represents comprehensive permission info for a cluster
type PermissionsSummary struct {
	Cluster              string   `json:"cluster"`
	IsClusterAdmin       bool     `json:"isClusterAdmin"`
	CanListNodes         bool     `json:"canListNodes"`
	CanListNamespaces    bool     `json:"canListNamespaces"`
	CanCreateNamespaces  bool     `json:"canCreateNamespaces"`
	CanManageRBAC        bool     `json:"canManageRBAC"`
	CanViewSecrets       bool     `json:"canViewSecrets"`
	AccessibleNamespaces []string `json:"accessibleNamespaces"`
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

// listAllNamespaces returns all namespace names in a cluster
func (m *MultiClusterClient) listAllNamespaces(ctx context.Context, contextName string) ([]string, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	nsList, err := client.CoreV1().Namespaces().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var namespaces []string
	for _, ns := range nsList.Items {
		namespaces = append(namespaces, ns.Name)
	}
	return namespaces, nil
}

// getAccessibleNamespaces finds namespaces user can access when they can't list all
func (m *MultiClusterClient) getAccessibleNamespaces(ctx context.Context, contextName string) ([]string, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	// Try common namespaces
	commonNamespaces := []string{"default", "kube-system", "kube-public"}
	var accessible []string

	for _, ns := range commonNamespaces {
		// Try to get the namespace
		_, err := client.CoreV1().Namespaces().Get(ctx, ns, metav1.GetOptions{})
		if err == nil {
			// Check if user can list pods in this namespace
			canList, _ := m.CheckPermission(ctx, contextName, "list", "pods", ns)
			if canList {
				accessible = append(accessible, ns)
			}
		}
	}

	return accessible, nil
}

// GetAllPermissionsSummaries returns permission summaries for all clusters
func (m *MultiClusterClient) GetAllPermissionsSummaries(ctx context.Context) ([]PermissionsSummary, error) {
	clusters, err := m.ListClusters(ctx)
	if err != nil {
		return nil, err
	}

	var summaries []PermissionsSummary
	for _, cluster := range clusters {
		summary, err := m.GetPermissionsSummary(ctx, cluster.Name)
		if err != nil {
			// Include partial info on error
			summaries = append(summaries, PermissionsSummary{
				Cluster: cluster.Name,
			})
			continue
		}
		summaries = append(summaries, *summary)
	}

	return summaries, nil
}

// ListNamespacesWithDetails returns namespaces with details for a cluster
func (m *MultiClusterClient) ListNamespacesWithDetails(ctx context.Context, contextName string) ([]models.NamespaceDetails, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	nsList, err := client.CoreV1().Namespaces().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var namespaces []models.NamespaceDetails
	for _, ns := range nsList.Items {
		namespaces = append(namespaces, models.NamespaceDetails{
			Name:      ns.Name,
			Cluster:   contextName,
			Status:    string(ns.Status.Phase),
			Labels:    ns.Labels,
			CreatedAt: ns.CreationTimestamp.Format(time.RFC3339),
		})
	}
	return namespaces, nil
}

// CreateNamespace creates a new namespace in a cluster
func (m *MultiClusterClient) CreateNamespace(ctx context.Context, contextName, name string, labels map[string]string) (*models.NamespaceDetails, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	ns := &corev1.Namespace{
		ObjectMeta: metav1.ObjectMeta{
			Name:   name,
			Labels: labels,
		},
	}

	created, err := client.CoreV1().Namespaces().Create(ctx, ns, metav1.CreateOptions{})
	if err != nil {
		return nil, err
	}

	return &models.NamespaceDetails{
		Name:      created.Name,
		Cluster:   contextName,
		Status:    string(created.Status.Phase),
		Labels:    created.Labels,
		CreatedAt: created.CreationTimestamp.Format(time.RFC3339),
	}, nil
}

// DeleteNamespace deletes a namespace from a cluster
func (m *MultiClusterClient) DeleteNamespace(ctx context.Context, contextName, name string) error {
	client, err := m.GetClient(contextName)
	if err != nil {
		return err
	}

	return client.CoreV1().Namespaces().Delete(ctx, name, metav1.DeleteOptions{})
}

// GrantNamespaceAccess creates a RoleBinding to grant access to a namespace
func (m *MultiClusterClient) GrantNamespaceAccess(ctx context.Context, contextName, namespace string, req models.GrantNamespaceAccessRequest) (string, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return "", err
	}

	// Determine the ClusterRole to bind based on the role requested
	roleName := req.Role
	if roleName == "admin" {
		roleName = "admin" // built-in ClusterRole
	} else if roleName == "edit" {
		roleName = "edit" // built-in ClusterRole
	} else if roleName == "view" {
		roleName = "view" // built-in ClusterRole
	}
	// Otherwise, use the role name as-is (custom role)

	// Generate binding name
	bindingName := fmt.Sprintf("%s-%s-%s", req.SubjectName, roleName, namespace)
	// Sanitize the binding name (remove special characters)
	bindingName = sanitizeK8sName(bindingName)

	subject := rbacv1.Subject{
		Kind: req.SubjectKind,
		Name: req.SubjectName,
	}

	if req.SubjectKind == "ServiceAccount" {
		subject.Namespace = req.SubjectNS
		subject.APIGroup = ""
	} else {
		subject.APIGroup = "rbac.authorization.k8s.io"
	}

	rb := &rbacv1.RoleBinding{
		ObjectMeta: metav1.ObjectMeta{
			Name:      bindingName,
			Namespace: namespace,
		},
		RoleRef: rbacv1.RoleRef{
			APIGroup: "rbac.authorization.k8s.io",
			Kind:     "ClusterRole",
			Name:     roleName,
		},
		Subjects: []rbacv1.Subject{subject},
	}

	_, err = client.RbacV1().RoleBindings(namespace).Create(ctx, rb, metav1.CreateOptions{})
	if err != nil {
		return "", err
	}

	return bindingName, nil
}

// sanitizeK8sName ensures a name is valid for Kubernetes
func sanitizeK8sName(name string) string {
	// Replace @ and other invalid characters with -
	result := ""
	for _, c := range name {
		if (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-' || c == '.' {
			result += string(c)
		} else if c >= 'A' && c <= 'Z' {
			result += string(c + 32) // lowercase
		} else {
			result += "-"
		}
	}
	// Ensure it starts with alphanumeric
	if len(result) > 0 && (result[0] == '-' || result[0] == '.') {
		result = "x" + result
	}
	// Truncate to max length
	if len(result) > 63 {
		result = result[:63]
	}
	// Ensure it ends with alphanumeric
	for len(result) > 0 && (result[len(result)-1] == '-' || result[len(result)-1] == '.') {
		result = result[:len(result)-1]
	}
	return result
}
