package k8s

import (
	"testing"

	"github.com/kubestellar/console/pkg/api/v1alpha1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

// TestParseStatefulSetsZeroReplicasIsRunning asserts the status-mapping fix
// from #6495: a StatefulSet intentionally scaled to zero should be reported
// as Running (idle), not Pending. Previously `readyReplicas == replicas &&
// replicas > 0` never matched 0/0 and the default Pending case fired.
func TestParseStatefulSetsZeroReplicasIsRunning(t *testing.T) {
	m := &MultiClusterClient{}

	zeroReplicaItem := unstructured.Unstructured{Object: map[string]interface{}{
		"metadata": map[string]interface{}{
			"name":      "idle-sts",
			"namespace": "default",
		},
		"spec": map[string]interface{}{
			"replicas": int64(0),
		},
		"status": map[string]interface{}{
			"readyReplicas": int64(0),
		},
	}}

	list := &unstructured.UnstructuredList{Items: []unstructured.Unstructured{zeroReplicaItem}}

	got := m.parseStatefulSetsAsWorkloads(list, "test-cluster")
	if len(got) != 1 {
		t.Fatalf("expected 1 workload, got %d", len(got))
	}
	if got[0].Status != v1alpha1.WorkloadStatusRunning {
		t.Errorf("expected zero-replica StatefulSet to report Running, got %q (#6495 regression)", got[0].Status)
	}
}

// TestParseStatefulSetsFullyReadyIsRunning guards against regression in the
// common path: ready==replicas>0 must still map to Running.
func TestParseStatefulSetsFullyReadyIsRunning(t *testing.T) {
	m := &MultiClusterClient{}

	item := unstructured.Unstructured{Object: map[string]interface{}{
		"metadata": map[string]interface{}{
			"name":      "busy-sts",
			"namespace": "default",
		},
		"spec": map[string]interface{}{
			"replicas": int64(3),
		},
		"status": map[string]interface{}{
			"readyReplicas": int64(3),
		},
	}}

	got := m.parseStatefulSetsAsWorkloads(&unstructured.UnstructuredList{Items: []unstructured.Unstructured{item}}, "c")
	if len(got) != 1 || got[0].Status != v1alpha1.WorkloadStatusRunning {
		t.Fatalf("expected Running, got %+v", got)
	}
}

// TestParseStatefulSetsPartialReadyIsDegraded guards the Degraded path.
func TestParseStatefulSetsPartialReadyIsDegraded(t *testing.T) {
	m := &MultiClusterClient{}

	item := unstructured.Unstructured{Object: map[string]interface{}{
		"metadata": map[string]interface{}{
			"name":      "half-sts",
			"namespace": "default",
		},
		"spec": map[string]interface{}{
			"replicas": int64(3),
		},
		"status": map[string]interface{}{
			"readyReplicas": int64(1),
		},
	}}

	got := m.parseStatefulSetsAsWorkloads(&unstructured.UnstructuredList{Items: []unstructured.Unstructured{item}}, "c")
	if len(got) != 1 || got[0].Status != v1alpha1.WorkloadStatusDegraded {
		t.Fatalf("expected Degraded, got %+v", got)
	}
}
