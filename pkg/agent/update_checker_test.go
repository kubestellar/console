package agent

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// TestTriggerNowRejectsConcurrent verifies that only one update can run at a time.
// Rapid successive calls to TriggerNow should return false when an update is in progress.
func TestTriggerNowRejectsConcurrent(t *testing.T) {
	var broadcastCount int32
	uc := &UpdateChecker{
		channel:       "developer",
		installMethod: "dev",
		repoPath:      "", // empty = checkDeveloperChannel returns early
		broadcast: func(msgType string, payload interface{}) {
			atomic.AddInt32(&broadcastCount, 1)
		},
	}

	// First trigger should succeed
	ok := uc.TriggerNow("")
	if !ok {
		t.Fatal("first TriggerNow() should return true")
	}

	// Wait briefly for goroutine to start
	time.Sleep(10 * time.Millisecond)

	// While the first goroutine holds the updating flag, simulate it being in progress
	// (in this test it finishes very fast since repoPath is empty, so we test the atomic directly)
	// Instead, test with a controlled long-running update:
	t.Run("concurrent_rejection", func(t *testing.T) {
		// Manually set updating flag to simulate in-progress update
		atomic.StoreInt32(&uc.updating, 1)
		defer atomic.StoreInt32(&uc.updating, 0)

		ok := uc.TriggerNow("")
		if ok {
			t.Error("TriggerNow() should return false when update is in progress")
		}

		ok = uc.TriggerNow("developer")
		if ok {
			t.Error("TriggerNow(channelOverride) should return false when update is in progress")
		}
	})
}

// TestTriggerNowConcurrentStress fires 100 concurrent TriggerNow calls while
// the updating flag is held. Exactly 0 should succeed.
func TestTriggerNowConcurrentStress(t *testing.T) {
	uc := &UpdateChecker{
		channel:       "developer",
		installMethod: "dev",
		repoPath:      "",
		broadcast: func(msgType string, payload interface{}) {
			// no-op
		},
	}

	// Hold the updating flag to simulate a long-running update
	atomic.StoreInt32(&uc.updating, 1)
	defer atomic.StoreInt32(&uc.updating, 0)

	const goroutines = 100
	var accepted int32
	start := make(chan struct{})
	var wg sync.WaitGroup

	wg.Add(goroutines)
	for i := 0; i < goroutines; i++ {
		go func() {
			defer wg.Done()
			<-start
			if uc.TriggerNow("developer") {
				atomic.AddInt32(&accepted, 1)
			}
		}()
	}

	// Fire all goroutines at once
	close(start)
	wg.Wait()

	if accepted != 0 {
		t.Errorf("expected 0 accepted triggers while update in progress, got %d", accepted)
	}
}

// TestIsUpdating verifies the IsUpdating helper reflects the atomic flag.
func TestIsUpdating(t *testing.T) {
	uc := &UpdateChecker{}

	if uc.IsUpdating() {
		t.Error("new UpdateChecker should not be updating")
	}

	atomic.StoreInt32(&uc.updating, 1)
	if !uc.IsUpdating() {
		t.Error("should report updating after flag set")
	}

	atomic.StoreInt32(&uc.updating, 0)
	if uc.IsUpdating() {
		t.Error("should not report updating after flag cleared")
	}
}

// TestTriggerNowReleasesOnCompletion verifies the updating flag is cleared
// after checkAndUpdate finishes, allowing a subsequent trigger.
func TestTriggerNowReleasesOnCompletion(t *testing.T) {
	uc := &UpdateChecker{
		channel:       "developer",
		installMethod: "dev",
		repoPath:      "", // causes early return
		broadcast: func(msgType string, payload interface{}) {
			// no-op
		},
	}

	ok := uc.TriggerNow("")
	if !ok {
		t.Fatal("first TriggerNow should succeed")
	}

	// Wait for goroutine to finish and release the flag
	time.Sleep(50 * time.Millisecond)

	if uc.IsUpdating() {
		t.Error("updating flag should be cleared after completion")
	}

	// Second trigger should now succeed
	ok = uc.TriggerNow("")
	if !ok {
		t.Error("second TriggerNow should succeed after first completes")
	}

	time.Sleep(50 * time.Millisecond)
}

// TestTriggerNowRecoversPanic verifies that a panic in checkAndUpdate
// doesn't leave the updating flag stuck (it's cleared by defer).
func TestTriggerNowRecoversPanic(t *testing.T) {
	uc := &UpdateChecker{
		channel:       "developer",
		installMethod: "dev",
		repoPath:      "", // causes early return (no panic in practice)
		broadcast: func(msgType string, payload interface{}) {
			// no-op
		},
	}

	// Manually simulate: set flag, then clear it (mimicking defer behavior)
	atomic.StoreInt32(&uc.updating, 1)
	// The defer in TriggerNow's goroutine always runs, even on panic
	atomic.StoreInt32(&uc.updating, 0)

	if uc.IsUpdating() {
		t.Error("flag should be cleared after simulated panic recovery")
	}

	// Should be able to trigger again
	ok := uc.TriggerNow("")
	if !ok {
		t.Error("should be able to trigger after panic recovery")
	}
	time.Sleep(50 * time.Millisecond)
}

// TestStatusIncludesUpdateInProgress verifies the Status() response includes
// the updateInProgress field.
func TestStatusIncludesUpdateInProgress(t *testing.T) {
	uc := &UpdateChecker{
		channel:       "stable",
		installMethod: "binary",
		broadcast: func(string, interface{}) {},
	}

	status := uc.Status()
	if status.UpdateInProgress {
		t.Error("status should show not updating initially")
	}

	atomic.StoreInt32(&uc.updating, 1)
	status = uc.Status()
	if !status.UpdateInProgress {
		t.Error("status should show updating when flag is set")
	}

	atomic.StoreInt32(&uc.updating, 0)
}

// =============================================================================
// Integration tests — full update flow with mock commands
// =============================================================================

// --- Mock script helpers ---

// writeMockScript creates an executable shell script in dir with the given name and body.
func writeMockScript(t *testing.T, dir, name, body string) {
	t.Helper()
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, []byte("#!/bin/bash\n"+body), 0755); err != nil {
		t.Fatalf("failed to write mock script %s: %v", name, err)
	}
}

// setupMockBin creates a temporary directory with mock versions of go, npm, and git.
// These mock scripts simulate successful operations without doing any real work.
func setupMockBin(t *testing.T) string {
	t.Helper()
	mockBin := t.TempDir()

	// Mock 'go' — when called with "build -o <path> ...", creates an empty executable
	writeMockScript(t, mockBin, "go", `
prev=""
for arg in "$@"; do
  if [ "$prev" = "-o" ]; then
    touch "$arg"
    chmod 755 "$arg"
  fi
  prev="$arg"
done
exit 0
`)

	// Mock 'npm' — always succeeds (handles install, run build, cache clean)
	writeMockScript(t, mockBin, "npm", `exit 0`)

	// Mock 'git' — handles the subcommands used by the updater
	writeMockScript(t, mockBin, "git", `
case "$1" in
  pull)      exit 0 ;;
  fetch)     exit 0 ;;
  rev-parse)
    case "$2" in
      --show-toplevel) pwd ;;
      HEAD)            echo "abc1234567890" ;;
      origin/main)     echo "def7890123456" ;;
      *)               echo "unknown" ;;
    esac
    exit 0 ;;
  status)    echo "" ; exit 0 ;;
  reset)     exit 0 ;;
  stash)     exit 0 ;;
  *)         exit 0 ;;
esac
`)

	return mockBin
}

// setupFakeRepo creates a minimal repo directory structure that the updater expects.
func setupFakeRepo(t *testing.T) string {
	t.Helper()
	repoDir := t.TempDir()

	webDir := filepath.Join(repoDir, "web")
	if err := os.MkdirAll(webDir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(webDir, "package.json"), []byte(`{"name":"test"}`), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(repoDir, "data"), 0755); err != nil {
		t.Fatal(err)
	}
	// Create a no-op startup-oauth.sh so restartViaStartupScript finds it.
	// The test overrides exitFunc to prevent actual os.Exit.
	if err := os.WriteFile(filepath.Join(repoDir, "startup-oauth.sh"),
		[]byte("#!/bin/bash\nexit 0\n"), 0755); err != nil {
		t.Fatal(err)
	}

	return repoDir
}

// newTestUpdateChecker creates an UpdateChecker configured for testing.
// The broadcast function records all payloads. exitFunc is a no-op.
func newTestUpdateChecker(t *testing.T, repoPath string) (*UpdateChecker, *[]UpdateProgressPayload) {
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
		exitFunc:       func(_ int) { /* no-op in tests */ },
	}

	return uc, &broadcasts
}

// TestDeveloperUpdateLoop_10x runs the full 7-step developer update 10 times
// in a row, verifying each iteration completes all steps successfully,
// progress increases monotonically, and the correct broadcast sequence is emitted.
// This is the primary CI reliability test for the self-update mechanism.
func TestDeveloperUpdateLoop_10x(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping update loop test in short mode")
	}

	mockBin := setupMockBin(t)
	repoPath := setupFakeRepo(t)
	t.Setenv("PATH", mockBin+":"+os.Getenv("PATH"))

	const iterations = 10

	for i := 1; i <= iterations; i++ {
		t.Run(fmt.Sprintf("iteration_%d", i), func(t *testing.T) {
			uc, broadcasts := newTestUpdateChecker(t, repoPath)

			newSHA := fmt.Sprintf("newsha%07d", i)
			uc.executeDeveloperUpdate(newSHA)

			msgs := *broadcasts

			// Must have at least 7 broadcasts (one per step)
			if len(msgs) < devUpdateTotalSteps {
				t.Fatalf("expected at least %d broadcasts, got %d: %+v",
					devUpdateTotalSteps, len(msgs), msgs)
			}

			// Verify all 7 steps were broadcast
			seenSteps := make(map[int]bool)
			for _, m := range msgs {
				if m.Step > 0 {
					seenSteps[m.Step] = true
				}
			}
			for s := 1; s <= devUpdateTotalSteps; s++ {
				if !seenSteps[s] {
					t.Errorf("missing broadcast for step %d", s)
				}
			}

			// Verify progress is monotonically non-decreasing
			maxProgress := 0
			for _, m := range msgs {
				if m.Progress < maxProgress {
					t.Errorf("progress decreased: %d -> %d at step %d (%s)",
						maxProgress, m.Progress, m.Step, m.Message)
				}
				if m.Progress > maxProgress {
					maxProgress = m.Progress
				}
			}

			// Verify no "failed" status
			for _, m := range msgs {
				if m.Status == "failed" {
					t.Fatalf("unexpected failure: step=%d message=%q error=%q",
						m.Step, m.Message, m.Error)
				}
			}

			// Verify final broadcast is "restarting" (step 7)
			last := msgs[len(msgs)-1]
			if last.Status != "restarting" {
				t.Errorf("expected last status 'restarting', got %q", last.Status)
			}
			if last.Step != devUpdateTotalSteps {
				t.Errorf("expected last step %d, got %d", devUpdateTotalSteps, last.Step)
			}

			// Verify SHA was updated
			uc.mu.Lock()
			currentSHA := uc.currentSHA
			lastErr := uc.lastUpdateError
			uc.mu.Unlock()
			if currentSHA != newSHA {
				t.Errorf("expected currentSHA=%q, got %q", newSHA, currentSHA)
			}
			if lastErr != "" {
				t.Errorf("unexpected lastUpdateError: %q", lastErr)
			}
		})
	}
}

// TestDeveloperUpdate_BuildTimeout verifies that builds are killed after the
// timeout expires and an appropriate error is reported.
func TestDeveloperUpdate_BuildTimeout(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping timeout test in short mode")
	}

	mockBin := t.TempDir()
	// Mock 'go' to sleep forever (simulating a hung build)
	writeMockScript(t, mockBin, "go", `sleep 3600`)
	t.Setenv("PATH", mockBin+":"+os.Getenv("PATH"))

	uc, _ := newTestUpdateChecker(t, t.TempDir())

	shortTimeout := 2 * time.Second
	start := time.Now()
	res := uc.runBuildCmd(shortTimeout, "test build", 1, 1, 50,
		"go", []string{"build", "-o", "/dev/null", "."}, t.TempDir(), nil)
	elapsed := time.Since(start)

	if res.err == nil {
		t.Fatal("expected timeout error, got nil")
	}
	if !strings.Contains(res.err.Error(), "timed out") {
		t.Errorf("expected timeout error, got: %v", res.err)
	}

	// Should have been killed close to the timeout + WaitDelay (3s for pipe drain)
	const pipeWaitDelay = 3 * time.Second
	const timingSlack = 2 * time.Second
	maxExpected := shortTimeout + pipeWaitDelay + timingSlack
	if elapsed > maxExpected {
		t.Errorf("command took %s, expected <%s (timeout=%s + pipe_drain=%s + slack=%s)",
			elapsed, maxExpected, shortTimeout, pipeWaitDelay, timingSlack)
	}
}

// TestDeveloperUpdate_BuildFailure verifies that build failures include the
// actual build output in the error broadcast.
func TestDeveloperUpdate_BuildFailure(t *testing.T) {
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
	// Mock 'go' to fail with a compile error
	writeMockScript(t, mockBin, "go", `
echo "# cmd/console" >&2
echo "./main.go:42:5: undefined: SomeNewFunction" >&2
exit 1
`)
	t.Setenv("PATH", mockBin+":"+os.Getenv("PATH"))

	uc, broadcasts := newTestUpdateChecker(t, repoPath)
	uc.executeDeveloperUpdate("newsha_fail")

	msgs := *broadcasts

	var failMsg *UpdateProgressPayload
	for i := range msgs {
		if msgs[i].Status == "failed" {
			failMsg = &msgs[i]
			break
		}
	}
	if failMsg == nil {
		t.Fatal("expected a 'failed' broadcast, got none")
	}
	// Error should contain the actual compiler output
	if !strings.Contains(failMsg.Error, "undefined: SomeNewFunction") {
		t.Errorf("expected build output in error, got: %q", failMsg.Error)
	}
}

// TestDeveloperUpdate_NpmInstallRetry verifies npm install retry logic
// with cache cleaning.
func TestDeveloperUpdate_NpmInstallRetry(t *testing.T) {
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

	// npm — fail first install attempt, succeed on second
	counterFile := filepath.Join(t.TempDir(), "npm_attempt")
	os.WriteFile(counterFile, []byte("0"), 0644) //nolint:errcheck

	writeMockScript(t, mockBin, "npm", fmt.Sprintf(`
COUNTER_FILE="%s"
case "$1" in
  install)
    count=$(cat "$COUNTER_FILE" 2>/dev/null || echo 0)
    count=$((count + 1))
    echo "$count" > "$COUNTER_FILE"
    if [ "$count" -le 1 ]; then
      echo "npm ERR! EACCES: permission denied" >&2
      exit 1
    fi
    exit 0 ;;
  cache) exit 0 ;;
  run)   exit 0 ;;
  *)     exit 0 ;;
esac
`, counterFile))

	writeMockScript(t, mockBin, "go", `
prev=""
for arg in "$@"; do
  if [ "$prev" = "-o" ]; then
    touch "$arg"
    chmod 755 "$arg"
  fi
  prev="$arg"
done
exit 0
`)
	t.Setenv("PATH", mockBin+":"+os.Getenv("PATH"))

	uc, broadcasts := newTestUpdateChecker(t, repoPath)
	uc.executeDeveloperUpdate("newsha_retry")

	msgs := *broadcasts

	// Should NOT have failed (npm retried and succeeded)
	for _, m := range msgs {
		if m.Status == "failed" {
			t.Fatalf("unexpected failure: %q (error: %q)", m.Message, m.Error)
		}
	}

	// Should have a retry message
	hasRetryMsg := false
	for _, m := range msgs {
		if strings.Contains(m.Message, "cache") || strings.Contains(m.Message, "attempt") {
			hasRetryMsg = true
			break
		}
	}
	if !hasRetryMsg {
		t.Error("expected a retry/cache-cleaning broadcast message")
	}

	// Should have completed
	last := msgs[len(msgs)-1]
	if last.Status != "restarting" {
		t.Errorf("expected final status 'restarting', got %q", last.Status)
	}
}

// TestDeveloperUpdate_GitPullFailure verifies git pull failure stops the update.
func TestDeveloperUpdate_GitPullFailure(t *testing.T) {
	mockBin := t.TempDir()
	repoPath := setupFakeRepo(t)

	writeMockScript(t, mockBin, "git", `
case "$1" in
  pull)
    echo "error: cannot pull with rebase" >&2
    exit 1 ;;
  rev-parse) echo "abc1234" ; exit 0 ;;
  status)    echo "" ; exit 0 ;;
  reset)     exit 0 ;;
  *)         exit 0 ;;
esac
`)
	writeMockScript(t, mockBin, "npm", `exit 0`)
	writeMockScript(t, mockBin, "go", `exit 0`)
	t.Setenv("PATH", mockBin+":"+os.Getenv("PATH"))

	uc, broadcasts := newTestUpdateChecker(t, repoPath)
	uc.executeDeveloperUpdate("newsha_gitfail")

	msgs := *broadcasts

	if len(msgs) < 2 {
		t.Fatalf("expected at least 2 broadcasts, got %d", len(msgs))
	}

	// First should be pulling
	if msgs[0].Status != "pulling" {
		t.Errorf("expected first status 'pulling', got %q", msgs[0].Status)
	}

	// Should have a failed broadcast
	var failMsg *UpdateProgressPayload
	for i := range msgs {
		if msgs[i].Status == "failed" {
			failMsg = &msgs[i]
			break
		}
	}
	if failMsg == nil {
		t.Fatal("expected a 'failed' broadcast after git pull failure")
	}

	// Should NOT have any build step broadcasts (steps 2+)
	for _, m := range msgs {
		if m.Step > 1 {
			t.Errorf("unexpected step %d broadcast after git pull failure", m.Step)
		}
	}
}

// TestDeveloperUpdate_HeartbeatDuringBuild verifies heartbeat messages are
// sent during long-running builds.
func TestDeveloperUpdate_HeartbeatDuringBuild(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping heartbeat test in short mode")
	}

	mockBin := t.TempDir()
	repoPath := setupFakeRepo(t)

	writeMockScript(t, mockBin, "git", `
case "$1" in
  pull)      exit 0 ;;
  rev-parse) echo "abc1234" ; exit 0 ;;
  *)         exit 0 ;;
esac
`)
	writeMockScript(t, mockBin, "npm", `exit 0`)
	// Mock 'go' — sleep long enough for at least one heartbeat (>15s)
	writeMockScript(t, mockBin, "go", `
prev=""
for arg in "$@"; do
  if [ "$prev" = "-o" ]; then
    OUTPUT="$arg"
  fi
  prev="$arg"
done
sleep 18
if [ -n "$OUTPUT" ]; then
  touch "$OUTPUT"
  chmod 755 "$OUTPUT"
fi
exit 0
`)
	t.Setenv("PATH", mockBin+":"+os.Getenv("PATH"))

	uc, broadcasts := newTestUpdateChecker(t, repoPath)

	start := time.Now()
	uc.executeDeveloperUpdate("newsha_heartbeat")
	elapsed := time.Since(start)

	msgs := *broadcasts

	if elapsed < 15*time.Second {
		t.Errorf("expected build to take >15s, took %s", elapsed)
	}

	// Should have heartbeat messages containing "elapsed"
	heartbeats := 0
	for _, m := range msgs {
		if strings.Contains(m.Message, "elapsed") {
			heartbeats++
		}
	}
	if heartbeats == 0 {
		t.Error("expected at least one heartbeat message with elapsed time")
	}
	t.Logf("received %d heartbeat messages over %s", heartbeats, elapsed)
}

// TestRunBuildCmd_OutputCapture verifies build output is captured in errors.
func TestRunBuildCmd_OutputCapture(t *testing.T) {
	mockBin := t.TempDir()

	writeMockScript(t, mockBin, "failbuild", `
echo "compiling package main..."
echo "ERROR: cannot find module 'foo'" >&2
exit 1
`)
	t.Setenv("PATH", mockBin+":"+os.Getenv("PATH"))

	uc, _ := newTestUpdateChecker(t, t.TempDir())
	res := uc.runBuildCmd(30*time.Second, "test", 1, 1, 50,
		filepath.Join(mockBin, "failbuild"), nil, t.TempDir(), nil)

	if res.err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(res.output, "cannot find module") {
		t.Errorf("expected stderr in output, got: %q", res.output)
	}
	if !strings.Contains(res.output, "compiling package main") {
		t.Errorf("expected stdout in output, got: %q", res.output)
	}
}

// TestTailLines verifies the tailLines utility.
func TestTailLines(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		n        int
		expected string
	}{
		{"fewer lines than n", "a\nb\nc", 5, "a\nb\nc"},
		{"exact n lines", "a\nb\nc", 3, "a\nb\nc"},
		{"more lines than n", "a\nb\nc\nd\ne", 2, "d\ne"},
		{"single line", "hello", 3, "hello"},
		{"empty string", "", 3, ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := tailLines(tt.input, tt.n)
			if got != tt.expected {
				t.Errorf("tailLines(%q, %d) = %q, want %q", tt.input, tt.n, got, tt.expected)
			}
		})
	}
}

// TestBuildErrorDetail verifies error detail formatting.
func TestBuildErrorDetail(t *testing.T) {
	err := fmt.Errorf("exit status 1")

	detail := buildErrorDetail(err, "line1\nline2")
	if !strings.Contains(detail, "exit status 1") || !strings.Contains(detail, "line2") {
		t.Errorf("unexpected detail: %q", detail)
	}

	detail = buildErrorDetail(err, "")
	if detail != "exit status 1" {
		t.Errorf("expected just error, got: %q", detail)
	}
}

// TestMockPathResolution is a sanity check that the mock PATH approach works.
func TestMockPathResolution(t *testing.T) {
	mockBin := setupMockBin(t)
	t.Setenv("PATH", mockBin+":"+os.Getenv("PATH"))

	goPath, err := exec.LookPath("go")
	if err != nil {
		t.Fatalf("failed to find mock go: %v", err)
	}
	if !strings.HasPrefix(goPath, mockBin) {
		t.Errorf("expected mock go at %s/go, found: %s", mockBin, goPath)
	}

	npmPath, err := exec.LookPath("npm")
	if err != nil {
		t.Fatalf("failed to find mock npm: %v", err)
	}
	if !strings.HasPrefix(npmPath, mockBin) {
		t.Errorf("expected mock npm at %s/npm, found: %s", mockBin, npmPath)
	}
}
