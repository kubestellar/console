package handlers

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/client"
	"github.com/kubestellar/console/pkg/store"
)

const (
	// manifestAppNameSuffixBytes is the number of random bytes appended to the
	// GitHub App name to avoid global name collisions on retry.
	manifestAppNameSuffixBytes = 3
	// manifestStateBytes is the number of random bytes used for the
	// single-use CSRF state on the manifest setup/callback flow.
	manifestStateBytes = 16
	manifestStateTTL   = 10 * time.Minute
)

// ManifestHandler implements the GitHub App Manifest one-click OAuth flow.
// When a user clicks "Set up GitHub Sign-In," the handler renders a page
// that auto-submits a manifest to GitHub. GitHub creates the OAuth App and
// redirects back with a temporary code, which we exchange for credentials.
type ManifestHandler struct {
	store             store.Store
	backendURL        string
	frontendURL       string
	githubURL         string
	bootstrapToken    string
	onConfigured      func(clientID, clientSecret string)
	isOAuthConfigured func() bool
	httpClient        *http.Client
	stateMu           sync.Mutex
	pendingStates     map[string]time.Time
}

// NewManifestHandler creates a ManifestHandler. onConfigured is called after
// credentials are persisted so the server can hot-reload OAuth config.
// isOAuthConfigured reports whether OAuth is already fully configured
// (from env vars OR SQLite), preventing duplicate app creation.
// bootstrapToken, if non-empty, must be provided as ?token= query parameter
// to access the manifest flow. If empty, access is restricted to loopback IPs.
func NewManifestHandler(
	s store.Store,
	backendURL, frontendURL, githubURL, bootstrapToken string,
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
		bootstrapToken:    bootstrapToken,
		onConfigured:      onConfigured,
		isOAuthConfigured: isOAuthConfigured,
		httpClient:        client.GitHub,
		pendingStates:     make(map[string]time.Time),
	}
}

// checkBootstrapAuth verifies the caller is authorized to use the manifest
// bootstrap flow. If CONSOLE_BOOTSTRAP_TOKEN is set, the request must include
// it as ?token=<value>. If no token is configured, only loopback/private-network
// clients are permitted (CWE-306 mitigation).
func (h *ManifestHandler) checkBootstrapAuth(c *fiber.Ctx) error {
	if h.bootstrapToken != "" {
		provided := c.Query("token")
		if subtle.ConstantTimeCompare([]byte(h.bootstrapToken), []byte(provided)) != 1 {
			slog.Warn("[Manifest] bootstrap access denied — invalid or missing token", "ip", c.IP())
			return fiber.NewError(fiber.StatusForbidden, "bootstrap token required")
		}
		return nil
	}

	// No explicit token configured — restrict to loopback/private IPs.
	if !isBootstrapAllowedIP(c.IP()) {
		slog.Warn("[Manifest] bootstrap access denied — non-private IP without token", "ip", c.IP())
		return fiber.NewError(fiber.StatusForbidden,
			"manifest bootstrap is restricted; set CONSOLE_BOOTSTRAP_TOKEN or access from localhost")
	}
	return nil
}

// isBootstrapAllowedIP returns true if the IP is loopback, private, link-local,
// or unspecified (0.0.0.0/::) — the unspecified case covers direct connections
// without a reverse proxy where the kernel hasn't resolved the peer address.
func isBootstrapAllowedIP(ip string) bool {
	parsed := net.ParseIP(ip)
	if parsed == nil {
		return false
	}
	return parsed.IsLoopback() || parsed.IsPrivate() || parsed.IsLinkLocalUnicast() || parsed.IsUnspecified()
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
	if err := h.checkBootstrapAuth(c); err != nil {
		return err
	}
	suffix, err := randomHex(manifestAppNameSuffixBytes)
	if err != nil {
		slog.Error("[Manifest] failed to generate random suffix", "error", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
	}
	state, err := h.issueState()
	if err != nil {
		slog.Error("[Manifest] failed to generate setup state", "error", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
	}

	manifest := manifestPayload{
		Name:               fmt.Sprintf("KubeStellar Console %s", suffix),
		URL:                h.backendURL,
		CallbackURLs:       []string{h.backendURL + "/auth/github/callback"},
		RedirectURL:        h.backendURL + "/auth/manifest/callback",
		HookAttributes:     map[string]any{"url": "https://example.com/events", "active": false},
		Public:             false,
		DefaultPermissions: map[string]string{},
		RequestOAuth:       true,
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
      <input type="hidden" name="state" value="%s">
      <input type="hidden" id="manifest-input" name="manifest" value="">
      <noscript><button type="submit">Continue to GitHub</button></noscript>
    </form>
    <script>
      document.getElementById('manifest-input').value = atob('%s');
      document.getElementById('manifest-form').submit();
    </script>
  </div>
</body>
</html>`, formAction, state, manifestB64)

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
	if err := h.checkBootstrapAuth(c); err != nil {
		return err
	}

	state := c.Query("state")
	if !h.consumeState(state) {
		slog.Warn("[Manifest] callback rejected — invalid or expired state")
		return c.Redirect(h.frontendURL + "/login?error=manifest_invalid_state")
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

	req, err := http.NewRequestWithContext(c.UserContext(), http.MethodPost, conversionURL, nil)
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

	if err := h.store.SaveOAuthCredentials(c.UserContext(), conversion.ClientID, conversion.ClientSecret); err != nil {
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

func (h *ManifestHandler) issueState() (string, error) {
	state, err := randomHex(manifestStateBytes)
	if err != nil {
		return "", err
	}

	now := time.Now()
	h.stateMu.Lock()
	defer h.stateMu.Unlock()
	if h.pendingStates == nil {
		h.pendingStates = make(map[string]time.Time)
	}
	h.pruneExpiredStatesLocked(now)
	h.pendingStates[state] = now.Add(manifestStateTTL)
	return state, nil
}

func (h *ManifestHandler) consumeState(state string) bool {
	if state == "" {
		return false
	}

	now := time.Now()
	h.stateMu.Lock()
	defer h.stateMu.Unlock()
	if h.pendingStates == nil {
		return false
	}
	h.pruneExpiredStatesLocked(now)
	expiresAt, ok := h.pendingStates[state]
	if !ok {
		return false
	}
	delete(h.pendingStates, state)
	return expiresAt.After(now)
}

func (h *ManifestHandler) pruneExpiredStatesLocked(now time.Time) {
	for state, expiresAt := range h.pendingStates {
		if !expiresAt.After(now) {
			delete(h.pendingStates, state)
		}
	}
}

func randomHex(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
