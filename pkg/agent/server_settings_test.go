package agent

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/kubestellar/console/pkg/settings"
)

func TestServer_SettingsHandlers(t *testing.T) {
	// 1. Setup temporary config
	cm := GetConfigManager()
	oldPath := cm.GetConfigPath()
	tmpFile := "/tmp/agent-test-config.yaml"
	cm.SetConfigPath(tmpFile)
	defer func() {
		cm.SetConfigPath(oldPath)
		os.Remove(tmpFile)
	}()

	server := &Server{
		allowedOrigins:    []string{"*"},
		SkipKeyValidation: true,
	}

	// Register a mock "openai" provider so the validation gate accepts it.
	// Ignore "already registered" errors from concurrent tests.
	_ = GetRegistry().Register(&ServerMockProvider{name: "openai"})

	// 2. Test handleSetKey
	reqBody := `{"provider":"openai", "apiKey":"test-key", "model":"gpt-4"}`
	req := httptest.NewRequest("POST", "/settings/keys", strings.NewReader(reqBody))
	req.Host = "localhost"
	w := httptest.NewRecorder()
	server.handleSettingsKeys(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("handleSetKey failed: %d - %s", w.Code, w.Body.String())
	}

	// Verify key was saved
	if cm.GetAPIKey("openai") != "test-key" {
		t.Error("API key not saved in config manager")
	}

	// 3. Test handleGetKeysStatus
	req = httptest.NewRequest("GET", "/settings/keys", nil)
	req.Host = "localhost"
	w = httptest.NewRecorder()
	server.handleSettingsKeys(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("handleGetKeysStatus failed: %d", w.Code)
	}

	var resp KeysStatusResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("Failed to decode keys status: %v", err)
	}

	// handleGetKeysStatus now reports the nine chat-only HTTP providers registered
	// in InitializeProviders (3 OpenAI-compatible gateways + 6 local LLM runners)
	// so the Settings modal can render a per-provider base URL override field
	// (#8248, #8254, #8256). CLI-based tool-capable agents remain hidden — they
	// manage their own credentials. The list must be non-empty and all entries
	// must carry a Provider name.
	if len(resp.Keys) == 0 {
		t.Error("Expected keys list to include chat-only HTTP providers, got 0 entries")
	}
	for _, k := range resp.Keys {
		if k.Provider == "" {
			t.Errorf("Key status entry missing Provider: %+v", k)
		}
	}
}

func TestServer_SettingsAll(t *testing.T) {
	// Setup temporary settings paths
	sm := settings.GetSettingsManager()
	oldSettingsPath := sm.GetSettingsPath()
	tmpSettings := "/tmp/test-settings.json"
	tmpKey := "/tmp/test-keyfile"
	sm.SetSettingsPath(tmpSettings)
	sm.SetKeyPath(tmpKey)
	defer func() {
		sm.SetSettingsPath(oldSettingsPath)
		os.Remove(tmpSettings)
		os.Remove(tmpKey)
	}()

	server := &Server{
		allowedOrigins: []string{"*"},
	}

	// 1. Test GET /settings (initial default)
	req := httptest.NewRequest("GET", "/settings", nil)
	req.Host = "localhost"
	w := httptest.NewRecorder()
	server.handleSettingsAll(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("GET /settings failed: %d", w.Code)
	}

	var all settings.AllSettings
	if err := json.Unmarshal(w.Body.Bytes(), &all); err != nil {
		t.Fatalf("Failed to unmarshal settings: %v", err)
	}

	// 2. Test PUT /settings
	all.Theme = "dark"
	all.APIKeys = map[string]settings.APIKeyEntry{
		"openai": {APIKey: "sk-test", Model: "gpt-4o"},
	}

	body, _ := json.Marshal(all)
	req = httptest.NewRequest("PUT", "/settings", strings.NewReader(string(body)))
	req.Host = "localhost"
	w = httptest.NewRecorder()
	server.handleSettingsAll(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("PUT /settings failed: %d", w.Code)
	}

	// 3. Verify saved settings
	req = httptest.NewRequest("GET", "/settings", nil)
	req.Host = "localhost"
	w = httptest.NewRecorder()
	server.handleSettingsAll(w, req)

	var saved settings.AllSettings
	json.Unmarshal(w.Body.Bytes(), &saved)
	if saved.Theme != "dark" {
		t.Errorf("Expected theme dark, got %s", saved.Theme)
	}
	if saved.APIKeys["openai"].Model != "gpt-4o" {
		t.Errorf("Expected gpt-4o, got %s", saved.APIKeys["openai"].Model)
	}
}

// ============================================================================
// COVERAGE EXPANSION TESTS - validateToken, checkOrigin, error paths
// ============================================================================

func TestServer_HandleSettingsKeyByProvider_OPTIONS(t *testing.T) {
	server := &Server{
		allowedOrigins: []string{"http://localhost"},
	}

	req := httptest.NewRequest("OPTIONS", "/settings/keys/claude", nil)
	req.Host = "localhost"
	req.Header.Set("Origin", "http://localhost")
	w := httptest.NewRecorder()

	server.handleSettingsKeyByProvider(w, req)

	if w.Code != http.StatusNoContent {
		t.Errorf("Expected 204 for OPTIONS, got %d", w.Code)
	}
}

func TestServer_HandleSettingsKeyByProvider_WrongMethod(t *testing.T) {
	server := &Server{
		allowedOrigins: []string{"*"},
	}

	req := httptest.NewRequest("GET", "/settings/keys/claude", nil)
	req.Host = "localhost"
	w := httptest.NewRecorder()

	server.handleSettingsKeyByProvider(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("Expected 405, got %d", w.Code)
	}
}

func TestServer_HandleSettingsKeyByProvider_MissingProvider(t *testing.T) {
	server := &Server{
		allowedOrigins: []string{"*"},
	}

	req := httptest.NewRequest("DELETE", "/settings/keys/", nil)
	req.Host = "localhost"
	w := httptest.NewRecorder()

	server.handleSettingsKeyByProvider(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected 400, got %d", w.Code)
	}
}

func TestServer_HandleSettingsAll_WrongMethod(t *testing.T) {
	server := &Server{
		allowedOrigins: []string{"*"},
	}

	req := httptest.NewRequest("DELETE", "/settings", nil)
	req.Host = "localhost"
	w := httptest.NewRecorder()

	server.handleSettingsAll(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("Expected 405, got %d", w.Code)
	}
}

func TestServer_HandleSettingsAll_OPTIONS(t *testing.T) {
	server := &Server{
		allowedOrigins: []string{"http://localhost"},
	}

	req := httptest.NewRequest("OPTIONS", "/settings", nil)
	req.Host = "localhost"
	req.Header.Set("Origin", "http://localhost")
	w := httptest.NewRecorder()

	server.handleSettingsAll(w, req)

	if w.Code != http.StatusNoContent {
		t.Errorf("Expected 204 for OPTIONS, got %d", w.Code)
	}
}

func TestServer_HandleSettingsAll_InvalidJSON(t *testing.T) {
	sm := settings.GetSettingsManager()
	oldPath := sm.GetSettingsPath()
	tmpSettings := "/tmp/test-settings-invalid.json"
	sm.SetSettingsPath(tmpSettings)
	defer func() {
		sm.SetSettingsPath(oldPath)
		os.Remove(tmpSettings)
	}()

	server := &Server{
		allowedOrigins: []string{"*"},
	}

	req := httptest.NewRequest("PUT", "/settings", strings.NewReader("invalid json"))
	req.Host = "localhost"
	w := httptest.NewRecorder()

	server.handleSettingsAll(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected 400 for invalid JSON, got %d", w.Code)
	}
}

func TestServer_HandleSettingsKeys_WrongMethod(t *testing.T) {
	server := &Server{
		allowedOrigins: []string{"*"},
	}

	req := httptest.NewRequest("DELETE", "/settings/keys", nil)
	req.Host = "localhost"
	w := httptest.NewRecorder()

	server.handleSettingsKeys(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("Expected 405, got %d", w.Code)
	}
}

func TestServer_HandleSettingsKeys_OPTIONS(t *testing.T) {
	server := &Server{
		allowedOrigins: []string{"http://localhost"},
	}

	req := httptest.NewRequest("OPTIONS", "/settings/keys", nil)
	req.Host = "localhost"
	req.Header.Set("Origin", "http://localhost")
	w := httptest.NewRecorder()

	server.handleSettingsKeys(w, req)

	if w.Code != http.StatusNoContent {
		t.Errorf("Expected 204 for OPTIONS, got %d", w.Code)
	}
}

func TestServer_HandleSettingsExport_OPTIONS(t *testing.T) {
	server := &Server{
		allowedOrigins: []string{"http://localhost"},
	}

	req := httptest.NewRequest("OPTIONS", "/settings/export", nil)
	req.Host = "localhost"
	req.Header.Set("Origin", "http://localhost")
	w := httptest.NewRecorder()

	server.handleSettingsExport(w, req)

	if w.Code != http.StatusNoContent {
		t.Errorf("Expected 204 for OPTIONS, got %d", w.Code)
	}
}

func TestServer_HandleSettingsExport_WrongMethod(t *testing.T) {
	server := &Server{
		allowedOrigins: []string{"*"},
	}

	req := httptest.NewRequest("GET", "/settings/export", nil)
	req.Host = "localhost"
	w := httptest.NewRecorder()

	server.handleSettingsExport(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("Expected 405, got %d", w.Code)
	}
}

func TestServer_HandleSettingsImport_OPTIONS(t *testing.T) {
	server := &Server{
		allowedOrigins: []string{"http://localhost"},
	}

	req := httptest.NewRequest("OPTIONS", "/settings/import", nil)
	req.Host = "localhost"
	req.Header.Set("Origin", "http://localhost")
	w := httptest.NewRecorder()

	server.handleSettingsImport(w, req)

	if w.Code != http.StatusNoContent {
		t.Errorf("Expected 204 for OPTIONS, got %d", w.Code)
	}
}

func TestServer_HandleSettingsImport_WrongMethod(t *testing.T) {
	server := &Server{
		allowedOrigins: []string{"*"},
	}

	req := httptest.NewRequest("GET", "/settings/import", nil)
	req.Host = "localhost"
	w := httptest.NewRecorder()

	server.handleSettingsImport(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("Expected 405, got %d", w.Code)
	}
}
