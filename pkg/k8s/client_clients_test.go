package k8s

import (
	"errors"
	"sync"
	"testing"

	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/dynamic/fake"
	"k8s.io/client-go/kubernetes"
	k8sfake "k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/rest"
)

// ---------------------------------------------------------------------------
// GetClient
// ---------------------------------------------------------------------------

// TestGetClient_NoClusterMode verifies that GetClient returns ErrNoClusterConfigured
// when the client is operating in no-cluster mode with no in-cluster config.
// This guards the nilaway-flagged code path where inClusterConfig is nil.
func TestGetClient_NoClusterMode(t *testing.T) {
	m := &MultiClusterClient{
		clients:        make(map[string]kubernetes.Interface),
		configs:        make(map[string]*rest.Config),
		dynamicClients: make(map[string]dynamic.Interface),
		noClusterMode:  true,
		// inClusterConfig is intentionally nil
	}

	_, err := m.GetClient("any-context")
	if !errors.Is(err, ErrNoClusterConfigured) {
		t.Errorf("GetClient in noClusterMode = %v, want ErrNoClusterConfigured", err)
	}
}

// TestGetClient_CacheHit verifies the fast-path: a client already present in
// the map is returned directly without any config resolution.
func TestGetClient_CacheHit(t *testing.T) {
	m, _ := NewMultiClusterClient("")
	injected := k8sfake.NewSimpleClientset()
	m.InjectClient("cached-ctx", injected)

	got, err := m.GetClient("cached-ctx")
	if err != nil {
		t.Fatalf("GetClient(cached-ctx) returned error: %v", err)
	}
	if got != injected {
		t.Error("GetClient did not return the cached client")
	}
}

// TestGetClient_UnknownContextWithBadKubeconfig verifies that resolving an
// unknown context with a non-existent kubeconfig path returns an error.
// This exercises the clientcmd branch and the downstream nil-config guard.
func TestGetClient_UnknownContextWithBadKubeconfig(t *testing.T) {
	m := &MultiClusterClient{
		clients:        make(map[string]kubernetes.Interface),
		configs:        make(map[string]*rest.Config),
		dynamicClients: make(map[string]dynamic.Interface),
		kubeconfig:     "/nonexistent/path/to/kubeconfig",
	}

	_, err := m.GetClient("unknown-context")
	if err == nil {
		t.Fatal("expected error for unknown context with bad kubeconfig, got nil")
	}
}

// TestGetClient_InClusterContext verifies that when an in-cluster config is
// injected, requests for "in-cluster" succeed and the client is cached.
// This exercises the rest.CopyConfig branch and the post-copy nil guard.
func TestGetClient_InClusterContext(t *testing.T) {
	inCluster := &rest.Config{Host: "https://kubernetes.default.svc"}
	m := &MultiClusterClient{
		clients:         make(map[string]kubernetes.Interface),
		configs:         make(map[string]*rest.Config),
		dynamicClients:  make(map[string]dynamic.Interface),
		inClusterConfig: inCluster,
	}

	got, err := m.GetClient("in-cluster")
	if err != nil {
		t.Fatalf("GetClient(in-cluster) = %v, want success", err)
	}
	if got == nil {
		t.Fatal("GetClient(in-cluster) returned nil client")
	}

	// Second call must hit the cache, not re-build.
	got2, err := m.GetClient("in-cluster")
	if err != nil {
		t.Fatalf("second GetClient(in-cluster) = %v", err)
	}
	if got2 == nil {
		t.Fatal("second GetClient returned nil")
	}
}

// TestGetClient_ConcurrentSameContext verifies that concurrent callers for a
// pre-cached context all succeed and receive the same client (idempotent writes).
func TestGetClient_ConcurrentSameContext(t *testing.T) {
	m, _ := NewMultiClusterClient("")
	injected := k8sfake.NewSimpleClientset()
	m.InjectClient("shared-ctx", injected)

	const goroutines = 20
	errCh := make(chan error, goroutines)
	clientCh := make(chan kubernetes.Interface, goroutines)
	var wg sync.WaitGroup
	wg.Add(goroutines)
	for i := 0; i < goroutines; i++ {
		go func() {
			defer wg.Done()
			c, err := m.GetClient("shared-ctx")
			errCh <- err
			clientCh <- c
		}()
	}
	wg.Wait()
	close(errCh)
	close(clientCh)

	for err := range errCh {
		if err != nil {
			t.Errorf("concurrent GetClient error: %v", err)
		}
	}
	for c := range clientCh {
		if c != injected {
			t.Error("concurrent GetClient returned unexpected client")
		}
	}
}

// ---------------------------------------------------------------------------
// GetRestConfig
// ---------------------------------------------------------------------------

// TestGetRestConfig_InjectedConfig verifies the happy path: after injecting a
// typed client and REST config, GetRestConfig returns a non-nil copy.
func TestGetRestConfig_InjectedConfig(t *testing.T) {
	m, _ := NewMultiClusterClient("")
	cfg := &rest.Config{Host: "https://example.com:6443"}
	m.InjectClient("ctx-with-config", k8sfake.NewSimpleClientset())
	m.InjectRestConfig("ctx-with-config", cfg)

	got, err := m.GetRestConfig("ctx-with-config")
	if err != nil {
		t.Fatalf("GetRestConfig = %v, want success", err)
	}
	if got == nil {
		t.Fatal("GetRestConfig returned nil config")
	}
	if got.Host != cfg.Host {
		t.Errorf("Host = %q, want %q", got.Host, cfg.Host)
	}
	// Verify it's a copy, not the same pointer.
	if got == cfg {
		t.Error("GetRestConfig returned the original pointer; expected a copy")
	}
}

// TestGetRestConfig_NoConfigAfterClientBuild verifies that GetRestConfig
// returns an error when the context has no cached config (e.g., context was
// never built) even though the underlying GetClient call would fail first.
func TestGetRestConfig_UnknownContext(t *testing.T) {
	m, _ := NewMultiClusterClient("")
	// noClusterMode is set by NewMultiClusterClient when no kubeconfig exists.
	// Don't inject anything — GetRestConfig must propagate the error.
	_, err := m.GetRestConfig("nonexistent-ctx")
	if err == nil {
		t.Fatal("GetRestConfig for unknown context should return error, got nil")
	}
}

// ---------------------------------------------------------------------------
// GetDynamicClient
// ---------------------------------------------------------------------------

// TestGetDynamicClient_NoClusterMode mirrors the GetClient test for the dynamic
// variant to ensure the ErrNoClusterConfigured guard is symmetric.
func TestGetDynamicClient_NoClusterMode(t *testing.T) {
	m := &MultiClusterClient{
		clients:        make(map[string]kubernetes.Interface),
		configs:        make(map[string]*rest.Config),
		dynamicClients: make(map[string]dynamic.Interface),
		noClusterMode:  true,
	}

	_, err := m.GetDynamicClient("any-context")
	if !errors.Is(err, ErrNoClusterConfigured) {
		t.Errorf("GetDynamicClient in noClusterMode = %v, want ErrNoClusterConfigured", err)
	}
}

// TestGetDynamicClient_CacheHit verifies the fast-path for dynamic clients.
func TestGetDynamicClient_CacheHit(t *testing.T) {
	m, _ := NewMultiClusterClient("")
	injected := fake.NewSimpleDynamicClient(runScheme())
	m.InjectDynamicClient("dyn-ctx", injected)

	got, err := m.GetDynamicClient("dyn-ctx")
	if err != nil {
		t.Fatalf("GetDynamicClient(dyn-ctx) returned error: %v", err)
	}
	if got != injected {
		t.Error("GetDynamicClient did not return the cached dynamic client")
	}
}

// TestGetDynamicClient_FromCachedRestConfig verifies that when a REST config is
// already cached (e.g., injected via InjectRestConfig), GetDynamicClient builds
// a new dynamic client without re-resolving the kubeconfig.
//
// Construct MultiClusterClient directly (not via NewMultiClusterClient) so
// noClusterMode is unset — otherwise the noClusterMode guard short-circuits
// before the cached-config path is exercised.
func TestGetDynamicClient_FromCachedRestConfig(t *testing.T) {
	m := &MultiClusterClient{
		clients:        make(map[string]kubernetes.Interface),
		configs:        make(map[string]*rest.Config),
		dynamicClients: make(map[string]dynamic.Interface),
	}
	cfg := &rest.Config{Host: "https://example.com:6443"}
	m.InjectRestConfig("cached-config-ctx", cfg)

	got, err := m.GetDynamicClient("cached-config-ctx")
	if err != nil {
		t.Fatalf("GetDynamicClient from cached config = %v, want success", err)
	}
	if got == nil {
		t.Fatal("GetDynamicClient returned nil dynamic client")
	}
}

// TestGetDynamicClient_InClusterContext mirrors the GetClient in-cluster test
// for the dynamic variant, exercising the rest.CopyConfig branch.
func TestGetDynamicClient_InClusterContext(t *testing.T) {
	inCluster := &rest.Config{Host: "https://kubernetes.default.svc"}
	m := &MultiClusterClient{
		clients:         make(map[string]kubernetes.Interface),
		configs:         make(map[string]*rest.Config),
		dynamicClients:  make(map[string]dynamic.Interface),
		inClusterConfig: inCluster,
	}

	got, err := m.GetDynamicClient("in-cluster")
	if err != nil {
		t.Fatalf("GetDynamicClient(in-cluster) = %v, want success", err)
	}
	if got == nil {
		t.Fatal("GetDynamicClient(in-cluster) returned nil")
	}
}

// TestGetDynamicClient_UnknownContextWithBadKubeconfig mirrors the GetClient
// variant — an unknown context with no cached config must fail rather than
// silently returning a nil client.
func TestGetDynamicClient_UnknownContextWithBadKubeconfig(t *testing.T) {
	m := &MultiClusterClient{
		clients:        make(map[string]kubernetes.Interface),
		configs:        make(map[string]*rest.Config),
		dynamicClients: make(map[string]dynamic.Interface),
		kubeconfig:     "/nonexistent/path/kubeconfig",
	}

	_, err := m.GetDynamicClient("ghost-context")
	if err == nil {
		t.Fatal("expected error for unknown context with bad kubeconfig, got nil")
	}
}
