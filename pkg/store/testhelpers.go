package store

import (
	"database/sql"
	"testing"
)

// OpenTestDB creates an in-memory SQLiteStore with migrations applied.
// It is exported so tests in other packages can share the same setup.
func OpenTestDB(t testing.TB) *SQLiteStore {
	t.Helper()

	// Set encryption key for tests that use encrypted credential storage (#17815).
	t.Setenv("CREDENTIAL_ENCRYPTION_KEY", "test-key-for-unit-tests-only")

	drv, err := sqlDriver("sqlite")
	if err != nil {
		t.Fatalf("lookup sqlite driver: %v", err)
	}

	db := sql.OpenDB(&fkConnector{driver: drv, dsn: ":memory:"})
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	db.SetConnMaxLifetime(0)
	db.SetConnMaxIdleTime(0)

	store := &SQLiteStore{db: db}
	if err := store.migrate(); err != nil {
		_ = db.Close()
		t.Fatalf("migrate test db: %v", err)
	}

	t.Cleanup(func() {
		if err := store.Close(); err != nil {
			t.Fatalf("close test db: %v", err)
		}
	})

	return store
}
