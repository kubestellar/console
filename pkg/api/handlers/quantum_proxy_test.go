package handlers

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"

	"github.com/kubestellar/console/pkg/api/middleware"
)

func TestIsAllowedQuantumPath(t *testing.T) {
	tests := []struct {
		name     string
		endpoint string
		want     bool
	}{
		// Allowed prefixes (exact matches)
		{"auth exact", "auth", true},
		{"circuit exact", "circuit", true},
		{"execute exact", "execute", true},
		{"health exact", "health", true},
		{"job exact", "job", true},
		{"loop exact", "loop", true},
		{"qasm exact", "qasm", true},
		{"qubits exact", "qubits", true},
		{"result exact", "result", true},
		{"status exact", "status", true},

		// Allowed prefixes with subpaths
		{"auth/save", "auth/save", true},
		{"auth/status", "auth/status", true},
		{"auth/clear", "auth/clear", true},
		{"qasm/file", "qasm/file", true},
		{"qasm/listfiles", "qasm/listfiles", true},
		{"qasm/circuit/ascii", "qasm/circuit/ascii", true},
		{"loop/start", "loop/start", true},
		{"loop/stop", "loop/stop", true},
		{"qubits/simple", "qubits/simple", true},
		{"result/histogram", "result/histogram", true},

		// Disallowed paths
		{"unknown prefix", "unknown", false},
		{"unknown/subpath", "unknown/subpath", false},
		{"config", "config", false},
		{"admin", "admin", false},

		// Path traversal attempts (rejected by isAllowedQuantumPath)
		{"path traversal ../ prefix", "../auth", false},
		{"path traversal in middle", "auth/../status", false},
		{"path traversal complex", "qasm/../../etc/passwd", false},

		// Edge cases
		{"empty string", "", false},
		{"slash only", "/", false},
		{"partial prefix mismatch", "aut", false},
		{"partial prefix mismatch 2", "auth1", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := isAllowedQuantumPath(tt.endpoint)
			if got != tt.want {
				t.Errorf("isAllowedQuantumPath(%q) = %v, want %v", tt.endpoint, got, tt.want)
			}
		})
	}
}

func TestQuantumProxyPostRequestRequiresBearerToken(t *testing.T) {
	const secret = "test-secret"
	var upstreamCalls int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&upstreamCalls, 1)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer upstream.Close()

	handler := &QuantumProxyHandler{quantumServiceURL: upstream.URL, jwtSecret: secret}
	app := fiber.New()
	app.Post("/api/quantum/*", handler.ProxyPostRequest)

	t.Run("missing bearer token returns 401", func(t *testing.T) {
		atomic.StoreInt32(&upstreamCalls, 0)
		req := httptest.NewRequest(http.MethodPost, "/api/quantum/execute", bytes.NewBufferString(`{"shots":1}`))
		req.Header.Set("Content-Type", "application/json")

		resp, err := app.Test(req, 5000)
		if err != nil {
			t.Fatalf("app.Test: %v", err)
		}
		if resp.StatusCode != http.StatusUnauthorized {
			t.Fatalf("expected 401, got %d", resp.StatusCode)
		}
		if got := atomic.LoadInt32(&upstreamCalls); got != 0 {
			t.Fatalf("expected no upstream request, got %d", got)
		}
	})

	t.Run("invalid bearer token returns 401", func(t *testing.T) {
		atomic.StoreInt32(&upstreamCalls, 0)
		req := httptest.NewRequest(http.MethodPost, "/api/quantum/loop/start", bytes.NewBufferString(`{"enabled":true}`))
		req.Header.Set("Authorization", "Bearer invalid-token")
		req.Header.Set("Content-Type", "application/json")

		resp, err := app.Test(req, 5000)
		if err != nil {
			t.Fatalf("app.Test: %v", err)
		}
		if resp.StatusCode != http.StatusUnauthorized {
			t.Fatalf("expected 401, got %d", resp.StatusCode)
		}
		if got := atomic.LoadInt32(&upstreamCalls); got != 0 {
			t.Fatalf("expected no upstream request, got %d", got)
		}
	})

	t.Run("valid bearer token proxies request", func(t *testing.T) {
		atomic.StoreInt32(&upstreamCalls, 0)
		req := httptest.NewRequest(http.MethodPost, "/api/quantum/auth/save", bytes.NewBufferString(`{"token":"abc"}`))
		req.Header.Set("Authorization", "Bearer "+generateQuantumTestToken(t, secret))
		req.Header.Set("Content-Type", "application/json")

		resp, err := app.Test(req, 5000)
		if err != nil {
			t.Fatalf("app.Test: %v", err)
		}
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		body, err := io.ReadAll(resp.Body)
		if err != nil {
			t.Fatalf("ReadAll: %v", err)
		}
		if string(body) != `{"ok":true}` {
			t.Fatalf("unexpected body %q", string(body))
		}
		if got := atomic.LoadInt32(&upstreamCalls); got != 1 {
			t.Fatalf("expected 1 upstream request, got %d", got)
		}
	})
}

func TestQuantumProxyGetRequestDoesNotRequireBearerToken(t *testing.T) {
	var upstreamCalls int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&upstreamCalls, 1)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	}))
	defer upstream.Close()

	handler := &QuantumProxyHandler{quantumServiceURL: upstream.URL, jwtSecret: "unused"}
	app := fiber.New()
	app.Get("/api/quantum/*", handler.ProxyRequest)

	req := httptest.NewRequest(http.MethodGet, "/api/quantum/status", nil)
	resp, err := app.Test(req, 5000)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	if got := atomic.LoadInt32(&upstreamCalls); got != 1 {
		t.Fatalf("expected 1 upstream request, got %d", got)
	}
}

func generateQuantumTestToken(t *testing.T, secret string) string {
	t.Helper()

	claims := middleware.UserClaims{
		UserID:      uuid.New(),
		GitHubLogin: "quantum-tester",
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(time.Now().Add(-time.Minute)),
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(secret))
	if err != nil {
		t.Fatalf("SignedString: %v", err)
	}
	return signed
}
