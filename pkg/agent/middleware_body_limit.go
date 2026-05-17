package agent

import "net/http"

// maxBodyMiddleware wraps an http.Handler and applies http.MaxBytesReader to
// the request body for all state-changing methods (POST, PUT, DELETE, PATCH).
// This prevents memory-exhaustion and slowloris attacks from clients sending
// unbounded request bodies. GET/HEAD/OPTIONS are exempt because they should
// not carry meaningful bodies.
//
// The limit is maxRequestBodyBytes (1 MB), matching the project's existing
// constant. Handlers that previously applied MaxBytesReader or LimitReader
// individually remain safe — applying a second limit on an already-capped
// reader simply retains the tighter bound.
//
// See #14491.
func maxBodyMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !csrfSafeMethods[r.Method] {
			r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodyBytes)
		}
		next.ServeHTTP(w, r)
	})
}
