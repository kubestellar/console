package handlers

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/kubestellar/console/pkg/settings"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGetSettings(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewSettingsHandler(env.Settings)
	env.App.Get("/api/settings", handler.GetSettings)

	// Case 1: File missing (default settings)
	req := httptest.NewRequest("GET", "/api/settings", nil)
	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, 200, resp.StatusCode)

	var result settings.AllSettings
	body, _ := io.ReadAll(resp.Body)
	err = json.Unmarshal(body, &result)
	require.NoError(t, err)
	// Check default
	assert.Equal(t, "kubestellar", result.Theme)
	assert.Equal(t, "medium", result.AIMode)

	// Case 2: File exists with custom data
	// Modify something and save
	result.Theme = "light"
	err = env.Settings.SaveAll(&result)
	require.NoError(t, err)

	// Request again
	req2 := httptest.NewRequest("GET", "/api/settings", nil)
	resp2, err := env.App.Test(req2, 5000)
	require.NoError(t, err)
	assert.Equal(t, 200, resp2.StatusCode)

	var result2 settings.AllSettings
	body2, _ := io.ReadAll(resp2.Body)
	err = json.Unmarshal(body2, &result2)
	require.NoError(t, err)
	assert.Equal(t, "light", result2.Theme)
}

func TestSaveSettings(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewSettingsHandler(env.Settings)
	env.App.Put("/api/settings", handler.SaveSettings)

	// Case 1: Valid save
	payload := settings.AllSettings{
		Theme:  "light",
		AIMode: "cloud",
		APIKeys: map[string]settings.APIKeyEntry{
			"openai": {APIKey: "sk-test", Model: "gpt-4"},
		},
	}
	data, _ := json.Marshal(payload)
	req := httptest.NewRequest("PUT", "/api/settings", bytes.NewReader(data))
	req.Header.Set("Content-Type", "application/json")

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, 200, resp.StatusCode)

	// Verify persistence in memory
	stored, err := env.Settings.GetAll()
	require.NoError(t, err)
	assert.Equal(t, "light", stored.Theme)
	assert.Equal(t, "cloud", stored.AIMode)
	assert.Equal(t, "sk-test", stored.APIKeys["openai"].APIKey)

	// Case 2: Malformed JSON
	reqInvalid := httptest.NewRequest("PUT", "/api/settings", bytes.NewReader([]byte("{invalid-json")))
	reqInvalid.Header.Set("Content-Type", "application/json")
	respInvalid, err := env.App.Test(reqInvalid, 5000)
	require.NoError(t, err)
	assert.Equal(t, 400, respInvalid.StatusCode)
}

func TestExportImportSettings(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewSettingsHandler(env.Settings)
	env.App.Post("/api/settings/export", handler.ExportSettings)
	env.App.Post("/api/settings/import", handler.ImportSettings)

	// Setup initial state
	initial := &settings.AllSettings{
		Theme: "light",
		APIKeys: map[string]settings.APIKeyEntry{
			"openai": {APIKey: "sk-secret", Model: "gpt-4"},
		},
	}
	err := env.Settings.SaveAll(initial)
	require.NoError(t, err)

	// Case 1: Export
	reqExport := httptest.NewRequest("POST", "/api/settings/export", nil)
	respExport, err := env.App.Test(reqExport, 5000)
	require.NoError(t, err)
	assert.Equal(t, 200, respExport.StatusCode)

	exportedData, err := io.ReadAll(respExport.Body)
	require.NoError(t, err)
	assert.NotEmpty(t, exportedData)
	assert.Contains(t, string(exportedData), "encrypted") // Should contain encrypted fields

	// Case 2: Import valid blob
	// Create new clean environment to simulate another machine
	env2 := setupTestEnv(t)
	// IMPORTANT: ImportEncrypted requires the SAME key to decrypt encrypted fields.
	// Since setupTestEnv relies on the singleton which holds the key in memory,
	// env2 actually shares the same key as env1 (because we didn't restart the process).
	// This is perfect for simulating a restore on the same machine/key setup.

	handler2 := NewSettingsHandler(env2.Settings)
	env2.App.Post("/api/settings/import", handler2.ImportSettings)

	reqImport := httptest.NewRequest("POST", "/api/settings/import", bytes.NewReader(exportedData))
	reqImport.Header.Set("Content-Type", "application/json")

	respImport, err := env2.App.Test(reqImport, 5000)
	require.NoError(t, err)
	assert.Equal(t, 200, respImport.StatusCode)

	// Verify imported data
	imported, err := env2.Settings.GetAll()
	require.NoError(t, err)
	assert.Equal(t, "light", imported.Theme)
	assert.Equal(t, "sk-secret", imported.APIKeys["openai"].APIKey) // Should be decrypted successfully

	// Case 3: Import invalid blob
	reqInvalid := httptest.NewRequest("POST", "/api/settings/import", bytes.NewReader([]byte("not-json")))
	respInvalid, err := env2.App.Test(reqInvalid, 5000)
	require.NoError(t, err)
	assert.Equal(t, 400, respInvalid.StatusCode)

	// Case 4: Import empty body
	reqEmpty := httptest.NewRequest("POST", "/api/settings/import", nil)
	respEmpty, err := env2.App.Test(reqEmpty, 5000)
	require.NoError(t, err)
	assert.Equal(t, 400, respEmpty.StatusCode)
}

func TestSettingsFileError(t *testing.T) {
	// Simulate permission error
	if os.Getuid() == 0 {
		t.Skip("Skipping permission test as root")
	}

	env := setupTestEnv(t)
	handler := NewSettingsHandler(env.Settings)
	env.App.Put("/api/settings", handler.SaveSettings)

	// Make directory read-only to force save error
	err := os.Chmod(env.TempDir, 0500)
	require.NoError(t, err)
	defer os.Chmod(env.TempDir, 0700)

	// The SettingsManager writes to a temp file then renames, or writes directly.
	// We need to invalidate the settings path specifically.
	// However, SettingsManager also does MkdirAll.
	// If parent dir is not writable, Save should fail.

	// Create payload
	payload := settings.AllSettings{Theme: "fail"}
	data, _ := json.Marshal(payload)
	req := httptest.NewRequest("PUT", "/api/settings", bytes.NewReader(data))
	req.Header.Set("Content-Type", "application/json")

	// This relies on file system permissions which can be flaky in some CI envs.
	// If it fails to fail (because temp dir behavior), we might just accept it.
	// But let's try.

	// Actually, `handler.SaveSettings` logs error and returns 500.
	// Let's see if we can trigger it.

	// Note: setupTestEnv sets the settings path inside `TempDir`.
	// Changing permission of TempDir should block writing `settings.json` inside it.

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	// If it successfully writes (somehow), status will be 200. If failed, 500.
	// We assert 500.
	assert.Equal(t, 500, resp.StatusCode)
}
