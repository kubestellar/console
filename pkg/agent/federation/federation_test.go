package federation

import (
	"context"
	"encoding/json"
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

type fakeActionProvider struct {
	*fakeProvider
	actions []ActionDescriptor
	result  ActionResult
	err     error
}

func (f *fakeActionProvider) Actions() []ActionDescriptor {
	return append([]ActionDescriptor(nil), f.actions...)
}

func (f *fakeActionProvider) Execute(context.Context, *rest.Config, ActionRequest) (ActionResult, error) {
	return f.result, f.err
}

func TestProviderInterfaceConformance(t *testing.T) {
	var _ Provider = (*fakeProvider)(nil)
	var _ ActionProvider = (*fakeActionProvider)(nil)
}

func TestActionRequestAndResult_JSONRoundTrip(t *testing.T) {
	req := ActionRequest{
		ActionID:    "karmada.taintCluster",
		Provider:    ProviderKarmada,
		HubContext:  "hub-a",
		ClusterName: "member-1",
		Payload: map[string]interface{}{
			"key":    "gpu",
			"value":  "true",
			"effect": "NoSchedule",
		},
	}

	raw, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("marshal ActionRequest: %v", err)
	}
	var gotReq ActionRequest
	if err := json.Unmarshal(raw, &gotReq); err != nil {
		t.Fatalf("unmarshal ActionRequest: %v", err)
	}
	if gotReq.ActionID != req.ActionID || gotReq.Provider != req.Provider || gotReq.HubContext != req.HubContext || gotReq.ClusterName != req.ClusterName {
		t.Fatalf("ActionRequest round-trip mismatch: got %+v want %+v", gotReq, req)
	}
	if len(gotReq.Payload) != len(req.Payload) {
		t.Fatalf("payload mismatch: got %d keys want %d", len(gotReq.Payload), len(req.Payload))
	}

	res := ActionResult{OK: true, Already: true, Message: "cluster already tainted"}
	raw, err = json.Marshal(res)
	if err != nil {
		t.Fatalf("marshal ActionResult: %v", err)
	}
	var gotRes ActionResult
	if err := json.Unmarshal(raw, &gotRes); err != nil {
		t.Fatalf("unmarshal ActionResult: %v", err)
	}
	if gotRes != res {
		t.Fatalf("ActionResult round-trip mismatch: got %+v want %+v", gotRes, res)
	}
}

func TestTypes_StableConstantValues(t *testing.T) {
	tests := []struct {
		name string
		got  string
		want string
	}{
		{name: "ProviderOCM", got: string(ProviderOCM), want: "ocm"},
		{name: "ProviderKarmada", got: string(ProviderKarmada), want: "karmada"},
		{name: "ProviderClusternet", got: string(ProviderClusternet), want: "clusternet"},
		{name: "ProviderLiqo", got: string(ProviderLiqo), want: "liqo"},
		{name: "ProviderKubeAdmiral", got: string(ProviderKubeAdmiral), want: "kubeadmiral"},
		{name: "ProviderCAPI", got: string(ProviderCAPI), want: "capi"},
		{name: "ClusterStateJoined", got: string(ClusterStateJoined), want: "joined"},
		{name: "ClusterStatePending", got: string(ClusterStatePending), want: "pending"},
		{name: "ClusterStateUnknown", got: string(ClusterStateUnknown), want: "unknown"},
		{name: "ClusterStateNotMember", got: string(ClusterStateNotMember), want: "not-member"},
		{name: "ClusterStateProvisioning", got: string(ClusterStateProvisioning), want: "provisioning"},
		{name: "ClusterStateProvisioned", got: string(ClusterStateProvisioned), want: "provisioned"},
		{name: "ClusterStateFailed", got: string(ClusterStateFailed), want: "failed"},
		{name: "ClusterStateDeleting", got: string(ClusterStateDeleting), want: "deleting"},
		{name: "ClusterErrorAuth", got: string(ClusterErrorAuth), want: "auth"},
		{name: "ClusterErrorTimeout", got: string(ClusterErrorTimeout), want: "timeout"},
		{name: "ClusterErrorNetwork", got: string(ClusterErrorNetwork), want: "network"},
		{name: "ClusterErrorCertificate", got: string(ClusterErrorCertificate), want: "certificate"},
		{name: "ClusterErrorNotInstalled", got: string(ClusterErrorNotInstalled), want: "not-installed"},
		{name: "ClusterErrorUnknown", got: string(ClusterErrorUnknown), want: "unknown"},
		{name: "FederatedGroupSet", got: string(FederatedGroupSet), want: "set"},
		{name: "FederatedGroupSelector", got: string(FederatedGroupSelector), want: "selector"},
		{name: "FederatedGroupPeer", got: string(FederatedGroupPeer), want: "peer"},
		{name: "FederatedGroupInfra", got: string(FederatedGroupInfra), want: "infra"},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			if tt.got != tt.want {
				t.Fatalf("%s changed: got %q want %q", tt.name, tt.got, tt.want)
			}
		})
	}
}

func TestFederatedTypes_JSONRoundTrip(t *testing.T) {
	cluster := FederatedCluster{
		Provider:     ProviderOCM,
		HubContext:   "hub-a",
		Name:         "member-1",
		State:        ClusterStateJoined,
		Available:    "True",
		ClusterSet:   "prod",
		Labels:       map[string]string{"region": "ap-south-1"},
		APIServerURL: "https://127.0.0.1:6443",
		Taints:       []Taint{{Key: "dedicated", Value: "gpu", Effect: "NoSchedule"}},
		Lifecycle: &Lifecycle{
			Phase:               "Provisioned",
			ControlPlaneReady:   true,
			InfrastructureReady: true,
			DesiredMachines:     3,
			ReadyMachines:       3,
		},
		Raw: map[string]interface{}{"kind": "ManagedCluster"},
	}
	group := FederatedGroup{
		Provider:   ProviderOCM,
		HubContext: "hub-a",
		Name:       "prod",
		Members:    []string{"member-1"},
		Kind:       FederatedGroupSet,
	}
	pending := PendingJoin{
		Provider:    ProviderOCM,
		HubContext:  "hub-a",
		ClusterName: "member-2",
		RequestedAt: time.Date(2026, 4, 30, 1, 0, 0, 0, time.UTC),
		Detail:      "csr waiting approval",
	}
	status := ProviderHubStatus{
		Provider:   ProviderOCM,
		HubContext: "hub-a",
		Detected:   true,
		Version:    "v0.13.0",
		Error: &FederationError{
			Provider:   ProviderOCM,
			HubContext: "hub-a",
			Type:       ClusterErrorTimeout,
			Message:    "request timed out",
		},
	}
	detect := DetectResult{Detected: true, Version: "v0.13.0"}

	roundTrip := func(name string, in interface{}, out interface{}) {
		t.Helper()
		raw, err := json.Marshal(in)
		if err != nil {
			t.Fatalf("%s marshal failed: %v", name, err)
		}
		if err := json.Unmarshal(raw, out); err != nil {
			t.Fatalf("%s unmarshal failed: %v", name, err)
		}
	}

	var gotCluster FederatedCluster
	roundTrip("FederatedCluster", cluster, &gotCluster)
	if gotCluster.Provider != cluster.Provider || gotCluster.Name != cluster.Name || gotCluster.State != cluster.State {
		t.Fatalf("cluster round-trip mismatch: got %+v want %+v", gotCluster, cluster)
	}

	var gotGroup FederatedGroup
	roundTrip("FederatedGroup", group, &gotGroup)
	if gotGroup.Provider != group.Provider || gotGroup.HubContext != group.HubContext || gotGroup.Name != group.Name || gotGroup.Kind != group.Kind || len(gotGroup.Members) != len(group.Members) || gotGroup.Members[0] != group.Members[0] {
		t.Fatalf("group round-trip mismatch: got %+v want %+v", gotGroup, group)
	}

	var gotPending PendingJoin
	roundTrip("PendingJoin", pending, &gotPending)
	if !gotPending.RequestedAt.Equal(pending.RequestedAt) || gotPending.ClusterName != pending.ClusterName {
		t.Fatalf("pending round-trip mismatch: got %+v want %+v", gotPending, pending)
	}

	var gotStatus ProviderHubStatus
	roundTrip("ProviderHubStatus", status, &gotStatus)
	if gotStatus.Provider != status.Provider || gotStatus.Version != status.Version || gotStatus.Error == nil || gotStatus.Error.Type != status.Error.Type {
		t.Fatalf("status round-trip mismatch: got %+v want %+v", gotStatus, status)
	}

	var gotDetect DetectResult
	roundTrip("DetectResult", detect, &gotDetect)
	if gotDetect != detect {
		t.Fatalf("detect round-trip mismatch: got %+v want %+v", gotDetect, detect)
	}
}
