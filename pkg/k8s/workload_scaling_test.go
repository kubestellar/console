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

	err := m.DeleteWorkload(context.Background(), "c1", "default", "dep1")
	if err != nil {
		t.Errorf("DeleteWorkload failed: %v", err)
	}
}

