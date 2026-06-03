package handlers

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

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

func issueTestManifestState(t *testing.T, h *ManifestHandler) string {
	t.Helper()
	state, err := h.issueState()
	require.NoError(t, err)
	return state
}

func extractHiddenInputValue(html, name string) string {
	marker := fmt.Sprintf(`name="%s" value="`, name)
	start := strings.Index(html, marker)
	if start == -1 {
		return ""
	}
	start += len(marker)
	end := strings.Index(html[start:], `"`)
	if end == -1 {
		return ""
	}
	return html[start : start+end]
}

func extractManifestJSON(t *testing.T, html string) []byte {
	t.Helper()
	marker := "document.getElementById('manifest-input').value = atob('"
	start := strings.Index(html, marker)
	require.NotEqual(t, -1, start, "manifest atob script not found")
	start += len(marker)
	end := strings.Index(html[start:], "')")
	require.NotEqual(t, -1, end, "manifest atob closing marker not found")
	manifestB64 := html[start : start+end]

	manifestJSON, err := base64.StdEncoding.DecodeString(manifestB64)
	require.NoError(t, err)
	return manifestJSON
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

	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	html := string(body)
	assert.Contains(t, html, "https://github.com/settings/apps/new")
	assert.Contains(t, html, "manifest-form")
	assert.Contains(t, html, "atob(")
	assert.NotEmpty(t, extractHiddenInputValue(html, "state"))
}

func TestManifestSetup_ManifestContainsExpectedFields(t *testing.T) {
	app := fiber.New()
	h := newTestManifestHandler(false)
	app.Get("/auth/manifest/setup", h.ManifestSetup)

	req := httptest.NewRequest("GET", "/auth/manifest/setup", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)

	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	html := string(body)
	assert.Contains(t, html, "https://github.com/settings/apps/new")
	assert.Contains(t, html, "manifest-form")
	assert.Contains(t, html, "atob(")
	assert.NotEmpty(t, extractHiddenInputValue(html, "state"))

	manifestJSON := extractManifestJSON(t, html)

	var manifest map[string]any
	require.NoError(t, json.Unmarshal(manifestJSON, &manifest))

	assert.Contains(t, manifest["name"].(string), "KubeStellar Console")
	assert.Equal(t, "http://localhost:8080", manifest["url"])
	assert.Equal(t, "http://localhost:8080/auth/manifest/callback", manifest["redirect_url"])

	callbacks := manifest["callback_urls"].([]any)
	assert.Len(t, callbacks, 1)
	assert.Equal(t, "http://localhost:8080/auth/github/callback", callbacks[0])

	hookAttrs := manifest["hook_attributes"].(map[string]any)
	assert.Equal(t, false, hookAttrs["active"])
	assert.NotEmpty(t, hookAttrs["url"], "hook_attributes.url is required by GitHub")

	perms := manifest["default_permissions"].(map[string]any)
	_, hasEmailAddresses := perms["email_addresses"]
	assert.False(t, hasEmailAddresses, "email_addresses is not a valid GitHub App permission")
}

func TestManifestCallback_RedirectsWhenAlreadyConfigured(t *testing.T) {
	app := fiber.New()
	h := newTestManifestHandler(true)
	app.Get("/auth/manifest/callback", h.ManifestCallback)

	req := httptest.NewRequest("GET", "/auth/manifest/callback?code=test123&state=test-state", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusFound, resp.StatusCode)
	assert.Contains(t, resp.Header.Get("Location"), "manifest_already_configured")
}

func TestManifestCallback_RedirectsWithoutState(t *testing.T) {
	app := fiber.New()
	h := newTestManifestHandler(false)
	app.Get("/auth/manifest/callback", h.ManifestCallback)

	req := httptest.NewRequest("GET", "/auth/manifest/callback?code=test123", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusFound, resp.StatusCode)
	assert.Contains(t, resp.Header.Get("Location"), "manifest_invalid_state")
}

func TestManifestCallback_RedirectsWithoutCode(t *testing.T) {
	app := fiber.New()
	h := newTestManifestHandler(false)
	app.Get("/auth/manifest/callback", h.ManifestCallback)

	state := issueTestManifestState(t, h)
	req := httptest.NewRequest("GET", "/auth/manifest/callback?state="+state, nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusFound, resp.StatusCode)
	assert.Contains(t, resp.Header.Get("Location"), "manifest_missing_code")
}

func TestManifestCallback_RejectsInvalidState(t *testing.T) {
	app := fiber.New()
	h := newTestManifestHandler(false)
	app.Get("/auth/manifest/callback", h.ManifestCallback)

	req := httptest.NewRequest("GET", "/auth/manifest/callback?code=test-code&state=invalid", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusFound, resp.StatusCode)
	assert.Contains(t, resp.Header.Get("Location"), "manifest_invalid_state")
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
		pendingStates:     make(map[string]time.Time),
	}

	app := fiber.New()
	app.Get("/auth/manifest/callback", h.ManifestCallback)

	state := issueTestManifestState(t, h)
	req := httptest.NewRequest("GET", "/auth/manifest/callback?code=test-code&state="+state, nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusFound, resp.StatusCode)
	assert.Contains(t, resp.Header.Get("Location"), "manifest=success")
	assert.Equal(t, "test-client-id", reloadedID)
	assert.Equal(t, "test-client-secret", reloadedSecret)
	mockStore.AssertExpectations(t)
}

func TestManifestCallback_HandlesGitHubError(t *testing.T) {
	githubAPI := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		fmt.Fprint(w, `{"message":"Not Found"}`)
	}))
	defer githubAPI.Close()

	mockStore := &test.MockStore{}
	h := &ManifestHandler{
		store:             mockStore,
		backendURL:        "http://localhost:8080",
		frontendURL:       "http://localhost:8080",
		githubURL:         githubAPI.URL,
		onConfigured:      func(clientID, clientSecret string) {},
		isOAuthConfigured: func() bool { return false },
		httpClient:        githubAPI.Client(),
		pendingStates:     make(map[string]time.Time),
	}

	app := fiber.New()
	app.Get("/auth/manifest/callback", h.ManifestCallback)

	state := issueTestManifestState(t, h)
	req := httptest.NewRequest("GET", "/auth/manifest/callback?code=bad-code&state="+state, nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusFound, resp.StatusCode)
	assert.Contains(t, resp.Header.Get("Location"), "manifest_conversion_failed")
	mockStore.AssertExpectations(t)
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

	mockStore := &test.MockStore{}
	h := &ManifestHandler{
		store:             mockStore,
		backendURL:        "http://localhost:8080",
		frontendURL:       "http://localhost:8080",
		githubURL:         githubAPI.URL,
		onConfigured:      func(clientID, clientSecret string) {},
		isOAuthConfigured: func() bool { return false },
		httpClient:        githubAPI.Client(),
		pendingStates:     make(map[string]time.Time),
	}

	app := fiber.New()
	app.Get("/auth/manifest/callback", h.ManifestCallback)

	state := issueTestManifestState(t, h)
	req := httptest.NewRequest("GET", "/auth/manifest/callback?code=test&state="+state, nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusFound, resp.StatusCode)
	assert.Contains(t, resp.Header.Get("Location"), "manifest_conversion_failed")
	mockStore.AssertExpectations(t)
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

	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	html := string(body)
	assert.Contains(t, html, "github.example.com/settings/apps/new")
	assert.NotEmpty(t, extractHiddenInputValue(html, "state"))
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

	mockStore := &test.MockStore{}
	h := &ManifestHandler{
		store:             mockStore,
		backendURL:        "http://localhost:8080",
		frontendURL:       "http://localhost:8080",
		githubURL:         githubAPI.URL,
		onConfigured:      func(clientID, clientSecret string) {},
		isOAuthConfigured: func() bool { return false },
		httpClient:        githubAPI.Client(),
		pendingStates:     make(map[string]time.Time),
	}

	app := fiber.New()
	app.Get("/auth/manifest/callback", h.ManifestCallback)

	state := issueTestManifestState(t, h)
	req := httptest.NewRequest("GET", "/auth/manifest/callback?code=ghe-code&state="+state, nil)
	app.Test(req, -1)
	assert.Contains(t, receivedPath, "/api/v3/app-manifests/ghe-code/conversions")
	mockStore.AssertExpectations(t)
}
