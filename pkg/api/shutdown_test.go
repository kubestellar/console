package api

import (
	"path/filepath"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/api/transport"
	"github.com/kubestellar/console/pkg/store"
)

// TestShutdown_DrainsBackgroundWorkers is a regression test for #21198.
// Previously Shutdown() closed lifecycle.done and returned without waiting for
// background goroutines (KB gap sweeper, GPU utilization worker) to finish their
// in-flight writes. If an in-flight SQLite write raced with t.TempDir cleanup
// (os.RemoveAll), the test failed intermittently with:
//
//	testing.go:1464: TempDir RemoveAll cleanup: unlinkat .../001: directory not empty
//
// The fix adds lifecycle.wg tracking: Shutdown() calls lifecycle.wg.Wait() (with
// a timeout) before closing the store so all goroutine writes complete before the
// data directory can be removed.
func TestShutdown_DrainsBackgroundWorkers(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "drain-test.db")
	sqliteStore, err := store.NewSQLiteStore(dbPath)
	if err != nil {
		t.Fatalf("failed to open sqlite store: %v", err)
	}

	lc := newServerLifecycle(nil)

	// Simulate a background goroutine (e.g. KB gap sweeper) that holds the
	// WaitGroup open for a brief window after it receives the done signal,
	// modelling an in-flight write that outlasts the signal.
	unblock := make(chan struct{})
	lc.wg.Add(1)
	go func() {
		defer lc.wg.Done()
		<-lc.done   // wait for the shutdown signal
		<-unblock   // simulate in-flight write that completes asynchronously
	}()

	s := &Server{
		app:        fiber.New(),
		store:      sqliteStore,
		hub:        transport.NewHub(),
		lifecycle:  lc,
		background: newBackgroundServices(),
	}

	shutdownDone := make(chan struct{})
	go func() {
		defer close(shutdownDone)
		_ = s.Shutdown()
	}()

	// Allow Shutdown to signal done and start waiting on the WaitGroup.
	time.Sleep(50 * time.Millisecond)

	// Shutdown must NOT have returned yet — the simulated worker is still running.
	select {
	case <-shutdownDone:
		t.Fatal("Shutdown returned before background worker exited (#21198 regression)")
	default:
	}

	// Unblock the worker; Shutdown should complete promptly.
	close(unblock)
	select {
	case <-shutdownDone:
		// expected: Shutdown waited for the worker before returning
	case <-time.After(2 * time.Second):
		t.Fatal("Shutdown did not complete after worker exited (#21198)")
	}
}

// TestShutdown_Idempotent is a regression test for #6478. Previously
// Server.Shutdown closed the lifecycle done channel directly, so a second call
// panicked with "close of closed channel". The fix wraps teardown in sync.Once so
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
		app:       fiber.New(),
		store:     sqliteStore,
		hub:       transport.NewHub(),
		lifecycle: newServerLifecycle(nil),
	}

	// First call tears everything down.
	if err := s.Shutdown(); err != nil {
		t.Fatalf("first Shutdown returned error: %v", err)
	}

	// done must be closed after the first call. A receive on a closed
	// channel returns immediately with the zero value.
	select {
	case <-s.lifecycle.done:
		// expected
	default:
		t.Fatalf("expected lifecycle.done to be closed after first Shutdown")
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
