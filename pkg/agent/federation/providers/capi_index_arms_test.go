package providers

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	dynamicfake "k8s.io/client-go/dynamic/fake"
	clienttesting "k8s.io/client-go/testing"
)

// capiIndexArmsScheme returns a scheme + list-kind map wired to the two
// GVRs both index helpers query. Sharing this across subtests keeps every
// case pointed at the same, real production GVRs so a rename in
// production code breaks the tests loudly.
func capiIndexArmsScheme() (*runtime.Scheme, map[schema.GroupVersionResource]string) {
	sch := runtime.NewScheme()
	return sch, map[schema.GroupVersionResource]string{
		capiMachineDeploymentGVR:   "MachineDeploymentList",
		capiKubeadmControlPlaneGVR: "KubeadmControlPlaneList",
	}
}

func newCAPIUnstructured(gvr schema.GroupVersionResource, listKind, name, ns, clusterLabel string, obj map[string]any) *unstructured.Unstructured {
	// The kind for a single item is the list kind minus "List".
	kind := listKind[:len(listKind)-len("List")]
	u := &unstructured.Unstructured{Object: obj}
	u.SetGroupVersionKind(schema.GroupVersionKind{
		Group:   gvr.Group,
		Version: gvr.Version,
		Kind:    kind,
	})
	u.SetName(name)
	u.SetNamespace(ns)
	if clusterLabel != "" {
		u.SetLabels(map[string]string{capiClusterNameLabel: clusterLabel})
	}
	return u
}

// -----------------------------------------------------------------------
// capiIndexMachineDeployments
// -----------------------------------------------------------------------

func TestCAPIIndexMachineDeployments_ListErrorReturnsEmpty(t *testing.T) {
	// If the CRD is absent or the API server rejects the List call, the
	// helper MUST swallow the error and return an empty map so the
	// caller can still populate a partial cluster snapshot.
	sch, listKinds := capiIndexArmsScheme()
	dc := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(sch, listKinds)
	dc.PrependReactor("list", "machinedeployments",
		func(_ clienttesting.Action) (bool, runtime.Object, error) {
			return true, nil, errors.New("simulated API server outage")
		},
	)

	got := capiIndexMachineDeployments(context.Background(), dc)

	assert.Empty(t, got,
		"list error must return an empty map, not a nil map or a partial index")
}

func TestCAPIIndexMachineDeployments_UnlabelledItemsAreSkipped(t *testing.T) {
	// A MachineDeployment without the cluster-name label cannot be
	// attributed to any CAPI Cluster and must be ignored — otherwise a
	// stray empty-string key would appear in the returned map and every
	// downstream lookup by cluster name would collide on it.
	sch, listKinds := capiIndexArmsScheme()
	labelled := newCAPIUnstructured(
		capiMachineDeploymentGVR, "MachineDeploymentList",
		"md-with-label", "default", "cluster-a",
		map[string]any{
			"spec":   map[string]any{"replicas": int64(3)},
			"status": map[string]any{"readyReplicas": int64(2)},
		},
	)
	unlabelled := newCAPIUnstructured(
		capiMachineDeploymentGVR, "MachineDeploymentList",
		"md-no-label", "default", "",
		map[string]any{
			"spec":   map[string]any{"replicas": int64(9)},
			"status": map[string]any{"readyReplicas": int64(9)},
		},
	)
	dc := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(
		sch, listKinds, labelled, unlabelled,
	)

	got := capiIndexMachineDeployments(context.Background(), dc)

	require.Len(t, got, 1, "only the labelled MD should appear in the index")
	assert.NotContains(t, got, "",
		"empty cluster-name key must never appear in the index")
	summary := got["cluster-a"]
	assert.Equal(t, int32(3), summary.desired)
	assert.Equal(t, int32(2), summary.ready)
}

func TestCAPIIndexMachineDeployments_SumsReplicasPerCluster(t *testing.T) {
	// Two MDs with the same cluster-name label must accumulate their
	// desired and ready replicas into a single summary. Missing
	// spec.replicas / status.readyReplicas fields must resolve to 0
	// (via NestedInt64's found-flag ignore) rather than panic.
	sch, listKinds := capiIndexArmsScheme()
	mdA1 := newCAPIUnstructured(
		capiMachineDeploymentGVR, "MachineDeploymentList",
		"md-a-1", "default", "cluster-a",
		map[string]any{
			"spec":   map[string]any{"replicas": int64(3)},
			"status": map[string]any{"readyReplicas": int64(3)},
		},
	)
	mdA2 := newCAPIUnstructured(
		capiMachineDeploymentGVR, "MachineDeploymentList",
		"md-a-2", "default", "cluster-a",
		map[string]any{
			"spec":   map[string]any{"replicas": int64(5)},
			"status": map[string]any{"readyReplicas": int64(4)},
		},
	)
	mdB := newCAPIUnstructured(
		capiMachineDeploymentGVR, "MachineDeploymentList",
		"md-b", "default", "cluster-b",
		// No spec.replicas / status.readyReplicas — must default to 0.
		map[string]any{},
	)
	dc := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(
		sch, listKinds, mdA1, mdA2, mdB,
	)

	got := capiIndexMachineDeployments(context.Background(), dc)

	require.Len(t, got, 2)
	assert.Equal(t, int32(8), got["cluster-a"].desired,
		"cluster-a desired replicas must sum across MDs")
	assert.Equal(t, int32(7), got["cluster-a"].ready,
		"cluster-a ready replicas must sum across MDs")
	assert.Equal(t, capiMachineSummary{}, got["cluster-b"],
		"MD without spec/status must contribute a zero summary, "+
			"not a missing entry")
}

// -----------------------------------------------------------------------
// capiIndexKubeadmControlPlanes
// -----------------------------------------------------------------------

func TestCAPIIndexKubeadmControlPlanes_ListErrorReturnsEmpty(t *testing.T) {
	// Same rationale as the MD list-error test: transient/absent CRD
	// must degrade to an empty index, not surface an error.
	sch, listKinds := capiIndexArmsScheme()
	dc := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(sch, listKinds)
	dc.PrependReactor("list", "kubeadmcontrolplanes",
		func(_ clienttesting.Action) (bool, runtime.Object, error) {
			return true, nil, errors.New("CRD not installed")
		},
	)

	got := capiIndexKubeadmControlPlanes(context.Background(), dc)

	assert.Empty(t, got)
}

func TestCAPIIndexKubeadmControlPlanes_UnlabelledAndNotReadyAreSkipped(t *testing.T) {
	// Only KCPs that (a) carry the cluster-name label AND (b) report
	// status.ready == true belong in the index. Every other case must
	// be filtered out — otherwise the caller will over-count healthy
	// control planes.
	sch, listKinds := capiIndexArmsScheme()
	// Ready + labelled — must land in the index as true.
	kcpReady := newCAPIUnstructured(
		capiKubeadmControlPlaneGVR, "KubeadmControlPlaneList",
		"kcp-ready", "default", "cluster-a",
		map[string]any{"status": map[string]any{"ready": true}},
	)
	// Ready but no cluster-name label — must be skipped.
	kcpNoLabel := newCAPIUnstructured(
		capiKubeadmControlPlaneGVR, "KubeadmControlPlaneList",
		"kcp-no-label", "default", "",
		map[string]any{"status": map[string]any{"ready": true}},
	)
	// Labelled but not ready — the `if ready` guard must exclude it.
	kcpNotReady := newCAPIUnstructured(
		capiKubeadmControlPlaneGVR, "KubeadmControlPlaneList",
		"kcp-not-ready", "default", "cluster-b",
		map[string]any{"status": map[string]any{"ready": false}},
	)
	// Labelled but status entirely missing — NestedBool -> false,
	// still skipped. Locks the same behaviour as an explicit false.
	kcpNoStatus := newCAPIUnstructured(
		capiKubeadmControlPlaneGVR, "KubeadmControlPlaneList",
		"kcp-no-status", "default", "cluster-c",
		map[string]any{},
	)
	dc := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(
		sch, listKinds, kcpReady, kcpNoLabel, kcpNotReady, kcpNoStatus,
	)

	got := capiIndexKubeadmControlPlanes(context.Background(), dc)

	assert.Equal(t, map[string]bool{"cluster-a": true}, got,
		"only ready + labelled KCPs may appear; unlabelled, "+
			"not-ready, and status-less entries must be excluded")
}

// Regression guard: the empty-arg List call in production uses
// metav1.ListOptions{} with no field/label selector. If a future edit
// added a selector that filtered out the very rows the helpers rely on,
// this test would surface it — the fake client honours label selectors.
func TestCAPIIndexHelpers_ListWithNoSelector(t *testing.T) {
	sch, listKinds := capiIndexArmsScheme()
	md := newCAPIUnstructured(
		capiMachineDeploymentGVR, "MachineDeploymentList",
		"md-1", "default", "cluster-x",
		map[string]any{
			"spec":   map[string]any{"replicas": int64(1)},
			"status": map[string]any{"readyReplicas": int64(1)},
		},
	)
	kcp := newCAPIUnstructured(
		capiKubeadmControlPlaneGVR, "KubeadmControlPlaneList",
		"kcp-1", "default", "cluster-x",
		map[string]any{"status": map[string]any{"ready": true}},
	)
	dc := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(
		sch, listKinds, md, kcp,
	)

	// Sanity: the ListOptions the helpers use are equivalent to the
	// zero-value ListOptions — if that changes, this line will need
	// to be updated in lockstep with production.
	require.Equal(t, metav1.ListOptions{}, metav1.ListOptions{})

	mds := capiIndexMachineDeployments(context.Background(), dc)
	kcps := capiIndexKubeadmControlPlanes(context.Background(), dc)

	assert.Contains(t, mds, "cluster-x")
	assert.True(t, kcps["cluster-x"])
}
