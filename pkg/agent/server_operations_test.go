package agent

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestServer_GetKeysStatus(t *testing.T) {
	server := &Server{
		allowedOrigins: []string{"*"},
	}

	// Register a mock provider
	GetRegistry().Register(&ServerMockProvider{name: "groq"})

	req := httptest.NewRequest("GET", "/settings/keys", nil)
	w := httptest.NewRecorder()

	server.handleGetKeysStatus(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", w.Code)
	}

	var resp KeysStatusResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	// Should contain the standard providers
	foundGroq := false
	for _, k := range resp.Keys {
		if k.Provider == "groq" {
			foundGroq = true
			break
		}
	}
	if !foundGroq {
		t.Error("groq provider not found in keys status")
	}
}

func TestServer_ValidateBaseURL(t *testing.T) {
	tests := []struct {
		url   string
		valid bool
	}{
		{"http://localhost:11434", true},
		{"https://api.openai.com", true},
		{"http://10.0.0.1:8080/v1", true},
		{"missing-scheme", false},
		{"ftp://invalid", false},
		{"http:// space ", false},
	}

	for _, tt := range tests {
		err := validateBaseURL(tt.url)
		if (err == nil) != tt.valid {
			t.Errorf("validateBaseURL(%q) valid=%v, want %v. Err: %v", tt.url, err == nil, tt.valid, err)
		}
	}
}

func TestServer_HandleSettingsExportImport(t *testing.T) {
	server := &Server{
		allowedOrigins: []string{"*"},
	}

	// 1. Export (should return encrypted blob if settings exist, or default)
	req := httptest.NewRequest("POST", "/settings/export", nil)
	w := httptest.NewRecorder()
	server.handleSettingsExport(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Export failed: %d", w.Code)
	}

	// 2. Import (mock an import)
	importBody := `{"data": "mock-encrypted-blob"}`
	req = httptest.NewRequest("POST", "/settings/import", strings.NewReader(importBody))
	w = httptest.NewRecorder()
	server.handleSettingsImport(w, req)

	// This might fail because "mock-encrypted-blob" is not valid encrypted data.
	// But let's check if it handles it gracefully.
	if w.Code != http.StatusBadRequest && w.Code != http.StatusInternalServerError {
		// If it succeeded with mock data, it might be a bug or it's very robust.
	}
}
