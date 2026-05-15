package handlers

import (
	"net"
	"net/http"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/test"
)

func TestIsBlockedIP(t *testing.T) {
	tests := []struct {
		name    string
		ip      string
		blocked bool
	}{
		{"loopback v4", "127.0.0.1", true},
		{"loopback v4 other", "127.0.0.2", true},
		{"private 10.x", "10.0.1.5", true},
		{"private 172.16.x", "172.16.0.1", true},
		{"private 192.168.x", "192.168.1.1", true},
		{"link-local", "169.254.1.1", true},
		{"multicast mDNS v4", "224.0.0.251", true},
		{"unspecified v4", "0.0.0.0", true},
		{"loopback v6", "::1", true},
		{"multicast mDNS v6", "ff02::fb", true},
		{"unspecified v6", "::", true},
		{"public IP", "8.8.8.8", false},
		{"public IP 2", "1.1.1.1", false},
		{"public v6", "2001:4860:4860::8888", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ip := net.ParseIP(tt.ip)
			if ip == nil {
				t.Fatalf("failed to parse IP %s", tt.ip)
			}
			got := isBlockedIP(ip)
			if got != tt.blocked {
				t.Errorf("isBlockedIP(%s) = %v, want %v", tt.ip, got, tt.blocked)
			}
		})
	}
}

func TestCardProxyAuthorization_ViewerForbidden(t *testing.T) {
	viewerID := uuid.New()
	mockStore := new(test.MockStore)
	mockStore.On("GetUser", viewerID).Return(&models.User{
		ID:   viewerID,
		Role: models.UserRoleViewer,
	}, nil).Maybe()

	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", viewerID)
		return c.Next()
	})

	handler := NewCardProxyHandler(mockStore)
	app.Get("/api/card-proxy", handler.Proxy)

	req, err := http.NewRequest(http.MethodGet, "/api/card-proxy?url=https://example.com", nil)
	if err != nil {
		t.Fatal(err)
	}

	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != fiber.StatusForbidden {
		t.Errorf("expected 403 Forbidden for viewer, got %d", resp.StatusCode)
	}
}

func TestCardProxyAuthorization_EditorAllowed(t *testing.T) {
	editorID := uuid.New()
	mockStore := new(test.MockStore)
	mockStore.On("GetUser", editorID).Return(&models.User{
		ID:   editorID,
		Role: models.UserRoleEditor,
	}, nil).Maybe()

	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", editorID)
		return c.Next()
	})

	handler := NewCardProxyHandler(mockStore)
	app.Get("/api/card-proxy", handler.Proxy)

	// Use a missing url param so we get 400 (proves we passed the RBAC check)
	req, err := http.NewRequest(http.MethodGet, "/api/card-proxy", nil)
	if err != nil {
		t.Fatal(err)
	}

	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	// Editor passes RBAC check, gets 400 for missing url — not 403
	if resp.StatusCode == fiber.StatusForbidden {
		t.Errorf("editor should not be forbidden, got %d", resp.StatusCode)
	}
}

func TestCardProxyAuthorization_NilStoreSkipsCheck(t *testing.T) {
	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", uuid.New())
		return c.Next()
	})

	handler := NewCardProxyHandler(nil)
	app.Get("/api/card-proxy", handler.Proxy)

	// nil store = dev/demo mode, RBAC skipped → expect 400 for missing url
	req, err := http.NewRequest(http.MethodGet, "/api/card-proxy", nil)
	if err != nil {
		t.Fatal(err)
	}

	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == fiber.StatusForbidden {
		t.Errorf("nil store should skip RBAC check, got %d", resp.StatusCode)
	}
	if resp.StatusCode != fiber.StatusBadRequest {
		t.Errorf("expected 400 for missing url param, got %d", resp.StatusCode)
	}
}

func TestCardProxyDialContext_EmptyDNSResult(t *testing.T) {
	// Extract the DialContext from the cardProxyClient transport.
	transport, ok := cardProxyClient.Transport.(*http.Transport)
	if !ok {
		t.Fatal("cardProxyClient.Transport is not *http.Transport")
	}
	dialCtx := transport.DialContext
	if dialCtx == nil {
		t.Fatal("cardProxyClient has no custom DialContext")
	}

	// Call DialContext with a host that will fail DNS resolution.
	// The empty-DNS guard should return an error before reaching ips[0].
	// Using .invalid TLD (RFC 6761) guarantees DNS failure in any environment.
	_, err := dialCtx(t.Context(), "tcp", "empty-dns-test.invalid:443")
	if err == nil {
		t.Fatal("expected error for unresolvable host, got nil")
	}
}
