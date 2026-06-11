package k8s

import (
	"context"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

func (m *MultiClusterClient) findRelatedCRDs(
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

	crdList, err := dynClient.Resource(gvrCRDs).List(ctx, metav1.ListOptions{})
	if err != nil {
		return deps
	}

	for _, crd := range crdList.Items {
		svcName, _, _ := unstructured.NestedString(
			crd.Object,
			"spec", "conversion", "webhook", "clientConfig", "service", "name",
		)
		svcNamespace, _, _ := unstructured.NestedString(
			crd.Object,
			"spec", "conversion", "webhook", "clientConfig", "service", "namespace",
		)
		if svcName != "" && svcSet[svcName] && svcNamespace == namespace {
			deps = append(deps, Dependency{
				Kind:  DepCRD,
				Name:  crd.GetName(),
				GVR:   gvrCRDs,
				Order: depApplyOrder[DepCRD],
			})
		}
	}

	return deps
}

func (m *MultiClusterClient) findMatchingWebhookConfigs(
	ctx context.Context, cluster, namespace string, serviceNames []string, mutating bool,
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

	gvr := gvrValidatingWebhooks
	kind := DepValidatingWebhook
	if mutating {
		gvr = gvrMutatingWebhooks
		kind = DepMutatingWebhook
	}

	whList, err := dynClient.Resource(gvr).List(ctx, metav1.ListOptions{})
	if err != nil {
		return deps
	}

	for _, wh := range whList.Items {
		for _, w := range getSlice(wh.Object, "webhooks") {
			webhook, ok := w.(map[string]interface{})
			if !ok {
				continue
			}
			clientConfig, ok := webhook["clientConfig"].(map[string]interface{})
			if !ok {
				continue
			}
			svc, ok := clientConfig["service"].(map[string]interface{})
			if !ok {
				continue
			}
			svcName, _ := svc["name"].(string)
			svcNamespace, _ := svc["namespace"].(string)
			if svcName != "" && svcSet[svcName] && svcNamespace == namespace {
				deps = append(deps, Dependency{
					Kind:  kind,
					Name:  wh.GetName(),
					GVR:   gvr,
					Order: depApplyOrder[kind],
				})
				break
			}
		}
	}

	return deps
}
