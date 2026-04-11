package k8s

import (
	"context"
	"testing"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	dynfake "k8s.io/client-go/dynamic/fake"
	"k8s.io/client-go/tools/clientcmd/api"

	"github.com/kubestellar/console/pkg/api/v1alpha1"
)

// newArgoApp builds a minimal unstructured ArgoCD Application object.
func newArgoApp(name, ns string) *unstructured.Unstructured {
	return &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "argoproj.io/v1alpha1",
			"kind":       "Application",
			"metadata": map[string]interface{}{
				"name":      name,
				"namespace": ns,
			},
			"spec":   map[string]interface{}{},
			"status": map[string]interface{}{},
		},
	}
}

// argoGVRMap is the minimal GVR→ListKind mapping needed by the fake
// dynamic client to serve ArgoCD Application / ApplicationSet list calls.
func argoGVRMap() map[schema.GroupVersionResource]string {
	return map[schema.GroupVersionResource]string{
		v1alpha1.ArgoApplicationGVR:    "ApplicationList",
		v1alpha1.ArgoApplicationSetGVR: "ApplicationSetList",
	}
}

// TestListArgoApplications_SeesNewContextAfterHotReload is a regression test
// for #6476. Previously ListArgoApplications snapshotted m.clients under a
// read lock, so contexts added to the kubeconfig after startup (hot reload)
// were silently dropped until their kubernetes client was lazily created on
// some other code path. After the fix it iterates DeduplicatedClusters() and
// lets GetDynamicClient lazily pick up newly-added contexts.
func TestListArgoApplications_SeesNewContextAfterHotReload(t *testing.T) {
	m, _ := NewMultiClusterClient("")

	// Start with ONE context (c1) — this simulates the state right after
	// startup with one cluster loaded. c1's kubernetes client has not been
	// created yet, so m.clients is empty. The old code would have returned
	// zero clusters here.
	m.rawConfig = &api.Config{
		Contexts: map[string]*api.Context{
			"c1": {Cluster: "cl1"},
		},
		Clusters: map[string]*api.Cluster{
			"cl1": {Server: "https://cluster-1.example"},
		},
	}

	// Pre-seed dynamic clients so ListArgoApplicationsForCluster's
	// GetDynamicClient call finds a cached entry (no real config needed).
	scheme := runtime.NewScheme()
	gvrMap := argoGVRMap()
	m.dynamicClients["c1"] = dynfake.NewSimpleDynamicClientWithCustomListKinds(
		scheme, gvrMap, newArgoApp("app-c1", "argocd"),
	)

	// Hot reload: a new context (c2) is added to the kubeconfig. Its
	// kubernetes client is NOT in m.clients — which is exactly the
	// condition that triggered #6476.
	m.rawConfig.Contexts["c2"] = &api.Context{Cluster: "cl2"}
	m.rawConfig.Clusters["cl2"] = &api.Cluster{Server: "https://cluster-2.example"}
	m.dynamicClients["c2"] = dynfake.NewSimpleDynamicClientWithCustomListKinds(
		scheme, gvrMap, newArgoApp("app-c2", "argocd"),
	)

	// Note: m.clients is intentionally left empty. The old implementation
	// would produce zero results; the new one must see both clusters.
	if len(m.clients) != 0 {
		t.Fatalf("precondition: expected m.clients empty to simulate no-lazy-client state, got %d", len(m.clients))
	}

	got, err := m.ListArgoApplications(context.Background())
	if err != nil {
		t.Fatalf("ListArgoApplications returned error: %v", err)
	}

	if got.TotalCount != 2 {
		t.Errorf("expected 2 apps across both contexts, got %d (items=%+v)", got.TotalCount, got.Items)
	}

	seen := map[string]bool{}
	for _, app := range got.Items {
		seen[app.Cluster] = true
	}
	if !seen["c1"] || !seen["c2"] {
		t.Errorf("expected apps from both c1 and c2, got clusters=%v", seen)
	}
}

// TestListArgoApplicationSets_SeesNewContextAfterHotReload mirrors the above
// for the ApplicationSets list path, which had the same m.clients snapshot
// bug (#6476).
func TestListArgoApplicationSets_SeesNewContextAfterHotReload(t *testing.T) {
	m, _ := NewMultiClusterClient("")

	m.rawConfig = &api.Config{
		Contexts: map[string]*api.Context{
			"c1": {Cluster: "cl1"},
			"c2": {Cluster: "cl2"},
		},
		Clusters: map[string]*api.Cluster{
			"cl1": {Server: "https://cluster-1.example"},
			"cl2": {Server: "https://cluster-2.example"},
		},
	}

	scheme := runtime.NewScheme()
	gvrMap := argoGVRMap()

	appSet := func(name string) *unstructured.Unstructured {
		return &unstructured.Unstructured{
			Object: map[string]interface{}{
				"apiVersion": "argoproj.io/v1alpha1",
				"kind":       "ApplicationSet",
				"metadata": map[string]interface{}{
					"name":      name,
					"namespace": "argocd",
				},
				"spec": map[string]interface{}{},
			},
		}
	}

	m.dynamicClients["c1"] = dynfake.NewSimpleDynamicClientWithCustomListKinds(scheme, gvrMap, appSet("as-c1"))
	m.dynamicClients["c2"] = dynfake.NewSimpleDynamicClientWithCustomListKinds(scheme, gvrMap, appSet("as-c2"))

	// m.clients is empty — pre-fix, the ListArgoApplicationSets loop would
	// iterate nothing.
	got, err := m.ListArgoApplicationSets(context.Background())
	if err != nil {
		t.Fatalf("ListArgoApplicationSets returned error: %v", err)
	}
	if got.TotalCount != 2 {
		t.Errorf("expected 2 applicationsets across both contexts, got %d", got.TotalCount)
	}
}
