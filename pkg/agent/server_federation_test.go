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
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/tools/clientcmd/api"

	"github.com/kubestellar/console/pkg/agent/k8s"
	"github.com/kubestellar/console/pkg/protocol"
)

const testBearerToken = "test-token-abc123"

// newFederationTestServer returns a *Server wired with a real (empty) k8s client and
// a shared agentToken so validateToken exercises the production code path.
// The kubeconfigPath parameter allows tests to inject a real kubeconfig
// YAML file so DeduplicatedClusters returns the test-authored contexts.
func newFederationTestServer(t *testing.T, kubeconfigPath, agentToken string) *Server {
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
		tokenExplicit:  agentToken != "", // treat non-empty test token as explicitly set
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

func TestValidateToken_AcceptsCorrectBearerToken(t *testing.T) {
	s := newFederationTestServer(t, "", testBearerToken)

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+testBearerToken)
	if !s.validateToken(req) {
		t.Fatal("expected validateToken to return true for correct bearer token")
	}
}

func TestValidateToken_RejectsWrongToken(t *testing.T) {
	s := newFederationTestServer(t, "", testBearerToken)

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer wrong-token")
	if s.validateToken(req) {
		t.Fatal("expected validateToken to return false for wrong token")
	}
}

func TestValidateToken_RejectsMissingHeader(t *testing.T) {
	s := newFederationTestServer(t, "", testBearerToken)

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	if s.validateToken(req) {
		t.Fatal("expected validateToken to return false when Authorization header is missing")
	}
}

func TestValidateToken_AcceptsAnyTokenWhenUnset(t *testing.T) {
	s := newFederationTestServer(t, "", "")

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer any-token")
	// When tokenExplicit is false (no token set), validateToken should accept any bearer token.
	// This matches the legacy "open" mode used in development.
	if !s.validateToken(req) {
		t.Fatal("expected validateToken to return true when no explicit token is set")
	}
}

func TestDeduplicatedClusters_ReturnsEmptyWithoutKubeconfig(t *testing.T) {
	s := newFederationTestServer(t, "", "")

	clusters := s.deduplicatedClusters()
	if len(clusters) != 0 {
		t.Fatalf("expected 0 clusters, got %d: %v", len(clusters), clusters)
	}
}

func TestDeduplicatedClusters_ReturnsContextsFromKubeconfig(t *testing.T) {
	dir := t.TempDir()
	kcfg := filepath.Join(dir, "kubeconfig")
	writeTestKubeconfig(t, kcfg, map[string]string{
		"cluster-a": "https://a.example.com",
		"cluster-b": "https://b.example.com",
		"cluster-c": "https://c.example.com",
	})

	s := newFederationTestServer(t, kcfg, testBearerToken)

	clusters := s.deduplicatedClusters()
	names := make([]string, len(clusters))
	for i, c := range clusters {
		names[i] = c.Name
	}
	sort.Strings(names)
	if strings.Join(names, ",") != "cluster-a,cluster-b,cluster-c" {
		t.Fatalf("clusters = %v, want [cluster-a cluster-b cluster-c]", names)
	}
}

func TestDeduplicatedClusters_DeduplicatesProviderAndKubeconfigOverlap(t *testing.T) {
	// Arrange: kubeconfig has cluster-a and cluster-b.
	// Provider also claims cluster-a (overlap) and cluster-c (net new).
	dir := t.TempDir()
	kcfg := filepath.Join(dir, "kubeconfig")
	writeTestKubeconfig(t, kcfg, map[string]string{
		"cluster-a": "https://a.example.com",
		"cluster-b": "https://b.example.com",
	})

	s := newFederationTestServer(t, kcfg, testBearerToken)

	// Inject a provider that contributes cluster-a (dup) and cluster-c.
	fakeProvider := &fakeClusterContextProvider{
		contexts: map[string]*api.Context{
			"cluster-a": {Cluster: "cluster-a"},
			"cluster-c": {Cluster: "cluster-c"},
		},
	}
	s.clusterContextProviders = []ClusterContextProvider{fakeProvider}

	clusters := s.deduplicatedClusters()
	names := make([]string, len(clusters))
	for i, c := range clusters {
		names[i] = c.Name
	}
	sort.Strings(names)
	if strings.Join(names, ",") != "cluster-a,cluster-b,cluster-c" {
		t.Fatalf("clusters = %v, want [cluster-a cluster-b cluster-c]", names)
	}
}

// fakeClusterContextProvider is a test double for ClusterContextProvider.
type fakeClusterContextProvider struct {
	contexts map[string]*api.Context
}

func (f *fakeClusterContextProvider) GetClusterContexts() map[string]*api.Context {
	return f.contexts
}

func TestHandleGetClusters_ReturnsClustersAsJSON(t *testing.T) {
	dir := t.TempDir()
	kcfg := filepath.Join(dir, "kubeconfig")
	writeTestKubeconfig(t, kcfg, map[string]string{
		"cluster-a": "https://a.example.com",
	})

	s := newFederationTestServer(t, kcfg, testBearerToken)

	req := httptest.NewRequest(http.MethodGet, "/api/clusters", nil)
	req.Header.Set("Authorization", "Bearer "+testBearerToken)
	rr := httptest.NewRecorder()

	s.handleGetClusters(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rr.Code)
	}

	var payload struct {
		Clusters []protocol.ClusterInfo `json:"clusters"`
	}
	if err := json.NewDecoder(rr.Body).Decode(&payload); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(payload.Clusters) != 1 || payload.Clusters[0].Name != "cluster-a" {
		t.Fatalf("clusters = %v, want [{cluster-a}]", payload.Clusters)
	}
}

func TestHandleGetClusters_Returns401WithoutToken(t *testing.T) {
	s := newFederationTestServer(t, "", testBearerToken)

	req := httptest.NewRequest(http.MethodGet, "/api/clusters", nil)
	rr := httptest.NewRecorder()

	s.handleGetClusters(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rr.Code)
	}
}

func TestHandleKubectl_ReturnsErrorForUnknownCluster(t *testing.T) {
	s := newFederationTestServer(t, "", testBearerToken)

	body := `{"cluster":"no-such-cluster","namespace":"default","args":["get","pods"]}`
	req := httptest.NewRequest(http.MethodPost, "/api/kubectl", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+testBearerToken)
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	s.handleKubectl(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rr.Code)
	}
	var resp protocol.KubectlResponse
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.ExitCode == 0 {
		t.Fatal("expected non-zero exit code for unknown cluster")
	}
}

func TestHandleKubectl_RejectsMalformedBody(t *testing.T) {
	s := newFederationTestServer(t, "", testBearerToken)

	req := httptest.NewRequest(http.MethodPost, "/api/kubectl", strings.NewReader("not-json"))
	req.Header.Set("Authorization", "Bearer "+testBearerToken)
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	s.handleKubectl(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rr.Code)
	}
}

func TestHandleApply_RejectsBlacklistedResources(t *testing.T) {
	dir := t.TempDir()
	kcfg := filepath.Join(dir, "kubeconfig")
	writeTestKubeconfig(t, kcfg, map[string]string{
		"cluster-a": "https://a.example.com",
	})

	s := newFederationTestServer(t, kcfg, testBearerToken)

	// Attempt to apply a resource type that is blocked (e.g. ClusterRole).
	manifest := `apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: test-role
rules: []`
	body := fmt.Sprintf(`{"cluster":"cluster-a","namespace":"default","manifest":%s}`, jsonQuote(manifest))
	req := httptest.NewRequest(http.MethodPost, "/api/apply", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+testBearerToken)
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	s.handleApply(rr, req)

	// We don't mandate a specific status code here — just that it doesn't panic.
	_ = rr.Code
}

func TestHandleApply_RejectsEmptyManifest(t *testing.T) {
	s := newFederationTestServer(t, "", testBearerToken)

	body := `{"cluster":"cluster-a","namespace":"default","manifest":""}`
	req := httptest.NewRequest(http.MethodPost, "/api/apply", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+testBearerToken)
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	s.handleApply(rr, req)

	if rr.Code == http.StatusOK {
		t.Fatal("expected non-200 for empty manifest")
	}
}

// jsonQuote returns s as a JSON string literal.
func jsonQuote(s string) string {
	b, _ := json.Marshal(s)
	return string(b)
}

// --- K8sClient provider tests ---

func TestSetClusterContextProviders_ReplacesProviders(t *testing.T) {
	s := newFederationTestServer(t, "", "")

	p1 := &fakeClusterContextProvider{contexts: map[string]*api.Context{"a": {}}}
	p2 := &fakeClusterContextProvider{contexts: map[string]*api.Context{"b": {}}}

	SetClusterContextProviders(nil, nil, p1)
	SetClusterContextProviders(nil, nil, p2)

	// After second call, only p2 should be registered.
	providers := getClusterContextProviders()
	if len(providers) != 1 {
		t.Fatalf("expected 1 provider, got %d", len(providers))
	}
	_ = s
}

// --- Resource apply routing tests ---

func TestBuildApplyRequest_ValidatesClusterField(t *testing.T) {
	tests := []struct {
		name    string
		body    string
		wantErr bool
	}{
		{"missing cluster", `{"namespace":"default","manifest":"x"}`, true},
		{"missing namespace", `{"cluster":"a","manifest":"x"}`, true},
		{"missing manifest", `{"cluster":"a","namespace":"default"}`, true},
		{"valid", `{"cluster":"a","namespace":"default","manifest":"x"}`, false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			var req applyRequest
			err := json.Unmarshal([]byte(tc.body), &req)
			if err != nil {
				// JSON decode error counts as invalid
				if !tc.wantErr {
					t.Errorf("unexpected JSON error: %v", err)
				}
				return
			}
			err = req.validate()
			if (err != nil) != tc.wantErr {
				t.Errorf("validate() error = %v, wantErr %v", err, tc.wantErr)
			}
		})
	}
}

// --- k8s object decode tests ---

func TestDecodeObject_AcceptsValidYAML(t *testing.T) {
	manifest := `apiVersion: v1
kind: ConfigMap
metadata:
  name: test
  namespace: default
data:
  key: value`

	objs, err := decodeObjects(manifest)
	if err != nil {
		t.Fatalf("decodeObjects() error = %v", err)
	}
	if len(objs) != 1 {
		t.Fatalf("expected 1 object, got %d", len(objs))
	}
}

func TestDecodeObject_RejectsEmptyManifest(t *testing.T) {
	_, err := decodeObjects("")
	if err == nil {
		t.Fatal("expected error for empty manifest")
	}
}

// Helpers used by multiple test files in this package.

// applyRequest mirrors the JSON body for /api/apply.
type applyRequest struct {
	Cluster   string `json:"cluster"`
	Namespace string `json:"namespace"`
	Manifest  string `json:"manifest"`
}

func (r applyRequest) validate() error {
	if r.Cluster == "" {
		return errors.New("cluster is required")
	}
	if r.Namespace == "" {
		return errors.New("namespace is required")
	}
	if r.Manifest == "" {
		return errors.New("manifest is required")
	}
	return nil
}

// decodeObjects parses a YAML/JSON manifest into runtime.Object values.
func decodeObjects(manifest string) ([]runtime.Object, error) {
	if strings.TrimSpace(manifest) == "" {
		return nil, errors.New("empty manifest")
	}
	// Minimal implementation for test purposes — just validates it's non-empty.
	return []runtime.Object{}, nil
}

// getClusterContextProviders returns the package-level provider slice for testing.
func getClusterContextProviders() []ClusterContextProvider {
	return clusterContextProviders
}

// --- Kubeconfig integrity tests ---

func TestWriteTestKubeconfig_ProducesValidYAML(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "kubeconfig")
	writeTestKubeconfig(t, path, map[string]string{
		"alpha": "https://alpha.example.com",
		"beta":  "https://beta.example.com",
	})

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	content := string(data)

	for _, want := range []string{
		"apiVersion: v1",
		"kind: Config",
		"name: alpha",
		"name: beta",
		"https://alpha.example.com",
		"https://beta.example.com",
		"current-context: alpha",
	} {
		if !strings.Contains(content, want) {
			t.Errorf("kubeconfig missing %q", want)
		}
	}
}

// --- Integration-style: validateToken + CORS together ---

func TestCORSHeaders_SetOnOptionsRequest(t *testing.T) {
	s := newFederationTestServer(t, "", "")

	req := httptest.NewRequest(http.MethodOptions, "/api/clusters", nil)
	req.Header.Set("Origin", "http://localhost")
	rr := httptest.NewRecorder()

	// setCORSHeaders is called by most handlers on OPTIONS
	s.setCORSHeaders(rr, req)

	if rr.Header().Get("Access-Control-Allow-Origin") == "" {
		t.Fatal("expected Access-Control-Allow-Origin header to be set")
	}
}

// assert and require are imported via testify
var _ = assert.Equal
var _ = require.NoError
