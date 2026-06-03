package store

import (
	"context"
	"crypto/sha256"
	"fmt"
	"log/slog"
	"strings"
)

func migrationLogID(version int, migration string) string {
	sum := sha256.Sum256([]byte(migration))
	return fmt.Sprintf("v%d-%x", version, sum[:4])
}

// migrate creates the database schema
func (s *SQLiteStore) migrate() error {
	ctx := context.Background()
	schema := `
	CREATE TABLE IF NOT EXISTS users (
		id TEXT PRIMARY KEY,
		github_id TEXT UNIQUE NOT NULL,
		github_login TEXT NOT NULL,
		email TEXT,
		slack_id TEXT,
		avatar_url TEXT,
		role TEXT DEFAULT 'viewer',
		onboarded INTEGER DEFAULT 0,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		last_login DATETIME
	);

	CREATE TABLE IF NOT EXISTS onboarding_responses (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		question_key TEXT NOT NULL,
		answer TEXT NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		UNIQUE(user_id, question_key)
	);

	CREATE TABLE IF NOT EXISTS dashboards (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		name TEXT NOT NULL,
		layout TEXT,
		is_default INTEGER DEFAULT 0,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME
	);

	CREATE TABLE IF NOT EXISTS cards (
		id TEXT PRIMARY KEY,
		dashboard_id TEXT NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
		card_type TEXT NOT NULL,
		config TEXT,
		position TEXT NOT NULL,
		last_summary TEXT,
		last_focus DATETIME,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS card_history (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		original_card_id TEXT,
		card_type TEXT NOT NULL,
		config TEXT,
		swapped_out_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		reason TEXT
	);

	CREATE TABLE IF NOT EXISTS user_events (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		event_type TEXT NOT NULL,
		card_id TEXT,
		metadata TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS pending_swaps (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
		new_card_type TEXT NOT NULL,
		new_card_config TEXT,
		reason TEXT,
		swap_at DATETIME NOT NULL,
		status TEXT DEFAULT 'pending',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE INDEX IF NOT EXISTS idx_users_github_login ON users(github_login COLLATE NOCASE);
	CREATE INDEX IF NOT EXISTS idx_dashboards_user ON dashboards(user_id);
	CREATE INDEX IF NOT EXISTS idx_cards_dashboard ON cards(dashboard_id);
	CREATE INDEX IF NOT EXISTS idx_events_user_time ON user_events(user_id, created_at);
	CREATE INDEX IF NOT EXISTS idx_card_history_user ON card_history(user_id, swapped_out_at DESC);
	CREATE INDEX IF NOT EXISTS idx_pending_swaps_due ON pending_swaps(status, swap_at);
	CREATE INDEX IF NOT EXISTS idx_pending_swaps_user ON pending_swaps(user_id);

	-- Feature requests from users (bugs/features submitted via console)
	CREATE TABLE IF NOT EXISTS feature_requests (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		title TEXT NOT NULL,
		description TEXT NOT NULL,
		request_type TEXT NOT NULL,
		target_repo TEXT NOT NULL DEFAULT 'console',
		github_issue_number INTEGER,
		-- NOTE: github_issue_url was removed (#7735) — it was never
		-- populated or read by any INSERT/SELECT/UPDATE query.  The
		-- handler's QueueItem.GitHubIssueURL is populated from the
		-- live GitHub API, not from this table.
		status TEXT DEFAULT 'submitted',
		pr_number INTEGER,
		pr_url TEXT,
		copilot_session_url TEXT,
		netlify_preview_url TEXT,
		latest_comment TEXT,
		closed_by_user INTEGER DEFAULT 0,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME
	);

	-- PR feedback from users (thumbs up/down on AI-generated fixes)
	CREATE TABLE IF NOT EXISTS pr_feedback (
		id TEXT PRIMARY KEY,
		feature_request_id TEXT NOT NULL REFERENCES feature_requests(id) ON DELETE CASCADE,
		user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		feedback_type TEXT NOT NULL,
		comment TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	-- User notifications for feature request status updates
	CREATE TABLE IF NOT EXISTS notifications (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		feature_request_id TEXT REFERENCES feature_requests(id) ON DELETE CASCADE,
		notification_type TEXT NOT NULL,
		title TEXT NOT NULL,
		message TEXT NOT NULL,
		read INTEGER DEFAULT 0,
		action_url TEXT NOT NULL DEFAULT '',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE INDEX IF NOT EXISTS idx_feature_requests_user ON feature_requests(user_id);
	CREATE INDEX IF NOT EXISTS idx_feature_requests_status ON feature_requests(status);
	CREATE INDEX IF NOT EXISTS idx_feature_requests_issue ON feature_requests(github_issue_number);
	CREATE INDEX IF NOT EXISTS idx_feature_requests_pr ON feature_requests(pr_number);
	CREATE INDEX IF NOT EXISTS idx_pr_feedback_request ON pr_feedback(feature_request_id);
	CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read);

	-- GPU reservations
	CREATE TABLE IF NOT EXISTS gpu_reservations (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		user_name TEXT NOT NULL,
		title TEXT NOT NULL,
		description TEXT DEFAULT '',
		cluster TEXT NOT NULL,
		namespace TEXT NOT NULL,
		gpu_count INTEGER NOT NULL,
		gpu_type TEXT DEFAULT '',
		-- Multi-type: JSON-encoded []string of acceptable GPU types. Empty
		-- string means "no preference" (any type); a one-element list is
		-- equivalent to the legacy single-type behaviour. The legacy
		-- gpu_type column is kept alongside and mirrors gpu_types[0].
		gpu_types TEXT NOT NULL DEFAULT '',
		start_date TEXT NOT NULL,
		duration_hours INTEGER DEFAULT 24,
		notes TEXT DEFAULT '',
		status TEXT DEFAULT 'active',
		quota_name TEXT DEFAULT '',
		quota_enforced INTEGER DEFAULT 0,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME
	);
	CREATE INDEX IF NOT EXISTS idx_gpu_reservations_user ON gpu_reservations(user_id);
	CREATE INDEX IF NOT EXISTS idx_gpu_reservations_status ON gpu_reservations(status);

	-- GPU utilization snapshots (hourly measurements per reservation)
	CREATE TABLE IF NOT EXISTS gpu_utilization_snapshots (
		id TEXT PRIMARY KEY,
		reservation_id TEXT NOT NULL,
		timestamp DATETIME NOT NULL,
		gpu_utilization_pct REAL NOT NULL,
		memory_utilization_pct REAL NOT NULL,
		active_gpu_count INTEGER NOT NULL,
		total_gpu_count INTEGER NOT NULL,
		FOREIGN KEY (reservation_id) REFERENCES gpu_reservations(id) ON DELETE CASCADE
	);
	CREATE INDEX IF NOT EXISTS idx_utilization_reservation ON gpu_utilization_snapshots(reservation_id, timestamp);

	-- Revoked JWT tokens (persisted across server restarts)
	CREATE TABLE IF NOT EXISTS revoked_tokens (
		jti TEXT PRIMARY KEY,
		expires_at DATETIME NOT NULL
	);
	CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expires ON revoked_tokens(expires_at);

	-- User rewards persistence (issue #6011): coin/point/level/bonus balances
	-- survive browser cache clears, private windows and device switches. The
	-- canonical store is server-side; the frontend treats localStorage as a
	-- loading-bridge cache only.
	CREATE TABLE IF NOT EXISTS user_rewards (
		user_id TEXT PRIMARY KEY,
		coins INTEGER NOT NULL DEFAULT 0,
		points INTEGER NOT NULL DEFAULT 0,
		level INTEGER NOT NULL DEFAULT 1,
		bonus_points INTEGER NOT NULL DEFAULT 0,
		last_daily_bonus_at DATETIME,
		updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	);
	CREATE INDEX IF NOT EXISTS idx_user_rewards_updated ON user_rewards(updated_at);

	-- User token-usage persistence (follow-up to issue #6011, folds the
	-- #6020 token-usage state into the same PR). Mirrors the rewards table
	-- layout: the server is authoritative, localStorage is a fast cache
	-- only. tokens_by_category holds the per-category breakdown as JSON so
	-- new categories do not require a schema migration. last_agent_session
	-- is the most recent kc-agent session marker the server has observed
	-- for this user — a change signals an agent restart and the server
	-- rebases totals instead of accumulating the stale delta.
	CREATE TABLE IF NOT EXISTS user_token_usage (
		user_id TEXT PRIMARY KEY,
		total_tokens INTEGER NOT NULL DEFAULT 0,
		tokens_by_category TEXT NOT NULL DEFAULT '{}',
		last_agent_session_id TEXT NOT NULL DEFAULT '',
		updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	);
	CREATE INDEX IF NOT EXISTS idx_user_token_usage_updated ON user_token_usage(updated_at);

	-- OAuth state tokens (persisted so in-flight OAuth flows survive a
	-- backend restart between /auth/login and /auth/callback — see issue #6028).
	-- Time columns use DATETIME to match the rest of the schema
	-- (revoked_tokens, user_rewards, etc.) and avoid driver-quirk surprises.
	CREATE TABLE IF NOT EXISTS oauth_states (
		state TEXT PRIMARY KEY,
		created_at DATETIME NOT NULL,
		expires_at DATETIME NOT NULL
	);
	CREATE INDEX IF NOT EXISTS idx_oauth_states_expires_at ON oauth_states(expires_at);

	CREATE TABLE IF NOT EXISTS cluster_groups (
		name TEXT PRIMARY KEY,
		data BLOB NOT NULL,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	-- Audit log for security-sensitive operations (#8670 Phase 3).
	-- Entries are append-only; the detail column holds a JSON blob with
	-- action-specific context (target type, target ID, IP, path, etc.).
	CREATE TABLE IF NOT EXISTS audit_log (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		timestamp TEXT NOT NULL,
		user_id TEXT NOT NULL,
		action TEXT NOT NULL,
		detail TEXT
	);
	CREATE INDEX IF NOT EXISTS idx_audit_log_user_time ON audit_log(user_id, timestamp);
	CREATE INDEX IF NOT EXISTS idx_users_github_login ON users(github_login COLLATE NOCASE);

	-- Cross-cluster event journal (#9967 Phase 1)
	CREATE TABLE IF NOT EXISTS cluster_events (
		id TEXT PRIMARY KEY,
		cluster_name TEXT NOT NULL,
		namespace TEXT NOT NULL DEFAULT '',
		event_type TEXT NOT NULL,
		reason TEXT NOT NULL,
		message TEXT,
		involved_object_kind TEXT,
		involved_object_name TEXT,
		event_uid TEXT NOT NULL UNIQUE,
		event_count INTEGER DEFAULT 1,
		first_seen DATETIME NOT NULL,
		last_seen DATETIME NOT NULL,
		recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	CREATE INDEX IF NOT EXISTS idx_ce_cluster_time ON cluster_events(cluster_name, last_seen DESC);
	CREATE INDEX IF NOT EXISTS idx_ce_uid ON cluster_events(event_uid);

	-- Stellar assistant user preferences. Keeps assistant behavior sticky
	-- across reconnects/restarts.
	CREATE TABLE IF NOT EXISTS stellar_preferences (
		user_id TEXT PRIMARY KEY,
		default_provider TEXT NOT NULL DEFAULT 'auto',
		execution_mode TEXT NOT NULL DEFAULT 'hybrid',
		timezone TEXT NOT NULL DEFAULT 'UTC',
		proactive_mode INTEGER NOT NULL DEFAULT 1,
		pinned_clusters TEXT NOT NULL DEFAULT '[]',
		updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	);
	CREATE INDEX IF NOT EXISTS idx_stellar_preferences_updated ON stellar_preferences(updated_at);

	-- Stellar mission registry. Stores user-authored long-running/scheduled
	-- assistant tasks and their runtime metadata.
	CREATE TABLE IF NOT EXISTS stellar_missions (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL,
		name TEXT NOT NULL,
		goal TEXT NOT NULL,
		schedule TEXT NOT NULL DEFAULT '',
		trigger_type TEXT NOT NULL DEFAULT 'manual',
		provider_policy TEXT NOT NULL DEFAULT 'auto',
		memory_scope TEXT NOT NULL DEFAULT 'user',
		enabled INTEGER NOT NULL DEFAULT 1,
		tool_bindings TEXT NOT NULL DEFAULT '[]',
		last_run_at DATETIME,
		next_run_at DATETIME,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	);
	CREATE INDEX IF NOT EXISTS idx_stellar_missions_user ON stellar_missions(user_id, created_at DESC);
	CREATE INDEX IF NOT EXISTS idx_stellar_missions_next_run ON stellar_missions(enabled, next_run_at);

	-- Stellar mission execution history
	CREATE TABLE IF NOT EXISTS stellar_executions (
		id TEXT PRIMARY KEY,
		mission_id TEXT NOT NULL,
		user_id TEXT NOT NULL,
		trigger_type TEXT NOT NULL,
		trigger_data TEXT NOT NULL DEFAULT '{}',
		status TEXT NOT NULL DEFAULT 'running',
		raw_input TEXT,
		enriched_input TEXT,
		output TEXT,
		actions_taken TEXT NOT NULL DEFAULT '[]',
		tokens_input INTEGER NOT NULL DEFAULT 0,
		tokens_output INTEGER NOT NULL DEFAULT 0,
		duration_ms INTEGER NOT NULL DEFAULT 0,
		started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		completed_at DATETIME
	);
	CREATE INDEX IF NOT EXISTS idx_stellar_executions_user_started ON stellar_executions(user_id, started_at DESC);
	CREATE INDEX IF NOT EXISTS idx_stellar_executions_mission ON stellar_executions(mission_id, started_at DESC);

	-- Stellar long-term memory entries
	CREATE TABLE IF NOT EXISTS stellar_memory_entries (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL,
		cluster TEXT NOT NULL,
		namespace TEXT NOT NULL DEFAULT '',
		category TEXT NOT NULL,
		summary TEXT NOT NULL,
		raw_content TEXT NOT NULL DEFAULT '',
		tags TEXT NOT NULL DEFAULT '[]',
		mission_id TEXT NOT NULL DEFAULT '',
		execution_id TEXT NOT NULL DEFAULT '',
		expires_at DATETIME,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	);
	CREATE INDEX IF NOT EXISTS idx_stellar_memory_user_created ON stellar_memory_entries(user_id, created_at DESC);
	CREATE INDEX IF NOT EXISTS idx_stellar_memory_cluster_created ON stellar_memory_entries(user_id, cluster, created_at DESC);

	-- Stellar scheduled actions
	CREATE TABLE IF NOT EXISTS stellar_actions (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL,
		description TEXT NOT NULL,
		action_type TEXT NOT NULL,
		parameters TEXT NOT NULL DEFAULT '{}',
		cluster TEXT NOT NULL,
		namespace TEXT NOT NULL DEFAULT '',
		scheduled_at DATETIME,
		cron_expr TEXT NOT NULL DEFAULT '',
		status TEXT NOT NULL DEFAULT 'pending_approval',
		approved_by TEXT NOT NULL DEFAULT '',
		approved_at DATETIME,
		executed_at DATETIME,
		outcome TEXT NOT NULL DEFAULT '',
		reject_reason TEXT NOT NULL DEFAULT '',
		created_by TEXT NOT NULL,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	);
	CREATE INDEX IF NOT EXISTS idx_stellar_actions_user_created ON stellar_actions(user_id, created_at DESC);
	CREATE INDEX IF NOT EXISTS idx_stellar_actions_status_due ON stellar_actions(status, scheduled_at);

	-- Stellar notification feed for persistent side panel
	CREATE TABLE IF NOT EXISTS stellar_notifications (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL,
		type TEXT NOT NULL,
		severity TEXT NOT NULL DEFAULT 'info',
		title TEXT NOT NULL,
		body TEXT NOT NULL,
		cluster TEXT NOT NULL DEFAULT '',
		namespace TEXT NOT NULL DEFAULT '',
		mission_id TEXT NOT NULL DEFAULT '',
		action_id TEXT NOT NULL DEFAULT '',
		dedupe_key TEXT NOT NULL DEFAULT '',
		status TEXT NOT NULL DEFAULT '',
		read INTEGER NOT NULL DEFAULT 0,
		read_at DATETIME,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		batch_timestamp DATETIME,
		updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		root_cause TEXT NOT NULL DEFAULT '',
		affected_resource TEXT NOT NULL DEFAULT '',
		error_message TEXT NOT NULL DEFAULT '',
		resolution_note TEXT NOT NULL DEFAULT '',
		dismissal_reason TEXT NOT NULL DEFAULT '',
		investigation_summary TEXT NOT NULL DEFAULT '',
		auto_resolution_status TEXT NOT NULL DEFAULT '',
		auto_resolution_detail TEXT NOT NULL DEFAULT ''
	);
	CREATE INDEX IF NOT EXISTS idx_stellar_notifications_user_created ON stellar_notifications(user_id, created_at DESC);
	CREATE INDEX IF NOT EXISTS idx_stellar_notifications_unread ON stellar_notifications(user_id, read, created_at DESC);
	CREATE UNIQUE INDEX IF NOT EXISTS idx_stellar_notifications_user_dedupe ON stellar_notifications(user_id, dedupe_key);

	-- Durable stellar task graph.
	CREATE TABLE IF NOT EXISTS stellar_tasks (
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
	);
	CREATE INDEX IF NOT EXISTS idx_stellar_tasks_user_status ON stellar_tasks(user_id, status, priority);

	-- Stellar observer journal.
	CREATE TABLE IF NOT EXISTS stellar_observations (
		id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
		cluster       TEXT NOT NULL DEFAULT '',
		kind          TEXT NOT NULL,
		summary       TEXT NOT NULL,
		detail        TEXT NOT NULL DEFAULT '',
		ref_type      TEXT NOT NULL DEFAULT '',
		ref_id        TEXT NOT NULL DEFAULT '',
		shown_to_user INTEGER NOT NULL DEFAULT 0,
		created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	);
	CREATE INDEX IF NOT EXISTS idx_stellar_obs_cluster_ts ON stellar_observations(cluster, created_at DESC);

	-- OAuth credentials persisted by the GitHub App Manifest one-click flow.
	-- Single-row table (CHECK constraint) so only one app registration exists.
	CREATE TABLE IF NOT EXISTS oauth_credentials (
		id INTEGER PRIMARY KEY CHECK (id = 1),
		client_id TEXT NOT NULL,
		client_secret TEXT NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	`
	_, err := s.db.ExecContext(ctx, schema)
	if err != nil {
		return err
	}

	// Run column migrations for existing databases
	migrations := []string{
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
	}
	for i, migration := range migrations {
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
	if err := s.ensureStellarMemoryFTS(ctx); err != nil {
		return fmt.Errorf("ensure stellar memory fts: %w", err)
	}
	if err := s.migrateKBGapsSchema(ctx); err != nil {
		return fmt.Errorf("migrate kb_query_gaps schema: %w", err)
	}

	slog.Info("[SQLite] schema migrations complete", "total_migrations", len(migrations))

	// Data migration: "pending" status is eliminated — reservations are now
	// provisioned synchronously and go straight to "active". Flip any
	// legacy pending rows so the UI no longer shows a dead state.
	if res, err := s.db.ExecContext(ctx,
		`UPDATE gpu_reservations SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE status = 'pending'`); err != nil {
		return fmt.Errorf("migrate pending gpu reservations to active: %w", err)
	} else if n, _ := res.RowsAffected(); n > 0 {
		slog.Info("[SQLite] migrated pending reservations to active", "count", n)
	}

	return nil
}

func (s *SQLiteStore) ensureStellarMemoryFTS(ctx context.Context) error {
	statements := []string{
		`CREATE VIRTUAL TABLE IF NOT EXISTS stellar_memory_fts USING fts5(
			summary, raw_content, tags,
			content='stellar_memory_entries',
			content_rowid='rowid'
		)`,
		`CREATE TRIGGER IF NOT EXISTS stellar_memory_entries_ai AFTER INSERT ON stellar_memory_entries BEGIN
			INSERT INTO stellar_memory_fts(rowid, summary, raw_content, tags)
			VALUES (new.rowid, new.summary, new.raw_content, new.tags);
		END`,
		`CREATE TRIGGER IF NOT EXISTS stellar_memory_entries_ad AFTER DELETE ON stellar_memory_entries BEGIN
			INSERT INTO stellar_memory_fts(stellar_memory_fts, rowid, summary, raw_content, tags)
			VALUES ('delete', old.rowid, old.summary, old.raw_content, old.tags);
		END`,
		`CREATE TRIGGER IF NOT EXISTS stellar_memory_entries_au AFTER UPDATE ON stellar_memory_entries BEGIN
			INSERT INTO stellar_memory_fts(stellar_memory_fts, rowid, summary, raw_content, tags)
			VALUES ('delete', old.rowid, old.summary, old.raw_content, old.tags);
			INSERT INTO stellar_memory_fts(rowid, summary, raw_content, tags)
			VALUES (new.rowid, new.summary, new.raw_content, new.tags);
		END`,
	}
	for _, statement := range statements {
		if _, err := s.db.ExecContext(ctx, statement); err != nil {
			return err
		}
	}

	var entryCount int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM stellar_memory_entries`).Scan(&entryCount); err != nil {
		return err
	}
	var ftsCount int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM stellar_memory_fts`).Scan(&ftsCount); err != nil {
		return err
	}
	if entryCount != ftsCount {
		if _, err := s.db.ExecContext(ctx, `INSERT INTO stellar_memory_fts(stellar_memory_fts) VALUES('rebuild')`); err != nil {
			return err
		}
	}
	return nil
}

// deduplicateBeforeUniqueIndex fixes duplicate rows that prevent a UNIQUE INDEX
// from being created. For the stellar_notifications dedupe_key scenario, it
// assigns UUID-based dedupe_keys to rows with empty ” values that would
// otherwise collide on (user_id, dedupe_key). (#14974)
func (s *SQLiteStore) deduplicateBeforeUniqueIndex(ctx context.Context, migrationID, migration string) error {
	if strings.Contains(migration, "idx_stellar_notifications_user_dedupe") {
		// Assign unique dedupe_key to all rows with empty dedupe_key.
		// The ID column is already unique, so use it as the dedupe_key fallback.
		res, err := s.db.ExecContext(ctx,
			`UPDATE stellar_notifications SET dedupe_key = id WHERE dedupe_key = ''`)
		if err != nil {
			return fmt.Errorf("fix empty dedupe_keys: %w", err)
		}
		if n, _ := res.RowsAffected(); n > 0 {
			slog.Info("[SQLite] assigned dedupe_key to rows with empty value", "count", n)
		}
		return nil
	}
	// Generic case: if other unique indexes fail, log and return error.
	return fmt.Errorf("no deduplication strategy for %s", migrationID)
}
