package agent

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/kubestellar/console/pkg/settings"
)

func TestServer_HandleSettingsAll(t *testing.T) {
	// Setup temporary settings and key files
	tmpSettings, err := os.CreateTemp("", "settings-*.json")
	if err != nil {
		t.Fatalf("Failed to create temp settings file: %v", err)
	}
	defer tmpSettings.Close()
	defer os.Remove(tmpSettings.Name())

	tmpKey, err := os.CreateTemp("", ".keyfile")
	if err != nil {
		t.Fatalf("Failed to create temp key file: %v", err)
	}
	defer tmpKey.Close()
	defer os.Remove(tmpKey.Name())

	sm := settings.GetSettingsManager()
	sm.SetSettingsPath(tmpSettings.Name())
	sm.SetKeyPath(tmpKey.Name())

	s := &Server{
		allowedOrigins: []string{"*"},
	}

	// 1. Test GET (default settings)
	req := httptest.NewRequest("GET", "/settings", nil)
	w := httptest.NewRecorder()
	s.handleSettingsAll(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d", w.Code)
	}

	// 2. Test PUT (update settings)
	newSettings := settings.DefaultAllSettings()
	newSettings.Theme = "dark"
	body, _ := json.Marshal(newSettings)
	req = httptest.NewRequest("PUT", "/settings", bytes.NewReader(body))
	w = httptest.NewRecorder()
	s.handleSettingsAll(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d", w.Code)
	}

	var resp map[string]interface{}
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["success"] != true {
		t.Error("Expected success: true")
	}
}

func TestServer_HandleGetKeysStatus(t *testing.T) {
	// Use isolateConfigManager to avoid reading/mutating the real ~/.kc/config.yaml.
	cm := isolateConfigManager(t)

	tmpConfig, err := os.CreateTemp("", "config-*.yaml")
	if err != nil {
		t.Fatalf("Failed to create temp config file: %v", err)
	}
	defer tmpConfig.Close()
	defer os.Remove(tmpConfig.Name())

	cm.SetConfigPath(tmpConfig.Name())

	s := &Server{
		allowedOrigins:     []string{"*"},
		SkipKeyValidation:  true, // Don't hit real APIs
	}

	req := httptest.NewRequest("GET", "/settings/keys", nil)
	w := httptest.NewRecorder()
	s.handleGetKeysStatus(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d", w.Code)
	}

	var resp KeysStatusResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if resp.ConfigPath != tmpConfig.Name() {
		t.Errorf("Expected config path %s, got %s", tmpConfig.Name(), resp.ConfigPath)
	}
}
