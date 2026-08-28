package github

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/settings"
)

type hasTokenResponse struct {
	HasToken bool   `json:"hasToken"`
	Source   string `json:"source"`
}

func doHasToken(t *testing.T, h *GitHubProxyHandler) hasTokenResponse {
	t.Helper()
	app := fiber.New()
	app.Get("/api/github/token/status", h.HasToken)

	req := httptest.NewRequest(http.MethodGet, "/api/github/token/status", nil)
	req.Host = "localhost"
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("HasToken request failed: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("HasToken status = %d, want 200", resp.StatusCode)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}
	var out hasTokenResponse
	if err := json.Unmarshal(body, &out); err != nil {
		t.Fatalf("decode: %v (body=%s)", err, string(body))
	}
	return out
}

// No token configured anywhere: HasToken must return hasToken=false, source="none".
func TestHasToken_NoTokenReturnsNone(t *testing.T) {
	setupGitHubProxyTestSettings(t)
	h := NewGitHubProxyHandler("", nil)
	got := doHasToken(t, h)
	if got.HasToken {
		t.Fatalf("hasToken = true, want false")
	}
	if got.Source != "none" {
		t.Fatalf("source = %q, want %q", got.Source, "none")
	}
}

// Only server env token configured (no user settings): source must be "env".
func TestHasToken_ServerTokenReturnsEnv(t *testing.T) {
	setupGitHubProxyTestSettings(t)
	h := NewGitHubProxyHandler("ghp_server_token", nil)
	got := doHasToken(t, h)
	if !got.HasToken {
		t.Fatal("hasToken = false, want true")
	}
	if got.Source != "env" {
		t.Fatalf("source = %q, want %q", got.Source, "env")
	}
}

// A user-saved token in encrypted settings takes precedence over the env
// server token, and the source is reported as "settings".
func TestHasToken_UserSettingsWinsOverEnv(t *testing.T) {
	setupGitHubProxyTestSettings(t)
	sm := settings.GetSettingsManager()
	all, err := sm.GetAll()
	if err != nil {
		t.Fatalf("GetAll: %v", err)
	}
	all.FeedbackGitHubToken = "ghp_user_saved_token"
	all.FeedbackGitHubTokenSource = "settings"
	if err := sm.SaveAll(all); err != nil {
		t.Fatalf("SaveAll: %v", err)
	}

	h := NewGitHubProxyHandler("ghp_server_token", nil)
	got := doHasToken(t, h)
	if !got.HasToken {
		t.Fatal("hasToken = false, want true")
	}
	if got.Source != "settings" {
		t.Fatalf("source = %q, want %q", got.Source, "settings")
	}
}

// User token with no explicit source falls back to the "settings" label.
func TestHasToken_UserTokenWithoutSourceFallsBackToSettings(t *testing.T) {
	setupGitHubProxyTestSettings(t)
	sm := settings.GetSettingsManager()
	all, err := sm.GetAll()
	if err != nil {
		t.Fatalf("GetAll: %v", err)
	}
	all.FeedbackGitHubToken = "ghp_user_saved_token"
	all.FeedbackGitHubTokenSource = ""
	if err := sm.SaveAll(all); err != nil {
		t.Fatalf("SaveAll: %v", err)
	}

	h := NewGitHubProxyHandler("", nil)
	got := doHasToken(t, h)
	if !got.HasToken {
		t.Fatal("hasToken = false, want true")
	}
	if got.Source != "settings" {
		t.Fatalf("source = %q, want %q", got.Source, "settings")
	}
}
