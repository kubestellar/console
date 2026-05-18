package k8s

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"

	"github.com/kubestellar/console/pkg/models"
	corev1 "k8s.io/api/core/v1"
	rbacv1 "k8s.io/api/rbac/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

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

// getAccessibleNamespaces finds namespaces user can access when they can't
// list all. Previously hard-coded to {default, kube-system, kube-public}
// which left users scoped to an application namespace with an empty
// Permissions panel (#6512). Now driven by buildProbeNamespaces which
// honors the user's claimed namespace, KC_PROBE_NAMESPACES env var, and a
// broader default list.
func (m *MultiClusterClient) getAccessibleNamespaces(ctx context.Context, contextName string) ([]string, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	probeNamespaces := buildProbeNamespaces(userNamespaceFromContext(ctx))
	var accessible []string

	for _, ns := range probeNamespaces {
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
			CreatedAt: ns.CreationTimestamp.Time,
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
		CreatedAt: created.CreationTimestamp.Time,
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

	// Generate binding name with a hash suffix to avoid collisions after sanitization (#7608).
	// Different inputs (e.g. "admin@foo.com" vs "admin-foo-com") can normalize to the same
	// sanitized string, so we append a short hash of the raw components.
	rawBindingKey := fmt.Sprintf("%s-%s-%s", req.SubjectName, roleName, namespace)
	const hashSuffixLen = 8  // Length of the hex hash suffix appended to binding names
	const k8sNameMaxLen = 63 // Maximum length of a Kubernetes resource name
	hash := sha256.Sum256([]byte(rawBindingKey))
	hashSuffix := hex.EncodeToString(hash[:])[:hashSuffixLen]
	sanitized := sanitizeK8sName(rawBindingKey)
	// Leave room for "-" separator + hash suffix so the final name stays within k8sNameMaxLen
	hashSuffixTotalLen := 1 + hashSuffixLen // dash separator + hex hash
	maxBaseLen := k8sNameMaxLen - hashSuffixTotalLen
	if len(sanitized) > maxBaseLen {
		sanitized = sanitized[:maxBaseLen]
		// Trim trailing dashes/dots left by truncation
		for len(sanitized) > 0 && (sanitized[len(sanitized)-1] == '-' || sanitized[len(sanitized)-1] == '.') {
			sanitized = sanitized[:len(sanitized)-1]
		}
	}
	bindingName := sanitized + "-" + hashSuffix

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
