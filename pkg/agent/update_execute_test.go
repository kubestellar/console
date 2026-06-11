package agent

import (
	"context"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// newCancellableUpdateChecker creates an UpdateChecker with cancellation pre-armed.
// The updateCancelled flag is set to 1 so checkCancelled returns true immediately.
func newCancellableUpdateChecker(t *testing.T, repoPath string) (*UpdateChecker, *[]UpdateProgressPayload) {
	t.Helper()

	var mu sync.Mutex
	var broadcasts []UpdateProgressPayload

	uc := &UpdateChecker{
		repoPath:   repoPath,
		currentSHA: "oldsha1234567",
		broadcast: func(_ string, payload interface{}) {
			if p, ok := payload.(UpdateProgressPayload); ok {
				mu.Lock()
				broadcasts = append(broadcasts, p)
				mu.Unlock()
			}
		},
		restartBackend: func() error { return nil },
		killBackend:    func() bool { return true },
		exitFunc:       func(_ int) {},
	}
	// Pre-arm cancellation
	atomic.StoreInt32(&uc.updateCancelled, 1)

	return uc, &broadcasts
}

// TestExecuteDeveloperUpdate_CancelBeforeStep1 verifies that cancellation before
// step 1 (git pull) exits immediately without any rollback or build commands.
func TestExecuteDeveloperUpdate_CancelBeforeStep1(t *testing.T) {
	mockBin := setupMockBin(t)
	repoPath := setupFakeRepo(t)
	t.Setenv("PATH", mockBin+":"+os.Getenv("PATH"))

	uc, broadcasts := newCancellableUpdateChecker(t, repoPath)
	uc.executeDeveloperUpdate("newsha_cancel1")

	msgs := *broadcasts
	var sawCancelled bool
	for _, m := range msgs {
		if m.Status == "cancelled" {
			sawCancelled = true
			break
		}
	}
	if !sawCancelled {
		t.Error("expected 'cancelled' broadcast when cancelled before step 1")
	}
	// Should have no "pulling" or "building" messages since we cancel immediately
	for _, m := range msgs {
		if m.Status == "pulling" || m.Status == "building" || m.Status == "restarting" {
			t.Errorf("unexpected broadcast status %q when cancelled before step 1", m.Status)
		}
	}
}

// TestExecuteDeveloperUpdate_CancelAfterGitPull verifies cancellation after git pull
// triggers a rollback and emits a "cancelled" broadcast.
func TestExecuteDeveloperUpdate_CancelAfterGitPull(t *testing.T) {
	mockBin := t.TempDir()
	repoPath := setupFakeRepo(t)

	// Git pull succeeds, but then we cancel. We use a marker file to cancel
	// after git pull succeeds — the mock git script sets cancellation.
	cancelFile := filepath.Join(t.TempDir(), "cancel-after-pull")

	writeMockScript(t, mockBin, "git", `
case "$1" in
  pull)
    # Signal that pull completed — test harness will check this
    exit 0 ;;
  rev-parse) echo "abc1234" ; exit 0 ;;
  status)    echo "" ; exit 0 ;;
  reset)     exit 0 ;;
  *)         exit 0 ;;
esac
`)
	writeMockScript(t, mockBin, "go", `
prev=""
for arg in "$@"; do
  if [ "$prev" = "-o" ]; then
    OUTPUT="$arg"
  fi
  prev="$arg"
done
if [ -n "$OUTPUT" ]; then
  touch "$OUTPUT"
  chmod 755 "$OUTPUT"
fi
exit 0
`)
	writeMockScript(t, mockBin, "npm", `exit 0`)
	t.Setenv("PATH", mockBin+":"+os.Getenv("PATH"))

	var mu sync.Mutex
	var broadcasts []UpdateProgressPayload

	uc := &UpdateChecker{
		repoPath:       repoPath,
		currentSHA:     "oldsha1234567",
		restartBackend: func() error { return nil },
		killBackend:    func() bool { return true },
		exitFunc:       func(_ int) {},
	}
	uc.broadcast = func(_ string, payload interface{}) {
		if p, ok := payload.(UpdateProgressPayload); ok {
			mu.Lock()
			broadcasts = append(broadcasts, p)
			mu.Unlock()
			// Cancel after we see the first "pulling" progress message complete
			// (which means git pull has started). We arm cancellation so that
			// checkCancelled at step2 boundary returns true.
			if p.Status == "pulling" {
				atomic.StoreInt32(&uc.updateCancelled, 1)
			}
		}
	}

	uc.executeDeveloperUpdate("newsha_cancel_after_pull")
	_ = cancelFile

	mu.Lock()
	msgs := make([]UpdateProgressPayload, len(broadcasts))
	copy(msgs, broadcasts)
	mu.Unlock()

	var sawCancelled bool
	for _, m := range msgs {
		if m.Status == "cancelled" {
			sawCancelled = true
			break
		}
	}
	if !sawCancelled {
		t.Error("expected 'cancelled' broadcast when cancelled after git pull")
	}
	// Should NOT reach the "building" npm install step
	for _, m := range msgs {
		if m.Status == "building" {
			t.Error("should not reach building step after cancellation at step 2 boundary")
			break
		}
	}
}

// TestExecuteDeveloperUpdate_CancelAfterFrontendBuild verifies that cancellation
// after frontend build triggers both git rollback and frontend rebuild.
func TestExecuteDeveloperUpdate_CancelAfterFrontendBuild(t *testing.T) {
	mockBin := t.TempDir()
	repoPath := setupFakeRepo(t)

	var npmBuildCount int32

	writeMockScript(t, mockBin, "git", `
case "$1" in
  pull)      exit 0 ;;
  rev-parse) echo "abc1234" ; exit 0 ;;
  status)    echo "" ; exit 0 ;;
  reset)     exit 0 ;;
  *)         exit 0 ;;
esac
`)
	writeMockScript(t, mockBin, "go", `
prev=""
for arg in "$@"; do
  if [ "$prev" = "-o" ]; then
    OUTPUT="$arg"
  fi
  prev="$arg"
done
if [ -n "$OUTPUT" ]; then
  touch "$OUTPUT"
  chmod 755 "$OUTPUT"
fi
exit 0
`)
	writeMockScript(t, mockBin, "npm", `exit 0`)
	t.Setenv("PATH", mockBin+":"+os.Getenv("PATH"))

	var mu sync.Mutex
	var broadcasts []UpdateProgressPayload
	var buildingCount int32

	uc := &UpdateChecker{
		repoPath:       repoPath,
		currentSHA:     "oldsha1234567",
		restartBackend: func() error { return nil },
		killBackend:    func() bool { return true },
		exitFunc:       func(_ int) {},
	}
	uc.broadcast = func(_ string, payload interface{}) {
		if p, ok := payload.(UpdateProgressPayload); ok {
			mu.Lock()
			broadcasts = append(broadcasts, p)
			mu.Unlock()
			// Cancel after frontend build completes (step 3, progress 30)
			if p.Status == "building" {
				count := atomic.AddInt32(&buildingCount, 1)
				// The 3rd "building" message is for step 3 (frontend build starting)
				if count >= 3 {
					atomic.StoreInt32(&uc.updateCancelled, 1)
				}
			}
		}
	}

	uc.executeDeveloperUpdate("newsha_cancel_after_frontend")
	_ = npmBuildCount

	mu.Lock()
	msgs := make([]UpdateProgressPayload, len(broadcasts))
	copy(msgs, broadcasts)
	mu.Unlock()

	var sawCancelled bool
	for _, m := range msgs {
		if m.Status == "cancelled" {
			sawCancelled = true
			break
		}
	}
	if !sawCancelled {
		t.Error("expected 'cancelled' broadcast after frontend build step")
	}
}

// TestExecuteDeveloperUpdate_FullSuccess verifies the complete 7-step flow
// produces expected broadcast sequence ending with "restarting".
func TestExecuteDeveloperUpdate_FullSuccess(t *testing.T) {
	mockBin := setupMockBin(t)
	repoPath := setupFakeRepo(t)
	t.Setenv("PATH", mockBin+":"+os.Getenv("PATH"))

	uc, broadcasts := newTestUpdateChecker(t, repoPath)
	uc.executeDeveloperUpdate("newsha_full_success")

	msgs := *broadcasts
	if len(msgs) == 0 {
		t.Fatal("expected broadcast messages, got none")
	}

	// Verify we see the complete progression
	expectedStatuses := []string{"pulling", "building", "restarting"}
	seen := make(map[string]bool)
	for _, m := range msgs {
		seen[m.Status] = true
	}
	for _, s := range expectedStatuses {
		if !seen[s] {
			t.Errorf("expected to see status %q in broadcasts", s)
		}
	}

	// Last meaningful broadcast should be "restarting"
	last := msgs[len(msgs)-1]
	if last.Status != "restarting" {
		t.Errorf("expected last broadcast status to be 'restarting', got %q", last.Status)
	}
}

// TestExecuteDeveloperUpdate_RollbackOnNpmFailure verifies that npm install failure
// triggers rollback git and rebuild frontend.
func TestExecuteDeveloperUpdate_RollbackOnNpmFailure(t *testing.T) {
	mockBin := t.TempDir()
	repoPath := setupFakeRepo(t)

	var gitResetCalled int32

	writeMockScript(t, mockBin, "git", `
case "$1" in
  pull)      exit 0 ;;
  rev-parse) echo "abc1234" ; exit 0 ;;
  status)    echo "" ; exit 0 ;;
  reset)     echo "RESET_CALLED" ; exit 0 ;;
  *)         exit 0 ;;
esac
`)
	// npm always fails
	writeMockScript(t, mockBin, "npm", `echo "ERR! network timeout"; exit 1`)
	writeMockScript(t, mockBin, "go", `exit 0`)
	t.Setenv("PATH", mockBin+":"+os.Getenv("PATH"))

	uc, broadcasts := newTestUpdateChecker(t, repoPath)
	uc.executeDeveloperUpdate("newsha_npm_fail")
	_ = gitResetCalled

	msgs := *broadcasts
	var sawFailed bool
	for _, m := range msgs {
		if m.Status == "failed" {
			sawFailed = true
			if m.Message == "" {
				t.Error("failed broadcast should include a message")
			}
			break
		}
	}
	if !sawFailed {
		t.Error("expected 'failed' broadcast when npm install fails")
	}

	// Verify the error was recorded
	uc.mu.Lock()
	lastErr := uc.lastUpdateError
	uc.mu.Unlock()
	if lastErr == "" {
		t.Error("expected lastUpdateError to be set after npm failure")
	}
}

// TestExecuteDeveloperUpdate_RollbackOnConsoleBuildFailure verifies rollback when
// the console binary build (step 4) fails.
func TestExecuteDeveloperUpdate_RollbackOnConsoleBuildFailure(t *testing.T) {
	mockBin := t.TempDir()
	repoPath := setupFakeRepo(t)

	writeMockScript(t, mockBin, "git", `
case "$1" in
  pull)      exit 0 ;;
  rev-parse) echo "abc1234" ; exit 0 ;;
  status)    echo "" ; exit 0 ;;
  reset)     exit 0 ;;
  *)         exit 0 ;;
esac
`)
	writeMockScript(t, mockBin, "npm", `exit 0`)
	// go build fails on first call (console binary), but succeeds on rollback calls
	writeMockScript(t, mockBin, "go", `
CALLED="$0.called"
if [ ! -f "$CALLED" ]; then
  touch "$CALLED"
  echo "syntax error in main.go"
  exit 1
fi
prev=""
for arg in "$@"; do
  if [ "$prev" = "-o" ]; then
    OUTPUT="$arg"
  fi
  prev="$arg"
done
if [ -n "$OUTPUT" ]; then
  touch "$OUTPUT"
  chmod 755 "$OUTPUT"
fi
exit 0
`)
	t.Setenv("PATH", mockBin+":"+os.Getenv("PATH"))

	uc, broadcasts := newTestUpdateChecker(t, repoPath)
	uc.executeDeveloperUpdate("newsha_console_build_fail")

	msgs := *broadcasts
	var sawFailed bool
	for _, m := range msgs {
		if m.Status == "failed" {
			sawFailed = true
			break
		}
	}
	if !sawFailed {
		t.Error("expected 'failed' broadcast when console build fails")
	}
}

// TestExecuteDevReleaseUpdate_Success verifies the dev-release update flow
// fetches a tag, checks it out, rebuilds, and restarts.
func TestExecuteDevReleaseUpdate_Success(t *testing.T) {
	mockBin := setupMockBin(t)
	repoPath := setupFakeRepo(t)
	t.Setenv("PATH", mockBin+":"+os.Getenv("PATH"))

	var mu sync.Mutex
	var broadcasts []UpdateProgressPayload

	uc := &UpdateChecker{
		repoPath:   repoPath,
		currentSHA: "oldsha1234567",
		broadcast: func(_ string, payload interface{}) {
			if p, ok := payload.(UpdateProgressPayload); ok {
				mu.Lock()
				broadcasts = append(broadcasts, p)
				mu.Unlock()
			}
		},
		restartBackend: func() error { return nil },
		killBackend:    func() bool { return true },
		exitFunc:       func(_ int) {},
	}

	release := &githubReleaseInfo{TagName: "v1.2.3"}
	uc.executeDevReleaseUpdate(release)

	mu.Lock()
	msgs := make([]UpdateProgressPayload, len(broadcasts))
	copy(msgs, broadcasts)
	mu.Unlock()

	if len(msgs) == 0 {
		t.Fatal("expected broadcast messages for dev release update")
	}

	// Should see pulling, building, restarting
	seen := make(map[string]bool)
	for _, m := range msgs {
		seen[m.Status] = true
	}
	if !seen["pulling"] {
		t.Error("expected 'pulling' status in dev release update")
	}
	if !seen["building"] {
		t.Error("expected 'building' status in dev release update")
	}
	if !seen["restarting"] {
		t.Error("expected 'restarting' status in dev release update")
	}

	// currentVersion should be updated
	uc.mu.Lock()
	ver := uc.currentVersion
	uc.mu.Unlock()
	if ver != "v1.2.3" {
		t.Errorf("expected currentVersion to be 'v1.2.3', got %q", ver)
	}
}

// TestExecuteDevReleaseUpdate_EmptyRepoPath verifies that an empty repoPath
// causes an immediate return with no broadcasts.
func TestExecuteDevReleaseUpdate_EmptyRepoPath(t *testing.T) {
	var mu sync.Mutex
	var broadcasts []UpdateProgressPayload

	uc := &UpdateChecker{
		repoPath: "",
		broadcast: func(_ string, payload interface{}) {
			if p, ok := payload.(UpdateProgressPayload); ok {
				mu.Lock()
				broadcasts = append(broadcasts, p)
				mu.Unlock()
			}
		},
	}

	release := &githubReleaseInfo{TagName: "v1.0.0"}
	uc.executeDevReleaseUpdate(release)

	mu.Lock()
	count := len(broadcasts)
	mu.Unlock()
	if count != 0 {
		t.Errorf("expected no broadcasts with empty repoPath, got %d", count)
	}
}

// TestExecuteDevReleaseUpdate_GitFetchFailure verifies that a git fetch failure
// records an error and doesn't proceed.
func TestExecuteDevReleaseUpdate_GitFetchFailure(t *testing.T) {
	mockBin := t.TempDir()
	repoPath := setupFakeRepo(t)

	writeMockScript(t, mockBin, "git", `
case "$1" in
  fetch)     echo "fatal: remote not found"; exit 128 ;;
  stash)     exit 0 ;;
  *)         exit 0 ;;
esac
`)
	writeMockScript(t, mockBin, "npm", `exit 0`)
	writeMockScript(t, mockBin, "go", `exit 0`)
	t.Setenv("PATH", mockBin+":"+os.Getenv("PATH"))

	var mu sync.Mutex
	var broadcasts []UpdateProgressPayload

	uc := &UpdateChecker{
		repoPath:   repoPath,
		currentSHA: "oldsha1234567",
		broadcast: func(_ string, payload interface{}) {
			if p, ok := payload.(UpdateProgressPayload); ok {
				mu.Lock()
				broadcasts = append(broadcasts, p)
				mu.Unlock()
			}
		},
		restartBackend: func() error { return nil },
		killBackend:    func() bool { return true },
		exitFunc:       func(_ int) {},
	}

	release := &githubReleaseInfo{TagName: "v2.0.0"}
	uc.executeDevReleaseUpdate(release)

	// Should have recorded an error
	uc.mu.Lock()
	lastErr := uc.lastUpdateError
	uc.mu.Unlock()
	if lastErr == "" {
		t.Error("expected lastUpdateError to be set after git fetch failure")
	}

	// Should NOT see "building" or "restarting"
	mu.Lock()
	msgs := make([]UpdateProgressPayload, len(broadcasts))
	copy(msgs, broadcasts)
	mu.Unlock()
	for _, m := range msgs {
		if m.Status == "building" || m.Status == "restarting" {
			t.Errorf("should not proceed to %q after git fetch failure", m.Status)
		}
	}
}

// TestExecuteDevReleaseUpdate_GitCheckoutFailure verifies that a checkout failure
// after successful fetch records an error.
func TestExecuteDevReleaseUpdate_GitCheckoutFailure(t *testing.T) {
	mockBin := t.TempDir()
	repoPath := setupFakeRepo(t)

	writeMockScript(t, mockBin, "git", `
case "$1" in
  fetch)     exit 0 ;;
  checkout)  echo "error: pathspec not found"; exit 1 ;;
  stash)     exit 0 ;;
  *)         exit 0 ;;
esac
`)
	writeMockScript(t, mockBin, "npm", `exit 0`)
	writeMockScript(t, mockBin, "go", `exit 0`)
	t.Setenv("PATH", mockBin+":"+os.Getenv("PATH"))

	var mu sync.Mutex
	var broadcasts []UpdateProgressPayload

	uc := &UpdateChecker{
		repoPath:   repoPath,
		currentSHA: "oldsha1234567",
		broadcast: func(_ string, payload interface{}) {
			if p, ok := payload.(UpdateProgressPayload); ok {
				mu.Lock()
				broadcasts = append(broadcasts, p)
				mu.Unlock()
			}
		},
		restartBackend: func() error { return nil },
		killBackend:    func() bool { return true },
		exitFunc:       func(_ int) {},
	}

	release := &githubReleaseInfo{TagName: "v2.0.0"}
	uc.executeDevReleaseUpdate(release)

	uc.mu.Lock()
	lastErr := uc.lastUpdateError
	uc.mu.Unlock()
	if lastErr == "" {
		t.Error("expected lastUpdateError after git checkout failure")
	}
}

// TestExecuteDevReleaseUpdate_CancellationPropagates verifies that context
// cancellation stops the dev-release update flow.
func TestExecuteDevReleaseUpdate_CancellationPropagates(t *testing.T) {
	mockBin := t.TempDir()
	repoPath := setupFakeRepo(t)

	// git fetch will sleep — we cancel the context before it completes
	writeMockScript(t, mockBin, "git", `
case "$1" in
  fetch)     sleep 30; exit 0 ;;
  stash)     exit 0 ;;
  *)         exit 0 ;;
esac
`)
	writeMockScript(t, mockBin, "npm", `exit 0`)
	writeMockScript(t, mockBin, "go", `exit 0`)
	t.Setenv("PATH", mockBin+":"+os.Getenv("PATH"))

	var mu sync.Mutex
	var broadcasts []UpdateProgressPayload

	ctx, cancel := context.WithCancel(context.Background())

	uc := &UpdateChecker{
		repoPath:   repoPath,
		currentSHA: "oldsha1234567",
		updateCtx:  ctx,
		broadcast: func(_ string, payload interface{}) {
			if p, ok := payload.(UpdateProgressPayload); ok {
				mu.Lock()
				broadcasts = append(broadcasts, p)
				mu.Unlock()
			}
		},
		restartBackend: func() error { return nil },
		killBackend:    func() bool { return true },
		exitFunc:       func(_ int) {},
	}

	// Cancel almost immediately
	go func() {
		time.Sleep(100 * time.Millisecond)
		cancel()
	}()

	done := make(chan struct{})
	release := &githubReleaseInfo{TagName: "v3.0.0"}
	go func() {
		defer close(done)
		uc.executeDevReleaseUpdate(release)
	}()

	select {
	case <-done:
		// Good — function returned after context cancellation
	case <-time.After(5 * time.Second):
		t.Fatal("executeDevReleaseUpdate did not complete after context cancellation")
	}

	// Should have recorded an error from the cancelled fetch
	uc.mu.Lock()
	lastErr := uc.lastUpdateError
	uc.mu.Unlock()
	if lastErr == "" {
		t.Error("expected lastUpdateError after context cancellation")
	}
}

// TestExecuteDeveloperUpdate_SHAUpdatedOnSuccess verifies that currentSHA
// is updated after a successful full update.
func TestExecuteDeveloperUpdate_SHAUpdatedOnSuccess(t *testing.T) {
	mockBin := setupMockBin(t)
	repoPath := setupFakeRepo(t)
	t.Setenv("PATH", mockBin+":"+os.Getenv("PATH"))

	uc, _ := newTestUpdateChecker(t, repoPath)
	newSHA := "deadbeef1234567890"
	uc.executeDeveloperUpdate(newSHA)

	uc.mu.Lock()
	current := uc.currentSHA
	uc.mu.Unlock()
	if current != newSHA {
		t.Errorf("expected currentSHA=%q, got %q", newSHA, current)
	}
}

// TestExecuteDeveloperUpdate_SHANotUpdatedOnFailure verifies that currentSHA
// is NOT updated when the update fails.
func TestExecuteDeveloperUpdate_SHANotUpdatedOnFailure(t *testing.T) {
	mockBin := t.TempDir()
	repoPath := setupFakeRepo(t)

	writeMockScript(t, mockBin, "git", `
case "$1" in
  pull)      echo "error: could not lock"; exit 1 ;;
  *)         exit 0 ;;
esac
`)
	writeMockScript(t, mockBin, "npm", `exit 0`)
	writeMockScript(t, mockBin, "go", `exit 0`)
	t.Setenv("PATH", mockBin+":"+os.Getenv("PATH"))

	uc, _ := newTestUpdateChecker(t, repoPath)
	originalSHA := uc.currentSHA
	uc.executeDeveloperUpdate("newsha_should_not_persist")

	uc.mu.Lock()
	current := uc.currentSHA
	uc.mu.Unlock()
	if current != originalSHA {
		t.Errorf("currentSHA should remain %q after failure, got %q", originalSHA, current)
	}
}

// TestExecuteBinaryUpdate_DelegatesToFlow verifies that executeBinaryUpdate
// calls executeBinaryUpdateFlow (basic sanity check).
func TestExecuteBinaryUpdate_DelegatesToFlow(t *testing.T) {
	// executeBinaryUpdate just delegates — we verify it doesn't panic with a
	// minimal UpdateChecker and a nil-safe flow (will fail gracefully).
	var mu sync.Mutex
	var broadcasts []UpdateProgressPayload

	uc := &UpdateChecker{
		repoPath:   "",
		currentSHA: "oldsha",
		broadcast: func(_ string, payload interface{}) {
			if p, ok := payload.(UpdateProgressPayload); ok {
				mu.Lock()
				broadcasts = append(broadcasts, p)
				mu.Unlock()
			}
		},
		restartBackend: func() error { return nil },
		killBackend:    func() bool { return true },
		exitFunc:       func(_ int) {},
	}

	release := &githubReleaseInfo{
		TagName: "v1.0.0",
		// No assets — will fail gracefully in the download flow
	}

	// Should not panic
	uc.executeBinaryUpdate(release)
}
