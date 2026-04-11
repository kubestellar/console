package k8s

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	k8sruntime "k8s.io/apimachinery/pkg/runtime"
	dynamicfake "k8s.io/client-go/dynamic/fake"
)

// writeTempKubeconfig writes a minimal kubeconfig to a temp file and returns
// its path. Used by the StartWatching/StopWatching lifecycle tests below.
func writeTempKubeconfig(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "kubeconfig")
	const body = `apiVersion: v1
kind: Config
current-context: c1
contexts:
  - name: c1
    context: {cluster: c1, user: u1}
clusters:
  - name: c1
    cluster: {server: https://c1.example.com}
users:
  - name: u1
    user: {}
`
	if err := os.WriteFile(path, []byte(body), 0600); err != nil {
		t.Fatalf("writeTempKubeconfig: %v", err)
	}
	return path
}

// Issue 6469 — StopWatching must be safe to call multiple times.
// Before the fix, a second call panicked on close of a closed channel.
func TestMultiClusterClient_StopWatching_DoubleCallSafe(t *testing.T) {
	path := writeTempKubeconfig(t)
	m, err := NewMultiClusterClient(path)
	if err != nil {
		t.Fatalf("NewMultiClusterClient: %v", err)
	}
	if err := m.StartWatching(); err != nil {
		t.Fatalf("StartWatching: %v", err)
	}

	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("second StopWatching panicked: %v", r)
		}
	}()

	m.StopWatching()
	m.StopWatching() // must not panic
}

// Issue 6470 — StartWatching must be idempotent. A second call before Stop
// must not spawn a second watchLoop goroutine or overwrite the first
// fsnotify.Watcher (which would orphan it and leak).
func TestMultiClusterClient_StartWatching_Idempotent(t *testing.T) {
	path := writeTempKubeconfig(t)
	m, err := NewMultiClusterClient(path)
	if err != nil {
		t.Fatalf("NewMultiClusterClient: %v", err)
	}
	if err := m.StartWatching(); err != nil {
		t.Fatalf("first StartWatching: %v", err)
	}
	m.mu.Lock()
	firstWatcher := m.watcher
	m.mu.Unlock()
	if firstWatcher == nil {
		t.Fatal("expected watcher to be set after first StartWatching")
	}
	// Second call should be a no-op.
	if err := m.StartWatching(); err != nil {
		t.Fatalf("second StartWatching: %v", err)
	}
	m.mu.Lock()
	secondWatcher := m.watcher
	m.mu.Unlock()
	if secondWatcher != firstWatcher {
		t.Error("second StartWatching replaced the watcher (should be idempotent)")
	}
	m.StopWatching()
}

// Issue 6472 — After Stop, Start must create a fresh stop channel and
// fsnotify watcher. Previously the second Start succeeded but the watchLoop
// goroutine exited immediately because it was reading a closed channel.
func TestMultiClusterClient_StartWatching_RestartAfterStop(t *testing.T) {
	path := writeTempKubeconfig(t)
	m, err := NewMultiClusterClient(path)
	if err != nil {
		t.Fatalf("NewMultiClusterClient: %v", err)
	}
	if err := m.StartWatching(); err != nil {
		t.Fatalf("first StartWatching: %v", err)
	}
	m.StopWatching()

	// Restart.
	if err := m.StartWatching(); err != nil {
		t.Fatalf("restart StartWatching: %v", err)
	}
	// Confirm stopWatch was recreated and is open. Read under the lock so
	// the race detector is happy; StartWatching spawns a goroutine that will
	// read the field too.
	m.mu.Lock()
	stopCh := m.stopWatch
	m.mu.Unlock()
	select {
	case <-stopCh:
		t.Fatal("stopWatch channel is already closed after restart")
	default:
	}
	m.StopWatching()
}

// Issue 6472 — ConsoleWatcher must be safe to restart after Stop.
func TestConsoleWatcher_RestartAfterStop(t *testing.T) {
	fakeDyn := dynamicfake.NewSimpleDynamicClient(k8sruntime.NewScheme())
	w := NewConsoleWatcher(fakeDyn, "default", func(ConsoleResourceEvent) {})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	if err := w.Start(ctx); err != nil {
		t.Fatalf("first Start: %v", err)
	}
	w.Stop()

	// Restart.
	if err := w.Start(ctx); err != nil {
		t.Fatalf("restart Start: %v", err)
	}
	// The new stopCh must not be closed. Read under mu to avoid racing
	// with the watchResource goroutines spawned by Start().
	w.mu.Lock()
	stopCh := w.stopCh
	w.mu.Unlock()
	select {
	case <-stopCh:
		t.Fatal("stopCh is closed after restart")
	default:
	}
	w.Stop()
}

// Issue 6469/6472 — ConsoleWatcher.Stop must be safe to call multiple times.
func TestConsoleWatcher_Stop_DoubleCallSafe(t *testing.T) {
	fakeDyn := dynamicfake.NewSimpleDynamicClient(k8sruntime.NewScheme())
	w := NewConsoleWatcher(fakeDyn, "default", func(ConsoleResourceEvent) {})
	if err := w.Start(context.Background()); err != nil {
		t.Fatalf("Start: %v", err)
	}

	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("second ConsoleWatcher.Stop panicked: %v", r)
		}
	}()

	w.Stop()
	w.Stop() // must not panic
}

// Issue 6471 — The kubeconfig watcher must invoke onWatchError when an
// error arrives on watcher.Errors. Previously the channel error was logged
// but SetOnWatchError callbacks never fired, silently breaking the public API.
//
// We can't easily synthesize a genuine fsnotify error without hooks into
// the private channel, so this test verifies the callback wiring path by
// registering a callback and ensuring reloadAndNotify's failure path still
// invokes it — that code already did, but we assert it stays working so a
// refactor cannot regress both callsites in silence.
func TestMultiClusterClient_OnWatchError_CallbackWired(t *testing.T) {
	path := writeTempKubeconfig(t)
	m, err := NewMultiClusterClient(path)
	if err != nil {
		t.Fatalf("NewMultiClusterClient: %v", err)
	}

	gotCh := make(chan error, 1)
	m.SetOnWatchError(func(err error) {
		select {
		case gotCh <- err:
		default:
		}
	})

	// Force LoadConfig to fail by pointing kubeconfig at a non-existent
	// path, then invoke reloadAndNotify which the watchLoop error branch
	// and the poll/reload branch both call through.
	m.kubeconfig = filepath.Join(t.TempDir(), "does-not-exist")
	m.reloadAndNotify()

	select {
	case <-gotCh:
		// ok
	case <-time.After(2 * time.Second):
		t.Fatal("onWatchError callback was not invoked on reload failure")
	}
}
