package agent

import (
	"log/slog"
	"net/http"
)

const (
	// csrfHeaderName is the custom header required on state-changing requests.
	// Browsers will not send this header on cross-origin form POSTs, so
	// requiring it blocks a malicious site from triggering mutations via a
	// forged form submission even if the victim's cookie is SameSite=Lax.
	csrfHeaderName = "X-Requested-With"

	// csrfHeaderValue is the expected value for csrfHeaderName.
	csrfHeaderValue = "XMLHttpRequest"

	// csrfForbiddenMsg is the error message returned when the CSRF header
	// is missing or has an incorrect value on a state-changing request.
	csrfForbiddenMsg = "CSRF header required"
)

// csrfSafeMethods are HTTP methods that do not change server state and are
// therefore exempt from the CSRF check. RFC 7231 section 4.2.1.
var csrfSafeMethods = map[string]bool{
	http.MethodGet:     true,
	http.MethodHead:    true,
	http.MethodOptions: true,
}

// requireCSRF wraps an http.Handler and rejects state-changing requests
// (POST, PUT, DELETE, PATCH) that lack the X-Requested-With: XMLHttpRequest
// header. GET, HEAD, and OPTIONS requests pass through unconditionally
// because they must not cause side effects per HTTP semantics.
//
// This is a defence-in-depth measure against cross-site request forgery:
// browsers never attach custom headers to requests initiated by <form> or
// navigation, so a cross-origin attacker cannot forge a request with this
// header. Mirrors the Fiber middleware in pkg/api/middleware/csrf.go.
// See #10000 for background.
func requireCSRF(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if csrfSafeMethods[r.Method] {
			next.ServeHTTP(w, r)
			return
		}

		if r.Header.Get(csrfHeaderName) != csrfHeaderValue {
			slog.Warn("[CSRF] request rejected: missing or invalid CSRF header",
				"ip", r.RemoteAddr, "method", r.Method, "path", r.URL.Path)
			http.Error(w, csrfForbiddenMsg, http.StatusForbidden)
			return
		}

		next.ServeHTTP(w, r)
	})
}
