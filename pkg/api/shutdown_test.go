package api

import (
	"path/filepath"
	"testing"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/api/handlers"
	"github.com/kubestellar/console/pkg/store"
)

// TestShutdown_Idempotent is a regression test for #6478. Previously
// Server.Shutdown closed s.done directly, so a second call panicked with
// "close of closed channel". The fix wraps teardown in sync.Once so
// subsequent calls are no-ops.
func TestShutdown_Idempotent(t *testing.T) {
	// Build a minimal Server with only the dependencies Shutdown touches.
	// k8sClient, bridge, gpuUtilWorker, loadingSrv are nil-guarded in
	// Shutdown so we can leave them unset. hub, store, and app must be
	// non-nil.
	dbPath := filepath.Join(t.TempDir(), "shutdown-test.db")
	sqliteStore, err := store.NewSQLiteStore(dbPath)
	if err != nil {
		t.Fatalf("failed to open sqlite store: %v", err)
	}

	s := &Server{
		app:   fiber.New(),
		store: sqliteStore,
		hub:   handlers.NewHub(),
		done:  make(chan struct{}),
	}

	// First call tears everything down.
	if err := s.Shutdown(); err != nil {
		t.Fatalf("first Shutdown returned error: %v", err)
	}

	// done must be closed after the first call. A receive on a closed
	// channel returns immediately with the zero value.
	select {
	case <-s.done:
		// expected
	default:
		t.Fatalf("expected s.done to be closed after first Shutdown")
	}

	// Second call must NOT panic (#6478). Before the fix this panicked
	// with "close of closed channel" inside Shutdown.
	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("second Shutdown panicked: %v", r)
		}
	}()
	if err := s.Shutdown(); err != nil {
		t.Fatalf("second Shutdown returned error: %v", err)
	}
}
