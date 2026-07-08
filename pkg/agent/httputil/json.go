package httputil

import (
	"encoding/json"
	"log/slog"
	"net/http"
)

// WriteJSON writes a JSON response to w. If encoding fails, logs the error
// and returns without modifying the response further. Callers should set
// Content-Type and status code before calling this function.
//
// Extracted from pkg/agent/server_http.go to enable reuse across handler
// files without coupling to the Server struct (#18334).
func WriteJSON(w http.ResponseWriter, v any) {
	if err := json.NewEncoder(w).Encode(v); err != nil {
		slog.Error("failed to encode JSON response", "error", err)
	}
}

// WriteJSONError writes an error response with the appropriate HTTP status code.
// Use this instead of WriteJSON for error cases to ensure clients see a non-200
// status (#7275). The response body includes an "error" field with the message.
//
// Extracted from pkg/agent/server_http.go to enable reuse across handler
// files without coupling to the Server struct (#18334).
func WriteJSONError(w http.ResponseWriter, statusCode int, msg string) {
	w.WriteHeader(statusCode)
	WriteJSON(w, map[string]string{"error": msg})
}
