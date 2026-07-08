package audit

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/kubestellar/console/pkg/store"
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
		req.Host = "localhost"
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
		req.Host = "localhost"
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
		req.Host = "localhost"
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

type auditStoreStub struct {
	store.Store
	userID string
	action string
	detail string
	calls  int
	err    error
}

func (s *auditStoreStub) InsertAuditLog(_ context.Context, userID, action, detail string) error {
	s.calls++
	s.userID = userID
	s.action = action
	s.detail = detail
	return s.err
}

func TestLogPersistsAuditEntry(t *testing.T) {
	originalStore := getStore()
	defer SetStore(originalStore)

	stub := &auditStoreStub{}
	SetStore(stub)

	app := fiber.New()
	actorID := uuid.New()
	app.Put("/api/settings", func(c *fiber.Ctx) error {
		c.Locals("userID", actorID)
		Log(c, ActionSaveSettings, "settings", "global", "saved", "ok")
		return c.SendStatus(fiber.StatusOK)
	})

	req := httptest.NewRequest("PUT", "/api/settings", nil)
	req.Host = "localhost"
	req.Header.Set("X-Forwarded-For", "203.0.113.10")
	_, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test() error = %v", err)
	}

	if stub.calls != 1 {
		t.Fatalf("InsertAuditLog calls = %d, want 1", stub.calls)
	}
	if stub.userID != actorID.String() {
		t.Fatalf("userID = %q, want %q", stub.userID, actorID.String())
	}
	if stub.action != ActionSaveSettings {
		t.Fatalf("action = %q, want %q", stub.action, ActionSaveSettings)
	}

	var detail map[string]string
	if err := json.Unmarshal([]byte(stub.detail), &detail); err != nil {
		t.Fatalf("json.Unmarshal(detail) error = %v", err)
	}
	if detail["target_type"] != "settings" {
		t.Errorf("target_type = %q, want %q", detail["target_type"], "settings")
	}
	if detail["target_id"] != "global" {
		t.Errorf("target_id = %q, want %q", detail["target_id"], "global")
	}
	if detail["path"] != "/api/settings" {
		t.Errorf("path = %q, want %q", detail["path"], "/api/settings")
	}
	if detail["method"] != "PUT" {
		t.Errorf("method = %q, want %q", detail["method"], "PUT")
	}
	if detail["details"] != "saved ok" {
		t.Errorf("details = %q, want %q", detail["details"], "saved ok")
	}
}

func TestLogStoreFailureLogsError(t *testing.T) {
	originalStore := getStore()
	defer SetStore(originalStore)

	stub := &auditStoreStub{err: errors.New("insert failed")}
	SetStore(stub)

	app := fiber.New()
	app.Post("/api/login", func(c *fiber.Ctx) error {
		Log(c, ActionAuthFailed, "session", "current")
		return c.SendStatus(fiber.StatusUnauthorized)
	})

	var buf bytes.Buffer
	captureLog(&buf, func() {
		req := httptest.NewRequest("POST", "/api/login", nil)
		req.Host = "localhost"
		_, err := app.Test(req)
		if err != nil {
			t.Fatalf("app.Test() error = %v", err)
		}
	})

	if stub.calls != 1 {
		t.Fatalf("InsertAuditLog calls = %d, want 1", stub.calls)
	}
	logText := buf.String()
	if !strings.Contains(logText, "audit: failed to persist audit entry") {
		t.Fatalf("log output %q does not contain persistence failure message", logText)
	}
	if !strings.Contains(logText, "\"level\":\"ERROR\"") {
		t.Fatalf("log output %q does not contain error level", logText)
	}
}
