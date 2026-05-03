package agent

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

// testCSRFOKBody is the response body returned by the downstream handler in
// CSRF middleware tests.
const testCSRFOKBody = "ok"

// newCSRFTestHandler wraps a simple 200 "ok" handler with the CSRF middleware.
func newCSRFTestHandler() http.Handler {
	inner := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(testCSRFOKBody)) //nolint:errcheck // test helper
	})
	return requireCSRF(inner)
}

func TestCSRF_SafeMethodsPassThrough(t *testing.T) {
	t.Parallel()
	handler := newCSRFTestHandler()

	safeMethods := []string{
		http.MethodGet,
		http.MethodHead,
		http.MethodOptions,
	}

	for _, method := range safeMethods {
		t.Run(method, func(t *testing.T) {
			req := httptest.NewRequest(method, "/any-path", nil)
			rr := httptest.NewRecorder()
			handler.ServeHTTP(rr, req)

			if rr.Code != http.StatusOK {
				t.Errorf("expected 200, got %d", rr.Code)
			}
		})
	}
}

func TestCSRF_UnsafeMethodsRejectedWithoutHeader(t *testing.T) {
	t.Parallel()
	handler := newCSRFTestHandler()

	unsafeMethods := []string{
		http.MethodPost,
		http.MethodPut,
		http.MethodDelete,
		http.MethodPatch,
	}

	for _, method := range unsafeMethods {
		t.Run(method, func(t *testing.T) {
			req := httptest.NewRequest(method, "/any-path", nil)
			rr := httptest.NewRecorder()
			handler.ServeHTTP(rr, req)

			if rr.Code != http.StatusForbidden {
				t.Errorf("expected 403, got %d", rr.Code)
			}
		})
	}
}

func TestCSRF_UnsafeMethodsRejectedWithWrongValue(t *testing.T) {
	t.Parallel()
	handler := newCSRFTestHandler()

	req := httptest.NewRequest(http.MethodPost, "/any-path", nil)
	req.Header.Set(csrfHeaderName, "BadValue")
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Errorf("expected 403, got %d", rr.Code)
	}
}

func TestCSRF_UnsafeMethodsPassWithCorrectHeader(t *testing.T) {
	t.Parallel()
	handler := newCSRFTestHandler()

	unsafeMethods := []string{
		http.MethodPost,
		http.MethodPut,
		http.MethodDelete,
		http.MethodPatch,
	}

	for _, method := range unsafeMethods {
		t.Run(method, func(t *testing.T) {
			req := httptest.NewRequest(method, "/any-path", nil)
			req.Header.Set(csrfHeaderName, csrfHeaderValue)
			rr := httptest.NewRecorder()
			handler.ServeHTTP(rr, req)

			if rr.Code != http.StatusOK {
				t.Errorf("expected 200, got %d", rr.Code)
			}
			body, _ := io.ReadAll(rr.Body)
			if string(body) != testCSRFOKBody {
				t.Errorf("expected body %q, got %q", testCSRFOKBody, string(body))
			}
		})
	}
}
