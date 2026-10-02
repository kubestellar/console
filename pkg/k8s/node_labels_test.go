package k8s

import (
	"context"
	"testing"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic/fake"
	"k8s.io/client-go/tools/clientcmd/api"
)

func TestNodeLabels_AddAndRemove(t *testing.T) {
	scheme := runtime.NewScheme()
	gvrMap := map[schema.GroupVersionResource]string{
		{Group: "", Version: "v1", Resource: "nodes"}: "NodeList",
	}

	nodeObj := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "v1",
			"kind":       "Node",
			"metadata": map[string]interface{}{
				"name": "node1",
				"labels": map[string]interface{}{
					"existing-label": "keep-me",
					"remove-me":      "bye",
				},
			},
		},
	}

	fakeDyn := fake.NewSimpleDynamicClientWithCustomListKinds(scheme, gvrMap, nodeObj)

	m, _ := NewMultiClusterClient("")
	m.dynamicClients["c1"] = fakeDyn
	m.rawConfig = &api.Config{Contexts: map[string]*api.Context{"c1": {Cluster: "cluster1"}}}

	gvrNodes := schema.GroupVersionResource{Version: "v1", Resource: "nodes"}

	// Phase 1: Add new labels
	err := m.LabelClusterNodes(context.Background(), "c1", map[string]string{
		"new-label": "added",
		"role":      "worker",
	})
	if err != nil {
		t.Fatalf("LabelClusterNodes failed: %v", err)
	}

	// Verify labels after add
	updatedNode, err := fakeDyn.Resource(gvrNodes).Get(context.Background(), "node1", metav1.GetOptions{})
	if err != nil {
		t.Fatalf("Failed to get node after labeling: %v", err)
	}
	labels, _, _ := unstructured.NestedStringMap(updatedNode.Object, "metadata", "labels")

	// Existing label preserved
	if labels["existing-label"] != "keep-me" {
		t.Errorf("Existing label lost: expected keep-me, got %s", labels["existing-label"])
	}
	// New label present
	if labels["new-label"] != "added" {
		t.Errorf("New label missing: expected added, got %s", labels["new-label"])
	}
	if labels["role"] != "worker" {
		t.Errorf("Role label missing: expected worker, got %s", labels["role"])
	}
	// Old label still present
	if labels["remove-me"] != "bye" {
		t.Errorf("remove-me label should still be present: got %s", labels["remove-me"])
	}

	// Phase 2: Remove specific labels
	err = m.RemoveClusterNodeLabels(context.Background(), "c1", []string{"remove-me"})
	if err != nil {
		t.Fatalf("RemoveClusterNodeLabels failed: %v", err)
	}

	// Verify labels after remove
	updatedNode, err = fakeDyn.Resource(gvrNodes).Get(context.Background(), "node1", metav1.GetOptions{})
	if err != nil {
		t.Fatalf("Failed to get node after remove: %v", err)
	}
	labels, _, _ = unstructured.NestedStringMap(updatedNode.Object, "metadata", "labels")

	// Removed label gone
	if _, exists := labels["remove-me"]; exists {
		t.Error("Label 'remove-me' should have been removed")
	}
	// Other labels preserved
	if labels["existing-label"] != "keep-me" {
		t.Errorf("Existing label should be preserved: got %s", labels["existing-label"])
	}
	if labels["new-label"] != "added" {
		t.Errorf("New label should be preserved: got %s", labels["new-label"])
	}
	if labels["role"] != "worker" {
		t.Errorf("Role label should be preserved: got %s", labels["role"])
	}
}
