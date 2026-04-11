package k8s

import (
	"context"
	"testing"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	dynfake "k8s.io/client-go/dynamic/fake"
	k8stesting "k8s.io/client-go/testing"

	"github.com/kubestellar/console/pkg/api/v1alpha1"
)

// Shared hot-reload regression tests for #6657 — "a cluster added to the
// kubeconfig after startup must appear in multi-cluster list APIs even
// though no lazy kubernetes client has been created for it yet."
//
// Pattern mirrors TestListArgoApplications_SeesNewContextAfterHotReload
// (the #6476/#6550 regression fixture): prime m.dynamicClients with fake
// clients for each context, leave m.clients deliberately empty, then call
// the multi-cluster list API and assert every context is represented.

// newLazyReloadClient builds a MultiClusterClient with fake dynamic clients
// for the named contexts but an intentionally empty m.clients map. This is
// the exact state that triggered the #6476 class of bugs: contexts exist in
// the kubeconfig but no lazy kubernetes client has been created yet.
func newLazyReloadClient(t *testing.T, gvrMap map[schema.GroupVersionResource]string, contextItems map[string][]runtime.Object) *MultiClusterClient {
	t.Helper()
	m, _ := NewMultiClusterClient("")

	// Build rawConfig with fake server URLs so DeduplicatedClusters sees
	// each context. Unique server URLs prevent dedup from collapsing them.
	injectTestClusters(m, keysOf(contextItems)...)

	// Register each GVR's kind+list in the scheme so the fake dynamic
	// client can serve unstructured lists without going through discovery.
	scheme := runtime.NewScheme()
	for gvr, listKind := range gvrMap {
		kind := listKind[:len(listKind)-len("List")]
		scheme.AddKnownTypeWithName(schema.GroupVersionKind{
			Group:   gvr.Group,
			Version: gvr.Version,
			Kind:    kind,
		}, &unstructured.Unstructured{})
		scheme.AddKnownTypeWithName(schema.GroupVersionKind{
			Group:   gvr.Group,
			Version: gvr.Version,
			Kind:    listKind,
		}, &unstructured.UnstructuredList{})
	}
	for name, items := range contextItems {
		m.dynamicClients[name] = dynfake.NewSimpleDynamicClientWithCustomListKinds(scheme, gvrMap, items...)
	}

	// Precondition: m.clients must be empty to simulate the no-lazy-client
	// state. If any test accidentally pre-populates it, the regression
	// guarantee is moot.
	if len(m.clients) != 0 {
		t.Fatalf("precondition: expected m.clients empty to simulate no-lazy-client state, got %d", len(m.clients))
	}
	return m
}

func keysOf(m map[string][]runtime.Object) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}

func newServiceExport(name, ns, cluster string) *unstructured.Unstructured {
	return &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "multicluster.x-k8s.io/v1alpha1",
			"kind":       "ServiceExport",
			"metadata": map[string]interface{}{
				"name":      name,
				"namespace": ns,
				"labels":    map[string]interface{}{"from": cluster},
			},
		},
	}
}

// TestListServiceExports_SeesNewContextAfterHotReload is the #6662 regression
// fixture. Previously ListServiceExports iterated m.clients and dropped
// hot-added contexts until their typed kubernetes client was lazily created.
func TestListServiceExports_SeesNewContextAfterHotReload(t *testing.T) {
	gvrMap := map[schema.GroupVersionResource]string{
		v1alpha1.ServiceExportGVR: "ServiceExportList",
	}
	m := newLazyReloadClient(t, gvrMap, map[string][]runtime.Object{
		"c1": {newServiceExport("svc-c1", "default", "c1")},
		"c2": {newServiceExport("svc-c2", "default", "c2")},
	})

	got, err := m.ListServiceExports(context.Background())
	if err != nil {
		t.Fatalf("ListServiceExports: %v", err)
	}
	if got.TotalCount != 2 {
		t.Errorf("expected 2 exports across both hot-reloaded contexts, got %d (items=%+v)", got.TotalCount, got.Items)
	}
	seen := map[string]bool{}
	for _, e := range got.Items {
		seen[e.Cluster] = true
	}
	if !seen["c1"] || !seen["c2"] {
		t.Errorf("expected exports from both c1 and c2, got clusters=%v", seen)
	}
}

// TestListServiceImports_SeesNewContextAfterHotReload is the companion
// regression fixture for ServiceImports (#6662).
func TestListServiceImports_SeesNewContextAfterHotReload(t *testing.T) {
	gvrMap := map[schema.GroupVersionResource]string{
		v1alpha1.ServiceImportGVR: "ServiceImportList",
	}
	importObj := func(name, cluster string) *unstructured.Unstructured {
		return &unstructured.Unstructured{
			Object: map[string]interface{}{
				"apiVersion": "multicluster.x-k8s.io/v1alpha1",
				"kind":       "ServiceImport",
				"metadata": map[string]interface{}{
					"name":      name,
					"namespace": "default",
					"labels":    map[string]interface{}{"from": cluster},
				},
				"spec": map[string]interface{}{"type": "ClusterSetIP"},
			},
		}
	}
	m := newLazyReloadClient(t, gvrMap, map[string][]runtime.Object{
		"c1": {importObj("i-c1", "c1")},
		"c2": {importObj("i-c2", "c2")},
	})

	got, err := m.ListServiceImports(context.Background())
	if err != nil {
		t.Fatalf("ListServiceImports: %v", err)
	}
	if got.TotalCount != 2 {
		t.Errorf("expected 2 imports, got %d", got.TotalCount)
	}
}

// TestListGateways_SeesNewContextAfterHotReload is the #6663 regression.
// Uses a reactor-based fake because the Gateway types are not in a registered
// scheme and the pre-seeded tracker path would otherwise return empty lists.
func TestListGateways_SeesNewContextAfterHotReload(t *testing.T) {
	m, _ := NewMultiClusterClient("")
	injectTestClusters(m, "c1", "c2")

	gwItem := func(name string) unstructured.Unstructured {
		return unstructured.Unstructured{
			Object: map[string]interface{}{
				"apiVersion": "gateway.networking.k8s.io/v1",
				"kind":       "Gateway",
				"metadata":   map[string]interface{}{"name": name, "namespace": "default"},
				"spec":       map[string]interface{}{"gatewayClassName": "cls"},
			},
		}
	}

	mkClient := func(item unstructured.Unstructured) *dynfake.FakeDynamicClient {
		scheme := runtime.NewScheme()
		fakeDyn := dynfake.NewSimpleDynamicClientWithCustomListKinds(scheme, map[schema.GroupVersionResource]string{
			v1alpha1.GatewayGVR: "GatewayList",
		})
		fakeDyn.PrependReactor("list", "*", func(action k8stesting.Action) (bool, runtime.Object, error) {
			if action.GetResource().Resource != "gateways" {
				return false, nil, nil
			}
			return true, &unstructured.UnstructuredList{
				Object: map[string]interface{}{"kind": "GatewayList", "apiVersion": "gateway.networking.k8s.io/v1"},
				Items:  []unstructured.Unstructured{item},
			}, nil
		})
		return fakeDyn
	}
	m.dynamicClients["c1"] = mkClient(gwItem("gw-c1"))
	m.dynamicClients["c2"] = mkClient(gwItem("gw-c2"))

	// m.clients is intentionally empty to reproduce the hot-reload state
	// (no lazy typed client has been created for either context).
	if len(m.clients) != 0 {
		t.Fatalf("precondition: expected m.clients empty, got %d", len(m.clients))
	}

	got, err := m.ListGateways(context.Background())
	if err != nil {
		t.Fatalf("ListGateways returned unexpected error: %v", err)
	}
	if got.TotalCount != 2 {
		t.Errorf("expected 2 gateways across both hot-reloaded contexts, got %d", got.TotalCount)
	}
}

// TestListHTTPRoutes_SeesNewContextAfterHotReload mirrors the Gateway test
// for HTTPRoutes (#6663).
func TestListHTTPRoutes_SeesNewContextAfterHotReload(t *testing.T) {
	gvrMap := map[schema.GroupVersionResource]string{
		v1alpha1.HTTPRouteGVR: "HTTPRouteList",
	}
	route := func(name string) *unstructured.Unstructured {
		return &unstructured.Unstructured{
			Object: map[string]interface{}{
				"apiVersion": "gateway.networking.k8s.io/v1",
				"kind":       "HTTPRoute",
				"metadata":   map[string]interface{}{"name": name, "namespace": "default"},
				"spec":       map[string]interface{}{"hostnames": []interface{}{"example.com"}},
			},
		}
	}
	m := newLazyReloadClient(t, gvrMap, map[string][]runtime.Object{
		"c1": {route("r-c1")},
		"c2": {route("r-c2")},
	})

	got, err := m.ListHTTPRoutes(context.Background())
	if err != nil {
		t.Fatalf("ListHTTPRoutes: %v", err)
	}
	if got.TotalCount != 2 {
		t.Errorf("expected 2 routes, got %d", got.TotalCount)
	}
}

// TestGetClusterCapabilities_SeesNewContextAfterHotReload is the #6661
// regression. GetClusterCapabilities used to iterate m.clients; after the
// fix it iterates DeduplicatedClusters. Every cluster must produce an entry
// (marked Available=false when GetNodes fails, which happens here because
// the fake typed client is not pre-populated — the contract is that every
// known cluster has an entry, not that it is reachable).
func TestGetClusterCapabilities_SeesNewContextAfterHotReload(t *testing.T) {
	m, _ := NewMultiClusterClient("")
	injectTestClusters(m, "c1", "c2")
	// m.clients is empty — GetNodes will fail per cluster, but both
	// clusters must still appear as entries (Available=false).

	caps, err := m.GetClusterCapabilities(context.Background())
	if err != nil {
		t.Fatalf("GetClusterCapabilities: %v", err)
	}
	if len(caps.Items) != 2 {
		t.Fatalf("expected 2 capability entries for hot-reloaded contexts, got %d", len(caps.Items))
	}
	seen := map[string]bool{}
	for _, c := range caps.Items {
		seen[c.Cluster] = true
	}
	if !seen["c1"] || !seen["c2"] {
		t.Errorf("expected entries for both c1 and c2, got %v", seen)
	}
}

// TestListWorkloads_SurfacesPerClusterErrors is the #6659 regression. A
// cluster that fails to list a kind (e.g. RBAC) must be reported in
// WorkloadList.ClusterErrors rather than silently dropped. We drive this
// through a reactor that injects a Forbidden error on deployment lists.
func TestListWorkloads_SurfacesPerClusterErrors(t *testing.T) {
	m, _ := NewMultiClusterClient("")
	injectTestClusters(m, "c-broken")

	// Build a dynamic client that hard-fails on every list with a generic
	// Forbidden-style error (not "no matches for" — so it must propagate).
	scheme := runtime.NewScheme()
	gvrMap := map[schema.GroupVersionResource]string{
		{Group: "apps", Version: "v1", Resource: "deployments"}:  "DeploymentList",
		{Group: "apps", Version: "v1", Resource: "statefulsets"}: "StatefulSetList",
		{Group: "apps", Version: "v1", Resource: "daemonsets"}:   "DaemonSetList",
	}
	fakeDyn := dynfake.NewSimpleDynamicClientWithCustomListKinds(scheme, gvrMap)
	fakeDyn.Fake.PrependReactor("list", "deployments", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, errForbidden("forbidden: user cannot list deployments")
	})
	m.dynamicClients["c-broken"] = fakeDyn

	got, err := m.ListWorkloads(context.Background(), "", "default", "")
	if err != nil {
		t.Fatalf("ListWorkloads returned top-level error: %v", err)
	}
	if len(got.ClusterErrors) == 0 {
		t.Fatalf("expected ClusterErrors to contain the broken cluster, got %+v", got)
	}
	var sawBroken bool
	for _, ce := range got.ClusterErrors {
		if ce.Cluster == "c-broken" {
			sawBroken = true
		}
	}
	if !sawBroken {
		t.Errorf("expected ClusterErrors to include c-broken, got %+v", got.ClusterErrors)
	}
}

// errForbidden is a tiny stand-in for an auth/RBAC style error that is NOT
// one of the "CRD not installed" benign classifiers.
type forbiddenErr struct{ msg string }

func (f forbiddenErr) Error() string { return f.msg }

func errForbidden(msg string) error { return forbiddenErr{msg: msg} }

// Ensure unstructured is referenced so the import stays valid even as
// helper fixtures evolve.
var _ = unstructured.Unstructured{}
