package compliance

import (
	"path/filepath"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/settings"
)

// testEnv holds the test environment components.
type testEnv struct {
	App      *fiber.App
	TempDir  string
	Settings *settings.SettingsManager
}

// setupTestEnv creates a new test environment with a fresh Fiber app and an initialized
// SettingsManager pointing to a temporary directory.
func setupTestEnv(t *testing.T) *testEnv {
	// Create a temporary directory for settings
	tempDir := t.TempDir()
	settingsPath := filepath.Join(tempDir, "settings.json")
	keyPath := filepath.Join(tempDir, ".keyfile")

	// Initialize SettingsManager
	manager := settings.GetSettingsManager()
	// Override paths for testing isolation
	manager.SetSettingsPath(settingsPath)
	manager.SetKeyPath(keyPath)

	// Ensure we start with a clean state for this test run relative to the file.
	_ = manager.Load()

	app := fiber.New(fiber.Config{
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			code := fiber.StatusInternalServerError
			if e, ok := err.(*fiber.Error); ok {
				code = e.Code
			}
			return c.Status(code).JSON(fiber.Map{"error": err.Error()})
		},
	})

	return &testEnv{
		App:      app,
		TempDir:  tempDir,
		Settings: manager,
	}
}
