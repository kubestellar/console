package middleware_test

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/api/middleware"
)

// testOKBody is the response body returned by the downstream handler in tests.
const testOKBody = "ok"

// newTestApp creates a Fiber app with the CSRF middleware and a catch-all
// handler that returns 200 "ok" for any route.
func newTestApp() *fiber.App {
	app := fiber.New()
	app.Use(middleware.RequireCSRF())
	app.Use(func(c *fiber.Ctx) error {
		return c.SendString(testOKBody)
	})
	return app
}

func TestCSRF_SafeMethodsPassThrough(t *testing.T) {
	t.Parallel()
	app := newTestApp()

	safeMethods := []string{
		http.MethodGet,
		http.MethodHead,
		http.MethodOptions,
	}

	for _, method := range safeMethods {
		t.Run(method, func(t *testing.T) {
			req := httptest.NewRequest(method, "/any-path", nil)
			// No CSRF header — should still pass for safe methods
			resp, err := app.Test(req)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if resp.StatusCode != http.StatusOK {
				t.Errorf("expected 200, got %d", resp.StatusCode)
			}
		})
	}
}

func TestCSRF_UnsafeMethodsRejectedWithoutHeader(t *testing.T) {
	t.Parallel()
	app := newTestApp()

	unsafeMethods := []string{
		http.MethodPost,
		http.MethodPut,
		http.MethodDelete,
		http.MethodPatch,
	}

	for _, method := range unsafeMethods {
		t.Run(method, func(t *testing.T) {
			req := httptest.NewRequest(method, "/any-path", nil)
			resp, err := app.Test(req)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if resp.StatusCode != http.StatusForbidden {
				t.Errorf("expected 403, got %d", resp.StatusCode)
			}
		})
	}
}

func TestCSRF_UnsafeMethodsRejectedWithWrongValue(t *testing.T) {
	t.Parallel()
	app := newTestApp()

	req := httptest.NewRequest(http.MethodPost, "/any-path", nil)
	req.Header.Set(middleware.CSRFHeaderName, "BadValue")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("expected 403, got %d", resp.StatusCode)
	}
}

func TestCSRF_UnsafeMethodsPassWithCorrectHeader(t *testing.T) {
	t.Parallel()
	app := newTestApp()

	unsafeMethods := []string{
		http.MethodPost,
		http.MethodPut,
		http.MethodDelete,
		http.MethodPatch,
	}

	for _, method := range unsafeMethods {
		t.Run(method, func(t *testing.T) {
			req := httptest.NewRequest(method, "/any-path", nil)
			req.Header.Set(middleware.CSRFHeaderName, middleware.CSRFHeaderValue)
			resp, err := app.Test(req)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if resp.StatusCode != http.StatusOK {
				t.Errorf("expected 200, got %d", resp.StatusCode)
			}
			body, _ := io.ReadAll(resp.Body)
			if string(body) != testOKBody {
				t.Errorf("expected body %q, got %q", testOKBody, string(body))
			}
		})
	}
}
