package v1alpha1

import (
	"testing"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

// Error-path tests for the six ToUnstructured / FromUnstructured helpers in
// console_types.go. The happy paths are covered by the round-trip tests in
// console_types_test.go; these tests target the two error branches in each
// helper (json.Marshal failure and json.Unmarshal failure) so a regression
// that swallows one of them cannot slip past the ratchet.
//
// - Marshal-fail case: seed the Unstructured.Object with a channel value.
//   encoding/json refuses to marshal chan / func values, so json.Marshal
//   returns an error at the first line of each FromUnstructured helper.
// - Unmarshal-fail case: seed Unstructured.Object with metadata as a plain
//   string. Marshal succeeds, but Unmarshal into the typed struct fails
//   because ObjectMeta cannot decode from a JSON string.

func unstructuredWithMarshalFailure() *unstructured.Unstructured {
	return &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "console.kubestellar.io/v1alpha1",
			"badField":   make(chan int),
		},
	}
}

func unstructuredWithBadMetadata(kind string) *unstructured.Unstructured {
	return &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "console.kubestellar.io/v1alpha1",
			"kind":       kind,
			"metadata":   "not-an-object",
		},
	}
}

func TestManagedWorkloadFromUnstructured_MarshalError(t *testing.T) {
	if _, err := ManagedWorkloadFromUnstructured(unstructuredWithMarshalFailure()); err == nil {
		t.Fatal("expected marshal error when Object contains a channel value, got nil")
	}
}

func TestManagedWorkloadFromUnstructured_UnmarshalError(t *testing.T) {
	if _, err := ManagedWorkloadFromUnstructured(unstructuredWithBadMetadata("ManagedWorkload")); err == nil {
		t.Fatal("expected unmarshal error when metadata is a string, got nil")
	}
}

func TestClusterGroupFromUnstructured_MarshalError(t *testing.T) {
	if _, err := ClusterGroupFromUnstructured(unstructuredWithMarshalFailure()); err == nil {
		t.Fatal("expected marshal error when Object contains a channel value, got nil")
	}
}

func TestClusterGroupFromUnstructured_UnmarshalError(t *testing.T) {
	if _, err := ClusterGroupFromUnstructured(unstructuredWithBadMetadata("ClusterGroup")); err == nil {
		t.Fatal("expected unmarshal error when metadata is a string, got nil")
	}
}

func TestWorkloadDeploymentFromUnstructured_MarshalError(t *testing.T) {
	if _, err := WorkloadDeploymentFromUnstructured(unstructuredWithMarshalFailure()); err == nil {
		t.Fatal("expected marshal error when Object contains a channel value, got nil")
	}
}

func TestWorkloadDeploymentFromUnstructured_UnmarshalError(t *testing.T) {
	if _, err := WorkloadDeploymentFromUnstructured(unstructuredWithBadMetadata("WorkloadDeployment")); err == nil {
		t.Fatal("expected unmarshal error when metadata is a string, got nil")
	}
}
