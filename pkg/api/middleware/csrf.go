package middleware

import (
	"log/slog"

	"github.com/gofiber/fiber/v2"
)

const (
	// CSRFHeaderName is the custom header required on state-changing requests.
	// Browsers will not send this header on cross-origin form POSTs, so
	// requiring it blocks a malicious site from triggering mutations via a
	// forged form submission even if the victim's cookie is SameSite=Lax.
	CSRFHeaderName = "X-Requested-With"

	// CSRFHeaderValue is the expected value for CSRFHeaderName.
	CSRFHeaderValue = "XMLHttpRequest"

	// csrfForbiddenMsg is the error message returned when the CSRF header
	// is missing or has an incorrect value.
	csrfForbiddenMsg = "CSRF header required"
)

// safeHTTPMethods are HTTP methods that do not change server state and are
// therefore exempt from the CSRF check. RFC 7231 §4.2.1.
var safeHTTPMethods = map[string]bool{
	fiber.MethodGet:     true,
	fiber.MethodHead:    true,
	fiber.MethodOptions: true,
}

// RequireCSRF returns a Fiber middleware that rejects state-changing requests
// (POST, PUT, DELETE, PATCH) that lack the X-Requested-With: XMLHttpRequest
// header. GET, HEAD, and OPTIONS requests pass through unconditionally because
// they must not cause side effects per HTTP semantics.
//
// This is a defence-in-depth measure against cross-site request forgery:
// browsers never attach custom headers to requests initiated by <form> or
// navigation, so a cross-origin attacker cannot forge a request with this
// header. See #6588 and #8680 for background.
func RequireCSRF() fiber.Handler {
	return func(c *fiber.Ctx) error {
		if safeHTTPMethods[c.Method()] {
			return c.Next()
		}

		if c.Get(CSRFHeaderName) != CSRFHeaderValue {
			slog.Warn("[CSRF] request rejected: missing or invalid CSRF header",
				"ip", c.IP(), "method", c.Method(), "path", c.Path())
			return fiber.NewError(fiber.StatusForbidden, csrfForbiddenMsg)
		}

		return c.Next()
	}
}
