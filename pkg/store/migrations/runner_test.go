package migrations

import (
	"context"
	"database/sql"
	"testing"

	_ "github.com/mattn/go-sqlite3"
)

func TestRun_CreatesTrackingTable(t *testing.T) {
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	ctx := context.Background()
	if err := Run(ctx, db); err != nil {
		t.Fatalf("Run() error: %v", err)
	}

	// Verify schema_migrations table exists
	var count int
	err = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM schema_migrations`).Scan(&count)
	if err != nil {
		t.Fatalf("schema_migrations table not created: %v", err)
	}
	if count == 0 {
		t.Fatal("expected at least one migration applied (seed)")
	}
}

func TestRun_Idempotent(t *testing.T) {
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	ctx := context.Background()
	// Run twice — should not error
	if err := Run(ctx, db); err != nil {
		t.Fatalf("first Run() error: %v", err)
	}
	if err := Run(ctx, db); err != nil {
		t.Fatalf("second Run() error: %v", err)
	}

	var count int
	err = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM schema_migrations`).Scan(&count)
	if err != nil {
		t.Fatal(err)
	}
	// Should have exactly 1 migration (the seed), not duplicated
	if count != 1 {
		t.Fatalf("expected 1 migration record, got %d", count)
	}
}
