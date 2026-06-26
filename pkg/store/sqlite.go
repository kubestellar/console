package store

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	_ "modernc.org/sqlite" // registers the "sqlite" driver
)

// fkConnector wraps a sql.Driver so that every freshly-opened connection
// executes PRAGMA foreign_keys = ON before being handed to the pool.
// DSN-level _pragma parameters are parsed by the modernc driver on each
// Open(), but connection-pool recycling can theoretically skip the DSN
// parse on reused file handles.  This connector guarantees enforcement on
// every physical connection regardless of pool lifecycle (#6905).
type fkConnector struct {
	driver driver.Driver
	dsn    string
}

func (c *fkConnector) Connect(_ context.Context) (driver.Conn, error) {
	conn, err := c.driver.Open(c.dsn)
	if err != nil {
		return nil, err
	}

	// Enable foreign-key enforcement on this specific connection.
	stmt, err := conn.Prepare("PRAGMA foreign_keys = ON")
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("prepare FK pragma: %w", err)
	}
	if _, err := stmt.Exec(nil); err != nil { //nolint:staticcheck // driver.Stmt.Exec([]driver.Value) is the v1 interface
		stmt.Close()
		conn.Close()
		return nil, fmt.Errorf("exec FK pragma: %w", err)
	}
	stmt.Close()
	return conn, nil
}

func (c *fkConnector) Driver() driver.Driver { return c.driver }

// sqlDriver returns the registered database/sql driver with the given name.
func sqlDriver(name string) (driver.Driver, error) {
	for _, d := range sql.Drivers() {
		if d == name {
			// Open a throwaway DB just to grab the driver reference.
			db, err := sql.Open(name, "")
			if err != nil {
				return nil, err
			}
			drv := db.Driver()
			db.Close()
			return drv, nil
		}
	}
	return nil, fmt.Errorf("sql driver %q not registered", name)
}

// ErrDashboardCardLimitReached is returned by CreateCardWithLimit when the
// dashboard already contains the maximum number of cards. Handlers should
// map this error to HTTP 429 Too Many Requests.
var ErrDashboardCardLimitReached = errors.New("dashboard card limit reached")

// ErrDailyBonusUnavailable is returned by ClaimDailyBonus when the user's
// last claim is within the daily-bonus cooldown window (issue #6011).
// Handlers should map this error to HTTP 429 Too Many Requests.
var ErrDailyBonusUnavailable = errors.New("daily bonus already claimed within cooldown window")

// ErrNotFound is returned when a store update targets a missing row.
// Handlers map this sentinel to HTTP 404 Not Found.
var ErrNotFound = errors.New("not found")

// MinCoinBalance is the floor for user coin balances. Negative increments
// are clamped to this value so buggy clients cannot drive balances below
// zero. Exported so handlers and tests can reference the same constant.
const MinCoinBalance = 0

// DefaultUserLevel is the level assigned to brand-new reward rows. Rewards
// rows are created on-demand the first time a user mutates their balance,
// so every user effectively starts at level 1.
const DefaultUserLevel = 1

// SQLite connection pool defaults
const (
	// sqliteDefaultMaxOpenConns limits concurrent database connections
	sqliteDefaultMaxOpenConns = 25
	// sqliteDatabaseFileMode prevents other local users from reading secrets
	// persisted in the SQLite database on shared hosts.
	sqliteDatabaseFileMode = 0o600
	// sqliteDefaultMaxIdleConns controls idle connection pool size
	sqliteDefaultMaxIdleConns = 5
	// sqliteDefaultConnMaxLifetime recycles connections periodically
	sqliteDefaultConnMaxLifetime = 5 * time.Minute
	// sqliteDefaultConnMaxIdleTime closes long-idle connections
	sqliteDefaultConnMaxIdleTime = 2 * time.Minute
	// sqliteMinConnLifetime is the minimum allowed connection lifetime
	// to prevent excessive connection churn
	sqliteMinConnLifetime = 30 * time.Second
	// sqliteBusyTimeoutMs is the millisecond duration that a writer will
	// wait for the SQLite write lock before returning SQLITE_BUSY. Under
	// WAL mode only one writer holds the lock at a time; this timeout
	// lets concurrent writers queue instead of failing immediately.
	// Also required for AddUserTokenDelta which uses BEGIN IMMEDIATE on a
	// pinned connection so concurrent goroutines can wait for the lock
	// rather than fail.
	sqliteBusyTimeoutMs = 5000
)

// parseUUID parses a UUID string from a DB column, logging a warning on
// malformed input before returning the zero UUID. The zero-UUID fallback is
// deliberate — the row scanners that call this helper would otherwise have
// to abort entire list queries when a single row has corrupt data, which is
// worse than serving the rest of the list with one misattributed row.
//
// #6609: callers that need a hard error (e.g. single-row lookups where a
// corrupt id means the returned value is meaningless) should use
// parseUUIDStrict instead, which returns (uuid.UUID, error) and lets the
// caller propagate the failure up to the handler layer.
func parseUUID(s string, field string) uuid.UUID {
	id, err := uuid.Parse(s)
	if err != nil {
		slog.Warn("[Store] malformed UUID in database — using zero UUID", "field", field, "value", s, "error", err)
	}
	return id
}

// parseUUIDStrict parses a UUID string and returns an error on failure,
// so callers can propagate corruption instead of silently substituting the
// zero UUID. Added for #6609 — new code paths should prefer this helper;
// existing list/row scanners continue to use the logging-only parseUUID
// to keep partial-failure tolerance on bulk queries.
func parseUUIDStrict(s string, field string) (uuid.UUID, error) {
	id, err := uuid.Parse(s)
	if err != nil {
		return uuid.Nil, fmt.Errorf("malformed UUID in %s: %w", field, err)
	}
	return id, nil
}

// maxSQLLimit is the maximum allowed value for SQL LIMIT parameters.
// This provides defense-in-depth against unbounded queries from internal callers.
const maxSQLLimit = 1000

// defaultPageLimit is the default page size for list queries when the caller
// does not supply one (limit <= 0). #6598-#6602.
const defaultPageLimit = 500

// defaultAdminPageLimit is the default page size for admin list queries that
// are hit on every dashboard load (e.g. GetAllFeatureRequests). Smaller than
// defaultPageLimit because the admin UI pages through results. #6602.
const defaultAdminPageLimit = 100

// clampLimit ensures a SQL LIMIT parameter is within safe bounds (1 to maxSQLLimit).
func clampLimit(limit int) int {
	if limit < 1 {
		return 1
	}
	if limit > maxSQLLimit {
		return maxSQLLimit
	}
	return limit
}

// resolvePageLimit applies the supplied limit (falling back to fallback when
// limit <= 0) and clamps the result to maxSQLLimit. #6598-#6602.
func resolvePageLimit(limit, fallback int) int {
	if limit <= 0 {
		limit = fallback
	}
	return clampLimit(limit)
}

// resolvePageOffset clamps negative offsets to 0. #6598-#6602.
func resolvePageOffset(offset int) int {
	if offset < 0 {
		return 0
	}
	return offset
}

// getEnvInt reads an integer from the environment, falling back to defaultVal.
func getEnvInt(key string, defaultVal int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return defaultVal
}

// getEnvDuration reads a duration from the environment, falling back to defaultVal.
func getEnvDuration(key string, defaultVal time.Duration) time.Duration {
	if v := os.Getenv(key); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return defaultVal
}

// configureConnectionPool sets SQLite connection pool parameters from environment variables.
// Reads KC_SQLITE_MAX_OPEN_CONNS, KC_SQLITE_MAX_IDLE_CONNS, KC_SQLITE_CONN_MAX_LIFETIME,
// and KC_SQLITE_CONN_MAX_IDLE_TIME, validates bounds, and logs the final configuration.
func configureConnectionPool(db *sql.DB) {
	maxOpen := getEnvInt("KC_SQLITE_MAX_OPEN_CONNS", sqliteDefaultMaxOpenConns)
	maxIdle := getEnvInt("KC_SQLITE_MAX_IDLE_CONNS", sqliteDefaultMaxIdleConns)
	lifetime := getEnvDuration("KC_SQLITE_CONN_MAX_LIFETIME", sqliteDefaultConnMaxLifetime)
	idleTime := getEnvDuration("KC_SQLITE_CONN_MAX_IDLE_TIME", sqliteDefaultConnMaxIdleTime)

	// Validate and clamp maxOpen to prevent zero or negative values
	if maxOpen < 1 {
		slog.Warn("[SQLite] KC_SQLITE_MAX_OPEN_CONNS must be >= 1, using default",
			"value", maxOpen, "default", sqliteDefaultMaxOpenConns)
		maxOpen = sqliteDefaultMaxOpenConns
	}

	// Validate maxIdle <= maxOpen to prevent idle pool larger than open pool
	if maxIdle > maxOpen {
		slog.Warn("[SQLite] KC_SQLITE_MAX_IDLE_CONNS cannot exceed KC_SQLITE_MAX_OPEN_CONNS, clamping",
			"max_idle", maxIdle, "max_open", maxOpen)
		maxIdle = maxOpen
	}

	// Validate lifetime >= 30s to prevent excessive connection churn
	if lifetime < sqliteMinConnLifetime {
		slog.Warn("[SQLite] KC_SQLITE_CONN_MAX_LIFETIME must be >= 30s, using default",
			"value", lifetime, "default", sqliteDefaultConnMaxLifetime)
		lifetime = sqliteDefaultConnMaxLifetime
	}

	db.SetMaxOpenConns(maxOpen)
	db.SetMaxIdleConns(maxIdle)
	db.SetConnMaxLifetime(lifetime)
	db.SetConnMaxIdleTime(idleTime)

	slog.Info("[SQLite] connection pool configured",
		"max_open_conns", maxOpen,
		"max_idle_conns", maxIdle,
		"conn_max_lifetime", lifetime,
		"conn_max_idle_time", idleTime,
	)
}

type sqlContextExecer interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
}

// SQLiteStore implements Store using SQLite
type SQLiteStore struct {
	db *sql.DB
}

func (s *SQLiteStore) WithTransaction(ctx context.Context, fn func(tx *sql.Tx) error) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err := fn(tx); err != nil {
		return err
	}
	return tx.Commit()
}

// dbDirPerms restricts the database directory to owner-only access.
const dbDirPerms = 0700

// dbFilePerms restricts the database file to owner-only read/write.
const dbFilePerms = 0600

var osChmod = os.Chmod //nolint:gochecknoglobals // overridden in tests

// ensureSecureDBPath creates the parent directory (owner-only) and pre-creates
// the database file with 0600 permissions if it does not already exist. This
// prevents the SQLite driver from creating files with a permissive umask on
// shared hosts (CWE-276).
func ensureSecureDBPath(dbPath string) error {
	if dbPath == ":memory:" || dbPath == "" {
		return nil
	}

	dir := filepath.Dir(dbPath)
	_, statErr := os.Stat(dir)
	dirExisted := statErr == nil
	if statErr != nil && !errors.Is(statErr, os.ErrNotExist) {
		return fmt.Errorf("stat db directory: %w", statErr)
	}
	if err := os.MkdirAll(dir, dbDirPerms); err != nil {
		return fmt.Errorf("create db directory: %w", err)
	}
	// Tighten directory permissions in case MkdirAll inherited a wider umask.
	if err := osChmod(dir, dbDirPerms); err != nil {
		if dirExisted && os.IsPermission(err) {
			slog.Warn("could not tighten existing db directory permissions", "path", dir, "error", err)
		} else {
			return fmt.Errorf("chmod db directory: %w", err)
		}
	}

	// Pre-create the file with restricted permissions so the driver doesn't
	// rely on umask.
	if _, err := os.Stat(dbPath); errors.Is(err, os.ErrNotExist) {
		f, createErr := os.OpenFile(dbPath, os.O_CREATE|os.O_WRONLY, dbFilePerms)
		if createErr != nil {
			return fmt.Errorf("pre-create db file: %w", createErr)
		}
		f.Close()
	} else if err == nil {
		// Existing file — tighten permissions if they are too wide.
		if chErr := osChmod(dbPath, dbFilePerms); chErr != nil {
			slog.Warn("could not tighten db file permissions", "path", dbPath, "error", chErr)
		}
	}
	return nil
}

// tightenSidecarPerms ensures WAL and SHM files have owner-only permissions.
func tightenSidecarPerms(dbPath string) {
	if dbPath == ":memory:" || dbPath == "" {
		return
	}
	for _, suffix := range []string{"-wal", "-shm"} {
		p := dbPath + suffix
		if _, err := os.Stat(p); err == nil {
			if chErr := osChmod(p, dbFilePerms); chErr != nil {
				slog.Warn("could not tighten sidecar permissions", "path", p, "error", chErr)
			}
		}
	}
}

// NewSQLiteStore creates a new SQLite store
func NewSQLiteStore(dbPath string) (*SQLiteStore, error) {
	if err := ensureSecureDBPath(dbPath); err != nil {
		return nil, err
	}
	// DSN notes (modernc.org/sqlite accepts PRAGMAs via _pragma=key(value)):
	//  - journal_mode=WAL enables Write-Ahead Logging so readers don't
	//    block writers.
	//  - synchronous=NORMAL is the recommended pairing with WAL for good
	//    durability without the overhead of FULL fsyncs.
	//  - busy_timeout queues contending writers instead of returning
	//    SQLITE_BUSY immediately; required for safe concurrent writes
	//    alongside db.SetMaxOpenConns > 1.
	//  - foreign_keys=on enforces FK constraints (off by default in SQLite).
	dsn := fmt.Sprintf(
		"%s?_pragma=foreign_keys(on)&_pragma=journal_mode(WAL)&_pragma=synchronous(NORMAL)&_pragma=busy_timeout(%d)",
		dbPath, sqliteBusyTimeoutMs,
	)
	// Use sql.OpenDB with a custom connector so that PRAGMA foreign_keys = ON
	// is executed on every new physical connection, not just the first one.
	// This prevents ghost-card orphans when the pool recycles connections (#6905).
	drv, err := sqlDriver("sqlite")
	if err != nil {
		return nil, fmt.Errorf("sqlite driver lookup: %w", err)
	}
	db := sql.OpenDB(&fkConnector{driver: drv, dsn: dsn})

	// Configure connection pool for resource management under high load
	configureConnectionPool(db)

	store := &SQLiteStore{db: db}
	if err := store.migrate(); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to migrate: %w", err)
	}
	if err := secureSQLiteDatabaseFile(dbPath); err != nil {
		db.Close()
		return nil, err
	}

	// Tighten WAL and SHM sidecar files created by the driver.
	tightenSidecarPerms(dbPath)

	return store, nil
}

func secureSQLiteDatabaseFile(dbPath string) error {
	if !isSQLiteFilePath(dbPath) {
		return nil
	}
	for _, path := range []string{dbPath, dbPath + "-wal", dbPath + "-shm"} {
		if err := chmodIfExists(path, sqliteDatabaseFileMode); err != nil {
			return fmt.Errorf("failed to secure sqlite database permissions: %w", err)
		}
	}
	return nil
}

func chmodIfExists(path string, mode os.FileMode) error {
	if err := os.Chmod(path, mode); err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	return nil
}

func isSQLiteFilePath(dbPath string) bool {
	cleanPath := strings.TrimSpace(dbPath)
	if cleanPath == "" || cleanPath == ":memory:" {
		return false
	}
	if strings.HasPrefix(cleanPath, "file:") {
		return false
	}
	return filepath.Clean(cleanPath) != "."
}

// Close closes the database connection
func (s *SQLiteStore) Close() error {
	return s.db.Close()
}

// Shared helper functions

// Helper functions

func nullString(s string) sql.NullString {
	if s == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: s, Valid: true}
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

// rollbackTimeout bounds the time a best-effort ROLLBACK is allowed to run on
// a pinned connection. Must be long enough for SQLite to release its write
// lock but short enough to avoid holding the pool when the pool is itself
// shutting down.
const rollbackTimeout = 5 * time.Second

// rollbackConn executes ROLLBACK against a pinned connection using a fresh
// bounded context. Use this from defers in BEGIN IMMEDIATE flows instead of
// ExecContext(ctx, "ROLLBACK"): if the caller's ctx is already cancelled
// (client disconnect, request timeout), a rollback on that ctx fails
// immediately and leaves the transaction zombified on the connection (#8854).
func rollbackConn(conn *sql.Conn) {
	ctx, cancel := context.WithTimeout(context.Background(), rollbackTimeout)
	defer cancel()
	_, _ = conn.ExecContext(ctx, "ROLLBACK")
}
