package handlers

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newTestManifestHandler(oauthConfigured bool) *ManifestHandler {
	return NewManifestHandler(
		&test.MockStore{},
		"http://localhost:8080",
		"http://localhost:8080",
		"https://github.com",
		func(clientID, clientSecret string) {},
		func() bool { return oauthConfigured },
	)
}

func TestManifestSetup_RedirectsWhenAlreadyConfigured(t *testing.T) {
	app := fiber.New()
	h := newTestManifestHandler(true)
	app.Get("/auth/manifest/setup", h.ManifestSetup)

	req := httptest.NewRequest("GET", "/auth/manifest/setup", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusFound, resp.StatusCode)
	assert.Equal(t, "http://localhost:8080/login", resp.Header.Get("Location"))
}

func TestManifestSetup_RendersFormWhenNotConfigured(t *testing.T) {
	app := fiber.New()
	h := newTestManifestHandler(false)
	app.Get("/auth/manifest/setup", h.ManifestSetup)

	req := httptest.NewRequest("GET", "/auth/manifest/setup", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	html := string(body)
	assert.Contains(t, html, "https://github.com/settings/apps/new")
	assert.Contains(t, html, "manifest-form")
	assert.Contains(t, html, "atob(")
}

func TestManifestSetup_ManifestContainsExpectedFields(t *testing.T) {
	app := fiber.New()
	h := newTestManifestHandler(false)
	app.Get("/auth/manifest/setup", h.ManifestSetup)

	req := httptest.NewRequest("GET", "/auth/manifest/setup", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)

	body, _ := io.ReadAll(resp.Body)
	html := string(body)

	// Extract the base64-encoded manifest from the atob('...') call
	assert.Contains(t, html, "atob('")
	start := len("atob('")
	idx := 0
	for i := range html {
		if html[i:i+len("atob('")] == "atob('" {
			idx = i + start
			break
		}
	}
	end := idx
	for end < len(html) && html[end] != '\'' {
		end++
	}
	b64 := html[idx:end]

	decoded, err := base64.StdEncoding.DecodeString(b64)
	require.NoError(t, err)

	var manifest map[string]any
	require.NoError(t, json.Unmarshal(decoded, &manifest))

	assert.Contains(t, manifest["name"].(string), "KubeStellar Console")
	assert.Equal(t, "http://localhost:8080", manifest["url"])
	assert.Equal(t, "http://localhost:8080/auth/manifest/callback", manifest["redirect_url"])

	callbacks := manifest["callback_urls"].([]any)
	assert.Len(t, callbacks, 1)
	assert.Equal(t, "http://localhost:8080/auth/github/callback", callbacks[0])
}

func TestManifestCallback_RedirectsWhenAlreadyConfigured(t *testing.T) {
	app := fiber.New()
	h := newTestManifestHandler(true)
	app.Get("/auth/manifest/callback", h.ManifestCallback)

	req := httptest.NewRequest("GET", "/auth/manifest/callback?code=test123", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusFound, resp.StatusCode)
	assert.Contains(t, resp.Header.Get("Location"), "manifest_already_configured")
}

func TestManifestCallback_RedirectsWithoutCode(t *testing.T) {
	app := fiber.New()
	h := newTestManifestHandler(false)
	app.Get("/auth/manifest/callback", h.ManifestCallback)

	req := httptest.NewRequest("GET", "/auth/manifest/callback", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusFound, resp.StatusCode)
	assert.Contains(t, resp.Header.Get("Location"), "manifest_missing_code")
}

func TestManifestCallback_ExchangesCodeAndPersists(t *testing.T) {
	githubAPI := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Contains(t, r.URL.Path, "/app-manifests/")
		assert.Contains(t, r.URL.Path, "/conversions")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(manifestConversionResponse{
			ClientID:     "test-client-id",
			ClientSecret: "test-client-secret",
			ID:           12345,
			Name:         "Test App",
			HTMLURL:      "https://github.com/apps/test",
		})
	}))
	defer githubAPI.Close()

	var reloadedID, reloadedSecret string
	mockStore := &test.MockStore{}

	h := &ManifestHandler{
		store:       mockStore,
		backendURL:  "http://localhost:8080",
		frontendURL: "http://localhost:8080",
		githubURL:   githubAPI.URL,
		onConfigured: func(clientID, clientSecret string) {
			reloadedID = clientID
			reloadedSecret = clientSecret
		},
		isOAuthConfigured: func() bool { return false },
		httpClient:        githubAPI.Client(),
	}

	app := fiber.New()
	app.Get("/auth/manifest/callback", h.ManifestCallback)

	req := httptest.NewRequest("GET", "/auth/manifest/callback?code=test-code", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusFound, resp.StatusCode)
	assert.Contains(t, resp.Header.Get("Location"), "manifest=success")
	assert.Equal(t, "test-client-id", reloadedID)
	assert.Equal(t, "test-client-secret", reloadedSecret)
}

func TestManifestCallback_HandlesGitHubError(t *testing.T) {
	githubAPI := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		fmt.Fprint(w, `{"message":"Not Found"}`)
	}))
	defer githubAPI.Close()

	h := &ManifestHandler{
		store:             &test.MockStore{},
		backendURL:        "http://localhost:8080",
		frontendURL:       "http://localhost:8080",
		githubURL:         githubAPI.URL,
		onConfigured:      func(clientID, clientSecret string) {},
		isOAuthConfigured: func() bool { return false },
		httpClient:        githubAPI.Client(),
	}

	app := fiber.New()
	app.Get("/auth/manifest/callback", h.ManifestCallback)

	req := httptest.NewRequest("GET", "/auth/manifest/callback?code=bad-code", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusFound, resp.StatusCode)
	assert.Contains(t, resp.Header.Get("Location"), "manifest_conversion_failed")
}

func TestManifestCallback_HandlesMissingCredentials(t *testing.T) {
	githubAPI := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(manifestConversionResponse{
			ClientID:     "",
			ClientSecret: "",
		})
	}))
	defer githubAPI.Close()

	h := &ManifestHandler{
		store:             &test.MockStore{},
		backendURL:        "http://localhost:8080",
		frontendURL:       "http://localhost:8080",
		githubURL:         githubAPI.URL,
		onConfigured:      func(clientID, clientSecret string) {},
		isOAuthConfigured: func() bool { return false },
		httpClient:        githubAPI.Client(),
	}

	app := fiber.New()
	app.Get("/auth/manifest/callback", h.ManifestCallback)

	req := httptest.NewRequest("GET", "/auth/manifest/callback?code=test", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusFound, resp.StatusCode)
	assert.Contains(t, resp.Header.Get("Location"), "manifest_conversion_failed")
}

func TestManifestSetup_GHEURLHandling(t *testing.T) {
	app := fiber.New()
	h := NewManifestHandler(
		&test.MockStore{},
		"http://localhost:8080",
		"http://localhost:8080",
		"https://github.example.com",
		func(clientID, clientSecret string) {},
		func() bool { return false },
	)
	app.Get("/auth/manifest/setup", h.ManifestSetup)

	req := httptest.NewRequest("GET", "/auth/manifest/setup", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	assert.Contains(t, string(body), "github.example.com/settings/apps/new")
}

func TestManifestCallback_GHEAPIBase(t *testing.T) {
	var receivedPath string
	githubAPI := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedPath = r.URL.Path
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(manifestConversionResponse{
			ClientID:     "ghe-id",
			ClientSecret: "ghe-secret",
			ID:           1,
			Name:         "GHE App",
		})
	}))
	defer githubAPI.Close()

	h := &ManifestHandler{
		store:             &test.MockStore{},
		backendURL:        "http://localhost:8080",
		frontendURL:       "http://localhost:8080",
		githubURL:         githubAPI.URL,
		onConfigured:      func(clientID, clientSecret string) {},
		isOAuthConfigured: func() bool { return false },
		httpClient:        githubAPI.Client(),
	}

	app := fiber.New()
	app.Get("/auth/manifest/callback", h.ManifestCallback)

	req := httptest.NewRequest("GET", "/auth/manifest/callback?code=ghe-code", nil)
	app.Test(req, -1)
	assert.Contains(t, receivedPath, "/api/v3/app-manifests/ghe-code/conversions")
}

