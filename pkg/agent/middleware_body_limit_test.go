package agent

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestMaxBodyMiddleware_LimitsPostBody(t *testing.T) {
	// Handler that reads the full body
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, err.Error(), http.StatusRequestEntityTooLarge)
			return
		}
		w.WriteHeader(http.StatusOK)
	})

	handler := maxBodyMiddleware(inner)

	// Create a body larger than maxRequestBodyBytes (1 MB)
	oversizedBody := strings.NewReader(strings.Repeat("x", int(maxRequestBodyBytes)+1))
	req := httptest.NewRequest(http.MethodPost, "/test", oversizedBody)
	req.Host = "localhost"
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusRequestEntityTooLarge {
		t.Errorf("expected status 413, got %d", rec.Code)
	}
}

func TestMaxBodyMiddleware_AllowsGetUnlimited(t *testing.T) {
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	handler := maxBodyMiddleware(inner)

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Host = "localhost"
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", rec.Code)
	}
}

func TestMaxBodyMiddleware_AllowsSmallPost(t *testing.T) {
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, err.Error(), http.StatusRequestEntityTooLarge)
			return
		}
		w.WriteHeader(http.StatusOK)
	})

	handler := maxBodyMiddleware(inner)

	smallBody := strings.NewReader(`{"key":"value"}`)
	req := httptest.NewRequest(http.MethodPost, "/test", smallBody)
	req.Host = "localhost"
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", rec.Code)
	}
}
