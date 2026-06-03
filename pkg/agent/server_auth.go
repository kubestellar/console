package agent

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/gorilla/websocket"
	"github.com/kubestellar/console/pkg/agent/protocol"
)

var originBypassAllowedPaths = map[string]struct{}{
	"/status": {},
}

const wsAuthTimeout = 5 * time.Second

// checkOrigin validates the Origin header against allowed origins
// SECURITY: This prevents malicious websites from connecting to the local agent.
// Empty Origin is rejected because browsers always send Origin on WebSocket
// handshakes; only non-browser clients (curl, native apps, local malware) omit it.
// Rejecting empty Origin provides defense-in-depth alongside the agentToken (#15244).
func (s *Server) checkOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")

	// Reject missing Origin — browsers always send it on WS upgrades
	if origin == "" {
		slog.Warn("SECURITY: rejected WebSocket connection with empty Origin")
		return false
	}

	// Check against allowed origins (supports wildcards like "https://*.ibm.com")
	for _, allowed := range s.allowedOrigins {
		if matchOrigin(origin, allowed) {
			return true
		}
	}

	slog.Warn("SECURITY: rejected WebSocket connection from unauthorized origin", "origin", origin)
	return false
}

// validateToken checks the authentication token (if configured).
// Tokens are accepted via the Authorization header for HTTP requests.
// WebSocket endpoints authenticate after upgrade using an auth frame so bearer
// tokens never appear in URL query parameters (#16508).
//
// When KC_AGENT_TOKEN is auto-generated, trusted browser origins may bypass the
// Bearer token requirement only on a tiny allow-list of safe read-only paths.
// This preserves the local status probe without granting origin-based access to
// cluster data, settings, or mutating endpoints (#15141).
func (s *Server) validateToken(r *http.Request) bool {
	// If no token configured, skip token validation
	if s.agentToken == "" {
		return true
	}

	// Check Authorization header (preferred for all requests)
	authHeader := r.Header.Get("Authorization")
	if strings.HasPrefix(authHeader, "Bearer ") {
		token := strings.TrimPrefix(authHeader, "Bearer ")
		if subtle.ConstantTimeCompare([]byte(token), []byte(s.agentToken)) == 1 {
			return true
		}
	}

	// When KC_AGENT_TOKEN was NOT explicitly set (auto-generated), allow
	// requests from browser pages served by trusted origins ONLY for a tiny
	// read-only allow-list. Origin alone must never authorize access to
	// cluster data, settings, or other sensitive endpoints (#15141).
	if !s.tokenExplicit && r.Method == http.MethodGet {
		origin := r.Header.Get("Origin")
		if origin != "" && s.isAllowedOrigin(origin) {
			if _, ok := originBypassAllowedPaths[r.URL.Path]; ok {
				return true
			}
		}
	}

	return false
}

func (s *Server) authenticateWebSocket(conn *websocket.Conn) error {
	if s.agentToken == "" {
		return nil
	}

	if err := conn.SetReadDeadline(time.Now().Add(wsAuthTimeout)); err != nil {
		return fmt.Errorf("set auth deadline: %w", err)
	}
	defer func() {
		_ = conn.SetReadDeadline(time.Time{})
	}()

	var authMessage struct {
		Type  string `json:"type"`
		Token string `json:"token"`
	}
	if err := conn.ReadJSON(&authMessage); err != nil {
		_ = conn.WriteJSON(protocol.Message{
			Type: protocol.TypeError,
			Payload: protocol.ErrorPayload{
				Code:    "unauthorized",
				Message: "authentication required",
			},
		})
		return fmt.Errorf("read auth message: %w", err)
	}
	if authMessage.Type != "auth" {
		_ = conn.WriteJSON(protocol.Message{
			Type: protocol.TypeError,
			Payload: protocol.ErrorPayload{
				Code:    "unauthorized",
				Message: "expected auth message",
			},
		})
		return fmt.Errorf("unexpected auth message type %q", authMessage.Type)
	}
	if subtle.ConstantTimeCompare([]byte(authMessage.Token), []byte(s.agentToken)) != 1 {
		_ = conn.WriteJSON(protocol.Message{
			Type: protocol.TypeError,
			Payload: protocol.ErrorPayload{
				Code:    "unauthorized",
				Message: "invalid token",
			},
		})
		return fmt.Errorf("invalid websocket token")
	}
	if err := conn.WriteJSON(protocol.Message{Type: "authenticated"}); err != nil {
		return fmt.Errorf("write auth acknowledgement: %w", err)
	}

	return nil
}

// isRealWebSocketUpgrade returns true only when the request carries all
// three headers that a browser sends for a genuine WebSocket handshake:
//   - Upgrade: websocket
//   - Connection: upgrade  (the value list must include "upgrade")
//   - Sec-WebSocket-Key: <non-empty>
//
// A plain HTTP client can easily set the Upgrade header alone; requiring
// all three makes spoofing significantly harder (#4264).
func isRealWebSocketUpgrade(r *http.Request) bool {
	if !strings.EqualFold(r.Header.Get("Upgrade"), "websocket") {
		return false
	}

	// Connection header may contain a comma-separated list (e.g. "keep-alive, Upgrade").
	hasConnectionUpgrade := false
	for _, v := range strings.Split(r.Header.Get("Connection"), ",") {
		if strings.EqualFold(strings.TrimSpace(v), "upgrade") {
			hasConnectionUpgrade = true
			break
		}
	}
	if !hasConnectionUpgrade {
		return false
	}

	// Sec-WebSocket-Key is a base64-encoded 16-byte nonce that browsers
	// always include. Its absence is a strong signal of a non-browser client.
	if r.Header.Get("Sec-WebSocket-Key") == "" {
		return false
	}

	return true
}

// isAllowedOrigin checks if the origin is in the allowed list.
// Supports wildcard entries like "https://*.ibm.com" which match any subdomain.
func (s *Server) isAllowedOrigin(origin string) bool {
	if origin == "" {
		return false
	}
	for _, allowed := range s.allowedOrigins {
		if matchOrigin(origin, allowed) {
			return true
		}
	}
	return false
}

// matchOrigin checks if an origin matches an allowed pattern.
// For non-wildcard origins, requires an exact match or a match with an additional port
// (e.g. "http://localhost" matches "http://localhost" and "http://localhost:5174" but NOT "http://localhost.attacker.com").
// For wildcard patterns like "https://*.ibm.com", matches any subdomain depth
// (e.g. "https://kc.ibm.com" and "https://deep.sub.ibm.com" both match).
func matchOrigin(origin, allowed string) bool {
	// Wildcard matching: "https://*.ibm.com" matches any subdomain depth
	// e.g. "https://*.ibm.com" matches "https://kc.ibm.com" and "https://kc.apps.example.ibm.com"
	if idx := strings.Index(allowed, "*."); idx != -1 {
		scheme := allowed[:idx]   // e.g. "https://"
		suffix := allowed[idx+1:] // e.g. ".ibm.com"
		if !strings.HasPrefix(origin, scheme) || !strings.HasSuffix(origin, suffix) {
			return false
		}
		// Extract the subdomain part between the scheme and the suffix
		middle := origin[len(scheme) : len(origin)-len(suffix)]
		// Must be non-empty (at least one subdomain level)
		return len(middle) > 0
	}
	// Exact match
	if origin == allowed {
		return true
	}
	// Allow the origin to have a port appended (e.g. allowed "http://localhost" matches "http://localhost:5174")
	if strings.HasPrefix(origin, allowed) && len(origin) > len(allowed) && origin[len(allowed)] == ':' {
		return true
	}
	return false
}

// generateRandomToken produces a cryptographically random hex-encoded token
// of the given byte length. Used to auto-generate KC_AGENT_TOKEN when the
// operator does not set one (#9480).
func generateRandomToken(nBytes int) (string, error) {
	buf := make([]byte, nBytes)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("crypto/rand.Read: %w", err)
	}
	return hex.EncodeToString(buf), nil
}
