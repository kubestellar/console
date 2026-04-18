// Package audit provides structured logging helpers for security-sensitive
// operations such as role changes, user deletions, and unauthorized access
// attempts. Phase 1 of #8670.
//
// Phase 3 adds opt-in SQLite persistence: call SetStore once at startup to
// enable writing audit entries to the audit_log table in addition to slog.
package audit

import (
	"context"
	"encoding/json"
	"log/slog"
	"strings"
	"sync"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/store"
)

// Action constants identify the kind of auditable event.
const (
	ActionUpdateRole          = "update_role"
	ActionDeleteUser          = "delete_user"
	ActionUnauthorizedAttempt = "unauthorized_attempt"

	// Phase 2: settings, cluster groups, notifications, tokens, quotas.
	ActionSaveSettings           = "save_settings"
	ActionImportSettings         = "import_settings"
	ActionExportSettings         = "export_settings"
	ActionCreateClusterGroup     = "create_cluster_group"
	ActionUpdateClusterGroup     = "update_cluster_group"
	ActionDeleteClusterGroup     = "delete_cluster_group"
	ActionSaveNotificationConfig = "save_notification_config"
	ActionDeleteToken            = "delete_token"
	ActionCreateResourceQuota    = "create_resource_quota"
	ActionDeleteResourceQuota    = "delete_resource_quota"
)

// storeMu guards the package-level store reference.
var (
	storeMu   sync.RWMutex
	auditStore store.Store
)

// SetStore enables SQLite persistence for audit entries. Pass nil to disable.
// Safe to call concurrently but typically called once at startup.
func SetStore(s store.Store) {
	storeMu.Lock()
	defer storeMu.Unlock()
	auditStore = s
}

// getStore returns the current store (or nil if not set).
func getStore() store.Store {
	storeMu.RLock()
	defer storeMu.RUnlock()
	return auditStore
}

// Log emits a structured audit log entry for a security-sensitive operation.
// Optional detail strings are joined with a space and included in the entry.
//
// If a store has been set via SetStore, the entry is also persisted to SQLite.
// Store write failures are logged but never propagated to the caller — audit
// persistence is best-effort so it cannot break request handling.
func Log(c *fiber.Ctx, action, targetType, targetID string, details ...string) {
	userID := middleware.GetUserID(c)
	ip := c.IP()

	attrs := []any{
		"action", action,
		"actor_id", userID,
		"target_type", targetType,
		"target_id", targetID,
		"ip", ip,
		"path", c.Path(),
		"method", c.Method(),
	}

	detailText := ""
	if len(details) > 0 {
		detailText = strings.Join(details, " ")
		attrs = append(attrs, "details", detailText)
	}

	slog.Info("audit", attrs...)

	// Persist to SQLite if a store is available.
	if s := getStore(); s != nil {
		detail, _ := json.Marshal(map[string]string{
			"target_type": targetType,
			"target_id":   targetID,
			"ip":          ip,
			"path":        c.Path(),
			"method":      c.Method(),
			"details":     detailText,
		})
		if err := s.InsertAuditLog(context.Background(), userID.String(), action, string(detail)); err != nil {
			slog.Error("audit: failed to persist audit entry", "error", err, "action", action)
		}
	}
}
