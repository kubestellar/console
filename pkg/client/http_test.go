package client

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestGitHubClient_Timeout(t *testing.T) {
	t.Helper()
	if GitHub.Timeout != 15*time.Second {
		t.Errorf("GitHub client timeout = %v, want 15s", GitHub.Timeout)
	}
}

func TestExternalClient_Timeout(t *testing.T) {
	t.Helper()
	if External.Timeout != 30*time.Second {
		t.Errorf("External client timeout = %v, want 30s", External.Timeout)
	}
}

func TestShortClient_Timeout(t *testing.T) {
	t.Helper()
	if Short.Timeout != 10*time.Second {
		t.Errorf("Short client timeout = %v, want 10s", Short.Timeout)
	}
}

func TestSharedTransport_ConnectionPoolSettings(t *testing.T) {
	t.Helper()
	if sharedTransport.MaxIdleConns != 100 {
		t.Errorf("MaxIdleConns = %d, want 100", sharedTransport.MaxIdleConns)
	}
	if sharedTransport.MaxConnsPerHost != 10 {
		t.Errorf("MaxConnsPerHost = %d, want 10", sharedTransport.MaxConnsPerHost)
	}
	if sharedTransport.IdleConnTimeout != 90*time.Second {
		t.Errorf("IdleConnTimeout = %v, want 90s", sharedTransport.IdleConnTimeout)
	}
	if sharedTransport.TLSHandshakeTimeout != 10*time.Second {
		t.Errorf("TLSHandshakeTimeout = %v, want 10s", sharedTransport.TLSHandshakeTimeout)
	}
}

func TestClients_ShareTransport(t *testing.T) {
	t.Helper()
	githubTransport := GitHub.Transport
	externalTransport := External.Transport
	shortTransport := Short.Transport

	if githubTransport != externalTransport {
		t.Error("GitHub and External clients should share the same transport")
	}
	if githubTransport != shortTransport {
		t.Error("GitHub and Short clients should share the same transport")
	}
}

func TestGitHubClient_SuccessfulRequest(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	}))
	defer ts.Close()

	resp, err := GitHub.Get(ts.URL)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("status = %d, want 200", resp.StatusCode)
	}
}

func TestExternalClient_NonOKStatus(t *testing.T) {
	tests := []struct {
		name       string
		statusCode int
	}{
		{"Bad Request", http.StatusBadRequest},
		{"Not Found", http.StatusNotFound},
		{"Internal Server Error", http.StatusInternalServerError},
		{"Service Unavailable", http.StatusServiceUnavailable},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(tc.statusCode)
			}))
			defer ts.Close()

			resp, err := External.Get(ts.URL)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			defer resp.Body.Close()

			if resp.StatusCode != tc.statusCode {
				t.Errorf("status = %d, want %d", resp.StatusCode, tc.statusCode)
			}
		})
	}
}

func TestShortClient_ContextCancellation(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		time.Sleep(5 * time.Second)
		w.WriteHeader(http.StatusOK)
	}))
	defer ts.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, ts.URL, nil)
	if err != nil {
		t.Fatalf("failed to create request: %v", err)
	}

	_, err = Short.Do(req)
	if err == nil {
		t.Fatal("expected error due to context cancellation, got nil")
	}
}

func TestGitHubClient_HeaderPropagation(t *testing.T) {
	var receivedHeaders http.Header
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedHeaders = r.Header.Clone()
		w.WriteHeader(http.StatusOK)
	}))
	defer ts.Close()

	req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, ts.URL, nil)
	if err != nil {
		t.Fatalf("failed to create request: %v", err)
	}
	req.Header.Set("Authorization", "Bearer test-token")
	req.Header.Set("X-Custom-Header", "custom-value")

	resp, err := GitHub.Do(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	defer resp.Body.Close()

	if got := receivedHeaders.Get("Authorization"); got != "Bearer test-token" {
		t.Errorf("Authorization header = %q, want %q", got, "Bearer test-token")
	}
	if got := receivedHeaders.Get("X-Custom-Header"); got != "custom-value" {
		t.Errorf("X-Custom-Header = %q, want %q", got, "custom-value")
	}
}
