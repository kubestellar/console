package k8s

import (
	"context"
	"fmt"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

func (m *MultiClusterClient) findMatchingServices(
	ctx context.Context, cluster, namespace string, podLabels map[string]string,
) ([]Dependency, []string) {
	var deps []Dependency
	var warnings []string

	dynClient, err := m.GetDynamicClient(cluster)
	if err != nil {
		warnings = append(warnings, fmt.Sprintf("Cannot resolve Services: %v", err))
		return deps, warnings
	}

	svcList, err := dynClient.Resource(gvrServices).Namespace(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return deps, warnings
	}

	for _, svc := range svcList.Items {
		selector, _, _ := unstructured.NestedStringMap(svc.Object, "spec", "selector")
		if len(selector) == 0 {
			continue
		}
		if labelsMatch(selector, podLabels) {
			deps = append(deps, Dependency{
				Kind:      DepService,
				Name:      svc.GetName(),
				Namespace: namespace,
				GVR:       gvrServices,
				Order:     depApplyOrder[DepService],
			})
		}
	}

	return deps, warnings
}

func (m *MultiClusterClient) findMatchingIngresses(
	ctx context.Context, cluster, namespace string, serviceNames []string,
) []Dependency {
	var deps []Dependency

	dynClient, err := m.GetDynamicClient(cluster)
	if err != nil {
		return deps
	}

	svcSet := make(map[string]bool, len(serviceNames))
	for _, name := range serviceNames {
		svcSet[name] = true
	}

	ingList, err := dynClient.Resource(gvrIngresses).Namespace(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return deps
	}

	for _, ing := range ingList.Items {
		if ingressReferencesServices(ing.Object, svcSet) {
			deps = append(deps, Dependency{
				Kind:      DepIngress,
				Name:      ing.GetName(),
				Namespace: namespace,
				GVR:       gvrIngresses,
				Order:     depApplyOrder[DepIngress],
			})
		}
	}

	return deps
}

func ingressReferencesServices(obj map[string]interface{}, svcSet map[string]bool) bool {
	spec, ok := obj["spec"].(map[string]interface{})
	if !ok {
		return false
	}

	if db, ok := spec["defaultBackend"].(map[string]interface{}); ok {
		if svc, ok := db["service"].(map[string]interface{}); ok {
			if name, _ := svc["name"].(string); svcSet[name] {
				return true
			}
		}
	}

	for _, r := range getSlice(spec, "rules") {
		rule, ok := r.(map[string]interface{})
		if !ok {
			continue
		}
		httpRule, ok := rule["http"].(map[string]interface{})
		if !ok {
			continue
		}
		for _, p := range getSlice(httpRule, "paths") {
			path, ok := p.(map[string]interface{})
			if !ok {
				continue
			}
			backend, ok := path["backend"].(map[string]interface{})
			if !ok {
				continue
			}
			svc, ok := backend["service"].(map[string]interface{})
			if !ok {
				continue
			}
			if name, _ := svc["name"].(string); svcSet[name] {
				return true
			}
		}
	}

	return false
}

func (m *MultiClusterClient) findMatchingNetworkPolicies(
	ctx context.Context, cluster, namespace string, podLabels map[string]string,
) []Dependency {
	var deps []Dependency

	dynClient, err := m.GetDynamicClient(cluster)
	if err != nil {
		return deps
	}

	npList, err := dynClient.Resource(gvrNetworkPolicies).Namespace(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return deps
	}

	for _, np := range npList.Items {
		selector, _, _ := unstructured.NestedStringMap(np.Object, "spec", "podSelector", "matchLabels")
		if len(selector) == 0 {
			continue
		}
		if labelsMatch(selector, podLabels) {
			deps = append(deps, Dependency{
				Kind:      DepNetworkPolicy,
				Name:      np.GetName(),
				Namespace: namespace,
				GVR:       gvrNetworkPolicies,
				Order:     depApplyOrder[DepNetworkPolicy],
			})
		}
	}

	return deps
}

func labelsMatch(selector, target map[string]string) bool {
	for k, v := range selector {
		if target[k] != v {
			return false
		}
	}
	return true
}
