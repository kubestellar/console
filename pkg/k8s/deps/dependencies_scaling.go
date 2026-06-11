package k8s

import (
	"context"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

func (m *MultiClusterClient) findMatchingHPAs(
	ctx context.Context, cluster, namespace string, workloadObj *unstructured.Unstructured,
) []Dependency {
	var deps []Dependency

	dynClient, err := m.GetDynamicClient(cluster)
	if err != nil {
		return deps
	}

	workloadName := workloadObj.GetName()
	workloadKind := workloadObj.GetKind()

	hpaList, err := dynClient.Resource(gvrHPAs).Namespace(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		gvrHPAv1 := schema.GroupVersionResource{Group: "autoscaling", Version: "v1", Resource: "horizontalpodautoscalers"}
		hpaList, err = dynClient.Resource(gvrHPAv1).Namespace(namespace).List(ctx, metav1.ListOptions{})
		if err != nil {
			return deps
		}
	}

	for _, hpa := range hpaList.Items {
		targetKind, _, _ := unstructured.NestedString(hpa.Object, "spec", "scaleTargetRef", "kind")
		targetName, _, _ := unstructured.NestedString(hpa.Object, "spec", "scaleTargetRef", "name")
		if targetName == workloadName && targetKind == workloadKind {
			deps = append(deps, Dependency{
				Kind:      DepHPA,
				Name:      hpa.GetName(),
				Namespace: namespace,
				GVR:       gvrHPAs,
				Order:     depApplyOrder[DepHPA],
			})
		}
	}

	return deps
}

func (m *MultiClusterClient) findMatchingPDBs(
	ctx context.Context, cluster, namespace string, podLabels map[string]string,
) []Dependency {
	var deps []Dependency

	dynClient, err := m.GetDynamicClient(cluster)
	if err != nil {
		return deps
	}

	pdbList, err := dynClient.Resource(gvrPDBs).Namespace(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return deps
	}

	for _, pdb := range pdbList.Items {
		selector, _, _ := unstructured.NestedStringMap(pdb.Object, "spec", "selector", "matchLabels")
		if len(selector) == 0 {
			continue
		}
		if labelsMatch(selector, podLabels) {
			deps = append(deps, Dependency{
				Kind:      DepPDB,
				Name:      pdb.GetName(),
				Namespace: namespace,
				GVR:       gvrPDBs,
				Order:     depApplyOrder[DepPDB],
			})
		}
	}

	return deps
}
