package k8s

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/kubestellar/console/pkg/api/v1alpha1"
	k8sruntime "k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	dynamicfake "k8s.io/client-go/dynamic/fake"
)

// consoleGVRListKinds maps every console CRD's GVR to its List kind so
// the fake dynamic client knows how to return typed lists. Without this,
// NewSimpleDynamicClient panics on the first List call because the list
// kind isn't registered. See k8s.io/client-go/dynamic/fake docs.
var consoleGVRListKinds = map[schema.GroupVersionResource]string{
	v1alpha1.ManagedWorkloadGVR:    "ManagedWorkloadList",
	v1alpha1.ClusterGroupGVR:       "ClusterGroupList",
	v1alpha1.WorkloadDeploymentGVR: "WorkloadDeploymentList",
}

// concurrentStartCallers — number of goroutines used by the concurrency race
// test for StartWatching. Chosen to be large enough that a naive unlocked
// check-and-set would lose the race with high probability under `go test
// -race`, while still completing quickly on CI.
const concurrentStartCallers = 100

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
	fakeDyn := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(k8sruntime.NewScheme(), consoleGVRListKinds)
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
	fakeDyn := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(k8sruntime.NewScheme(), consoleGVRListKinds)
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

// PR #6518 item A — StartWatching must be concurrency-safe. Many goroutines
// calling StartWatching simultaneously must result in exactly one installed
// watcher, not a race where the check-and-set gap lets two callers both
// construct a fresh fsnotify.Watcher (leaking the loser). Run under
// `go test -race` to catch unlocked mutation of m.watching / m.watcher.
func TestMultiClusterClient_StartWatching_ConcurrentRace(t *testing.T) {
	path := writeTempKubeconfig(t)
	m, err := NewMultiClusterClient(path)
	if err != nil {
		t.Fatalf("NewMultiClusterClient: %v", err)
	}

	var wg sync.WaitGroup
	errs := make(chan error, concurrentStartCallers)
	start := make(chan struct{})
	// PR #6573 item A — assert that EVERY successful StartWatching caller
	// observes m.watcher != nil immediately after its own call returns. The
	// previous impl released the lock before running fsnotify setup, so a
	// second caller could see watching=true and return nil while m.watcher
	// was still nil. With the lock now held across setup, any StartWatching
	// return means setup has fully completed (or cleanly rolled back).
	for i := 0; i < concurrentStartCallers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			if e := m.StartWatching(); e != nil {
				errs <- e
				return
			}
			// Setup must be complete before ANY caller returns nil.
			m.mu.Lock()
			wInstalled := m.watcher
			watching := m.watching
			m.mu.Unlock()
			if !watching || wInstalled == nil {
				errs <- fmt.Errorf("StartWatching returned nil but watcher not yet installed (watching=%v, watcher=%v)", watching, wInstalled != nil)
			}
		}()
	}
	close(start)
	wg.Wait()
	close(errs)
	for e := range errs {
		t.Fatalf("concurrent StartWatching error: %v", e)
	}

	// Exactly one watcher should be installed and watching must be true.
	m.mu.Lock()
	w := m.watcher
	watching := m.watching
	m.mu.Unlock()
	if !watching {
		t.Fatal("expected watching=true after concurrent StartWatching")
	}
	if w == nil {
		t.Fatal("expected exactly one watcher to be installed")
	}
	m.StopWatching()
}

// PR #6518 item B — StopWatching must be concurrency-safe against
// interleaved StartWatching calls that rotate m.stopWatchOnce. The previous
// impl captured &m.stopWatchOnce then released the lock and called Do, which
// raced with Start replacing the Once. Run under `go test -race`.
func TestMultiClusterClient_StopStartRace(t *testing.T) {
	path := writeTempKubeconfig(t)
	m, err := NewMultiClusterClient(path)
	if err != nil {
		t.Fatalf("NewMultiClusterClient: %v", err)
	}
	if err := m.StartWatching(); err != nil {
		t.Fatalf("initial StartWatching: %v", err)
	}

	var wg sync.WaitGroup
	const cycles = 25 // kept modest because each cycle does real fsnotify I/O
	startErrs := make(chan error, cycles)
	for i := 0; i < cycles; i++ {
		wg.Add(2)
		go func() {
			defer wg.Done()
			m.StopWatching()
		}()
		go func() {
			defer wg.Done()
			// PR #6573 item D — assert no fsnotify error escapes. The
			// previous test swallowed errors with `_ =`, so a resource
			// exhaustion failure would have let the test pass vacuously.
			if e := m.StartWatching(); e != nil {
				startErrs <- e
			}
		}()
	}
	wg.Wait()
	close(startErrs)
	for e := range startErrs {
		t.Fatalf("StartWatching error during Stop/Start race: %v", e)
	}
	m.StopWatching()
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
