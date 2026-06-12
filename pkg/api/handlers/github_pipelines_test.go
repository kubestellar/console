package handlers

import (
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGitHubPipelinesHandler_HandleHealth(t *testing.T) {
	tests := []struct {
		name           string
		token          string
		wantStatusCode int
		wantError      bool
	}{
		{
			name:           "missing token returns 503",
			token:          "",
			wantStatusCode: fiber.StatusServiceUnavailable,
			wantError:      true,
		},
		{
			name:           "with token validates (will fail without real GitHub)",
			token:          "ghp_fake_token_for_test",
			wantStatusCode: fiber.StatusServiceUnavailable,
			wantError:      true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler := NewGitHubPipelinesHandler(tt.token, nil)
			app := fiber.New()
			app.Get("/health", handler.HandleHealth)

			req := httptest.NewRequest("GET", "/health", nil)
			resp, err := app.Test(req, -1)
			require.NoError(t, err)
			assert.Equal(t, tt.wantStatusCode, resp.StatusCode)
		})
	}
}

func TestGitHubPipelinesHandler_Serve_InvalidView(t *testing.T) {
	handler := NewGitHubPipelinesHandler("fake-token", nil)
	app := fiber.New()
	app.Get("/api/github-pipelines", handler.Serve)

	req := httptest.NewRequest("GET", "/api/github-pipelines?view=invalid_view", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
}

func TestGitHubPipelinesHandler_Serve_MissingToken(t *testing.T) {
	handler := NewGitHubPipelinesHandler("", nil)
	app := fiber.New()
	app.Get("/api/github-pipelines", handler.Serve)

	req := httptest.NewRequest("GET", "/api/github-pipelines?view=pulse", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusInternalServerError, resp.StatusCode)
}
