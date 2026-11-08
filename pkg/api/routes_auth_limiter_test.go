package api

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
)

func TestHasAuthCredentials(t *testing.T) {
	tests := []struct {
		name   string
		header string
		cookie string
		want   bool
	}{
		{"no credentials", "", "", false},
		{"bearer header", "Bearer abc", "", true},
		{"non-bearer header", "Basic abc", "", false},
		{"auth cookie", "", "tok", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			app := fiber.New()
			var got bool
			app.Get("/", func(c *fiber.Ctx) error {
				got = hasAuthCredentials(c)
				return c.SendStatus(http.StatusOK)
			})
			req := httptest.NewRequest(http.MethodGet, "/", nil)
			if tt.header != "" {
				req.Header.Set("Authorization", tt.header)
			}
			if tt.cookie != "" {
				req.AddCookie(&http.Cookie{Name: authCookieName, Value: tt.cookie})
			}
			resp, err := app.Test(req)
			assert.NoError(t, err)
			defer resp.Body.Close()
			assert.Equal(t, tt.want, got)
		})
	}
}
