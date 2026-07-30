package agent

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const (
	wsAuthToken    = "secret-agent-token-abc123"
	wsHandshakeKey = "dGhlIHNhbXBsZSBub25jZQ=="
)

func newWebSocketAuthRequest(t *testing.T, target string) *http.Request {
	t.Helper()

	req := httptest.NewRequest(http.MethodGet, target, nil)
	req.Host = "localhost"
	req.Header.Set("Upgrade", "websocket")
	req.Header.Set("Connection", "Upgrade")
	req.Header.Set("Sec-WebSocket-Key", wsHandshakeKey)

	return req
}

func newTokenAuthServer() *Server {
	return &Server{
		agentToken:    wsAuthToken,
		tokenExplicit: true,
	}
}

func TestWsSubprotocols_ParseBearerToken(t *testing.T) {
	req := newWebSocketAuthRequest(t, "/ws")
	req.Header.Set("Sec-WebSocket-Protocol", "json, bearer."+wsAuthToken+", v2")

	protocols := websocketSubprotocols(req)

	require.Equal(t, []string{"json", "bearer." + wsAuthToken, "v2"}, protocols)
}

func TestWsValidateToken_SubprotocolAccepted(t *testing.T) {
	s := newTokenAuthServer()
	req := newWebSocketAuthRequest(t, "/ws")
	req.Header.Set("Sec-WebSocket-Protocol", "json, bearer."+wsAuthToken)

	assert.True(t, s.validateToken(req))
}

func TestWsValidateToken_InvalidSubprotocolsRejected(t *testing.T) {
	tests := []struct {
		name        string
		subprotocol string
	}{
		{
			name:        "empty subprotocol header",
			subprotocol: "",
		},
		{
			name:        "missing bearer prefix",
			subprotocol: wsAuthToken,
		},
		{
			name:        "multiple dots in bearer token",
			subprotocol: "bearer.secret.token",
		},
	}

	s := newTokenAuthServer()
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := newWebSocketAuthRequest(t, "/ws")
			if tt.subprotocol != "" {
				req.Header.Set("Sec-WebSocket-Protocol", tt.subprotocol)
			}

			assert.False(t, s.validateToken(req))
		})
	}
}

func TestWsValidateToken_LegacyQueryParamAccepted(t *testing.T) {
	s := newTokenAuthServer()
	req := newWebSocketAuthRequest(t, "/ws?token="+wsAuthToken)

	assert.True(t, s.validateToken(req))
}

func TestWsValidateToken_SubprotocolTakesPrecedence(t *testing.T) {
	s := newTokenAuthServer()
	req := newWebSocketAuthRequest(t, "/ws?token=wrong-token")
	req.Header.Set("Sec-WebSocket-Protocol", "bearer."+wsAuthToken)

	assert.True(t, s.validateToken(req))
}

func TestWsValidateToken_InvalidSubprotocolFallsBackToQueryParam(t *testing.T) {
	s := newTokenAuthServer()
	req := newWebSocketAuthRequest(t, "/ws?token="+wsAuthToken)
	req.Header.Set("Sec-WebSocket-Protocol", "bearer.wrong-token")

	assert.True(t, s.validateToken(req))
}

// TestValidateToken_OriginBypass verifies the origin-bypass path for
// auto-generated tokens only works on allowed paths with valid origins.
func TestValidateToken_OriginBypass(t *testing.T) {
	const validToken = "auto-generated-token"

	s := &Server{
		agentToken:     validToken,
		tokenExplicit:  false,
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

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, tt.path, nil)
			req.Host = "localhost"
			if tt.origin != "" {
				req.Header.Set("Origin", tt.origin)
			}

			assert.Equal(t, tt.expect, s.validateToken(req))
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
				"Upgrade":           "websocket",
				"Connection":        "Upgrade",
				"Sec-WebSocket-Key": wsHandshakeKey,
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
				"Upgrade":           "websocket",
				"Sec-WebSocket-Key": wsHandshakeKey,
			},
			expect: false,
		},
		{
			name: "missing Upgrade header",
			headers: map[string]string{
				"Connection":        "Upgrade",
				"Sec-WebSocket-Key": wsHandshakeKey,
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
				"Upgrade":           "websocket",
				"Connection":        "keep-alive, Upgrade",
				"Sec-WebSocket-Key": wsHandshakeKey,
			},
			expect: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/ws", nil)
			req.Host = "localhost"
			for key, value := range tt.headers {
				req.Header.Set(key, value)
			}

			assert.Equal(t, tt.expect, isRealWebSocketUpgrade(req))
		})
	}
}
