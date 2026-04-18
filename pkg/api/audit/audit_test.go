package audit

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
)

// captureLog replaces the default slog logger with a JSON logger that writes
// to buf, calls fn, then restores the original logger.
func captureLog(buf *bytes.Buffer, fn func()) {
	original := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(buf, nil)))
	defer slog.SetDefault(original)
	fn()
}

func TestLogEmitsRequiredFields(t *testing.T) {
	app := fiber.New()
	app.Post("/api/users/:id/role", func(c *fiber.Ctx) error {
		Log(c, ActionUpdateRole, "user", "target-123", "viewer->admin")
		return c.SendStatus(fiber.StatusOK)
	})

	var buf bytes.Buffer
	captureLog(&buf, func() {
		req := httptest.NewRequest("POST", "/api/users/target-123/role", nil)
		req.Header.Set("X-Forwarded-For", "10.0.0.1")
		//nolint:errcheck // test-only; response body is irrelevant
		app.Test(req)
	})

	var entry map[string]any
	if err := json.Unmarshal(buf.Bytes(), &entry); err != nil {
		t.Fatalf("failed to parse log JSON: %v\nbuf: %s", err, buf.String())
	}

	requiredKeys := []string{"action", "actor_id", "target_type", "target_id", "ip", "path", "method", "details"}
	for _, k := range requiredKeys {
		if _, ok := entry[k]; !ok {
			t.Errorf("missing required audit field %q in log entry", k)
		}
	}

	if entry["action"] != ActionUpdateRole {
		t.Errorf("action = %v, want %v", entry["action"], ActionUpdateRole)
	}
	if entry["target_type"] != "user" {
		t.Errorf("target_type = %v, want %q", entry["target_type"], "user")
	}
	if entry["target_id"] != "target-123" {
		t.Errorf("target_id = %v, want %q", entry["target_id"], "target-123")
	}
	if entry["details"] != "viewer->admin" {
		t.Errorf("details = %v, want %q", entry["details"], "viewer->admin")
	}
}

func TestLogOmitsDetailsWhenEmpty(t *testing.T) {
	app := fiber.New()
	app.Delete("/api/users/:id", func(c *fiber.Ctx) error {
		Log(c, ActionDeleteUser, "user", "target-456")
		return c.SendStatus(fiber.StatusOK)
	})

	var buf bytes.Buffer
	captureLog(&buf, func() {
		req := httptest.NewRequest("DELETE", "/api/users/target-456", nil)
		//nolint:errcheck // test-only
		app.Test(req)
	})

	var entry map[string]any
	if err := json.Unmarshal(buf.Bytes(), &entry); err != nil {
		t.Fatalf("failed to parse log JSON: %v", err)
	}

	if _, ok := entry["details"]; ok {
		t.Error("details field should be omitted when no details are provided")
	}

	if entry["action"] != ActionDeleteUser {
		t.Errorf("action = %v, want %v", entry["action"], ActionDeleteUser)
	}
}

func TestLogUnauthorizedAttempt(t *testing.T) {
	app := fiber.New()
	app.Get("/api/users", func(c *fiber.Ctx) error {
		Log(c, ActionUnauthorizedAttempt, "endpoint", "/api/users", "non-admin list attempt")
		return c.SendStatus(fiber.StatusForbidden)
	})

	var buf bytes.Buffer
	captureLog(&buf, func() {
		req := httptest.NewRequest("GET", "/api/users", nil)
		//nolint:errcheck // test-only
		app.Test(req)
	})

	var entry map[string]any
	if err := json.Unmarshal(buf.Bytes(), &entry); err != nil {
		t.Fatalf("failed to parse log JSON: %v", err)
	}

	if entry["action"] != ActionUnauthorizedAttempt {
		t.Errorf("action = %v, want %v", entry["action"], ActionUnauthorizedAttempt)
	}
}
