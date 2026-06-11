package k8s

import (
	"errors"
	"sync"
	"testing"

	"k8s.io/client-go/dynamic"
	dynamicfake "k8s.io/client-go/dynamic/fake"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/rest"
	"k8s.io/apimachinery/pkg/runtime"
)

// newTestClient returns a MultiClusterClient pre-configured for unit tests.
func newTestClient(opts ...func(*MultiClusterClient)) *MultiClusterClient {
	m := &MultiClusterClient{
		clients:        make(map[string]kubernetes.Interface),
		dynamicClients: make(map[string]dynamic.Interface),
		configs:        make(map[string]*rest.Config),
	}
	for _, o := range opts {
		o(m)
	}
	return m
}

func withInCluster(name string) func(*MultiClusterClient) {
	return func(m *MultiClusterClient) {
		m.inClusterConfig = &rest.Config{Host: "https://in-cluster:6443"}
		m.inClusterName = name
	}
}

func withNoClusterMode() func(*MultiClusterClient) {
	return func(m *MultiClusterClient) {
		m.noClusterMode = true
	}
}

// --- GetClient tests ---

func TestGetClient_CachedHit(t *testing.T) {
	fakeClient := fake.NewSimpleClientset()
	m := newTestClient()
	m.clients["ctx-a"] = fakeClient

	got, err := m.GetClient("ctx-a")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != fakeClient {
		t.Fatal("expected cached client to be returned")
	}
}

func TestGetClient_NoClusterMode_ReturnsError(t *testing.T) {
	m := newTestClient(withNoClusterMode())

	_, err := m.GetClient("any")
	if !errors.Is(err, ErrNoClusterConfigured) {
		t.Fatalf("expected ErrNoClusterConfigured, got: %v", err)
	}
}

func TestGetClient_InCluster_ByCanonicalName(t *testing.T) {
	m := newTestClient(withInCluster("my-cluster"))

	client, err := m.GetClient("in-cluster")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if client == nil {
		t.Fatal("expected non-nil client for in-cluster context")
	}

	// Verify config was stored
	m.mu.RLock()
	cfg, ok := m.configs["in-cluster"]
	m.mu.RUnlock()
	if !ok || cfg == nil {
		t.Fatal("expected config to be stored for in-cluster context")
	}
	if cfg.Host != "https://in-cluster:6443" {
		t.Fatalf("expected in-cluster host, got %s", cfg.Host)
	}
}

func TestGetClient_InCluster_ByDetectedName(t *testing.T) {
	m := newTestClient(withInCluster("fmaas-vllm-d"))

	client, err := m.GetClient("fmaas-vllm-d")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if client == nil {
		t.Fatal("expected non-nil client for detected in-cluster name")
	}
}

func TestGetClient_ConcurrentAccess_FirstWriterWins(t *testing.T) {
	m := newTestClient(withInCluster("shared"))

	const goroutines = 20
	var wg sync.WaitGroup
	wg.Add(goroutines)

	clients := make([]kubernetes.Interface, goroutines)
	errs := make([]error, goroutines)

	for i := 0; i < goroutines; i++ {
		go func(idx int) {
			defer wg.Done()
			clients[idx], errs[idx] = m.GetClient("in-cluster")
		}(i)
	}
	wg.Wait()

	// All should succeed
	for i, err := range errs {
		if err != nil {
			t.Fatalf("goroutine %d got error: %v", i, err)
		}
	}

	// All should get the same client (first writer wins)
	first := clients[0]
	for i := 1; i < goroutines; i++ {
		if clients[i] != first {
			t.Fatalf("goroutine %d got different client pointer — first-writer-wins violated", i)
		}
	}
}

func TestGetClient_InvalidKubeconfig_ReturnsError(t *testing.T) {
	m := newTestClient()
	m.kubeconfig = "/nonexistent/path/kubeconfig"

	_, err := m.GetClient("bogus-context")
	if err == nil {
		t.Fatal("expected error for invalid kubeconfig path")
	}
}

// --- GetRestConfig tests ---

func TestGetRestConfig_ReturnsConfigCopy(t *testing.T) {
	m := newTestClient(withInCluster("test"))

	cfg, err := m.GetRestConfig("in-cluster")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg == nil {
		t.Fatal("expected non-nil config")
	}

	// Mutating the returned config should not affect the stored one
	cfg.Host = "mutated"
	m.mu.RLock()
	stored := m.configs["in-cluster"]
	m.mu.RUnlock()
	if stored.Host == "mutated" {
		t.Fatal("GetRestConfig should return a copy, not the original")
	}
}

func TestGetRestConfig_InvalidContext_ReturnsError(t *testing.T) {
	m := newTestClient()
	m.kubeconfig = "/nonexistent/path"

	_, err := m.GetRestConfig("does-not-exist")
	if err == nil {
		t.Fatal("expected error for invalid context")
	}
}

// --- GetDynamicClient tests ---

func TestGetDynamicClient_CachedHit(t *testing.T) {
	fakeDyn := dynamicfake.NewSimpleDynamicClient(runtime.NewScheme())
	m := newTestClient()
	m.dynamicClients["ctx-b"] = fakeDyn

	got, err := m.GetDynamicClient("ctx-b")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != fakeDyn {
		t.Fatal("expected cached dynamic client to be returned")
	}
}

func TestGetDynamicClient_NoClusterMode_ReturnsError(t *testing.T) {
	m := newTestClient(withNoClusterMode())

	_, err := m.GetDynamicClient("any")
	if !errors.Is(err, ErrNoClusterConfigured) {
		t.Fatalf("expected ErrNoClusterConfigured, got: %v", err)
	}
}

func TestGetDynamicClient_UsesExistingConfig(t *testing.T) {
	m := newTestClient()
	m.configs["preloaded"] = &rest.Config{Host: "https://preloaded:6443"}

	client, err := m.GetDynamicClient("preloaded")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if client == nil {
		t.Fatal("expected non-nil dynamic client when config is pre-cached")
	}
}

func TestGetDynamicClient_InCluster(t *testing.T) {
	m := newTestClient(withInCluster("dyn-cluster"))

	client, err := m.GetDynamicClient("in-cluster")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if client == nil {
		t.Fatal("expected non-nil dynamic client for in-cluster")
	}
}

func TestGetDynamicClient_ConcurrentAccess(t *testing.T) {
	m := newTestClient(withInCluster("concurrent"))

	const goroutines = 20
	var wg sync.WaitGroup
	wg.Add(goroutines)

	clients := make([]dynamic.Interface, goroutines)
	errs := make([]error, goroutines)

	for i := 0; i < goroutines; i++ {
		go func(idx int) {
			defer wg.Done()
			clients[idx], errs[idx] = m.GetDynamicClient("in-cluster")
		}(i)
	}
	wg.Wait()

	for i, err := range errs {
		if err != nil {
			t.Fatalf("goroutine %d got error: %v", i, err)
		}
	}

	first := clients[0]
	for i := 1; i < goroutines; i++ {
		if clients[i] != first {
			t.Fatalf("goroutine %d got different dynamic client — first-writer-wins violated", i)
		}
	}
}

func TestGetDynamicClient_InvalidKubeconfig_ReturnsError(t *testing.T) {
	m := newTestClient()
	m.kubeconfig = "/nonexistent/path/kubeconfig"

	_, err := m.GetDynamicClient("bogus-context")
	if err == nil {
		t.Fatal("expected error for invalid kubeconfig path")
	}
}
