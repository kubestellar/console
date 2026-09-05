package tokentracker

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/kubestellar/console/pkg/ai"
)

// TestAddUsage_NilNoop exercises the nil-usage guard at the top of
// AddUsage. Prior tests always passed a non-nil ProviderTokenUsage,
// leaving the early return uncovered — a regression there would cause
// the tracker to silently panic when a provider returns no usage info.
func TestAddUsage_NilNoop(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)

	tr := New(0)
	// Must not panic and must not schedule a flush.
	tr.AddUsage(nil)

	in, out, _, _ := tr.GetUsage()
	if in != 0 || out != 0 {
		t.Fatalf("nil AddUsage mutated counters: in=%d out=%d", in, out)
	}
	if tr.flushTimer != nil {
		t.Fatalf("nil AddUsage scheduled a flush timer")
	}
}

// TestAddUsage_DateRolloverResetsDailyCounters targets the branch that
// resets daily counters when the wall-clock day changes. Without this
// branch, `todayIn` / `todayOut` would monotonically accumulate across
// day boundaries and would report inflated same-day usage after any
// process that has been running for more than 24h.
func TestAddUsage_DateRolloverResetsDailyCounters(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)

	tr := New(0)

	// Seed a "yesterday" day counter directly, bypassing AddUsage's
	// own accounting, so the day-changed branch is guaranteed to fire
	// on the next AddUsage call regardless of when the test runs.
	tr.mu.Lock()
	tr.todayDate = "2000-01-01"
	tr.todayIn = 500
	tr.todayOut = 500
	tr.mu.Unlock()

	// Any real usage now should reset todayIn/todayOut to the new-day
	// values and re-anchor todayDate to today.
	tr.AddUsage(mkUsage(10, 20))

	sessionIn, sessionOut, todayIn, todayOut := tr.GetUsage()
	if todayIn != 10 || todayOut != 20 {
		t.Fatalf("day-rollover branch did not reset today counters: in=%d out=%d", todayIn, todayOut)
	}
	// Session counters must NOT be reset — only the daily counters.
	if sessionIn != 10 || sessionOut != 20 {
		t.Fatalf("day-rollover branch spuriously reset session counters: in=%d out=%d", sessionIn, sessionOut)
	}
	if tr.todayDate != time.Now().Format("2006-01-02") {
		t.Fatalf("day-rollover branch did not re-anchor todayDate: %q", tr.todayDate)
	}
}

// TestLoad_MalformedJSON covers the json.Unmarshal error branch of Load.
// The tracker must swallow parse errors from a corrupted usage file
// rather than crashing the agent on startup — a corrupted file must
// leave the tracker in its zero-valued state so counting can resume.
func TestLoad_MalformedJSON(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)

	// Write a corrupt payload at the exact path Load reads.
	if err := os.WriteFile(usagePath(), []byte("{not-json"), fileMode); err != nil {
		t.Fatal(err)
	}

	tr := New(0)
	tr.Load() // must not panic or throw.

	_, _, todayIn, todayOut := tr.GetUsage()
	if todayIn != 0 || todayOut != 0 {
		t.Fatalf("corrupt usage file leaked into counters: in=%d out=%d", todayIn, todayOut)
	}
}

// TestLoad_StaleDateIsDiscarded covers the branch where the persisted
// usage file is from a prior day. Load must NOT restore stale
// yesterday-or-earlier counters into today's totals — otherwise a
// weekly report would double-count old days after every restart.
func TestLoad_StaleDateIsDiscarded(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)

	stale := usageData{
		Date:      "2000-01-01",
		InputIn:   999,
		OutputOut: 999,
	}
	buf, err := json.Marshal(stale)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(usagePath(), buf, fileMode); err != nil {
		t.Fatal(err)
	}

	tr := New(0)
	tr.Load()

	_, _, todayIn, todayOut := tr.GetUsage()
	if todayIn != 0 || todayOut != 0 {
		t.Fatalf("stale-date branch failed: yesterday's tokens leaked into today: in=%d out=%d", todayIn, todayOut)
	}
}

// TestAcquireFileLock_OpenError covers the OpenFile failure branch.
// Pointing the lock path at a nested location under a plain-file
// parent guarantees ENOTDIR from openat(2), so the function must
// return an error rather than nil.
func TestAcquireFileLock_OpenError(t *testing.T) {
	tmp := t.TempDir()

	// Create a regular file, then try to lock underneath it — the
	// intermediate component is not a directory, which forces
	// OpenFile to fail.
	plainFile := filepath.Join(tmp, "not-a-dir")
	if err := os.WriteFile(plainFile, []byte("x"), 0600); err != nil {
		t.Fatal(err)
	}
	badLockPath := filepath.Join(plainFile, "child.lock")

	release, err := acquireFileLock(badLockPath)
	if err == nil {
		if release != nil {
			release()
		}
		t.Fatalf("expected error when lock parent is not a directory, got nil")
	}
	if release != nil {
		t.Fatalf("release must be nil when lock acquisition fails")
	}
}

// TestAcquireFileLock_SuccessAndRelease covers the happy-path release
// closure. The release function must be safe to invoke, and calling it
// must permit a subsequent acquire on the same path — proving the OS
// lock was actually dropped, not just leaked.
func TestAcquireFileLock_SuccessAndRelease(t *testing.T) {
	lockPath := filepath.Join(t.TempDir(), "test.lock")

	release, err := acquireFileLock(lockPath)
	if err != nil {
		t.Fatalf("initial acquire failed: %v", err)
	}
	if release == nil {
		t.Fatalf("release closure must be non-nil on success")
	}
	release()

	// Should be re-acquirable after release.
	release2, err := acquireFileLock(lockPath)
	if err != nil {
		t.Fatalf("re-acquire after release failed: %v", err)
	}
	if release2 != nil {
		release2()
	}
}

// mkUsage returns a minimal ProviderTokenUsage for tests.
func mkUsage(in, out int) *ai.ProviderTokenUsage {
	return &ai.ProviderTokenUsage{InputTokens: in, OutputTokens: out, TotalTokens: in + out}
}
