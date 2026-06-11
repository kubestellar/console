package k8s

import (
	"context"
	"time"

	"github.com/kubestellar/console/pkg/models"
	corev1 "k8s.io/api/core/v1"
	rbacv1 "k8s.io/api/rbac/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
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

	// Pre-fetch all bindings once to avoid N+1 queries per SA
	saRolesMap := m.buildServiceAccountRolesMap(ctx, client, namespace)

	var result []models.K8sServiceAccount
	for _, sa := range sas.Items {
		var secrets []string
		for _, s := range sa.Secrets {
			secrets = append(secrets, s.Name)
		}

		key := sa.Namespace + "/" + sa.Name
		roles := saRolesMap[key]

		// Leave CreatedAt nil when CreationTimestamp is zero so the JSON
		// `omitempty` tag drops the field instead of emitting
		// "0001-01-01T00:00:00Z" (fake clientset, partial metadata). See #6764.
		var saCreatedAtPtr *time.Time
		if !sa.CreationTimestamp.Time.IsZero() {
			saCreatedAt := sa.CreationTimestamp.Time
			saCreatedAtPtr = &saCreatedAt
		}
		result = append(result, models.K8sServiceAccount{
			Name:      sa.Name,
			Namespace: sa.Namespace,
			Cluster:   contextName,
			Secrets:   secrets,
			Roles:     roles,
			CreatedAt: saCreatedAtPtr,
		})
	}

	return result, nil
}

// buildServiceAccountRolesMap fetches RoleBindings and ClusterRoleBindings once,
// then builds a map of "namespace/name" -> []role for all service account subjects.
func (m *MultiClusterClient) buildServiceAccountRolesMap(ctx context.Context, client kubernetes.Interface, namespace string) map[string][]string {
	result := make(map[string][]string)

	// Check RoleBindings in the namespace
	rbs, err := client.RbacV1().RoleBindings(namespace).List(ctx, metav1.ListOptions{})
	if err == nil {
		for _, rb := range rbs.Items {
			for _, subject := range rb.Subjects {
				if subject.Kind == "ServiceAccount" {
					ns := subject.Namespace
					if ns == "" {
						ns = rb.Namespace
					}
					key := ns + "/" + subject.Name
					result[key] = append(result[key], rb.RoleRef.Name)
				}
			}
		}
	}

	// Check ClusterRoleBindings
	crbs, err := client.RbacV1().ClusterRoleBindings().List(ctx, metav1.ListOptions{})
	if err == nil {
		for _, crb := range crbs.Items {
			for _, subject := range crb.Subjects {
				if subject.Kind == "ServiceAccount" {
					ns := subject.Namespace
					key := ns + "/" + subject.Name
					result[key] = append(result[key], crb.RoleRef.Name+" (cluster)")
				}
			}
		}
	}

	return result
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

	// Leave CreatedAt nil when CreationTimestamp is zero so the JSON
	// `omitempty` tag drops the field instead of emitting
	// "0001-01-01T00:00:00Z" (fake clientset, partial metadata). See #6764.
	var createdAtPtr *time.Time
	if !created.CreationTimestamp.Time.IsZero() {
		createdAt := created.CreationTimestamp.Time
		createdAtPtr = &createdAt
	}
	return &models.K8sServiceAccount{
		Name:      created.Name,
		Namespace: created.Namespace,
		Cluster:   contextName,
		CreatedAt: createdAtPtr,
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
