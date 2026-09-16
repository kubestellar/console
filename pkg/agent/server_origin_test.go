package agent

import (
	"net/http/httptest"
	"testing"
)

func TestServer_IsAllowedOrigin(t *testing.T) {
	server := &Server{
		allowedOrigins: []string{
			"http://localhost",
			"https://*.ibm.com",
		},
	}

	tests := []struct {
		origin string
		want   bool
	}{
		{"http://localhost", true},
		{"https://sub.ibm.com", true},
		{"https://deep.sub.ibm.com", true}, // Wildcard matches any subdomain depth
		{"http://ibm.com", false},          // Wrong scheme
		{"https://google.com", false},
		{"", false}, // Empty origin usually treated as allowed in checkOrigin logic, but isAllowedOrigin likely returns false map lookup
	}

	for _, tt := range tests {
		if got := server.isAllowedOrigin(tt.origin); got != tt.want {
			t.Errorf("isAllowedOrigin(%q) = %v, want %v", tt.origin, got, tt.want)
		}
	}
}

func TestServer_ValidateToken(t *testing.T) {
	tests := []struct {
		name             string
		path             string
		agentToken       string   // configured token
		tokenExplicit    bool     // true when KC_AGENT_TOKEN came from an explicit user setting
		allowedOrigins   []string // origins eligible for the browser-only bypass
		authHeader       string
		queryToken       string
		upgradeHeader    string // set to "websocket" for WebSocket upgrade requests
		connectionHeader string // "upgrade" for real WebSocket handshakes
		secWebSocketKey  string // base64 nonce sent by browsers
		origin           string // Origin header — browser requests always include this
		expectResult     bool
	}{
		{
			name:         "No token configured - skip validation",
			agentToken:   "",
			authHeader:   "",
			queryToken:   "",
			expectResult: true,
		},
		{
			name:         "GET without token rejected even without Origin",
			agentToken:   "secret123",
			authHeader:   "",
			queryToken:   "",
			expectResult: false, // all requests require token when configured
		},
		{
			name:         "GET with Origin header still requires token",
			agentToken:   "secret123",
			authHeader:   "",
			queryToken:   "",
			origin:       "http://localhost:8080",
			expectResult: false, // browser requests include Origin — CSRF protection
		},
		{
			name:           "Allowed origin bypass on safe status path when token was startup-generated",
			path:           "/status",
			agentToken:     "secret123",
			tokenExplicit:  false,
			allowedOrigins: []string{"http://localhost"},
			origin:         "http://localhost:5174",
			expectResult:   true,
		},
		{
			name:           "Allowed origin does not bypass auth on sensitive path",
			path:           "/clusters",
			agentToken:     "secret123",
			tokenExplicit:  false,
			allowedOrigins: []string{"http://localhost"},
			origin:         "http://localhost:5174",
			expectResult:   false,
		},
		{
			name:         "Valid Bearer token",
			agentToken:   "secret123",
			authHeader:   "Bearer secret123",
			queryToken:   "",
			expectResult: true,
		},
		{
			name:         "Invalid Bearer token",
			agentToken:   "secret123",
			authHeader:   "Bearer wrongtoken",
			queryToken:   "",
			origin:       "http://localhost:8080",
			expectResult: false,
		},
		{
			name:             "Valid query parameter token on genuine WebSocket upgrade",
			agentToken:       "secret123",
			authHeader:       "",
			queryToken:       "secret123",
			upgradeHeader:    "websocket",
			connectionHeader: "Upgrade",
			secWebSocketKey:  "dGhlIHNhbXBsZSBub25jZQ==",
			expectResult:     true,
		},
		{
			name:         "Query parameter token rejected on non-upgrade request",
			agentToken:   "secret123",
			authHeader:   "",
			queryToken:   "secret123",
			origin:       "http://localhost:8080",
			expectResult: false, // query tokens only accepted for WebSocket upgrades
		},
		{
			name:             "Invalid query parameter token on WebSocket upgrade",
			agentToken:       "secret123",
			authHeader:       "",
			queryToken:       "wrongtoken",
			upgradeHeader:    "websocket",
			connectionHeader: "Upgrade",
			secWebSocketKey:  "dGhlIHNhbXBsZSBub25jZQ==",
			origin:           "http://localhost:8080",
			expectResult:     false,
		},
		{
			name:         "Missing token when required",
			agentToken:   "secret123",
			authHeader:   "",
			queryToken:   "",
			origin:       "http://localhost:8080",
			expectResult: false,
		},
		{
			name:         "Malformed auth header - no Bearer prefix",
			agentToken:   "secret123",
			authHeader:   "Basic secret123",
			queryToken:   "",
			origin:       "http://localhost:8080",
			expectResult: false,
		},
		{
			// #4264: spoofed Upgrade header without Connection header
			name:          "Spoofed Upgrade header only - missing Connection",
			agentToken:    "secret123",
			authHeader:    "",
			queryToken:    "secret123",
			upgradeHeader: "websocket",
			// connectionHeader deliberately empty
			secWebSocketKey: "dGhlIHNhbXBsZSBub25jZQ==",
			origin:          "http://localhost:8080",
			expectResult:    false,
		},
		{
			// #4264: spoofed Upgrade+Connection but missing Sec-WebSocket-Key
			name:             "Spoofed Upgrade+Connection - missing Sec-WebSocket-Key",
			agentToken:       "secret123",
			authHeader:       "",
			queryToken:       "secret123",
			upgradeHeader:    "websocket",
			connectionHeader: "Upgrade",
			// secWebSocketKey deliberately empty
			origin:       "http://localhost:8080",
			expectResult: false,
		},
		{
			// #4264: only Upgrade header, nothing else
			name:          "Spoofed Upgrade header alone",
			agentToken:    "secret123",
			authHeader:    "",
			queryToken:    "secret123",
			upgradeHeader: "websocket",
			origin:        "http://localhost:8080",
			expectResult:  false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server := &Server{
				agentToken:     tt.agentToken,
				tokenExplicit:  tt.tokenExplicit,
				allowedOrigins: tt.allowedOrigins,
			}

			url := tt.path
			if url == "" {
				url = "/test"
			}
			if tt.queryToken != "" {
				url += "?token=" + tt.queryToken
			}
			req := httptest.NewRequest("GET", url, nil)
			req.Host = "localhost"
			if tt.authHeader != "" {
				req.Header.Set("Authorization", tt.authHeader)
			}
			if tt.upgradeHeader != "" {
				req.Header.Set("Upgrade", tt.upgradeHeader)
			}
			if tt.connectionHeader != "" {
				req.Header.Set("Connection", tt.connectionHeader)
			}
			if tt.secWebSocketKey != "" {
				req.Header.Set("Sec-WebSocket-Key", tt.secWebSocketKey)
			}
			if tt.origin != "" {
				req.Header.Set("Origin", tt.origin)
			}

			result := server.validateToken(req)
			if result != tt.expectResult {
				t.Errorf("validateToken() = %v, want %v", result, tt.expectResult)
			}
		})
	}
}

func TestServer_CheckOrigin(t *testing.T) {
	server := &Server{
		allowedOrigins: []string{
			"http://localhost",
			"https://localhost",
			"https://*.ibm.com",
			"http://127.0.0.1",
		},
	}

	tests := []struct {
		name   string
		origin string
		want   bool
	}{
		{"No origin - reject", "", false},
		{"Exact match localhost", "http://localhost", true},
		{"Localhost with port", "http://localhost:5174", true},
		{"HTTPS localhost", "https://localhost:3000", true},
		{"Wildcard subdomain match", "https://app.ibm.com", true},
		{"Deep subdomain match", "https://kc.apps.example.ibm.com", true},
		{"127.0.0.1", "http://127.0.0.1:8080", true},
		{"Unauthorized origin", "http://evil.com", false},
		{"Wrong scheme for wildcard", "http://app.ibm.com", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/ws", nil)
			req.Host = "localhost"
			if tt.origin != "" {
				req.Header.Set("Origin", tt.origin)
			}

			result := server.checkOrigin(req)
			if result != tt.want {
				t.Errorf("checkOrigin(%q) = %v, want %v", tt.origin, result, tt.want)
			}
		})
	}
}

func TestMatchOrigin(t *testing.T) {
	tests := []struct {
		origin  string
		allowed string
		want    bool
	}{
		{"http://localhost:5174", "http://localhost", true},
		{"http://localhost", "http://localhost", true},
		{"http://localhost.attacker.com", "http://localhost", false}, // prefix bypass
		{"https://app.ibm.com", "https://*.ibm.com", true},
		{"https://deep.sub.ibm.com", "https://*.ibm.com", true}, // multi-level subdomain allowed
		{"http://ibm.com", "https://*.ibm.com", false},          // wrong scheme
		{"https://ibm.com", "https://*.ibm.com", false},         // no subdomain, doesn't have .ibm.com suffix
		{"https://google.com", "https://*.ibm.com", false},
		{"http://exact.com", "http://exact.com", true},
		{"http://exact.com:8080", "http://exact.com", true},      // port variation allowed
		{"http://exact.com.evil.com", "http://exact.com", false}, // suffix bypass rejected
	}

	for _, tt := range tests {
		t.Run(tt.origin+"_vs_"+tt.allowed, func(t *testing.T) {
			result := matchOrigin(tt.origin, tt.allowed)
			if result != tt.want {
				t.Errorf("matchOrigin(%q, %q) = %v, want %v", tt.origin, tt.allowed, result, tt.want)
			}
		})
	}
}
