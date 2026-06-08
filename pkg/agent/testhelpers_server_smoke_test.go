package agent

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/kubestellar/console/pkg/k8s"
	fakek8s "k8s.io/client-go/kubernetes/fake"
)

// TestNewTestServer_Health verifies the helper produces a Server that can
// serve the /health endpoint without panicking.
func TestNewTestServer_Health(t *testing.T) {
	s := newTestServer(t)

	req := httptest.NewRequest("GET", "/health", nil)
	w := httptest.NewRecorder()

	s.handleHealth(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("handleHealth returned %d, want 200", w.Code)
	}

	var payload map[string]string
	if err := json.NewDecoder(w.Body).Decode(&payload); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if payload["status"] != "ok" {
		t.Errorf("status = %q, want \"ok\"", payload["status"])
	}
}

// TestNewTestServer_WithK8sClient verifies injection of a fake k8s client.
func TestNewTestServer_WithK8sClient(t *testing.T) {
	fakeClientset := fakek8s.NewSimpleClientset()
	k8sClient, _ := k8s.NewMultiClusterClient("")
	k8sClient.SetClient("test-cluster", fakeClientset)

	s := newTestServer(t, withK8sClient(k8sClient))

	if s.k8sClient == nil {
		t.Fatal("k8sClient should be set")
	}
}

// TestNewTestServer_WithToken verifies the token option enables auth.
func TestNewTestServer_WithToken(t *testing.T) {
	s := newTestServer(t, withToken("secret-token"))

	// Build a request without the token — should fail auth
	req := httptest.NewRequest("GET", "/status", nil)
	w := httptest.NewRecorder()

	s.handleStatus(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("handleStatus without token returned %d, want 401", w.Code)
	}

	// Now with token — should pass
	req2 := httptest.NewRequest("GET", "/status", nil)
	req2.Header.Set("Authorization", "Bearer secret-token")
	w2 := httptest.NewRecorder()

	s.handleStatus(w2, req2)

	if w2.Code != http.StatusOK {
		t.Errorf("handleStatus with valid token returned %d, want 200", w2.Code)
	}
}

// TestNewTestServer_WithProvider verifies provider injection.
func TestNewTestServer_WithProvider(t *testing.T) {
	mock := &ServerMockProvider{name: "test-provider"}
	s := newTestServer(t, withProvider(mock))

	providers := s.registry.ListAvailable()
	found := false
	for _, p := range providers {
		if p.Name == "test-provider" {
			found = true
			break
		}
	}
	if !found {
		t.Error("injected provider not found in registry")
	}
}
