package agent

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// TestValidateToken_ConstantTimeComparison verifies that validateToken uses
// crypto/subtle.ConstantTimeCompare (not ==) for token comparison, preventing
// timing side-channel attacks. We test correctness here; the constant-time
// property is guaranteed by the crypto/subtle package itself.
func TestValidateToken_ConstantTimeComparison(t *testing.T) {
	const validToken = "secret-agent-token-abc123"

	s := &Server{
		agentToken:     validToken,
		tokenExplicit:  true,
		allowedOrigins: []string{"http://localhost:5174"},
	}

	tests := []struct {
		name   string
		setup  func(r *http.Request)
		expect bool
	}{
		{
			name: "valid bearer token",
			setup: func(r *http.Request) {
				r.Header.Set("Authorization", "Bearer "+validToken)
			},
			expect: true,
		},
		{
			name: "invalid bearer token",
			setup: func(r *http.Request) {
				r.Header.Set("Authorization", "Bearer wrong-token")
			},
			expect: false,
		},
		{
			name: "token differs by one char",
			setup: func(r *http.Request) {
				r.Header.Set("Authorization", "Bearer secret-agent-token-abc124")
			},
			expect: false,
		},
		{
			name: "empty bearer token",
			setup: func(r *http.Request) {
				r.Header.Set("Authorization", "Bearer ")
			},
			expect: false,
		},
		{
			name: "no auth header",
			setup: func(r *http.Request) {},
			expect: false,
		},
		{
			name: "valid query token on real WebSocket upgrade",
			setup: func(r *http.Request) {
				r.URL.RawQuery = "token=" + validToken
				r.Header.Set("Upgrade", "websocket")
				r.Header.Set("Connection", "Upgrade")
				r.Header.Set("Sec-WebSocket-Key", "dGhlIHNhbXBsZSBub25jZQ==")
			},
			expect: true,
		},
		{
			name: "invalid query token on real WebSocket upgrade",
			setup: func(r *http.Request) {
				r.URL.RawQuery = "token=wrong-token"
				r.Header.Set("Upgrade", "websocket")
				r.Header.Set("Connection", "Upgrade")
				r.Header.Set("Sec-WebSocket-Key", "dGhlIHNhbXBsZSBub25jZQ==")
			},
			expect: false,
		},
		{
			name: "valid query token but no WebSocket upgrade headers",
			setup: func(r *http.Request) {
				r.URL.RawQuery = "token=" + validToken
			},
			expect: false,
		},
		{
			name: "valid query token with only Upgrade header (spoofed)",
			setup: func(r *http.Request) {
				r.URL.RawQuery = "token=" + validToken
				r.Header.Set("Upgrade", "websocket")
			},
			expect: false,
		},
		{
			name: "no token configured allows all",
			setup: func(r *http.Request) {},
			expect: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			testServer := s
			// Special case: "no token configured" uses a different server config
			if tc.name == "no token configured allows all" {
				testServer = &Server{agentToken: ""}
			}

			req := httptest.NewRequest(http.MethodGet, "/clusters", nil)
			tc.setup(req)

			got := testServer.validateToken(req)
			if got != tc.expect {
				t.Errorf("validateToken() = %v, want %v", got, tc.expect)
			}
		})
	}
}

// TestValidateToken_OriginBypass verifies the origin-bypass path for
// auto-generated tokens only works on allowed paths with valid origins.
func TestValidateToken_OriginBypass(t *testing.T) {
	const validToken = "auto-generated-token"

	s := &Server{
		agentToken:     validToken,
		tokenExplicit:  false, // auto-generated
		allowedOrigins: []string{"http://localhost:5174"},
	}

	tests := []struct {
		name   string
		path   string
		origin string
		expect bool
	}{
		{
			name:   "allowed origin on bypass path",
			path:   "/status",
			origin: "http://localhost:5174",
			expect: true,
		},
		{
			name:   "allowed origin on non-bypass path",
			path:   "/clusters",
			origin: "http://localhost:5174",
			expect: false,
		},
		{
			name:   "disallowed origin on bypass path",
			path:   "/status",
			origin: "http://evil.com",
			expect: false,
		},
		{
			name:   "empty origin on bypass path",
			path:   "/status",
			origin: "",
			expect: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, tc.path, nil)
			if tc.origin != "" {
				req.Header.Set("Origin", tc.origin)
			}

			got := s.validateToken(req)
			if got != tc.expect {
				t.Errorf("validateToken() = %v, want %v", got, tc.expect)
			}
		})
	}
}

// TestIsRealWebSocketUpgrade verifies the three-header check that prevents
// spoofed Upgrade headers from enabling query-param token fallback.
func TestIsRealWebSocketUpgrade(t *testing.T) {
	tests := []struct {
		name    string
		headers map[string]string
		expect  bool
	}{
		{
			name: "all three headers present",
			headers: map[string]string{
				"Upgrade":          "websocket",
				"Connection":       "Upgrade",
				"Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
			},
			expect: true,
		},
		{
			name: "missing Sec-WebSocket-Key",
			headers: map[string]string{
				"Upgrade":    "websocket",
				"Connection": "Upgrade",
			},
			expect: false,
		},
		{
			name: "missing Connection header",
			headers: map[string]string{
				"Upgrade":          "websocket",
				"Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
			},
			expect: false,
		},
		{
			name: "missing Upgrade header",
			headers: map[string]string{
				"Connection":       "Upgrade",
				"Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
			},
			expect: false,
		},
		{
			name:    "no headers",
			headers: map[string]string{},
			expect:  false,
		},
		{
			name: "Connection has upgrade in comma list",
			headers: map[string]string{
				"Upgrade":          "websocket",
				"Connection":       "keep-alive, Upgrade",
				"Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
			},
			expect: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/ws", nil)
			for k, v := range tc.headers {
				req.Header.Set(k, v)
			}

			got := isRealWebSocketUpgrade(req)
			if got != tc.expect {
				t.Errorf("isRealWebSocketUpgrade() = %v, want %v", got, tc.expect)
			}
		})
	}
}
