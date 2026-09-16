package store

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
)

// columnMigrations run against existing databases: ALTER TABLE ADD COLUMN,
// index creation, and small data backfills that predate the file-based
// migration runner in pkg/store/migrations. Order matters — entries are
// applied by position (version = index+1) — so do not reorder or remove
// existing entries. New schema changes should be added as numbered .sql
// files under pkg/store/migrations/ instead of appending here.
var columnMigrations = []string{
	"ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'viewer'",
	"ALTER TABLE users ADD COLUMN slack_id TEXT",
	"ALTER TABLE feature_requests ADD COLUMN closed_by_user INTEGER DEFAULT 0",
	// #6284: UpdateFeatureRequestLatestComment writes to this column
	// but it was never added to CREATE TABLE or migrations.
	"ALTER TABLE feature_requests ADD COLUMN latest_comment TEXT",
	// #6949: ActionURL was declared in the Notification model but never
	// persisted — the column, INSERT, and SELECT all omitted it.
	"ALTER TABLE notifications ADD COLUMN action_url TEXT NOT NULL DEFAULT ''",
	// Multi-type GPU reservations. gpu_types is a JSON-encoded
	// []string of acceptable GPU types. The legacy gpu_type column is
	// still populated (mirrors gpu_types[0]) so pre-migration clients
	// continue to read meaningful values, and pre-migration rows are
	// transparently promoted to a one-element list on read.
	"ALTER TABLE gpu_reservations ADD COLUMN gpu_types TEXT NOT NULL DEFAULT ''",
	// target_repo was declared in the FeatureRequest model but never
	// persisted — the column, INSERT, and SELECT all omitted it, causing
	// webhook/close/update operations to route docs issues to the wrong repo.
	"ALTER TABLE feature_requests ADD COLUMN target_repo TEXT NOT NULL DEFAULT 'console'",
	// Ensure stellar notification dedupe metadata exists for watcher/scheduler
	// generated feed events in older databases.
	"ALTER TABLE stellar_notifications ADD COLUMN dedupe_key TEXT NOT NULL DEFAULT ''",
	"CREATE UNIQUE INDEX IF NOT EXISTS idx_stellar_notifications_user_dedupe ON stellar_notifications(user_id, dedupe_key)",
	"ALTER TABLE stellar_notifications ADD COLUMN status TEXT NOT NULL DEFAULT ''",
	"ALTER TABLE stellar_notifications ADD COLUMN read_at DATETIME",
	"ALTER TABLE stellar_notifications ADD COLUMN batch_timestamp DATETIME",
	// SQLite does not allow non-constant DEFAULT (like CURRENT_TIMESTAMP) in ALTER TABLE ADD COLUMN.
	// Split into ADD COLUMN + UPDATE to achieve the same result.
	"ALTER TABLE stellar_notifications ADD COLUMN updated_at DATETIME NOT NULL DEFAULT '1970-01-01 00:00:00'",
	"UPDATE stellar_notifications SET updated_at = CURRENT_TIMESTAMP WHERE updated_at = '1970-01-01 00:00:00'",
	"ALTER TABLE stellar_notifications ADD COLUMN root_cause TEXT NOT NULL DEFAULT ''",
	"ALTER TABLE stellar_notifications ADD COLUMN affected_resource TEXT NOT NULL DEFAULT ''",
	"ALTER TABLE stellar_notifications ADD COLUMN error_message TEXT NOT NULL DEFAULT ''",
	"ALTER TABLE stellar_notifications ADD COLUMN resolution_note TEXT NOT NULL DEFAULT ''",
	"ALTER TABLE stellar_notifications ADD COLUMN dismissal_reason TEXT NOT NULL DEFAULT ''",
	"ALTER TABLE stellar_notifications ADD COLUMN investigation_summary TEXT NOT NULL DEFAULT ''",
	"ALTER TABLE stellar_notifications ADD COLUMN auto_resolution_status TEXT NOT NULL DEFAULT ''",
	"ALTER TABLE stellar_notifications ADD COLUMN auto_resolution_detail TEXT NOT NULL DEFAULT ''",
	"CREATE INDEX IF NOT EXISTS idx_stellar_notif_read ON stellar_notifications(read, created_at DESC)",
	"CREATE INDEX IF NOT EXISTS idx_stellar_notifications_type_batch ON stellar_notifications(type, batch_timestamp DESC)",

	"ALTER TABLE stellar_memory_entries ADD COLUMN embedding BLOB",
	"ALTER TABLE stellar_memory_entries ADD COLUMN importance INTEGER NOT NULL DEFAULT 5",
	"ALTER TABLE stellar_memory_entries ADD COLUMN incident_id TEXT",
	"CREATE INDEX IF NOT EXISTS idx_stellar_mem_cluster ON stellar_memory_entries(cluster, created_at DESC)",
	"CREATE INDEX IF NOT EXISTS idx_stellar_mem_expires ON stellar_memory_entries(expires_at)",

	"ALTER TABLE stellar_actions ADD COLUMN approved_by TEXT NOT NULL DEFAULT ''",
	"ALTER TABLE stellar_actions ADD COLUMN approved_at DATETIME",
	"ALTER TABLE stellar_actions ADD COLUMN rejected_by TEXT NOT NULL DEFAULT ''",
	"ALTER TABLE stellar_actions ADD COLUMN rejected_at DATETIME",
	"ALTER TABLE stellar_actions ADD COLUMN rejection_reason TEXT NOT NULL DEFAULT ''",
	"ALTER TABLE stellar_actions ADD COLUMN started_at DATETIME",
	"ALTER TABLE stellar_actions ADD COLUMN completed_at DATETIME",
	"ALTER TABLE stellar_actions ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0",
	"ALTER TABLE stellar_actions ADD COLUMN max_retries INTEGER NOT NULL DEFAULT 0",
	"ALTER TABLE stellar_actions ADD COLUMN audit_log TEXT NOT NULL DEFAULT '[]'",
	"ALTER TABLE stellar_actions ADD COLUMN idempotency_key TEXT",
	"ALTER TABLE stellar_actions ADD COLUMN confirm_token TEXT",
	// SQLite does not allow non-constant DEFAULT (like CURRENT_TIMESTAMP) in ALTER TABLE ADD COLUMN.
	// Split into ADD COLUMN + UPDATE to achieve the same result.
	"ALTER TABLE stellar_actions ADD COLUMN updated_at DATETIME NOT NULL DEFAULT '1970-01-01 00:00:00'",
	"UPDATE stellar_actions SET updated_at = CURRENT_TIMESTAMP WHERE updated_at = '1970-01-01 00:00:00'",
	"CREATE UNIQUE INDEX IF NOT EXISTS idx_stellar_actions_idempotency ON stellar_actions(idempotency_key) WHERE idempotency_key IS NOT NULL",
	"CREATE INDEX IF NOT EXISTS idx_stellar_actions_due ON stellar_actions(status, scheduled_at)",

	"ALTER TABLE stellar_executions ADD COLUMN provider TEXT NOT NULL DEFAULT ''",
	"ALTER TABLE stellar_executions ADD COLUMN model TEXT NOT NULL DEFAULT ''",

	`CREATE TABLE IF NOT EXISTS stellar_provider_configs (
		id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
		user_id      TEXT NOT NULL,
		provider     TEXT NOT NULL,
		display_name TEXT NOT NULL DEFAULT '',
		base_url     TEXT NOT NULL DEFAULT '',
		model        TEXT NOT NULL DEFAULT '',
		api_key_enc  BLOB NOT NULL DEFAULT '',
		is_default   INTEGER NOT NULL DEFAULT 0,
		is_active    INTEGER NOT NULL DEFAULT 1,
		last_tested  TEXT,
		last_latency INTEGER DEFAULT 0,
		created_at   TEXT NOT NULL DEFAULT (datetime('now')),
		updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
	)`,
	"CREATE UNIQUE INDEX IF NOT EXISTS idx_stellar_provider_user_default ON stellar_provider_configs(user_id) WHERE is_default = 1",
	"CREATE INDEX IF NOT EXISTS idx_stellar_provider_user ON stellar_provider_configs(user_id, is_active)",

	`CREATE TABLE IF NOT EXISTS stellar_audit_log (
		id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
		ts          TEXT NOT NULL DEFAULT (datetime('now')),
		user_id     TEXT NOT NULL,
		action      TEXT NOT NULL,
		entity_type TEXT NOT NULL,
		entity_id   TEXT NOT NULL,
		cluster     TEXT NOT NULL DEFAULT '',
		detail      TEXT NOT NULL DEFAULT '{}'
	)`,
	"CREATE INDEX IF NOT EXISTS idx_audit_user_ts ON stellar_audit_log(user_id, ts DESC)",
	"CREATE INDEX IF NOT EXISTS idx_audit_entity ON stellar_audit_log(entity_type, entity_id)",
	`CREATE TABLE IF NOT EXISTS stellar_tasks (
		id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
		session_id   TEXT NOT NULL,
		user_id      TEXT NOT NULL,
		cluster      TEXT NOT NULL DEFAULT '',
		title        TEXT NOT NULL,
		description  TEXT NOT NULL DEFAULT '',
		status       TEXT NOT NULL DEFAULT 'open',
		priority     INTEGER NOT NULL DEFAULT 5,
		source       TEXT NOT NULL DEFAULT 'user',
		parent_id    TEXT,
		due_at       DATETIME,
		completed_at DATETIME,
		context_json TEXT NOT NULL DEFAULT '{}',
		created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	)`,
	"CREATE INDEX IF NOT EXISTS idx_stellar_tasks_user_status ON stellar_tasks(user_id, status, priority)",
	`CREATE TABLE IF NOT EXISTS stellar_observations (
		id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
		cluster       TEXT NOT NULL DEFAULT '',
		kind          TEXT NOT NULL,
		summary       TEXT NOT NULL,
		detail        TEXT NOT NULL DEFAULT '',
		ref_type      TEXT NOT NULL DEFAULT '',
		ref_id        TEXT NOT NULL DEFAULT '',
		shown_to_user INTEGER NOT NULL DEFAULT 0,
		created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	)`,
	"CREATE INDEX IF NOT EXISTS idx_stellar_obs_cluster_ts ON stellar_observations(cluster, created_at DESC)",
	`CREATE TABLE IF NOT EXISTS stellar_watches (
		id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
		user_id       TEXT NOT NULL,
		cluster       TEXT NOT NULL,
		namespace     TEXT NOT NULL DEFAULT '',
		resource_kind TEXT NOT NULL,
		resource_name TEXT NOT NULL,
		reason        TEXT NOT NULL DEFAULT '',
		status        TEXT NOT NULL DEFAULT 'active',
		last_event_at DATETIME,
		last_checked  DATETIME,
		last_update   TEXT NOT NULL DEFAULT '',
		resolved_at   DATETIME,
		created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	)`,
	"CREATE INDEX IF NOT EXISTS idx_stellar_watches_active ON stellar_watches(user_id, status, cluster) WHERE status = 'active'",

	// Sprint 5: stellar_user_sessions for catch-up summary (away detection)
	`CREATE TABLE IF NOT EXISTS stellar_user_sessions (
		user_id         TEXT PRIMARY KEY,
		last_seen_at    TEXT NOT NULL DEFAULT (datetime('now')),
		last_digest_at  TEXT
	)`,

	// Sprint 5: reasoning column on stellar_observations for trust layer
	"ALTER TABLE stellar_observations ADD COLUMN reasoning TEXT NOT NULL DEFAULT ''",

	// Sprint 5: snooze support — last_checked already exists on stellar_watches

	// Issue #14198: auto-resolve inactive watches after event silence.
	"ALTER TABLE stellar_watches ADD COLUMN last_event_at DATETIME",
	"UPDATE stellar_watches SET last_event_at = COALESCE(last_event_at, updated_at, created_at) WHERE last_event_at IS NULL",

	// Stellar v2: solve sessions (headless solve loop). Each row tracks one
	// end-to-end attempt by Stellar to resolve an event without user input.
	`CREATE TABLE IF NOT EXISTS stellar_solves (
		id            TEXT PRIMARY KEY,
		event_id      TEXT NOT NULL,
		user_id       TEXT NOT NULL,
		cluster       TEXT NOT NULL DEFAULT '',
		namespace     TEXT NOT NULL DEFAULT '',
		workload      TEXT NOT NULL DEFAULT '',
		status        TEXT NOT NULL DEFAULT 'running',
		actions_taken INTEGER NOT NULL DEFAULT 0,
		limit_hit     TEXT NOT NULL DEFAULT '',
		summary       TEXT NOT NULL DEFAULT '',
		error         TEXT NOT NULL DEFAULT '',
		started_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		ended_at      DATETIME
	)`,
	"CREATE INDEX IF NOT EXISTS idx_stellar_solves_event ON stellar_solves(event_id, started_at DESC)",
	"CREATE INDEX IF NOT EXISTS idx_stellar_solves_user_status ON stellar_solves(user_id, status, started_at DESC)",
	"CREATE INDEX IF NOT EXISTS idx_stellar_solves_dedupe ON stellar_solves(cluster, namespace, workload, started_at DESC)",

	// Solve attempt → execution linkage + per-workload dedupe key for
	// attempt history surfacing on watch cards.
	"ALTER TABLE stellar_executions ADD COLUMN solve_id TEXT NOT NULL DEFAULT ''",
	"ALTER TABLE stellar_executions ADD COLUMN dedupe_key TEXT NOT NULL DEFAULT ''",
	"CREATE INDEX IF NOT EXISTS idx_stellar_executions_solve ON stellar_executions(solve_id)",
	"CREATE INDEX IF NOT EXISTS idx_stellar_executions_dedupe ON stellar_executions(dedupe_key, started_at DESC)",

	// Stale approval re-evaluation: bumping a pending approval to the top
	// when its event has been re-triggered.
	"ALTER TABLE stellar_actions ADD COLUMN bumped_at DATETIME",
	"CREATE INDEX IF NOT EXISTS idx_stellar_actions_bumped ON stellar_actions(status, bumped_at DESC)",

	// Partial success outcome classification (#14970): track next recheck
	// time for resolved_monitored solves.
	"ALTER TABLE stellar_solves ADD COLUMN next_recheck_at DATETIME",
	"CREATE INDEX IF NOT EXISTS idx_stellar_solves_recheck ON stellar_solves(status, next_recheck_at)",

	// Stellar activity log: Stellar's first-person record of what it did and
	// why. Distinct from stellar_audit_log (operator-facing legal trail) and
	// stellar_notifications (the inbox). This is the "junior engineer's
	// commit log" the operator scans to verify Stellar is being reasonable.
	`CREATE TABLE IF NOT EXISTS stellar_activity (
		id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
		user_id     TEXT NOT NULL DEFAULT 'system',
		ts          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		kind        TEXT NOT NULL,
		event_id    TEXT NOT NULL DEFAULT '',
		solve_id    TEXT NOT NULL DEFAULT '',
		cluster     TEXT NOT NULL DEFAULT '',
		namespace   TEXT NOT NULL DEFAULT '',
		workload    TEXT NOT NULL DEFAULT '',
		title       TEXT NOT NULL,
		detail      TEXT NOT NULL DEFAULT '',
		severity    TEXT NOT NULL DEFAULT 'info'
	)`,
	"CREATE INDEX IF NOT EXISTS idx_stellar_activity_ts ON stellar_activity(ts DESC)",
	"CREATE INDEX IF NOT EXISTS idx_stellar_activity_user_ts ON stellar_activity(user_id, ts DESC)",
	// KB query gap tracker — records zero-result browse paths so maintainers
	// know which KB content is missing from the knowledge base.
	`CREATE TABLE IF NOT EXISTS kb_query_gaps (
		path      TEXT PRIMARY KEY,
		hit_count INTEGER NOT NULL DEFAULT 0,
		last_seen DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	)`,

	// #16814: Per-user observation visibility tracking (CWE-200).
	`CREATE TABLE IF NOT EXISTS stellar_observation_seen (
		user_id        TEXT NOT NULL,
		observation_id TEXT NOT NULL,
		seen_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (user_id, observation_id)
	)`,
	"CREATE INDEX IF NOT EXISTS idx_stellar_obs_seen_user ON stellar_observation_seen(user_id, seen_at DESC)",

	// #17593: Encrypt OAuth client_secret at rest using AES-256-GCM.
	// Store encrypted data in separate columns; the old plaintext column
	// is kept for backward compatibility during migration but will be
	// cleared after successful encryption.
	"ALTER TABLE oauth_credentials ADD COLUMN client_secret_ciphertext TEXT",
	"ALTER TABLE oauth_credentials ADD COLUMN client_secret_iv TEXT",
}

// applyColumnMigrations executes columnMigrations in order. It tolerates
// migrations that were already applied (e.g. "duplicate column name") and
// repairs data that would otherwise block a new UNIQUE INDEX before retrying.
func (s *SQLiteStore) applyColumnMigrations(ctx context.Context) error {
	for i, migration := range columnMigrations {
		version := i + 1
		migrationID := migrationLogID(version, migration)
		if _, err := s.db.ExecContext(ctx, migration); err != nil {
			// #6291 / #6614: distinguish "column already exists"
			// (expected, idempotent) from other errors (DB locked,
			// read-only, corrupt, typo in the DDL). The former is how
			// we get idempotent migrations; the latter used to only
			// log a warning and let the server keep booting against a
			// partially-migrated schema, which would silently 500 on
			// any query that touched the missing column. Real errors
			// now surface and abort startup so an operator can fix
			// the underlying problem before serving traffic.
			if strings.Contains(err.Error(), "duplicate column name") {
				slog.Debug("[SQLite] migration already applied",
					"migration_id", migrationID, "version", version)
				continue
			}
			// #14974: UNIQUE INDEX creation can fail when existing rows
			// have duplicate (user_id, dedupe_key) pairs after adding the
			// dedupe_key column with DEFAULT ''. Fix the data and retry.
			if strings.Contains(migration, "CREATE UNIQUE INDEX") &&
				strings.Contains(err.Error(), "UNIQUE constraint failed") {
				slog.Warn("[SQLite] deduplicating data before retrying unique index",
					"migration_id", migrationID, "version", version)
				if fixErr := s.deduplicateBeforeUniqueIndex(ctx, migrationID, migration); fixErr != nil {
					slog.Error("[SQLite] deduplication failed", "migration_id", migrationID, "error", fixErr)
					return fmt.Errorf("migration %s failed after dedup: %w", migrationID, err)
				}
				if _, retryErr := s.db.ExecContext(ctx, migration); retryErr != nil {
					slog.Error("[SQLite] migration still fails after dedup",
						"migration_id", migrationID, "error", retryErr)
					return fmt.Errorf("migration %s failed: %w", migrationID, retryErr)
				}
				slog.Info("[SQLite] migration succeeded after deduplication", "migration_id", migrationID, "version", version)
				continue
			}
			slog.Error("[SQLite] migration failed — refusing to start",
				"migration_id", migrationID, "version", version, "error", err)
			return fmt.Errorf("migration %s failed: %w", migrationID, err)
		}
		slog.Debug("[SQLite] migration applied", "migration_id", migrationID, "version", version)
	}
	return nil
}
