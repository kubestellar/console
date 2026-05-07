package handlers

import (
	"net"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
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
		{"loopback v6", "::1", true},
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

func TestCardProxyAuthorization(t *testing.T) {
	t.Run("viewer forbidden", func(t *testing.T) {
		app := fiber.New()
		mockStore := new(test.MockStore)
		userID := uuid.New()
		mockStore.On("GetUser", userID).Return(&models.User{Role: models.UserRoleViewer}, nil)

		handler := NewCardProxyHandler(mockStore)
		app.Get("/card-proxy", func(c *fiber.Ctx) error {
			c.Locals("userID", userID)
			return handler.Proxy(c)
		})

		req := httptest.NewRequest("GET", "/card-proxy?url=https%3A%2F%2Fexample.com", nil)
		resp, err := app.Test(req)
		if err != nil {
			t.Fatalf("app.Test: %v", err)
		}
		assert.Equal(t, fiber.StatusForbidden, resp.StatusCode)
	})

	t.Run("admin reaches normal validation", func(t *testing.T) {
		app := fiber.New()
		mockStore := new(test.MockStore)
		userID := uuid.New()
		mockStore.On("GetUser", userID).Return(&models.User{Role: models.UserRoleAdmin}, nil)

		handler := NewCardProxyHandler(mockStore)
		app.Get("/card-proxy", func(c *fiber.Ctx) error {
			c.Locals("userID", userID)
			return handler.Proxy(c)
		})

		req := httptest.NewRequest("GET", "/card-proxy?url=http%3A%2F%2F%25", nil)
		resp, err := app.Test(req)
		if err != nil {
			t.Fatalf("app.Test: %v", err)
		}
		assert.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
	})
}
