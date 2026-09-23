package admin

import (
	"path/filepath"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/settings"
	"github.com/kubestellar/console/pkg/store"
	"github.com/kubestellar/console/pkg/test"
)

// fiberTestTimeout is the app.Test timeout (ms) used by handler tests.
const fiberTestTimeout = 5000

// testAdminUserID is the fixed user ID injected by setupTestEnv for RBAC-protected
// endpoints. The MockStore is configured to return an admin user for this ID.
var testAdminUserID = uuid.MustParse("00000000-0000-0000-0000-000000000001")

// testEnv holds the test environment components.
type testEnv struct {
	App      *fiber.App
	TempDir  string
	Settings *settings.SettingsManager
	Store    store.Store
}

// setupTestEnv creates a new test environment with a fresh Fiber app, an
// initialized SettingsManager pointing to a temporary directory, and a
// MockStore pre-configured with an admin user (mirrors the root handlers
// package test env, trimmed to what the admin subpackage needs).
func setupTestEnv(t *testing.T) *testEnv {
	t.Helper()
	tempDir := t.TempDir()

	manager := settings.GetSettingsManager()
	manager.SetSettingsPath(filepath.Join(tempDir, "settings.json"))
	manager.SetKeyPath(filepath.Join(tempDir, ".keyfile"))
	_ = manager.Load()

	mockStore := new(test.MockStore)
	mockStore.On("GetUser", testAdminUserID).Return(&models.User{
		ID:   testAdminUserID,
		Role: "admin",
	}, nil).Maybe()

	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", testAdminUserID)
		return c.Next()
	})

	return &testEnv{
		App:      app,
		TempDir:  tempDir,
		Settings: manager,
		Store:    mockStore,
	}
}
