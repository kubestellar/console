package migrations

import (
	"context"
	"database/sql"
	"strings"
	"testing"

	_ "modernc.org/sqlite"
)

// Error-path tests for runner.go. The pre-existing runner_test.go only exercises
// the happy path (schema_migrations table creation + idempotence), leaving all
// error branches — ensureTrackingTable failure, appliedVersions query failure,
// rows.Scan failure, applyMigration BeginTx/Exec/Insert failures, and the loop's
// per-file readfile/apply failures — untested. Each of these is on the primary
// startup path (db.migrations.Run is called during store.Connect at server
// boot) so a silent regression in any of them would surface as a difficult-to-
// diagnose "server won't come up" failure in production. Closing the *sql.DB
// and re-invoking each API is the cheapest way to drive every db.ExecContext /
// QueryContext / BeginTx into its documented sql.ErrConnDone branch without
// touching the migration file list or embed.FS.

func openAndClose(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	if err := db.Close(); err != nil {
		t.Fatalf("close: %v", err)
	}
	return db
}

// TestRun_EnsureTrackingTableError drives the very first branch of Run:
// ensureTrackingTable returns from `db.ExecContext(CREATE TABLE IF NOT
// EXISTS)`, and a closed DB makes that call return sql.ErrConnDone. This
// covers the `if err := ensureTrackingTable(...); err != nil { return err }`
// arm at runner.go:36-38 which the happy-path tests never exercise.
func TestRun_EnsureTrackingTableError(t *testing.T) {
	db := openAndClose(t)
	err := Run(context.Background(), db)
	if err == nil {
		t.Fatal("expected error from Run with closed DB, got nil")
	}
}

// TestAppliedVersions_QueryError drives the `db.QueryContext ... error` arm
// at runner.go:93-96 — appliedVersions is called from Run right after the
// tracking table is created, so making the SELECT fail (closed DB) is the
// only way to reach the `return nil, fmt.Errorf("query schema_migrations")`
// return. The Run wrapper already hides the error above it in
// EnsureTrackingTable, so we call appliedVersions directly.
func TestAppliedVersions_QueryError(t *testing.T) {
	db := openAndClose(t)
	_, err := appliedVersions(context.Background(), db)
	if err == nil {
		t.Fatal("expected query error from appliedVersions with closed DB, got nil")
	}
	if !strings.Contains(err.Error(), "query schema_migrations") {
		t.Fatalf("expected wrapped 'query schema_migrations' error, got %v", err)
	}
}

// TestApplyMigration_BeginTxError drives the `BeginTx ... error` arm at
// runner.go:112-114. A closed DB makes BeginTx return sql.ErrConnDone before
// any Exec runs, exercising the very first return in applyMigration.
func TestApplyMigration_BeginTxError(t *testing.T) {
	db := openAndClose(t)
	err := applyMigration(context.Background(), db, "test", "SELECT 1")
	if err == nil {
		t.Fatal("expected BeginTx error from applyMigration with closed DB, got nil")
	}
}

// TestApplyMigration_ExecStatementError drives the mid-arm `tx.ExecContext(sql)
// ... error` return at runner.go:117-119 by handing applyMigration valid
// context/tx (real open DB) but syntactically invalid SQL. This must NOT
// double-write to schema_migrations either — the tx rolls back.
func TestApplyMigration_ExecStatementError(t *testing.T) {
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	ctx := context.Background()
	if err := ensureTrackingTable(ctx, db); err != nil {
		t.Fatalf("ensure: %v", err)
	}

	err = applyMigration(ctx, db, "bad", "THIS IS NOT VALID SQL;")
	if err == nil {
		t.Fatal("expected exec error from applyMigration with invalid SQL, got nil")
	}

	// Confirm the tx rolled back — no row in schema_migrations for "bad".
	var n int
	if scanErr := db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM schema_migrations WHERE version = ?`, "bad").Scan(&n); scanErr != nil {
		t.Fatalf("verify: %v", scanErr)
	}
	if n != 0 {
		t.Fatalf("expected schema_migrations to have 0 rows for 'bad' after rollback, got %d", n)
	}
}

// TestApplyMigration_DuplicateVersionInsertError drives the tail-arm
// `INSERT INTO schema_migrations ... error` return at runner.go:121-125.
// Passing SQL that succeeds but a version string already present in
// schema_migrations triggers the PRIMARY KEY constraint violation on the
// tracking-row insert — the only realistic way to reach the third return
// without going through a closed DB (which we've already covered).
func TestApplyMigration_DuplicateVersionInsertError(t *testing.T) {
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	ctx := context.Background()
	if err := ensureTrackingTable(ctx, db); err != nil {
		t.Fatalf("ensure: %v", err)
	}

	// First insert: succeeds (registers "001").
	if err := applyMigration(ctx, db, "001", "SELECT 1"); err != nil {
		t.Fatalf("first apply: %v", err)
	}

	// Second insert of the same version: succeeds at the SELECT 1 stage,
	// then fails at the INSERT stage on the PRIMARY KEY collision.
	err = applyMigration(ctx, db, "001", "SELECT 1")
	if err == nil {
		t.Fatal("expected PRIMARY KEY error on duplicate version insert, got nil")
	}
}
