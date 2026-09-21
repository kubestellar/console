package workers

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/kubestellar/console/pkg/k8s"
	fakek8s "k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/tools/clientcmd/api"
)

// newTestMetricsHistory returns a MetricsHistory backed by a minimal
// single-cluster fake k8s client and a per-test temp data dir.
func newTestMetricsHistory(t *testing.T) (*MetricsHistory, string) {
	t.Helper()
	m, _ := k8s.NewMultiClusterClient("")
	m.SetRawConfig(&api.Config{
		Contexts: map[string]*api.Context{"c1": {Cluster: "cl1"}},
		Clusters: map[string]*api.Cluster{"cl1": {Server: "s1"}},
	})
	m.InjectClient("c1", fakek8s.NewSimpleClientset())
	tmpDir := t.TempDir()
	return NewMetricsHistory(m, tmpDir), tmpDir
}

// TestMetricsHistory_SetDataDir verifies that SetDataDir moves subsequent
// persistence to the new directory. This exercises the previously-uncovered
// SetDataDir setter (workers_metrics_history.go:109).
func TestMetricsHistory_SetDataDir(t *testing.T) {
	mh, origDir := newTestMetricsHistory(t)

	newDir := t.TempDir()
	if newDir == origDir {
		t.Fatalf("t.TempDir() returned duplicate dir")
	}

	mh.SetDataDir(newDir)

	if err := mh.CaptureNow(); err != nil {
		t.Fatalf("CaptureNow after SetDataDir: %v", err)
	}
	mh.saveToDisk()

	// The new dir should now contain the history file; the original should not.
	if _, err := os.Stat(filepath.Join(newDir, metricsHistoryFile)); err != nil {
		t.Fatalf("expected history file in new dir: %v", err)
	}
	if _, err := os.Stat(filepath.Join(origDir, metricsHistoryFile)); !os.IsNotExist(err) {
		t.Fatalf("expected NO history file in original dir, got err=%v", err)
	}
}

// TestMetricsHistory_LastPersistError_HealthyThenFailing verifies:
//   - LastPersistError is nil on a fresh instance and after a successful save
//   - after a save into an unwritable directory it reports the underlying error
//   - a subsequent successful save clears the error back to nil
//
// This exercises the previously-uncovered LastPersistError() accessor
// (workers_metrics_history.go:392) and both branches of setLastPersistError
// via saveToDisk's success/failure paths.
func TestMetricsHistory_LastPersistError_HealthyThenFailing(t *testing.T) {
	mh, _ := newTestMetricsHistory(t)

	if err := mh.LastPersistError(); err != nil {
		t.Fatalf("fresh MetricsHistory should have nil LastPersistError, got %v", err)
	}

	if err := mh.CaptureNow(); err != nil {
		t.Fatalf("CaptureNow: %v", err)
	}
	mh.saveToDisk()
	if err := mh.LastPersistError(); err != nil {
		t.Fatalf("after healthy saveToDisk, LastPersistError should be nil, got %v", err)
	}

	// Point at an unwritable location so saveToDisk's MkdirAll/CreateTemp
	// fails. Using a path where a parent component is an existing regular
	// file makes MkdirAll fail deterministically on POSIX systems without
	// requiring root or chmod tricks.
	blocker := filepath.Join(t.TempDir(), "not-a-dir")
	if err := os.WriteFile(blocker, []byte("x"), 0o600); err != nil {
		t.Fatalf("seed blocker file: %v", err)
	}
	badDir := filepath.Join(blocker, "child")
	mh.SetDataDir(badDir)

	mh.saveToDisk()
	perr := mh.LastPersistError()
	if perr == nil {
		t.Fatalf("expected non-nil LastPersistError after save into unwritable dir")
	}
	// Sanity: error mentions the bad path or a not-a-directory hint. We don't
	// pin an exact string (varies by OS), just that it's non-empty.
	if strings.TrimSpace(perr.Error()) == "" {
		t.Fatalf("LastPersistError message should be non-empty")
	}

	// Recovery: point back at a good dir and confirm the error clears.
	goodDir := t.TempDir()
	mh.SetDataDir(goodDir)
	mh.saveToDisk()
	if err := mh.LastPersistError(); err != nil {
		t.Fatalf("after recovery saveToDisk, LastPersistError should be nil, got %v", err)
	}
}

// TestMetricsHistory_StartStop verifies that Start spawns the collection
// goroutine (captures at least one snapshot via the initial capture in
// runLoop) and that Stop shuts it down without panic. Stop is called twice
// to exercise the sync.Once guard added for #7244.
func TestMetricsHistory_StartStop(t *testing.T) {
	mh, _ := newTestMetricsHistory(t)

	// Long ticker interval — we only rely on the initial capture inside
	// runLoop, not on the ticker firing. This keeps the test fast and
	// deterministic on slow CI.
	mh.Start(time.Hour)

	// Wait for the initial snapshot to be captured by runLoop. We poll
	// GetSnapshots rather than sleeping a fixed duration.
	deadline := time.Now().Add(2 * time.Second)
	var snaps int
	for time.Now().Before(deadline) {
		snaps = len(mh.GetSnapshots().Snapshots)
		if snaps >= 1 {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if snaps < 1 {
		t.Fatalf("Start did not trigger initial snapshot within deadline, got %d", snaps)
	}

	mh.Stop()
	// Second Stop must be a safe no-op (regression guard for #7244 — closing
	// an already-closed channel would panic without the stopOnce guard).
	mh.Stop()
}
