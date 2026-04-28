package handlers

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/settings"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestSettings_Integration_RoundTrip verifies issue #4.3: Settings persistence round-trip.
// It exercises the full flow from API request (PUT) to disk persistence (JSON)
// and back through the API (GET).
func TestSettings_Integration_RoundTrip(t *testing.T) {
	// Setup real SettingsManager pointing to temp files
	tempDir := t.TempDir()
	settingsPath := filepath.Join(tempDir, "settings.json")
	keyPath := filepath.Join(tempDir, ".keyfile")

	manager := settings.GetSettingsManager()
	// Override paths for this test
	oldSettingsPath := manager.GetSettingsPath()
	manager.SetSettingsPath(settingsPath)
	manager.SetKeyPath(keyPath)
	defer manager.SetSettingsPath(oldSettingsPath)

	// We need a store for the handler (checks user role)
	adminID := uuid.New()
	mockStore := new(test.MockStore)
	mockStore.On("GetUser", adminID).Return(&models.User{
		ID:   adminID,
		Role: models.UserRoleAdmin,
	}, nil).Maybe()

	app := fiber.New()
	handler := NewSettingsHandler(manager, mockStore)

	// Middleware to inject admin user
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", adminID)
		return c.Next()
	})

	app.Get("/api/settings", handler.GetSettings)
	app.Put("/api/settings", handler.SaveSettings)

	// 1. Initial GET - should return defaults
	req1 := httptest.NewRequest("GET", "/api/settings", nil)
	resp1, err := app.Test(req1)
	require.NoError(t, err)
	assert.Equal(t, 200, resp1.StatusCode)

	var s1 settings.AllSettings
	require.NoError(t, json.NewDecoder(resp1.Body).Decode(&s1))
	assert.Equal(t, "kubestellar", s1.Theme) // Default theme

	// 2. PUT - Update theme and an API key
	payload := settings.AllSettings{
		Theme: "dark-premium",
		APIKeys: map[string]settings.APIKeyEntry{
			"openai": {APIKey: "sk-integration-test-key", Model: "gpt-4-turbo"},
		},
	}
	body, _ := json.Marshal(payload)
	req2 := httptest.NewRequest("PUT", "/api/settings", bytes.NewReader(body))
	req2.Header.Set("Content-Type", "application/json")
	resp2, err := app.Test(req2)
	require.NoError(t, err)
	assert.Equal(t, 200, resp2.StatusCode)

	// Verify file exists on disk
	_, err = os.Stat(settingsPath)
	assert.NoError(t, err, "settings file must be persisted to disk")

	// 3. Final GET - should return updated values from disk
	// We call manager.Load() to simulate a server restart/new request cycle
	// although in a real app the manager keeps state in memory; but Load()
	// verifies the disk content is valid.
	err = manager.Load()
	require.NoError(t, err)

	req3 := httptest.NewRequest("GET", "/api/settings", nil)
	resp3, err := app.Test(req3)
	require.NoError(t, err)
	assert.Equal(t, 200, resp3.StatusCode)

	var s2 settings.AllSettings
	require.NoError(t, json.NewDecoder(resp3.Body).Decode(&s2))
	assert.Equal(t, "dark-premium", s2.Theme)
	assert.Equal(t, "sk-integration-test-key", s2.APIKeys["openai"].APIKey)
}

// TestSettings_Integration_ExportImport verifies the round-trip of settings
// through the export/import API.
func TestSettings_Integration_ExportImport(t *testing.T) {
	tempDir := t.TempDir()
	manager := settings.GetSettingsManager()
	manager.SetSettingsPath(filepath.Join(tempDir, "settings.json"))
	manager.SetKeyPath(filepath.Join(tempDir, ".keyfile"))

	adminID := uuid.New()
	mockStore := new(test.MockStore)
	mockStore.On("GetUser", adminID).Return(&models.User{
		ID:   adminID,
		Role: models.UserRoleAdmin,
	}, nil).Maybe()

	app := fiber.New()
	handler := NewSettingsHandler(manager, mockStore)
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", adminID)
		return c.Next()
	})

	app.Post("/api/settings/export", handler.ExportSettings)
	app.Post("/api/settings/import", handler.ImportSettings)

	// 1. Setup some settings
	initial := settings.AllSettings{Theme: "custom"}
	manager.SaveAll(&initial)

	// 2. Export
	reqExport := httptest.NewRequest("POST", "/api/settings/export", nil)
	respExport, err := app.Test(reqExport)
	require.NoError(t, err)
	assert.Equal(t, 200, respExport.StatusCode)

	blob, err := io.ReadAll(respExport.Body)
	require.NoError(t, err)

	// 3. Clear settings
	manager.SaveAll(&settings.AllSettings{Theme: "default"})

	// 4. Import
	reqImport := httptest.NewRequest("POST", "/api/settings/import", bytes.NewReader(blob))
	reqImport.Header.Set("Content-Type", "application/json")
	respImport, err := app.Test(reqImport)
	require.NoError(t, err)
	assert.Equal(t, 200, respImport.StatusCode)

	// 5. Verify
	current, err := manager.GetAll()
	require.NoError(t, err)
	require.NotNil(t, current)
	assert.Equal(t, "custom", current.Theme)

}
