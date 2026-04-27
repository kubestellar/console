package api

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// loadingServerTestTimeout bounds all HTTP calls in the loading-server test
// so a hung server cannot stall CI.
const loadingServerTestTimeout = 2 * time.Second

// loadingServerShutdownTimeout bounds the graceful shutdown of the test's
// loading server.
const loadingServerShutdownTimeout = 1 * time.Second

// TestLoadingServer_HealthReturns503 enforces the #9904 regression guard:
// while the backend is still initializing, the temporary loading server
// MUST report /health as HTTP 503 so readiness probes, `curl -sf`, and the
// auth-login smoke test keep polling until the real Fiber app is up.
//
// Before this contract was in place, the loading server's /health returned
// HTTP 200 + {"status":"starting"}; smoke tests accepted that as "ready",
// immediately hit /auth/github, and got HTTP 200 back from the loading
// page's catch-all `/` handler — which looked like a broken auth contract
// but was actually just the loading page answering. Keeping /health at 503
// during init ensures the smoke test never races past the loading phase.
func TestLoadingServer_HealthReturns503(t *testing.T) {
	// Bind to an ephemeral port so parallel test runs don't collide.
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err, "must be able to reserve a loopback port")
	port := ln.Addr().(*net.TCPAddr).Port
	ln.Close()

	addr := fmt.Sprintf("127.0.0.1:%d", port)
	srv := startLoadingServer(addr)
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), loadingServerShutdownTimeout)
		defer cancel()
		_ = srv.Shutdown(ctx)
	})

	client := &http.Client{Timeout: loadingServerTestTimeout}
	resp, err := client.Get("http://" + addr + "/health")
	require.NoError(t, err, "loading server must answer /health")
	defer resp.Body.Close()

	assert.Equal(t, http.StatusServiceUnavailable, resp.StatusCode,
		"loading /health must return 503 while backend is initializing (#9904)")
	assert.NotEmpty(t, resp.Header.Get("Retry-After"),
		"loading /health must include Retry-After so clients back off (#9904)")

	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	var parsed map[string]string
	require.NoError(t, json.Unmarshal(body, &parsed),
		"loading /health body must be JSON: %s", string(body))
	assert.Equal(t, "starting", parsed["status"],
		"loading /health body must report status=starting for UX/debugging")
}

// TestHealth_OAuthConfiguredRequiresBothIdAndSecret covers #6056: the
// /health endpoint must report oauth_configured=true ONLY when BOTH the
// GitHub client ID AND the client secret are present. A partial config
// (id set but no secret, or vice versa) is unusable for OAuth — the token
// exchange step needs the secret to authenticate to GitHub — so the probe
// must not lie to the frontend about OAuth readiness. The helper lives on
// Server so we exercise it directly without spinning up the full server
// with DB, k8s, hub, etc.
func TestLoadConfigFromEnv_KCAgentToken(t *testing.T) {
	const testToken = "deadbeef1234567890abcdef"
	t.Setenv("KC_AGENT_TOKEN", testToken)
	cfg := LoadConfigFromEnv()
	assert.Equal(t, testToken, cfg.AgentToken,
		"KC_AGENT_TOKEN must be read from env so backend can expose it to the frontend")
}

func TestHealth_OAuthConfiguredRequiresBothIdAndSecret(t *testing.T) {
	cases := []struct {
		name     string
		clientID string
		secret   string
		want     bool
	}{
		{
			name:     "both empty",
			clientID: "",
			secret:   "",
			want:     false,
		},
		{
			name:     "id only (the #6056 regression case)",
			clientID: "client-id",
			secret:   "",
			want:     false,
		},
		{
			name:     "secret only",
			clientID: "",
			secret:   "shhh",
			want:     false,
		},
		{
			name:     "both set",
			clientID: "client-id",
			secret:   "shhh",
			want:     true,
		},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			s := &Server{
				config: Config{
					GitHubClientID: tc.clientID,
					GitHubSecret:   tc.secret,
				},
			}
			assert.Equal(t, tc.want, s.oauthConfigured(),
				"oauth_configured must require both client id and secret (#6056)")
		})
	}
}
