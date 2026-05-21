package agent

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
)

// checkOrigin validates the Origin header against allowed origins
// SECURITY: This prevents malicious websites from connecting to the local agent
func (s *Server) checkOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")

	// No origin header (e.g., same-origin request, curl, etc.) - allow
	if origin == "" {
		return true
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
// For WebSocket upgrades, tokens are also accepted via the ?token= query
// parameter since browsers cannot set custom headers on WebSocket handshakes.
// Query parameter tokens are restricted to genuine WebSocket upgrade requests
// to keep secrets out of server logs, browser history, and proxy access logs
// (#3895). To prevent spoofed Upgrade headers from enabling the query-param
// fallback (#4264), we verify all three headers that browsers always send for
// real WebSocket handshakes: Upgrade, Connection, and Sec-WebSocket-Key.
func (s *Server) validateToken(r *http.Request) bool {
	// If no token configured, skip token validation
	if s.agentToken == "" {
		return true
	}

	// Check Authorization header (preferred for all requests)
	authHeader := r.Header.Get("Authorization")
	if strings.HasPrefix(authHeader, "Bearer ") {
		token := strings.TrimPrefix(authHeader, "Bearer ")
		if token == s.agentToken {
			return true
		}
	}

	// When KC_AGENT_TOKEN was NOT explicitly set (auto-generated), allow
	// requests from browser pages served by trusted origins. Since kc-agent
	// binds to loopback only, CORS is the effective access control for
	// browser clients. This handles dev mode and standalone usage where the
	// token isn't shared with the backend (#11120).
	if !s.tokenExplicit {
		origin := r.Header.Get("Origin")
		if origin != "" && s.isAllowedOrigin(origin) {
			return true
		}
	}

	// Fall back to query parameter ONLY for genuine WebSocket upgrade requests.
	// Browsers always send all three headers; a plain HTTP client spoofing just
	// the Upgrade header will be missing Connection and/or Sec-WebSocket-Key.
	if isRealWebSocketUpgrade(r) {
		if queryToken := r.URL.Query().Get("token"); queryToken != "" {
			return queryToken == s.agentToken
		}
	}

	return false
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
