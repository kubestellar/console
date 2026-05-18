package k8s

import (
	"context"
	"fmt"
	"strings"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func (m *MultiClusterClient) resolveRBACForSA(
	ctx context.Context, cluster, namespace, saName string,
) ([]Dependency, []string) {
	var deps []Dependency
	var warnings []string

	dynClient, err := m.GetDynamicClient(cluster)
	if err != nil {
		warnings = append(warnings, fmt.Sprintf("Cannot resolve RBAC: %v", err))
		return deps, warnings
	}

	rbCacheKey := fmt.Sprintf("%s/%s/%s", cluster, "rolebindings", namespace)
	rbItems, cached := globalRBACCache.get(rbCacheKey)
	if !cached {
		rbList, listErr := dynClient.Resource(gvrRoleBindings).Namespace(namespace).List(ctx, metav1.ListOptions{})
		if listErr == nil {
			rbItems = rbList.Items
			globalRBACCache.set(rbCacheKey, rbItems)
		}
	}
	for _, rb := range rbItems {
		if !bindingReferencesSA(rb.Object, saName, namespace) {
			continue
		}

		deps = append(deps, Dependency{
			Kind:      DepRoleBinding,
			Name:      rb.GetName(),
			Namespace: namespace,
			GVR:       gvrRoleBindings,
			Order:     depApplyOrder[DepRoleBinding],
		})

		roleName := getRoleRefName(rb.Object)
		roleKind := getRoleRefKind(rb.Object)
		if roleName != "" && roleKind == "Role" {
			deps = append(deps, Dependency{
				Kind:      DepRole,
				Name:      roleName,
				Namespace: namespace,
				GVR:       gvrRoles,
				Order:     depApplyOrder[DepRole],
			})
		}
	}

	crbCacheKey := fmt.Sprintf("%s/%s", cluster, "clusterrolebindings")
	crbItems, cached := globalRBACCache.get(crbCacheKey)
	if !cached {
		crbList, listErr := dynClient.Resource(gvrClusterRoleBindings).List(ctx, metav1.ListOptions{})
		if listErr == nil {
			crbItems = crbList.Items
			globalRBACCache.set(crbCacheKey, crbItems)
		}
	}
	for _, crb := range crbItems {
		if !bindingReferencesSA(crb.Object, saName, namespace) {
			continue
		}

		deps = append(deps, Dependency{
			Kind:  DepClusterRoleBinding,
			Name:  crb.GetName(),
			GVR:   gvrClusterRoleBindings,
			Order: depApplyOrder[DepClusterRoleBinding],
		})

		roleName := getRoleRefName(crb.Object)
		if roleName != "" && !isSystemClusterRole(roleName) {
			deps = append(deps, Dependency{
				Kind:  DepClusterRole,
				Name:  roleName,
				GVR:   gvrClusterRoles,
				Order: depApplyOrder[DepClusterRole],
			})
		}
	}

	return deps, warnings
}

func bindingReferencesSA(obj map[string]interface{}, saName, namespace string) bool {
	subjects, ok := obj["subjects"].([]interface{})
	if !ok {
		return false
	}

	for _, s := range subjects {
		subject, ok := s.(map[string]interface{})
		if !ok {
			continue
		}

		kind, _ := subject["kind"].(string)
		name, _ := subject["name"].(string)
		ns, _ := subject["namespace"].(string)
		if kind == "ServiceAccount" && name == saName && (ns == namespace || ns == "") {
			return true
		}
	}

	return false
}

func getRoleRefName(obj map[string]interface{}) string {
	roleRef, ok := obj["roleRef"].(map[string]interface{})
	if !ok {
		return ""
	}
	name, _ := roleRef["name"].(string)
	return name
}

func getRoleRefKind(obj map[string]interface{}) string {
	roleRef, ok := obj["roleRef"].(map[string]interface{})
	if !ok {
		return ""
	}
	kind, _ := roleRef["kind"].(string)
	return kind
}

func isSystemClusterRole(name string) bool {
	systemPrefixes := []string{
		"system:", "admin", "cluster-admin", "edit", "view",
		"kubeadm:", "calico", "flannel", "kindnet",
	}
	for _, prefix := range systemPrefixes {
		if strings.HasPrefix(name, prefix) || name == prefix {
			return true
		}
	}
	return false
}
