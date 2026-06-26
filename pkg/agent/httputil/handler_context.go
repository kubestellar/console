package httputil

import "net/http"

// HandlerContext abstracts the minimal Server interface required by extracted
// handler files. This interface decouples handler groups from the full Server
// struct, enabling incremental extraction and testing without circular imports
// or tight coupling to the monolithic server implementation (#18334).
//
// Implementing types must provide:
//   - SetCORSHeaders: CORS header injection for cross-origin requests
//   - ValidateToken: authorization check for protected endpoints
//
// JSON serialization is handled by standalone WriteJSON/WriteJSONError
// functions in this package.
type HandlerContext interface {
	// SetCORSHeaders sets common CORS headers for HTTP endpoints. An optional
	// list of HTTP methods may be supplied to override the default
	// Access-Control-Allow-Methods value — required for POST/PUT/DELETE
	// endpoints so browser preflight requests succeed.
	SetCORSHeaders(w http.ResponseWriter, r *http.Request, methods ...string)

	// ValidateToken validates the bearer token from the Authorization header
	// against the server's configured agent token. Returns true if the request
	// is authorized (or if no token is configured), false otherwise.
	ValidateToken(r *http.Request) bool
}
