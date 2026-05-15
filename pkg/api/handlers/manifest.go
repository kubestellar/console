package handlers

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/client"
	"github.com/kubestellar/console/pkg/store"
)

// manifestAppNameSuffixBytes is the number of random bytes appended to the
// GitHub App name to avoid global name collisions on retry.
const manifestAppNameSuffixBytes = 3

// ManifestHandler implements the GitHub App Manifest one-click OAuth flow.
// When a user clicks "Set up GitHub Sign-In," the handler renders a page
// that auto-submits a manifest to GitHub. GitHub creates the OAuth App and
// redirects back with a temporary code, which we exchange for credentials.
type ManifestHandler struct {
	store             store.Store
	backendURL        string
	frontendURL       string
	githubURL         string
	onConfigured      func(clientID, clientSecret string)
	isOAuthConfigured func() bool
	httpClient        *http.Client
}

// NewManifestHandler creates a ManifestHandler. onConfigured is called after
// credentials are persisted so the server can hot-reload OAuth config.
// isOAuthConfigured reports whether OAuth is already fully configured
// (from env vars OR SQLite), preventing duplicate app creation.
func NewManifestHandler(
	s store.Store,
	backendURL, frontendURL, githubURL string,
	onConfigured func(clientID, clientSecret string),
	isOAuthConfigured func() bool,
) *ManifestHandler {
	if githubURL == "" {
		githubURL = "https://github.com"
	}
	return &ManifestHandler{
		store:             s,
		backendURL:        strings.TrimRight(backendURL, "/"),
		frontendURL:       strings.TrimRight(frontendURL, "/"),
		githubURL:         strings.TrimRight(githubURL, "/"),
		onConfigured:      onConfigured,
		isOAuthConfigured: isOAuthConfigured,
		httpClient:        client.GitHub,
	}
}

// manifestPayload is the JSON structure POSTed to GitHub as the app manifest.
type manifestPayload struct {
	Name               string            `json:"name"`
	URL                string            `json:"url"`
	CallbackURLs       []string          `json:"callback_urls"`
	RedirectURL        string            `json:"redirect_url"`
	HookAttributes     map[string]any    `json:"hook_attributes"`
	Public             bool              `json:"public"`
	DefaultPermissions map[string]string `json:"default_permissions"`
	RequestOAuth       bool              `json:"request_oauth_on_install"`
}

// manifestConversionResponse is the subset of fields returned by the GitHub
// App Manifest code-to-credentials exchange endpoint.
type manifestConversionResponse struct {
	ClientID     string `json:"client_id"`
	ClientSecret string `json:"client_secret"`
	ID           int64  `json:"id"`
	Name         string `json:"name"`
	HTMLURL      string `json:"html_url"`
}

// ManifestSetup renders an HTML page that auto-submits a GitHub App Manifest
// form to GitHub. The user sees GitHub's "Create GitHub App" confirmation.
// Returns 302 to login if OAuth is already configured (prevents duplicate apps).
func (h *ManifestHandler) ManifestSetup(c *fiber.Ctx) error {
	if h.isOAuthConfigured != nil && h.isOAuthConfigured() {
		return c.Redirect(h.frontendURL + "/login")
	}
	suffix, err := randomHex(manifestAppNameSuffixBytes)
	if err != nil {
		slog.Error("[Manifest] failed to generate random suffix", "error", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
	}

	manifest := manifestPayload{
		Name:         fmt.Sprintf("KubeStellar Console %s", suffix),
		URL:          h.backendURL,
		CallbackURLs: []string{h.backendURL + "/auth/github/callback"},
		RedirectURL:  h.backendURL + "/auth/manifest/callback",
		HookAttributes: map[string]any{"url": "https://example.com/events", "active": false},
		Public:       false,
		DefaultPermissions: map[string]string{},
		RequestOAuth: true,
	}

	manifestJSON, err := json.Marshal(manifest)
	if err != nil {
		slog.Error("[Manifest] failed to marshal manifest", "error", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
	}

	formAction := h.githubURL + "/settings/apps/new"
	manifestB64 := base64.StdEncoding.EncodeToString(manifestJSON)

	page := fmt.Sprintf(`<!DOCTYPE html>
<html>
<head><title>Setting up GitHub Sign-In…</title></head>
<body style="display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0a0a0f;color:#e0e0e0;font-family:system-ui">
  <div style="text-align:center">
    <p>Redirecting to GitHub to create your OAuth app…</p>
    <form id="manifest-form" method="post" action="%s">
      <input type="hidden" id="manifest-input" name="manifest" value="">
      <noscript><button type="submit">Continue to GitHub</button></noscript>
    </form>
    <script>
      document.getElementById('manifest-input').value = atob('%s');
      document.getElementById('manifest-form').submit();
    </script>
  </div>
</body>
</html>`, formAction, manifestB64)

	c.Set("Content-Type", "text/html; charset=utf-8")
	return c.SendString(page)
}

// ManifestCallback handles the redirect from GitHub after the user creates
// the app. It exchanges the temporary code for credentials, persists them,
// hot-reloads OAuth config, and redirects to the login page.
func (h *ManifestHandler) ManifestCallback(c *fiber.Ctx) error {
	if h.isOAuthConfigured != nil && h.isOAuthConfigured() {
		slog.Warn("[Manifest] callback rejected — OAuth already configured")
		return c.Redirect(h.frontendURL + "/login?error=manifest_already_configured")
	}

	code := c.Query("code")
	if code == "" {
		slog.Warn("[Manifest] callback called without code")
		return c.Redirect(h.frontendURL + "/login?error=manifest_missing_code")
	}

	apiBase := "https://api.github.com"
	if h.githubURL != "https://github.com" {
		apiBase = h.githubURL + "/api/v3"
	}
	conversionURL := fmt.Sprintf("%s/app-manifests/%s/conversions", apiBase, code)

	req, err := http.NewRequestWithContext(c.Context(), http.MethodPost, conversionURL, nil)
	if err != nil {
		slog.Error("[Manifest] failed to create conversion request", "error", err)
		return c.Redirect(h.frontendURL + "/login?error=manifest_conversion_failed")
	}
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := h.httpClient.Do(req)
	if err != nil {
		slog.Error("[Manifest] conversion request failed", "error", err)
		return c.Redirect(h.frontendURL + "/login?error=manifest_conversion_failed")
	}
	defer resp.Body.Close()

	const maxConversionBodyBytes = 1 << 16
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxConversionBodyBytes))
	if err != nil {
		slog.Error("[Manifest] failed to read conversion response", "error", err)
		return c.Redirect(h.frontendURL + "/login?error=manifest_conversion_failed")
	}

	if resp.StatusCode != http.StatusCreated {
		slog.Error("[Manifest] conversion returned non-201", "status", resp.StatusCode, "body", string(body))
		return c.Redirect(h.frontendURL + "/login?error=manifest_conversion_failed")
	}

	var conversion manifestConversionResponse
	if err := json.Unmarshal(body, &conversion); err != nil {
		slog.Error("[Manifest] failed to parse conversion response", "error", err)
		return c.Redirect(h.frontendURL + "/login?error=manifest_conversion_failed")
	}

	if conversion.ClientID == "" || conversion.ClientSecret == "" {
		slog.Error("[Manifest] conversion response missing credentials")
		return c.Redirect(h.frontendURL + "/login?error=manifest_conversion_failed")
	}

	if err := h.store.SaveOAuthCredentials(c.Context(), conversion.ClientID, conversion.ClientSecret); err != nil {
		slog.Error("[Manifest] failed to persist credentials", "error", err)
		return c.Redirect(h.frontendURL + "/login?error=manifest_conversion_failed")
	}

	slog.Info("[Manifest] GitHub App created and credentials saved",
		"appID", conversion.ID, "appName", conversion.Name, "appURL", conversion.HTMLURL)

	if h.onConfigured != nil {
		h.onConfigured(conversion.ClientID, conversion.ClientSecret)
	}

	return c.Redirect(h.frontendURL + "/login?manifest=success")
}

func randomHex(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
