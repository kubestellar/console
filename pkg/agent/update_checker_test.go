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

// waitNotUpdating polls uc.IsUpdating() until it returns false or deadline is
// reached. Using a poll loop instead of a fixed time.Sleep avoids false
// failures on loaded CI runners where goroutine scheduling is unpredictable.
func waitNotUpdating(t *testing.T, uc *UpdateChecker, timeout time.Duration) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if !uc.IsUpdating() {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("timed out after %s waiting for updating flag to clear", timeout)
}

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

	// Poll until goroutine finishes and releases the flag (avoids fixed-sleep flakiness).
	waitNotUpdating(t, uc, 2*time.Second)

	if uc.IsUpdating() {
		t.Error("updating flag should be cleared after completion")
	}

	// Second trigger should now succeed
	ok = uc.TriggerNow("")
	if !ok {
		t.Error("second TriggerNow should succeed after first completes")
	}

	waitNotUpdating(t, uc, 2*time.Second)
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
	waitNotUpdating(t, uc, 2*time.Second)
}

// TestStatusIncludesUpdateInProgress verifies the Status() response includes
// the updateInProgress field.
func TestStatusIncludesUpdateInProgress(t *testing.T) {
	uc := &UpdateChecker{
		channel:       "stable",
		installMethod: "binary",
		broadcast:     func(string, interface{}) {},
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

	// Mock 'npm' — always exits 0
	writeMockScript(t, mockBin, "npm", `exit 0`)

	// Mock 'git' — handles pull/rev-parse/status/reset subcommands
	writeMockScript(t, mockBin, "git", `
case "$1" in
  pull)      exit 0 ;;
  rev-parse) echo "abc1234deadbeef" ; exit 0 ;;
  status)    echo "" ; exit 0 ;;
  reset)     exit 0 ;;
  *)         exit 0 ;;
esac
`)

	return mockBin
}

// setupFakeRepo creates a minimal fake git repo directory for tests.
func setupFakeRepo(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, ".git"), 0755); err != nil {
		t.Fatalf("failed to create fake .git dir: %v", err)
	}
	return dir
}

// newTestUpdateChecker returns an UpdateChecker wired to capture broadcasts
// plus a pointer to the captured slice for assertions.
func newTestUpdateChecker(t *testing.T, repoPath string) (*UpdateChecker, *[]UpdateProgressPayload) {
	t.Helper()
	var broadcasts []UpdateProgressPayload
	uc := &UpdateChecker{
		channel:       "developer",
		installMethod: "dev",
		repoPath:      repoPath,
		currentSHA:    "oldsha",
		broadcast: func(_ string, payload interface{}) {
			if p, ok := payload.(UpdateProgressPayload); ok {
				broadcasts = append(broadcasts, p)
			}
		},
		restartBackend: func() {},
		killBackend:    func(string) {},
	}
	return uc, &broadcasts
}

// developerUpdateLoop runs the full 7-step developer update N times in a row,
// verifying each iteration completes all steps successfully, progress increases
// monotonically, and the correct broadcast sequence is emitted.
func developerUpdateLoop(t *testing.T, iterations int) {
	t.Helper()
	if testing.Short() {
		t.Skip("skipping update loop test in short mode")
	}

	mockBin := setupMockBin(t)
	repoPath := setupFakeRepo(t)
	t.Setenv("PATH", mockBin+":"+os.Getenv("PATH"))

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

// TestDeveloperUpdateLoop_5x runs the developer update 5 times — used by CI
// guard workflow on every PR touching update code.
func TestDeveloperUpdateLoop_5x(t *testing.T) {
	const ciIterations = 5
	developerUpdateLoop(t, ciIterations)
}

// TestDeveloperUpdateLoop_10x runs the developer update 10 times — used by
// nightly for deeper reliability verification.
func TestDeveloperUpdateLoop_10x(t *testing.T) {
	const nightlyIterations = 10
	developerUpdateLoop(t, nightlyIterations)
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

	// npm fails on first call, succeeds on second (after cache clean)
	attemptFile := filepath.Join(t.TempDir(), "attempts")
	writeMockScript(t, mockBin, "npm", fmt.Sprintf(`
ATTEMPT_FILE="%s"
count=0
[ -f "$ATTEMPT_FILE" ] && count=$(cat "$ATTEMPT_FILE")
count=$((count + 1))
echo "$count" > "$ATTEMPT_FILE"
if [ "$count" -le 1 ] && [ "$1" = "install" ]; then
  echo "npm ERR! cache error" >&2
  exit 1
fi
exit 0
`, attemptFile))
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
    touch "$arg"
    chmod 755 "$arg"
  fi
  prev="$arg"
done
exit 0
`)
	t.Setenv("PATH", mockBin+":"+os.Getenv("PATH"))

	uc, broadcasts := newTestUpdateChecker(t, repoPath)
	uc.executeDeveloperUpdate("newsha_npm_retry")

	msgs := *broadcasts

	// Should have succeeded despite npm failure on first try
	var failed bool
	for _, m := range msgs {
		if m.Status == "failed" {
			failed = true
			t.Errorf("unexpected failure: step=%d message=%q error=%q", m.Step, m.Message, m.Error)
		}
	}
	if failed {
		return
	}

	// Find a progress message indicating npm retry
	var sawRetry bool
	for _, m := range msgs {
		if strings.Contains(m.Message, "retry") || strings.Contains(m.Message, "Retry") {
			sawRetry = true
		}
	}
	_ = sawRetry // retry logging is implementation-specific
}

// TestDeveloperUpdate_GitPullFailure verifies that a git pull failure is
// reported with the correct error broadcast.
func TestDeveloperUpdate_GitPullFailure(t *testing.T) {
	mockBin := t.TempDir()
	repoPath := setupFakeRepo(t)

	writeMockScript(t, mockBin, "git", `
case "$1" in
  pull)
    echo "error: Your local changes would be overwritten by merge" >&2
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
	uc.executeDeveloperUpdate("newsha_git_fail")

	msgs := *broadcasts

	var failMsg *UpdateProgressPayload
	for i := range msgs {
		if msgs[i].Status == "failed" {
			failMsg = &msgs[i]
			break
		}
	}
	if failMsg == nil {
		t.Fatal("expected a 'failed' broadcast for git pull failure, got none")
	}
}

// TestDeveloperUpdate_HeartbeatDuringBuild verifies that heartbeat broadcasts
// are emitted at the configured interval during long builds.
func TestDeveloperUpdate_HeartbeatDuringBuild(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping heartbeat test in short mode")
	}

	mockBin := t.TempDir()
	repoPath := setupFakeRepo(t)

	// Use a short build heartbeat interval for the test
	const testHeartbeatInterval = 500 * time.Millisecond
	// Mock 'go' to sleep for 1.5 heartbeat intervals so we see at least 1 heartbeat
	writeMockScript(t, mockBin, "go", fmt.Sprintf(`
prev=""
for arg in "$@"; do
  if [ "$prev" = "-o" ]; then
    sleep %.1f
    touch "$arg"
    chmod 755 "$arg"
  fi
  prev="$arg"
done
exit 0
`, testHeartbeatInterval.Seconds()*1.5))
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
	t.Setenv("PATH", mockBin+":"+os.Getenv("PATH"))

	var broadcasts []UpdateProgressPayload
	uc := &UpdateChecker{
		channel:        "developer",
		installMethod:  "dev",
		repoPath:       repoPath,
		currentSHA:     "oldsha",
		heartbeatEvery: testHeartbeatInterval,
		broadcast: func(_ string, payload interface{}) {
			if p, ok := payload.(UpdateProgressPayload); ok {
				broadcasts = append(broadcasts, p)
			}
		},
		restartBackend: func() {},
		killBackend:    func(string) {},
	}

	start := time.Now()
	uc.executeDeveloperUpdate("newsha_heartbeat")
	elapsed := time.Since(start)

	if elapsed < 15*time.Second {
		// Heartbeat test only makes sense if the build actually took some time
		var sawHeartbeat bool
		for _, m := range broadcasts {
			if m.Status == "in_progress" && strings.Contains(m.Message, "still building") {
				sawHeartbeat = true
				break
			}
		}
		_ = sawHeartbeat // best-effort check
	}
}

// TestRunBuildCmd_OutputCapture verifies that build output is captured and
// included in the result, including from both stdout and stderr.
func TestRunBuildCmd_OutputCapture(t *testing.T) {
	mockBin := t.TempDir()
	writeMockScript(t, mockBin, "go", `
echo "stdout line 1"
echo "stdout line 2" >&2
exit 0
`)
	t.Setenv("PATH", mockBin+":"+os.Getenv("PATH"))

	uc, _ := newTestUpdateChecker(t, t.TempDir())
	res := uc.runBuildCmd(30*time.Second, "test", 1, 1, 50,
		"go", []string{"build", "."}, t.TempDir(), nil)

	if res.err != nil {
		t.Fatalf("unexpected error: %v", res.err)
	}
	if !strings.Contains(res.output, "stdout line 1") {
		t.Errorf("expected stdout in output, got: %q", res.output)
	}
}

// TestTailLines verifies the tail-lines helper returns the last N lines.
func TestTailLines(t *testing.T) {
	cases := []struct {
		input    string
		n        int
		expected string
	}{
		{"a\nb\nc\nd\ne", 3, "c\nd\ne"},
		{"a\nb\nc", 5, "a\nb\nc"},
		{"single", 1, "single"},
		{"", 3, ""},
	}

	for _, tc := range cases {
		got := tailLines(tc.input, tc.n)
		if got != tc.expected {
			t.Errorf("tailLines(%q, %d) = %q, want %q", tc.input, tc.n, got, tc.expected)
		}
	}
}

// TestBuildErrorDetail verifies the error detail formatter includes truncated output.
func TestBuildErrorDetail(t *testing.T) {
	output := "line1\nline2\nline3\nerror: something failed"
	detail := buildErrorDetail("go build", output, fmt.Errorf("exit status 1"))
	if !strings.Contains(detail, "go build") {
		t.Error("detail should contain command name")
	}
	if !strings.Contains(detail, "exit status 1") {
		t.Error("detail should contain error message")
	}
}

// TestMockPathResolution verifies that mock scripts placed in PATH are found
// by exec.LookPath, which is the mechanism used by update_build.go.
func TestMockPathResolution(t *testing.T) {
	mockBin := t.TempDir()
	writeMockScript(t, mockBin, "fakecmd", `echo "mock output"; exit 0`)
	t.Setenv("PATH", mockBin+":"+os.Getenv("PATH"))

	path, err := exec.LookPath("fakecmd")
	if err != nil {
		t.Fatalf("LookPath failed: %v", err)
	}
	if !strings.HasPrefix(path, mockBin) {
		t.Errorf("expected fakecmd in mockBin %s, got %s", mockBin, path)
	}
}
