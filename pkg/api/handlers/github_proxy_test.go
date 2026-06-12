package handlers

import (
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGitHubProxyHandler_MissingToken(t *testing.T) {
	mockStore := new(test.MockStore)
	handler := NewGitHubProxyHandler("", mockStore, nil)
	app := fiber.New()
	app.Get("/api/github-proxy", handler.Proxy)

	req := httptest.NewRequest("GET", "/api/github-proxy?path=/user", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusInternalServerError, resp.StatusCode)
}

func TestGitHubProxyHandler_InvalidPath(t *testing.T) {
	tests := []struct {
		name string
		path string
	}{
		{
			name: "missing path",
			path: "",
		},
		{
			name: "path too long",
			path: "/" + string(make([]byte, 600)),
		},
		{
			name: "path without leading slash",
			path: "repos/kubestellar/console",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockStore := new(test.MockStore)
			handler := NewGitHubProxyHandler("fake-token", mockStore, nil)
			app := fiber.New()
			app.Get("/api/github-proxy", handler.Proxy)

			req := httptest.NewRequest("GET", "/api/github-proxy?path="+tt.path, nil)
			resp, err := app.Test(req, -1)
			require.NoError(t, err)
			assert.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
		})
	}
}

func TestGitHubProxyHandler_DisallowedRepo(t *testing.T) {
	mockStore := new(test.MockStore)
	handler := NewGitHubProxyHandler("fake-token", mockStore, nil)
	app := fiber.New()
	app.Get("/api/github-proxy", handler.Proxy)

	// Attempt to access a repo not in the default allowlist
	req := httptest.NewRequest("GET", "/api/github-proxy?path=/repos/other-org/private-repo", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusForbidden, resp.StatusCode)
}
