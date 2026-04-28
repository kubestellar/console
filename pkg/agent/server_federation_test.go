package agent

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"k8s.io/client-go/rest"

	"github.com/kubestellar/console/pkg/agent/federation"
	"github.com/kubestellar/console/pkg/k8s"
)

// testBearerToken is the fake shared secret used by federation handler tests.
// Kept as a constant so the per-test server + request headers match.
const testBearerToken = "test-agent-token"

// fakeProvider is the server-side mirror of the one in
// federation/federation_test.go, used here to drive handler fan-out under
// realistic conditions. Each field mirrors the Provider contract plus a
// per-context map so the provider can return different data per hub.
type handlerFakeProvider struct {
	name FederationProviderName

	// perContextClusters overrides clusters returned per hub context so
	// multi-hub tests can prove each result carries the correct HubContext
	// stamp. The key is the rest.Config.Host value that stubResolver sets.
	perContextClusters map[string][]FederatedCluster

	detectCalls int32
	readCalls   int32
}

// Short aliases to the federation-package types so the test body reads
// naturally. Using aliases instead of re-exports keeps compile-time coupling
// explicit.
type (
	FederationProviderName = federation.FederationProviderName
	FederatedCluster       = federation.FederatedCluster
	FederatedGroup         = federation.FederatedGroup
	PendingJoin            = federation.PendingJoin
	DetectResult           = federation.DetectResult
	ProviderHubStatus      = federation.ProviderHubStatus
	FederationError        = federation.FederationError
)

func (f *handlerFakeProvider) Name() FederationProviderName { return f.name }

func (f *handlerFakeProvider) Detect(_ context.Context, _ *rest.Config) (DetectResult, error) {
	atomic.AddInt32(&f.detectCalls, 1)
	// Note: without access to hub context we must look up by side-channel.
	// The server_federation fan-out actually derives hub context from the
	// configResolver — so the fake cannot see which hub it was called with
	// here. Tests that need per-hub data use perContextClusters via
	// Read*() methods below, which DO see hub context through the rest.Config
	// pointer identity (set up by the per-context resolver). For Detect, we
	// always return Detected=true with no version.
	return DetectResult{Detected: true}, nil
}

// restConfigKey is the marker we stuff in the *rest.Config.Host field so
// fake providers can tell which hub context they're being called against.
// The handler test sets up a per-context resolver that stamps this value
// into a fresh rest.Config.
func (f *handlerFakeProvider) hubFromConfig(cfg *rest.Config) string {
	if cfg == nil {
		return ""
	}
	return cfg.Host
}

func (f *handlerFakeProvider) ReadClusters(_ context.Context, cfg *rest.Config) ([]FederatedCluster, error) {
	atomic.AddInt32(&f.readCalls, 1)
	if f.perContextClusters == nil {
		return nil, nil
	}
	if out, ok := f.perContextClusters[f.hubFromConfig(cfg)]; ok {
		return out, nil
	}
	return []FederatedCluster{}, nil
}

func (f *handlerFakeProvider) ReadGroups(_ context.Context, _ *rest.Config) ([]FederatedGroup, error) {
	return nil, nil
}

func (f *handlerFakeProvider) ReadPendingJoins(_ context.Context, _ *rest.Config) ([]PendingJoin, error) {
	return nil, nil
}

// newTestServer returns a *Server wired with a real (empty) k8s client and
// a shared agentToken so validateToken exercises the production code path.
// The kubeconfigPath parameter allows tests to inject a real kubeconfig
// YAML file so DeduplicatedClusters returns the test-authored contexts.
func newTestServer(t *testing.T, kubeconfigPath, agentToken string) *Server {
	t.Helper()
	k8sClient, err := k8s.NewMultiClusterClient(kubeconfigPath)
	if err != nil {
		t.Fatalf("NewMultiClusterClient: %v", err)
	}
	if kubeconfigPath != "" {
		if err := k8sClient.LoadConfig(); err != nil {
			t.Fatalf("LoadConfig: %v", err)
		}
	}
	return &Server{
		k8sClient:      k8sClient,
		agentToken:     agentToken,
		allowedOrigins: []string{"http://localhost"},
	}
}

// writeTestKubeconfig drops a minimal kubeconfig at the given path containing
// the supplied (contextName -> serverURL) pairs. The file is valid enough
// for MultiClusterClient.LoadConfig to accept and for DeduplicatedClusters
// to enumerate. Real dynamic-client construction from this file WOULD fail
// (no real apiserver on the URL) — tests only exercise the context-listing
// path, not the actual provider-read path.
func writeTestKubeconfig(t *testing.T, path string, entries map[string]string) {
	t.Helper()

	type cluster struct {
		Server string `yaml:"server"`
	}
	type namedCluster struct {
		Name    string  `yaml:"name"`
		Cluster cluster `yaml:"cluster"`
	}
	type ctxInfo struct {
		Cluster string `yaml:"cluster"`
		User    string `yaml:"user"`
	}
	type namedContext struct {
		Name    string  `yaml:"name"`
		Context ctxInfo `yaml:"context"`
	}

	// Build YAML manually to avoid pulling in a YAML dep just for tests.
	var b strings.Builder
	b.WriteString("apiVersion: v1\nkind: Config\n")
	b.WriteString("clusters:\n")
	// Iterate sorted so file contents are deterministic.
	names := make([]string, 0, len(entries))
	for n := range entries {
		names = append(names, n)
	}
	sort.Strings(names)
	for _, n := range names {
		fmt.Fprintf(&b, "- name: %s\n  cluster:\n    server: %s\n", n, entries[n])
	}
	b.WriteString("contexts:\n")
	for _, n := range names {
		fmt.Fprintf(&b, "- name: %s\n  context:\n    cluster: %s\n    user: test-user\n", n, n)
	}
	b.WriteString("users:\n- name: test-user\n  user: {}\n")
	if len(names) > 0 {
		fmt.Fprintf(&b, "current-context: %s\n", names[0])
	}

	if err := os.WriteFile(path, []byte(b.String()), 0600); err != nil {
		t.Fatalf("write kubeconfig: %v", err)
	}
}

// TestHandler_MissingBearerToken_401 asserts the "no pod-SA fallback"
// contract: a federation read request without a valid bearer token returns
// HTTP 401 Unauthorized, loudly signaling the missing identity with the
// semantically correct status code.
func TestHandler_MissingBearerToken_401(t *testing.T) {
	s := newTestServer(t, "", testBearerToken)

	endpoints := []string{
		"/federation/detect",
		"/federation/clusters",
		"/federation/groups",
		"/federation/pending-joins",
	}
	handlers := map[string]http.HandlerFunc{
		"/federation/detect":        s.handleFederationDetect,
		"/federation/clusters":      s.handleFederationClusters,
		"/federation/groups":        s.handleFederationGroups,
		"/federation/pending-joins": s.handleFederationPendingJoins,
	}

	for _, e := range endpoints {
		t.Run(e, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, e, nil)
			req.Header.Set("Origin", "http://localhost:8080")
			// No Authorization header at all — the strict test.
			w := httptest.NewRecorder()
			handlers[e](w, req)
			if w.Code != http.StatusUnauthorized {
				t.Fatalf("%s: got %d, want 401", e, w.Code)
			}
		})
	}
}

// TestHandler_EmptyRegistry_ReturnsEmpty verifies that when no provider is
// registered (the state PR A ships in), the handler returns a JSON array
// (not null, not a 500). This is a key guarantee for the UI — the hook can
// safely iterate the response on first page load before any provider has
// been shipped in a follow-up PR.
func TestHandler_EmptyRegistry_ReturnsEmpty(t *testing.T) {
	federation.Reset()
	defer federation.Reset()

	dir := t.TempDir()
	kcfg := filepath.Join(dir, "kubeconfig")
	writeTestKubeconfig(t, kcfg, map[string]string{
		"hub-a": "https://hub-a.example",
	})
	s := newTestServer(t, kcfg, testBearerToken)

	req := httptest.NewRequest(http.MethodGet, "/federation/detect", nil)
	req.Header.Set("Authorization", "Bearer "+testBearerToken)
	w := httptest.NewRecorder()
	s.handleFederationDetect(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("want 200, got %d (body=%s)", w.Code, w.Body.String())
	}
	// Response must be a JSON array (possibly empty), not `null`.
	var got []ProviderHubStatus
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode: %v (body=%s)", err, w.Body.String())
	}
	if len(got) != 0 {
		t.Fatalf("want empty array, got %d entries", len(got))
	}
	// Explicit `[]` in the wire body — not `null`.
	body := strings.TrimSpace(w.Body.String())
	if body != "[]" {
		t.Fatalf("wire body should be `[]`, got %q", body)
	}

	// The list handlers use an envelope; they should still return an empty
	// items slice (not null) under an empty registry.
	for _, e := range []string{"/federation/clusters", "/federation/groups", "/federation/pending-joins"} {
		req := httptest.NewRequest(http.MethodGet, e, nil)
		req.Header.Set("Authorization", "Bearer "+testBearerToken)
		w := httptest.NewRecorder()
		switch e {
		case "/federation/clusters":
			s.handleFederationClusters(w, req)
		case "/federation/groups":
			s.handleFederationGroups(w, req)
		case "/federation/pending-joins":
			s.handleFederationPendingJoins(w, req)
		}
		if w.Code != http.StatusOK {
			t.Fatalf("%s: want 200, got %d (body=%s)", e, w.Code, w.Body.String())
		}
		var envelope map[string]interface{}
		if err := json.Unmarshal(w.Body.Bytes(), &envelope); err != nil {
			t.Fatalf("%s: decode: %v", e, err)
		}
		if envelope["errors"] == nil {
			t.Fatalf("%s: errors field missing", e)
		}
	}
}

// stubResolver is a fake configResolver that returns a fresh *rest.Config
// with the hub context name stamped into Host. Tests use this to inspect
// which hub a fake provider is being called against, without having to
// stand up a real apiserver.
func stubResolver(hubToHost map[string]string) configResolver {
	return func(contextName string) (*rest.Config, error) {
		host, ok := hubToHost[contextName]
		if !ok {
			return nil, fmt.Errorf("unknown context %q", contextName)
		}
		return &rest.Config{Host: host}, nil
	}
}

// TestFanOut_OneProviderErrorDoesNotPoisonOthers_Handler exercises the
// server-level fanOutRead path and asserts a single (provider, hub)
// failure is classified into FederationError while other pairs' results
// are returned intact. This mirrors the federation-package test of the
// same name but at the server layer — the UI-facing contract.
func TestFanOut_OneProviderErrorDoesNotPoisonOthers_Handler(t *testing.T) {
	providers := []federation.Provider{
		// Provider that always errors on ReadClusters.
		&alwaysErrReadProvider{name: federation.ProviderOCM, errMsg: "forbidden: 403"},
		// Provider that returns a real result per hub.
		&handlerFakeProvider{
			name: federation.ProviderKarmada,
			perContextClusters: map[string][]FederatedCluster{
				"hub-a": {{Provider: federation.ProviderKarmada, HubContext: "hub-a", Name: "member-1"}},
			},
		},
	}
	resolver := stubResolver(map[string]string{"hub-a": "hub-a"})

	items, errs := fanOutRead(
		context.Background(),
		providers,
		[]string{"hub-a"},
		resolver,
		func(ctx context.Context, p federation.Provider, cfg *rest.Config) (interface{}, error) {
			return p.ReadClusters(ctx, cfg)
		},
	)

	// Exactly one error from the bad provider, exactly one cluster from the
	// good one. Neither poisoned the other.
	if len(errs) != 1 {
		t.Fatalf("want 1 error, got %d (%#v)", len(errs), errs)
	}
	if errs[0].Provider != federation.ProviderOCM || errs[0].Type != federation.ClusterErrorAuth {
		t.Fatalf("error not classified as auth: %#v", errs[0])
	}
	if len(items) != 1 {
		t.Fatalf("want 1 good cluster, got %d (%#v)", len(items), items)
	}
	cl, ok := items[0].(FederatedCluster)
	if !ok {
		t.Fatalf("result not a FederatedCluster: %T", items[0])
	}
	if cl.Name != "member-1" || cl.HubContext != "hub-a" {
		t.Fatalf("wrong cluster payload: %+v", cl)
	}
}

// alwaysErrReadProvider returns an error for every reader call. Detect is
// hard-coded to succeed so fan-out reaches the reader stage.
type alwaysErrReadProvider struct {
	name   FederationProviderName
	errMsg string
}

func (p *alwaysErrReadProvider) Name() FederationProviderName { return p.name }
func (p *alwaysErrReadProvider) Detect(context.Context, *rest.Config) (DetectResult, error) {
	return DetectResult{Detected: true}, nil
}
func (p *alwaysErrReadProvider) ReadClusters(context.Context, *rest.Config) ([]FederatedCluster, error) {
	return nil, errors.New(p.errMsg)
}
func (p *alwaysErrReadProvider) ReadGroups(context.Context, *rest.Config) ([]FederatedGroup, error) {
	return nil, errors.New(p.errMsg)
}
func (p *alwaysErrReadProvider) ReadPendingJoins(context.Context, *rest.Config) ([]PendingJoin, error) {
	return nil, errors.New(p.errMsg)
}

// TestFanOut_ParallelExecution_Handler verifies that the server-level
// fanOutDetect runs all (provider, context) probes concurrently. We use
// delayed providers and measure wall-clock; serial execution would take
// N * delay while parallel should take ~delay.
func TestFanOut_ParallelExecution_Handler(t *testing.T) {
	const n = 4
	const delay = 120 * time.Millisecond

	providers := make([]federation.Provider, 0, n)
	for i := 0; i < n; i++ {
		providers = append(providers, &delayedProvider{
			name:  FederationProviderName(string(rune('a' + i))),
			delay: delay,
		})
	}
	resolver := stubResolver(map[string]string{"hub-a": "hub-a-host"})

	start := time.Now()
	out := fanOutDetect(context.Background(), providers, []string{"hub-a"}, resolver)
	elapsed := time.Since(start)

	if len(out) != n {
		t.Fatalf("expected %d results, got %d", n, len(out))
	}
	// Allow up to 2.5× delay for CI jitter.
	maxAllowed := time.Duration(float64(delay) * 2.5)
	if elapsed > maxAllowed {
		t.Fatalf("fanOutDetect ran serially: elapsed=%v > %v", elapsed, maxAllowed)
	}
}

// delayedProvider is a Detect-only provider that sleeps before returning so
// parallelism can be measured.
type delayedProvider struct {
	name  FederationProviderName
	delay time.Duration
}

func (d *delayedProvider) Name() FederationProviderName { return d.name }
func (d *delayedProvider) Detect(ctx context.Context, _ *rest.Config) (DetectResult, error) {
	select {
	case <-time.After(d.delay):
		return DetectResult{Detected: true}, nil
	case <-ctx.Done():
		return DetectResult{}, ctx.Err()
	}
}
func (d *delayedProvider) ReadClusters(context.Context, *rest.Config) ([]FederatedCluster, error) {
	return nil, nil
}
func (d *delayedProvider) ReadGroups(context.Context, *rest.Config) ([]FederatedGroup, error) {
	return nil, nil
}
func (d *delayedProvider) ReadPendingJoins(context.Context, *rest.Config) ([]PendingJoin, error) {
	return nil, nil
}

// TestFanOut_PerContextErrorsClassified verifies that each (provider, hub)
// pair gets its own FederationError entry when the resolver fails for one
// hub while succeeding for another. The successful hub's results must not
// be affected by the failing hub.
func TestFanOut_PerContextErrorsClassified(t *testing.T) {
	provider := &handlerFakeProvider{
		name: federation.ProviderOCM,
		perContextClusters: map[string][]FederatedCluster{
			"host-good": {{Provider: federation.ProviderOCM, HubContext: "hub-good", Name: "c1"}},
		},
	}

	// Resolver succeeds for hub-good, errors for hub-bad with a message that
	// classifyError should bucket as network.
	resolver := func(contextName string) (*rest.Config, error) {
		switch contextName {
		case "hub-good":
			return &rest.Config{Host: "host-good"}, nil
		case "hub-bad":
			return nil, errors.New("dial tcp 10.0.0.1:6443: connection refused")
		default:
			return nil, fmt.Errorf("unknown context %q", contextName)
		}
	}

	items, errs := fanOutRead(
		context.Background(),
		[]federation.Provider{provider},
		[]string{"hub-good", "hub-bad"},
		resolver,
		func(ctx context.Context, p federation.Provider, cfg *rest.Config) (interface{}, error) {
			return p.ReadClusters(ctx, cfg)
		},
	)

	// One good cluster, one classified error.
	if len(items) != 1 {
		t.Fatalf("expected 1 item, got %d (%#v)", len(items), items)
	}
	if len(errs) != 1 {
		t.Fatalf("expected 1 error, got %d (%#v)", len(errs), errs)
	}
	if errs[0].HubContext != "hub-bad" {
		t.Fatalf("error HubContext = %q, want hub-bad", errs[0].HubContext)
	}
	if errs[0].Type != federation.ClusterErrorNetwork {
		t.Fatalf("error Type = %q, want %q", errs[0].Type, federation.ClusterErrorNetwork)
	}
	if errs[0].Provider != federation.ProviderOCM {
		t.Fatalf("error Provider = %q, want OCM", errs[0].Provider)
	}
}

// TestHandler_MultiHubFanOut stands up a kubeconfig with two contexts and a
// fake provider that returns different clusters per hub. The handler must
// aggregate both contexts' results and stamp each with the correct
// HubContext. This proves the request-level fan-out over the user's
// kubeconfig, not just the unit-level fanOutRead helper.
func TestHandler_MultiHubFanOut(t *testing.T) {
	federation.Reset()
	defer federation.Reset()

	provider := &handlerFakeProvider{
		name: federation.ProviderOCM,
		perContextClusters: map[string][]FederatedCluster{
			"https://hub-a.example": {{
				Provider:   federation.ProviderOCM,
				HubContext: "hub-a",
				Name:       "member-a1",
				State:      federation.ClusterStateJoined,
			}},
			"https://hub-b.example": {{
				Provider:   federation.ProviderOCM,
				HubContext: "hub-b",
				Name:       "member-b1",
				State:      federation.ClusterStateJoined,
			}},
		},
	}
	federation.Register(provider)

	dir := t.TempDir()
	kcfg := filepath.Join(dir, "kubeconfig")
	writeTestKubeconfig(t, kcfg, map[string]string{
		"hub-a": "https://hub-a.example",
		"hub-b": "https://hub-b.example",
	})

	s := newTestServer(t, kcfg, testBearerToken)

	req := httptest.NewRequest(http.MethodGet, "/federation/clusters", nil)
	req.Header.Set("Authorization", "Bearer "+testBearerToken)
	w := httptest.NewRecorder()
	s.handleFederationClusters(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("want 200, got %d (body=%s)", w.Code, w.Body.String())
	}

	var resp struct {
		Clusters []FederatedCluster `json:"clusters"`
		Errors   []FederationError  `json:"errors"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode: %v (body=%s)", err, w.Body.String())
	}
	// Expect 2 clusters total — one per hub.
	if len(resp.Clusters) != 2 {
		t.Fatalf("want 2 clusters, got %d (%#v)", len(resp.Clusters), resp.Clusters)
	}
	// Verify each expected hub is represented (order may vary — fan-out is
	// concurrent).
	seen := map[string]string{}
	for _, c := range resp.Clusters {
		seen[c.HubContext] = c.Name
	}
	if seen["hub-a"] != "member-a1" {
		t.Fatalf("hub-a result missing/wrong: %+v", resp.Clusters)
	}
	if seen["hub-b"] != "member-b1" {
		t.Fatalf("hub-b result missing/wrong: %+v", resp.Clusters)
	}
}

// TestRequireBearerToken_NoAuthConfigured verifies that when the agent is
// started WITHOUT a KC_AGENT_TOKEN (dev mode), federation handlers still
// process the request — the 500 bypass only fires when token auth is
// configured and the caller failed validation.
func TestRequireBearerToken_NoAuthConfigured(t *testing.T) {
	s := newTestServer(t, "", "")

	req := httptest.NewRequest(http.MethodGet, "/federation/detect", nil)
	w := httptest.NewRecorder()
	// No token header AND no agentToken set — should pass the gate.
	if !s.requireBearerToken(w, req) {
		t.Fatalf("with agentToken unset, requireBearerToken should return true")
	}
}

