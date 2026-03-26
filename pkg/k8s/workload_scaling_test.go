package k8s

import (
	"context"
	"testing"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic/fake"
	"k8s.io/client-go/kubernetes"
	k8sfake "k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/tools/clientcmd/api"
)

func TestScaleWorkload(t *testing.T) {
	deployObj := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "apps/v1",
			"kind":       "Deployment",
			"metadata": map[string]interface{}{
				"name":      "dep1",
				"namespace": "default",
			},
			"spec": map[string]interface{}{
				"replicas": int64(1),
			},
		},
	}

	scheme := runtime.NewScheme()
	gvrMap := map[schema.GroupVersionResource]string{
		{Group: "apps", Version: "v1", Resource: "deployments"}: "DeploymentList",
	}

	fakeDyn := fake.NewSimpleDynamicClientWithCustomListKinds(scheme, gvrMap, deployObj)

	m, _ := NewMultiClusterClient("")
	m.dynamicClients["c1"] = fakeDyn
	m.rawConfig = &api.Config{Contexts: map[string]*api.Context{"c1": {Cluster: "cluster1"}}}

	resp, err := m.ScaleWorkload(context.Background(), "default", "dep1", []string{"c1"}, 5)
	if err != nil {
		t.Fatalf("ScaleWorkload failed: %v", err)
	}
	if !resp.Success {
		t.Error("Expected success")
	}

	// Verify that spec.replicas was actually updated to 5
	updated, err := fakeDyn.Resource(schema.GroupVersionResource{
		Group: "apps", Version: "v1", Resource: "deployments",
	}).Namespace("default").Get(context.Background(), "dep1", metav1.GetOptions{})
	if err != nil {
		t.Fatalf("Failed to get deployment after scaling: %v", err)
	}
	replicas, found, err := unstructured.NestedInt64(updated.Object, "spec", "replicas")
	if err != nil || !found {
		t.Fatal("spec.replicas not found in updated deployment")
	}
	if replicas != 5 {
		t.Errorf("Expected spec.replicas=5 after scaling, got %d", replicas)
	}
}

func TestDeleteWorkload(t *testing.T) {
	scheme := runtime.NewScheme()
	gvrMap := map[schema.GroupVersionResource]string{
		{Group: "apps", Version: "v1", Resource: "deployments"}: "DeploymentList",
	}

	fakeDyn := fake.NewSimpleDynamicClientWithCustomListKinds(scheme, gvrMap)

	m, _ := NewMultiClusterClient("")
	m.dynamicClients["c1"] = fakeDyn
	m.rawConfig = &api.Config{Contexts: map[string]*api.Context{"c1": {Cluster: "cluster1"}}}

	err := m.DeleteWorkload(context.Background(), "c1", "default", "dep1")
	if err != nil {
		t.Errorf("DeleteWorkload failed: %v", err)
	}
}

func TestGetClusterCapabilities(t *testing.T) {
	m, _ := NewMultiClusterClient("")

	node1 := &corev1.Node{
		ObjectMeta: metav1.ObjectMeta{
			Name: "node1",
			Labels: map[string]string{
				"nvidia.com/gpu.product": "Tesla-A100",
			},
		},
		Status: corev1.NodeStatus{
			Capacity: corev1.ResourceList{
				corev1.ResourceCPU:    resource.MustParse("16"),
				corev1.ResourceMemory: resource.MustParse("64Gi"),
			},
			Allocatable: corev1.ResourceList{
				"nvidia.com/gpu": resource.MustParse("2"),
			},
		},
	}
	node2 := &corev1.Node{
		ObjectMeta: metav1.ObjectMeta{
			Name: "node2",
		},
		Status: corev1.NodeStatus{
			Capacity: corev1.ResourceList{
				corev1.ResourceCPU:    resource.MustParse("8"),
				corev1.ResourceMemory: resource.MustParse("32Gi"),
			},
		},
	}

	fakeClient := k8sfake.NewSimpleClientset(node1, node2)
	m.clients = map[string]kubernetes.Interface{
		"c1": fakeClient,
	}
	m.rawConfig = &api.Config{Contexts: map[string]*api.Context{"c1": {Cluster: "cl1"}}}

	caps, err := m.GetClusterCapabilities(context.Background())
	if err != nil {
		t.Fatalf("GetClusterCapabilities failed: %v", err)
	}
	if caps == nil {
		t.Fatal("Expected capabilities")
	}
	if len(caps.Items) != 1 {
		t.Fatalf("Expected 1 capability item, got %d", len(caps.Items))
	}

	cap := caps.Items[0]
	if cap.NodeCount != 2 {
		t.Errorf("Expected 2 nodes, got %d", cap.NodeCount)
	}
	if cap.GPUCount != 2 {
		t.Errorf("Expected 2 GPUs, got %d", cap.GPUCount)
	}
	if cap.GPUType != "Tesla-A100" {
		t.Errorf("Expected GPU type Tesla-A100, got %s", cap.GPUType)
	}
	// CPU capacity comes from first node
	if cap.CPUCapacity != "16" {
		t.Errorf("Expected CPUCapacity=16, got %s", cap.CPUCapacity)
	}
	// Memory capacity comes from first node
	if cap.MemCapacity != "64Gi" {
		t.Errorf("Expected MemCapacity=64Gi, got %s", cap.MemCapacity)
	}
}

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

func TestListBindingPolicies(t *testing.T) {
	m, _ := NewMultiClusterClient("")
	bp, err := m.ListBindingPolicies(context.Background())
	if err != nil {
		t.Fatalf("ListBindingPolicies failed: %v", err)
	}
	if bp == nil {
		t.Fatal("Expected binding policies")
	}
	if len(bp.Items) != 0 {
		t.Error("Expected empty items")
	}
}
