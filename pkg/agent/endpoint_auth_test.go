package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"

	"github.com/kubestellar/console/pkg/agent/protocol"
	"k8s.io/client-go/tools/clientcmd/api"
)

// ── Named constants for endpoint paths ──────────────────────────────────────

const (
	// endpointHealth is the health-check endpoint (public, no auth required).
	endpointHealth = "/health"

	// endpointSettingsKeys manages AI provider API keys (sensitive).
	endpointSettingsKeys = "/settings/keys"

	// endpointSettingsKeyByProvider deletes a specific provider key (sensitive).
	endpointSettingsKeyByProvider = "/settings/keys/claude"

	// endpointSettings reads/writes persistent settings (sensitive).
	endpointSettings = "/settings"

	// endpointSettingsExport exports all settings as JSON (sensitive).
	endpointSettingsExport = "/settings/export"

	// endpointSettingsImport imports settings from JSON (sensitive).
	endpointSettingsImport = "/settings/import"

	// endpointClusters lists kubeconfig contexts (sensitive — reveals infra).
	endpointClusters = "/clusters"

	// endpointSecrets lists Kubernetes secrets (sensitive).
	endpointSecrets = "/secrets"

	// endpointWS is the WebSocket endpoint for agent communication (sensitive).
	endpointWS = "/ws"

	// endpointRestartBackend restarts the backend process (sensitive).
	endpointRestartBackend = "/restart-backend"

	// endpointAutoUpdateTrigger triggers a self-update (sensitive).
	endpointAutoUpdateTrigger = "/auto-update/trigger"

	// endpointKubeconfigImport imports a kubeconfig file (sensitive).
	endpointKubeconfigImport = "/kubeconfig/import"

	// endpointPods lists Kubernetes pods (sensitive — reveals workloads).
	endpointPods = "/pods"

	// endpointNodes lists Kubernetes nodes (sensitive — reveals infra).
	endpointNodes = "/nodes"

	// endpointScale scales a deployment (sensitive — mutating).
	endpointScale = "/scale"

	// testTokenValue is the shared secret used to configure auth in tests.
	testTokenValue = "test-secret-token-42"

	// testAllowedOrigin is the CORS origin accepted in test servers.
	testAllowedOrigin = "http://localhost:3000"

	// expectedUnauthorizedStatus is the HTTP status code for missing/invalid auth.
	expectedUnauthorizedStatus = http.StatusUnauthorized
)

// ── Endpoint classification ─────────────────────────────────────────────────

// publicEndpoints are expected to respond without authentication.
// These are used for agent discovery and monitoring.
var publicEndpoints = []string{
	endpointHealth,
}

// sensitiveEndpoints require a valid Bearer token when agentToken is set.
// This list covers security-critical paths (settings, secrets, mutations).
var sensitiveEndpoints = []struct {
	path   string
	method string
}{
	{endpointSettingsKeys, "GET"},
	{endpointSettingsKeyByProvider, "DELETE"},
	{endpointSettings, "GET"},
	{endpointSettingsExport, "POST"},
	{endpointSettingsImport, "POST"},
	{endpointClusters, "GET"},
	{endpointSecrets, "GET"},
	{endpointRestartBackend, "POST"},
	{endpointAutoUpdateTrigger, "POST"},
	{endpointKubeconfigImport, "POST"},
	{endpointPods, "GET"},
	{endpointNodes, "GET"},
}

// endpointsLackingAuth are endpoints that SHOULD require auth but currently
// do not call validateToken. These are documented security gaps.
// When fixed upstream, move them to sensitiveEndpoints above.
var endpointsLackingAuth = []struct {
	path   string
	method string
}{
	{endpointScale, "POST"},
}

// ── Helpers ─────────────────────────────────────────────────────────────────

// newAuthTestServerWithToken creates a minimal Server with token auth enabled.
func newAuthTestServerWithToken() *Server {
	config := &api.Config{
		Contexts: map[string]*api.Context{
			"test-ctx": {Cluster: "test-cluster"},
		},
	}

	return &Server{
		kubectl:        &KubectlProxy{config: config},
		allowedOrigins: []string{testAllowedOrigin},
		agentToken:     testTokenValue,
		registry:       &Registry{providers: make(map[string]AIProvider)},
	}
}

// newAuthTestServerNoToken creates a minimal Server without token auth (open mode).
func newAuthTestServerNoToken() *Server {
	config := &api.Config{
		Contexts: map[string]*api.Context{
			"test-ctx": {Cluster: "test-cluster"},
		},
	}

	return &Server{
		kubectl:        &KubectlProxy{config: config},
		allowedOrigins: []string{testAllowedOrigin},
		agentToken:     "", // No token — all requests pass validateToken
		registry:       &Registry{providers: make(map[string]AIProvider)},
	}
}

// ── Tests: Sensitive endpoints reject unauthenticated requests ──────────────

func TestEndpointAuth_SensitiveEndpointsRejectWithoutToken(t *testing.T) {
	server := newAuthTestServerWithToken()

	for _, ep := range sensitiveEndpoints {
		ep := ep // capture loop variable
		t.Run(fmt.Sprintf("%s_%s_no_auth", ep.method, ep.path), func(t *testing.T) {
			req := httptest.NewRequest(ep.method, ep.path, nil)
			req.Header.Set("Origin", testAllowedOrigin)
			w := httptest.NewRecorder()

			// Route the request to the correct handler
			handler := resolveEndpointHandler(server, ep.path)
			if handler == nil {
				t.Skipf("No handler found for %s (endpoint may not be registered in tests)", ep.path)
				return
			}

			handler(w, req)

			if w.Code != expectedUnauthorizedStatus {
				t.Errorf("%s %s: expected status %d without auth, got %d (body: %s)",
					ep.method, ep.path, expectedUnauthorizedStatus, w.Code, w.Body.String())
			}
		})
	}
}

// TestEndpointAuth_SensitiveEndpointsAcceptValidToken verifies that
// authenticated requests are NOT rejected with 401.
func TestEndpointAuth_SensitiveEndpointsAcceptValidToken(t *testing.T) {
	server := newAuthTestServerWithToken()

	for _, ep := range sensitiveEndpoints {
		ep := ep
		t.Run(fmt.Sprintf("%s_%s_with_auth", ep.method, ep.path), func(t *testing.T) {
			req := httptest.NewRequest(ep.method, ep.path, nil)
			req.Header.Set("Origin", testAllowedOrigin)
			req.Header.Set("Authorization", "Bearer "+testTokenValue)
			w := httptest.NewRecorder()

			handler := resolveEndpointHandler(server, ep.path)
			if handler == nil {
				t.Skipf("No handler found for %s", ep.path)
				return
			}

			handler(w, req)

			if w.Code == expectedUnauthorizedStatus {
				t.Errorf("%s %s: got 401 even with valid Bearer token",
					ep.method, ep.path)
			}
		})
	}
}

// TestEndpointAuth_InvalidTokenRejected ensures a wrong token is treated
// the same as no token.
func TestEndpointAuth_InvalidTokenRejected(t *testing.T) {
	server := newAuthTestServerWithToken()

	for _, ep := range sensitiveEndpoints {
		ep := ep
		t.Run(fmt.Sprintf("%s_%s_bad_token", ep.method, ep.path), func(t *testing.T) {
			req := httptest.NewRequest(ep.method, ep.path, nil)
			req.Header.Set("Origin", testAllowedOrigin)
			req.Header.Set("Authorization", "Bearer wrong-token")
			w := httptest.NewRecorder()

			handler := resolveEndpointHandler(server, ep.path)
			if handler == nil {
				t.Skipf("No handler found for %s", ep.path)
				return
			}

			handler(w, req)

			if w.Code != expectedUnauthorizedStatus {
				t.Errorf("%s %s: expected %d with invalid token, got %d",
					ep.method, ep.path, expectedUnauthorizedStatus, w.Code)
			}
		})
	}
}

// ── Tests: Public endpoints remain accessible ───────────────────────────────

func TestEndpointAuth_PublicEndpointsAccessibleWithoutToken(t *testing.T) {
	server := newAuthTestServerWithToken()

	for _, ep := range publicEndpoints {
		ep := ep
		t.Run(fmt.Sprintf("GET_%s_public", ep), func(t *testing.T) {
			req := httptest.NewRequest("GET", ep, nil)
			req.Header.Set("Origin", testAllowedOrigin)
			w := httptest.NewRecorder()

			handler := resolveEndpointHandler(server, ep)
			if handler == nil {
				t.Skipf("No handler found for %s", ep)
				return
			}

			handler(w, req)

			if w.Code == expectedUnauthorizedStatus {
				t.Errorf("GET %s: public endpoint returned 401 — it should be accessible without auth", ep)
			}
		})
	}
}

// ── Tests: Document endpoints missing auth (security gap tracking) ──────────

// TestEndpointAuth_DocumentMissingAuth tracks endpoints that should require
// auth but currently don't. When auth is added to these endpoints, this test
// will fail — move them from endpointsLackingAuth to sensitiveEndpoints.
func TestEndpointAuth_DocumentMissingAuth(t *testing.T) {
	server := newAuthTestServerWithToken()

	for _, ep := range endpointsLackingAuth {
		ep := ep
		t.Run(fmt.Sprintf("%s_%s_missing_auth", ep.method, ep.path), func(t *testing.T) {
			req := httptest.NewRequest(ep.method, ep.path, nil)
			req.Header.Set("Origin", testAllowedOrigin)
			w := httptest.NewRecorder()

			handler := resolveEndpointHandler(server, ep.path)
			if handler == nil {
				t.Skipf("No handler found for %s", ep.path)
				return
			}

			handler(w, req)

			// This test documents that these endpoints currently allow
			// unauthenticated access. When the bug is fixed, this will
			// fail — that's your signal to move the endpoint to sensitiveEndpoints.
			if w.Code == expectedUnauthorizedStatus {
				t.Logf("GOOD NEWS: %s %s now requires auth! Move it to sensitiveEndpoints.", ep.method, ep.path)
				t.FailNow()
			}

			t.Logf("SECURITY GAP: %s %s returned %d without auth (expected 401)", ep.method, ep.path, w.Code)
		})
	}
}

// ── Tests: Health endpoint does not leak sensitive data ──────────────────────

// sensitiveFieldPatterns are regex patterns that should NEVER appear in
// the /health response body. These catch accidental exposure of API keys,
// tokens, passwords, or secrets in health check output.
var sensitiveFieldPatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?i)"(api[_-]?key|apikey)"\s*:`),
	regexp.MustCompile(`(?i)"(secret|password|passwd|credential)"\s*:`),
	regexp.MustCompile(`(?i)"(access[_-]?key|private[_-]?key)"\s*:`),
	regexp.MustCompile(`(?i)"(auth[_-]?token|bearer|jwt)"\s*:`),
	regexp.MustCompile(`(?i)"(ssh[_-]?key|signing[_-]?key)"\s*:`),
	// AWS-style access keys
	regexp.MustCompile(`AKIA[0-9A-Z]{16}`),
	// GitHub tokens
	regexp.MustCompile(`ghp_[A-Za-z0-9]{36}`),
	regexp.MustCompile(`gho_[A-Za-z0-9]{36}`),
}

func TestEndpointAuth_HealthDoesNotLeakSecrets(t *testing.T) {
	server := newAuthTestServerNoToken()

	req := httptest.NewRequest("GET", endpointHealth, nil)
	req.Header.Set("Origin", testAllowedOrigin)
	w := httptest.NewRecorder()

	server.handleHealth(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("GET /health: expected 200, got %d", w.Code)
	}

	body := w.Body.String()

	// 1. Verify we can decode it as valid JSON
	var payload protocol.HealthPayload
	if err := json.NewDecoder(strings.NewReader(body)).Decode(&payload); err != nil {
		t.Fatalf("GET /health: response is not valid JSON: %v", err)
	}

	// 2. Scan the raw JSON for sensitive field patterns
	for _, pattern := range sensitiveFieldPatterns {
		if pattern.MatchString(body) {
			t.Errorf("GET /health: response body matches sensitive pattern %q — possible secret leak.\nBody excerpt: %.500s",
				pattern.String(), body)
		}
	}

	// 3. Verify the response only contains expected top-level fields
	var rawMap map[string]interface{}
	if err := json.Unmarshal([]byte(body), &rawMap); err != nil {
		t.Fatalf("GET /health: failed to unmarshal as map: %v", err)
	}

	allowedFields := map[string]bool{
		"status":             true,
		"version":            true,
		"clusters":           true,
		"hasClaude":          true,
		"claude":             true,
		"install_method":     true,
		"availableProviders": true,
	}

	for field := range rawMap {
		if !allowedFields[field] {
			t.Errorf("GET /health: unexpected field %q in response — review whether it leaks sensitive info", field)
		}
	}
}

// TestEndpointAuth_HealthProviderSummaryNoSecrets ensures the provider
// summaries in /health don't accidentally include API keys or config.
func TestEndpointAuth_HealthProviderSummaryNoSecrets(t *testing.T) {
	server := newAuthTestServerNoToken()

	// Register a fake provider to ensure summaries are populated
	server.registry.providers["test-provider"] = &authTestFakeProvider{
		name:        "test-provider",
		displayName: "Test Provider",
	}

	req := httptest.NewRequest("GET", endpointHealth, nil)
	req.Header.Set("Origin", testAllowedOrigin)
	w := httptest.NewRecorder()

	server.handleHealth(w, req)

	body := w.Body.String()

	// Provider summaries should only contain name, displayName, capabilities
	var payload protocol.HealthPayload
	if err := json.Unmarshal([]byte(body), &payload); err != nil {
		t.Fatalf("Failed to decode health payload: %v", err)
	}

	for _, p := range payload.AvailableProviders {
		// Verify no secret-like data in the summary
		combined := p.Name + p.DisplayName
		for _, pattern := range sensitiveFieldPatterns {
			if pattern.MatchString(combined) {
				t.Errorf("Provider summary for %q matches sensitive pattern %q", p.Name, pattern.String())
			}
		}
	}
}

// ── Tests: OPTIONS preflight should not require auth ────────────────────────

func TestEndpointAuth_OptionsPreflightNoAuth(t *testing.T) {
	server := newAuthTestServerWithToken()

	// CORS preflight requests (OPTIONS) should always succeed without auth
	preflightEndpoints := []string{
		endpointHealth,
		endpointSettingsKeys,
		endpointClusters,
	}

	for _, ep := range preflightEndpoints {
		ep := ep
		t.Run(fmt.Sprintf("OPTIONS_%s", ep), func(t *testing.T) {
			req := httptest.NewRequest("OPTIONS", ep, nil)
			req.Header.Set("Origin", testAllowedOrigin)
			w := httptest.NewRecorder()

			handler := resolveEndpointHandler(server, ep)
			if handler == nil {
				t.Skipf("No handler found for %s", ep)
				return
			}

			handler(w, req)

			if w.Code == expectedUnauthorizedStatus {
				t.Errorf("OPTIONS %s: preflight returned 401 — CORS preflight must not require auth", ep)
			}
		})
	}
}

// ── Handler resolver ────────────────────────────────────────────────────────

// resolveEndpointHandler maps an endpoint path to the server's handler method.
// This avoids needing to start a full HTTP server for unit tests.
func resolveEndpointHandler(s *Server, path string) func(http.ResponseWriter, *http.Request) {
	// Handle /settings/keys/ prefix for provider-specific routes
	if strings.HasPrefix(path, "/settings/keys/") {
		return s.handleSettingsKeyByProvider
	}

	handlers := map[string]func(http.ResponseWriter, *http.Request){
		endpointHealth:            s.handleHealth,
		endpointSettingsKeys:      s.handleSettingsKeys,
		endpointSettings:          s.handleSettingsAll,
		endpointSettingsExport:    s.handleSettingsExport,
		endpointSettingsImport:    s.handleSettingsImport,
		endpointClusters:          s.handleClustersHTTP,
		endpointSecrets:           s.handleSecretsHTTP,
		endpointWS:                s.handleWebSocket,
		endpointRestartBackend:    s.handleRestartBackend,
		endpointAutoUpdateTrigger: s.handleAutoUpdateTrigger,
		endpointKubeconfigImport:  s.handleKubeconfigImportHTTP,
		endpointPods:              s.handlePodsHTTP,
		endpointNodes:             s.handleNodesHTTP,
		endpointScale:             s.handleScaleHTTP,
	}

	return handlers[path]
}

// ── Test helper: fake AI provider ───────────────────────────────────────────

// authTestFakeProvider implements AIProvider for testing the health endpoint.
type authTestFakeProvider struct {
	name        string
	displayName string
}

func (p *authTestFakeProvider) Name() string                    { return p.name }
func (p *authTestFakeProvider) DisplayName() string             { return p.displayName }
func (p *authTestFakeProvider) Description() string             { return "Test provider for auth tests" }
func (p *authTestFakeProvider) Provider() string                { return "test" }
func (p *authTestFakeProvider) IsAvailable() bool               { return true }
func (p *authTestFakeProvider) Capabilities() ProviderCapability { return CapabilityChat }

func (p *authTestFakeProvider) Chat(_ context.Context, _ *ChatRequest) (*ChatResponse, error) {
	return &ChatResponse{Content: "test", Agent: p.name}, nil
}

func (p *authTestFakeProvider) StreamChat(_ context.Context, _ *ChatRequest, _ func(chunk string)) (*ChatResponse, error) {
	return &ChatResponse{Content: "test", Agent: p.name}, nil
}
