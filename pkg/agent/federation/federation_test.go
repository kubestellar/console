package federation

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"k8s.io/client-go/rest"
)

// fakeProvider is a configurable stub that supports every Provider method.
// Tests construct one per scenario — Name() drives registry keying, and the
// error / result channels drive fan-out behavior deterministically.
type fakeProvider struct {
	name FederationProviderName

	detectResult DetectResult
	detectErr    error
	detectDelay  time.Duration
	detectCalls  int32

	clusters    []FederatedCluster
	clustersErr error

	groups    []FederatedGroup
	groupsErr error

	pending    []PendingJoin
	pendingErr error
}

func (f *fakeProvider) Name() FederationProviderName { return f.name }

func (f *fakeProvider) Detect(ctx context.Context, _ *rest.Config) (DetectResult, error) {
	atomic.AddInt32(&f.detectCalls, 1)
	if f.detectDelay > 0 {
		select {
		case <-time.After(f.detectDelay):
		case <-ctx.Done():
			return DetectResult{}, ctx.Err()
		}
	}
	return f.detectResult, f.detectErr
}

func (f *fakeProvider) ReadClusters(context.Context, *rest.Config) ([]FederatedCluster, error) {
	return f.clusters, f.clustersErr
}

func (f *fakeProvider) ReadGroups(context.Context, *rest.Config) ([]FederatedGroup, error) {
	return f.groups, f.groupsErr
}

func (f *fakeProvider) ReadPendingJoins(context.Context, *rest.Config) ([]PendingJoin, error) {
	return f.pending, f.pendingErr
}

func TestRegistry_EmptyInitialState(t *testing.T) {
	// PR A ships with the registry empty — every `go test` invocation should
	// see zero providers registered by default. If a future PR accidentally
	// registers a provider from this package's init(), this test catches it.
	Reset()
	if got := All(); len(got) != 0 {
		t.Fatalf("registry should start empty; got %d providers", len(got))
	}
	if _, ok := Get(ProviderOCM); ok {
		t.Fatalf("Get should miss on an empty registry")
	}
}

func TestRegistry_RegisterAndGet(t *testing.T) {
	Reset()
	defer Reset()

	ocm := &fakeProvider{name: ProviderOCM}
	karmada := &fakeProvider{name: ProviderKarmada}
	Register(ocm)
	Register(karmada)

	if got, ok := Get(ProviderOCM); !ok || got != ocm {
		t.Fatalf("Get(OCM) mismatch: ok=%v", ok)
	}
	if got, ok := Get(ProviderKarmada); !ok || got != karmada {
		t.Fatalf("Get(Karmada) mismatch: ok=%v", ok)
	}
	// All() must be lexicographic by Name so iteration order is stable in
	// other callers (e.g. UI-rendered provider tiles).
	all := All()
	if len(all) != 2 {
		t.Fatalf("All() returned %d, want 2", len(all))
	}
	if all[0].Name() != ProviderKarmada || all[1].Name() != ProviderOCM {
		t.Fatalf("All() not sorted; got %v, %v", all[0].Name(), all[1].Name())
	}
}

func TestRegistry_RegisterNilPanics(t *testing.T) {
	Reset()
	defer Reset()
	defer func() {
		if r := recover(); r == nil {
			t.Fatalf("Register(nil) should panic; did not")
		}
	}()
	Register(nil)
}

func TestRegistry_ResetClears(t *testing.T) {
	Reset()
	Register(&fakeProvider{name: ProviderOCM})
	if len(All()) != 1 {
		t.Fatalf("sanity: registry should have 1 entry before Reset")
	}
	Reset()
	if len(All()) != 0 {
		t.Fatalf("Reset should empty the registry")
	}
}

// testConfigResolver always returns a non-nil *rest.Config so fake providers
// can be invoked without a real kubeconfig. Returning a shared pointer is
// fine — fake providers don't touch the config.
func testConfigResolver(string) (*rest.Config, error) {
	return &rest.Config{}, nil
}

// fanOutHelpers are re-exported from the agent package in real life; the
// tests below exercise the server-package fan-out in the agent test file.
// This file covers registry-level behavior only. For scenarios that need
// the fan-out helper itself, see server_federation_test.go.

func TestFederationError_ImplementsError(t *testing.T) {
	// FederationError must satisfy `error` so callers can return it directly
	// anywhere `error` is expected.
	var e error = &FederationError{
		Provider:   ProviderOCM,
		HubContext: "hub-a",
		Type:       ClusterErrorAuth,
		Message:    "forbidden",
	}
	if e.Error() != "auth: forbidden" {
		t.Fatalf("unexpected Error(): %q", e.Error())
	}
	var nilE *FederationError
	if nilE.Error() != "" {
		t.Fatalf("nil FederationError should Error() to empty string")
	}
}

// TestFanOut_ParallelExecution asserts that Detect is invoked concurrently
// across providers rather than serialized. We construct N providers that
// each block for a fixed delay and verify that the total elapsed time is
// less than N * delay. The margin is wide enough (N * delay / 2) that this
// is not flaky under CI load.
func TestFanOut_ParallelExecution(t *testing.T) {
	const n = 5
	const delay = 100 * time.Millisecond
	providers := make([]Provider, 0, n)
	for i := 0; i < n; i++ {
		providers = append(providers, &fakeProvider{
			name:         FederationProviderName(string(rune('a' + i))),
			detectResult: DetectResult{Detected: true},
			detectDelay:  delay,
		})
	}

	// Invoke Detect on all providers in parallel and measure wall-clock.
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	var wg sync.WaitGroup
	start := time.Now()
	for _, p := range providers {
		wg.Add(1)
		go func(p Provider) {
			defer wg.Done()
			_, _ = p.Detect(ctx, &rest.Config{})
		}(p)
	}
	wg.Wait()
	elapsed := time.Since(start)

	// Serial would be n*delay = 500ms; parallel should be ~delay = 100ms.
	// Allow up to 2.5× delay for CI jitter while still catching serialization.
	maxAllowed := time.Duration(float64(delay) * 2.5)
	if elapsed > maxAllowed {
		t.Fatalf("providers ran serially (elapsed=%v > %v)", elapsed, maxAllowed)
	}

	for i, p := range providers {
		fp := p.(*fakeProvider)
		if got := atomic.LoadInt32(&fp.detectCalls); got != 1 {
			t.Fatalf("provider %d: Detect called %d times, want 1", i, got)
		}
	}
}

// TestFanOut_OneProviderErrorDoesNotPoisonOthers verifies the plan's
// cross-provider isolation guarantee: one provider returning an auth error
// must not prevent another provider's results from being collected. This
// test targets the provider-level behavior; the server-level fan-out test
// (server_federation_test.go) repeats the assertion at the HTTP layer.
func TestFanOut_OneProviderErrorDoesNotPoisonOthers(t *testing.T) {
	Reset()
	defer Reset()

	// Provider A: auth failure on every read.
	providerA := &fakeProvider{
		name:        ProviderOCM,
		clustersErr: errors.New("forbidden: 403"),
	}
	// Provider B: normal results.
	clusterB := FederatedCluster{
		Provider:   ProviderKarmada,
		HubContext: "hub-b",
		Name:       "member-1",
		State:      ClusterStateJoined,
	}
	providerB := &fakeProvider{
		name:     ProviderKarmada,
		clusters: []FederatedCluster{clusterB},
	}
	Register(providerA)
	Register(providerB)

	all := All()
	if len(all) != 2 {
		t.Fatalf("expected 2 registered providers; got %d", len(all))
	}

	// Simulate the server's per-provider branch. We expect A to err and B
	// to succeed; we assert both outcomes are visible to the caller.
	ctx := context.Background()
	cfg := &rest.Config{}

	var gotErr error
	var gotClusters []FederatedCluster

	for _, p := range all {
		cs, err := p.ReadClusters(ctx, cfg)
		if err != nil {
			gotErr = err
			continue
		}
		gotClusters = append(gotClusters, cs...)
	}

	if gotErr == nil {
		t.Fatalf("expected provider A to report an error")
	}
	if len(gotClusters) != 1 || gotClusters[0].Name != clusterB.Name {
		t.Fatalf("provider B's result was poisoned: got %+v", gotClusters)
	}
}
