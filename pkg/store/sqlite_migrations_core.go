package store

import "context"

// initialSchema is the base SQLite schema applied to a fresh database. It is
// intentionally idempotent (CREATE TABLE/INDEX IF NOT EXISTS) so it is safe
// to run on every startup. Changes for existing databases are layered on top
// via columnMigrations (sqlite_migrations_columns.go) or, for newer schema
// changes, the file-based runner in pkg/store/migrations.
const initialSchema = `
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

	-- Team management for access control
	CREATE TABLE IF NOT EXISTS teams (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		description TEXT DEFAULT '',
		created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME
	);
	CREATE INDEX IF NOT EXISTS idx_teams_name ON teams(name COLLATE NOCASE);

	CREATE TABLE IF NOT EXISTS team_members (
		id TEXT PRIMARY KEY,
		team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
		user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		role TEXT NOT NULL DEFAULT 'member',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		UNIQUE(team_id, user_id)
	);
	CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id);
	CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);
`

// createInitialSchema creates the base tables/indexes if they do not already
// exist.
func (s *SQLiteStore) createInitialSchema(ctx context.Context) error {
	_, err := s.db.ExecContext(ctx, initialSchema)
	return err
}
