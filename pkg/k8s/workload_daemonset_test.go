package k8s

import (
	"testing"
	"time"

	"github.com/kubestellar/console/pkg/apis/v1alpha1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

// TestParseDaemonSetsAsWorkloads_FullyReadyIsRunning covers the common path:
// numberReady == desiredNumberScheduled > 0 must map to Running, and the
// basic metadata/labels/TargetClusters/Deployments fields parseDaemonSetsAsWorkloads
// populates must round-trip from the unstructured object.
func TestParseDaemonSetsAsWorkloads_FullyReadyIsRunning(t *testing.T) {
	m := &MultiClusterClient{}
	created := time.Now().Add(-time.Hour).UTC().Truncate(time.Second)

	item := unstructured.Unstructured{Object: map[string]interface{}{
		"metadata": map[string]interface{}{
			"name":              "fluentd",
			"namespace":         "monitoring",
			"labels":            map[string]interface{}{"app": "fluentd"},
			"creationTimestamp": created.Format(time.RFC3339),
		},
		"status": map[string]interface{}{
			"desiredNumberScheduled": int64(5),
			"numberReady":            int64(5),
		},
	}}

	got := m.parseDaemonSetsAsWorkloads(&unstructured.UnstructuredList{Items: []unstructured.Unstructured{item}}, "cluster-1")
	if len(got) != 1 {
		t.Fatalf("expected 1 workload, got %d", len(got))
	}
	w := got[0]

	if w.Name != "fluentd" || w.Namespace != "monitoring" {
		t.Errorf("unexpected name/namespace: %+v", w)
	}
	if w.Type != v1alpha1.WorkloadTypeDaemonSet {
		t.Errorf("expected Type DaemonSet, got %q", w.Type)
	}
	if w.Labels["app"] != "fluentd" {
		t.Errorf("expected labels to be parsed, got %+v", w.Labels)
	}
	if !w.CreatedAt.Equal(created) {
		t.Errorf("expected CreatedAt %v, got %v", created, w.CreatedAt)
	}
	if len(w.TargetClusters) != 1 || w.TargetClusters[0] != "cluster-1" {
		t.Errorf("expected TargetClusters [cluster-1], got %+v", w.TargetClusters)
	}
	if w.Replicas != 5 || w.ReadyReplicas != 5 {
		t.Errorf("expected Replicas=5 ReadyReplicas=5, got Replicas=%d ReadyReplicas=%d", w.Replicas, w.ReadyReplicas)
	}
	if w.Status != v1alpha1.WorkloadStatusRunning {
		t.Errorf("expected Running, got %q", w.Status)
	}
	if len(w.Deployments) != 1 {
		t.Fatalf("expected 1 ClusterDeployment entry, got %d", len(w.Deployments))
	}
	dep := w.Deployments[0]
	if dep.Cluster != "cluster-1" || dep.Status != v1alpha1.WorkloadStatusRunning || dep.Replicas != 5 || dep.ReadyReplicas != 5 {
		t.Errorf("unexpected ClusterDeployment: %+v", dep)
	}
}

// TestParseDaemonSetsAsWorkloads_PartialReadyIsDegraded guards the Degraded
// branch: some but not all desired pods are ready.
func TestParseDaemonSetsAsWorkloads_PartialReadyIsDegraded(t *testing.T) {
	m := &MultiClusterClient{}

	item := unstructured.Unstructured{Object: map[string]interface{}{
		"metadata": map[string]interface{}{
			"name":      "half-ready-ds",
			"namespace": "default",
		},
		"status": map[string]interface{}{
			"desiredNumberScheduled": int64(4),
			"numberReady":            int64(1),
		},
	}}

	got := m.parseDaemonSetsAsWorkloads(&unstructured.UnstructuredList{Items: []unstructured.Unstructured{item}}, "c")
	if len(got) != 1 || got[0].Status != v1alpha1.WorkloadStatusDegraded {
		t.Fatalf("expected Degraded, got %+v", got)
	}
}

// TestParseDaemonSetsAsWorkloads_NoneReadyIsPending guards the Pending
// branch: zero ready pods out of a non-zero desired count.
func TestParseDaemonSetsAsWorkloads_NoneReadyIsPending(t *testing.T) {
	m := &MultiClusterClient{}

	item := unstructured.Unstructured{Object: map[string]interface{}{
		"metadata": map[string]interface{}{
			"name":      "not-ready-ds",
			"namespace": "default",
		},
		"status": map[string]interface{}{
			"desiredNumberScheduled": int64(2),
			"numberReady":            int64(0),
		},
	}}

	got := m.parseDaemonSetsAsWorkloads(&unstructured.UnstructuredList{Items: []unstructured.Unstructured{item}}, "c")
	if len(got) != 1 || got[0].Status != v1alpha1.WorkloadStatusPending {
		t.Fatalf("expected Pending, got %+v", got)
	}
}

// TestParseDaemonSetsAsWorkloads_ZeroDesiredIsPending documents current
// behaviour for a daemonset with no desired pods (e.g. a node selector that
// matches no nodes yet): 0/0 falls through to Pending rather than Running,
// unlike the StatefulSet zero-replica case fixed in #6495, because the
// ready==desired branch requires desired>0.
func TestParseDaemonSetsAsWorkloads_ZeroDesiredIsPending(t *testing.T) {
	m := &MultiClusterClient{}

	item := unstructured.Unstructured{Object: map[string]interface{}{
		"metadata": map[string]interface{}{
			"name":      "no-nodes-ds",
			"namespace": "default",
		},
		"status": map[string]interface{}{
			"desiredNumberScheduled": int64(0),
			"numberReady":            int64(0),
		},
	}}

	got := m.parseDaemonSetsAsWorkloads(&unstructured.UnstructuredList{Items: []unstructured.Unstructured{item}}, "c")
	if len(got) != 1 || got[0].Status != v1alpha1.WorkloadStatusPending {
		t.Fatalf("expected Pending for 0/0 daemonset, got %+v", got)
	}
}

// TestParseDaemonSetsAsWorkloads_MissingStatusIsUnknown covers an object with
// no status subresource at all (e.g. freshly created, not yet observed by
// the controller): the pre-initialised Unknown status must be left as-is.
func TestParseDaemonSetsAsWorkloads_MissingStatusIsUnknown(t *testing.T) {
	m := &MultiClusterClient{}

	item := unstructured.Unstructured{Object: map[string]interface{}{
		"metadata": map[string]interface{}{
			"name":      "brand-new-ds",
			"namespace": "default",
		},
	}}

	got := m.parseDaemonSetsAsWorkloads(&unstructured.UnstructuredList{Items: []unstructured.Unstructured{item}}, "c")
	if len(got) != 1 || got[0].Status != v1alpha1.WorkloadStatusUnknown {
		t.Fatalf("expected Unknown when status is absent, got %+v", got)
	}
}

// TestParseDaemonSetsAsWorkloads_MultipleItems ensures every item in the list
// is parsed, not just the first.
func TestParseDaemonSetsAsWorkloads_MultipleItems(t *testing.T) {
	m := &MultiClusterClient{}

	mk := func(name string, desired, ready int64) unstructured.Unstructured {
		return unstructured.Unstructured{Object: map[string]interface{}{
			"metadata": map[string]interface{}{"name": name, "namespace": "default"},
			"status": map[string]interface{}{
				"desiredNumberScheduled": desired,
				"numberReady":            ready,
			},
		}}
	}

	list := &unstructured.UnstructuredList{Items: []unstructured.Unstructured{
		mk("ds-a", 2, 2),
		mk("ds-b", 2, 0),
	}}

	got := m.parseDaemonSetsAsWorkloads(list, "c")
	if len(got) != 2 {
		t.Fatalf("expected 2 workloads, got %d", len(got))
	}
	if got[0].Name != "ds-a" || got[0].Status != v1alpha1.WorkloadStatusRunning {
		t.Errorf("unexpected first workload: %+v", got[0])
	}
	if got[1].Name != "ds-b" || got[1].Status != v1alpha1.WorkloadStatusPending {
		t.Errorf("unexpected second workload: %+v", got[1])
	}
}

// TestParseDaemonSetsAsWorkloads_WrongListType guards the type-assertion
// fallback: a non-*unstructured.UnstructuredList argument must yield an
// empty (non-nil) slice rather than panicking.
func TestParseDaemonSetsAsWorkloads_WrongListType(t *testing.T) {
	m := &MultiClusterClient{}

	got := m.parseDaemonSetsAsWorkloads("not-a-list", "c")
	if got == nil {
		t.Fatal("expected non-nil empty slice, got nil")
	}
	if len(got) != 0 {
		t.Fatalf("expected 0 workloads for wrong input type, got %d", len(got))
	}
}

// TestParseDaemonSetsAsWorkloads_EmptyList guards the zero-items case.
func TestParseDaemonSetsAsWorkloads_EmptyList(t *testing.T) {
	m := &MultiClusterClient{}

	got := m.parseDaemonSetsAsWorkloads(&unstructured.UnstructuredList{}, "c")
	if got == nil || len(got) != 0 {
		t.Fatalf("expected empty slice, got %+v", got)
	}
}
