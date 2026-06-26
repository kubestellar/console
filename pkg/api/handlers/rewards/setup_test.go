package rewards

import (
	"testing"

	"github.com/gofiber/fiber/v2"
)

// testEnv provides a minimal test environment for rewards handler tests.
type testEnv struct {
	App *fiber.App
}

func setupTestEnv(t *testing.T) *testEnv {
	t.Helper()
	app := fiber.New(fiber.Config{
		DisableStartupMessage: true,
	})
	return &testEnv{App: app}
}
