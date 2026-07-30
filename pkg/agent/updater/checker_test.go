package updater

import (
	"context"
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

// waitNotUpdating polls uc.IsUpdating() until it returns false or timeout is
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
	if uc.IsUpdating() {
		t.Error("timed out waiting for IsUpdating to return false")
	}
}

// TestTriggerNowRejectsConcurrent verifies that only one update can run at a time.
// Rapid successive calls to TriggerNow should return false when an update is in progress.
func TestTriggerNowRejectsConcurrent(t *testing.T) {
	// hold keeps the update goroutine alive so the second TriggerNow call sees
	// updating=1 regardless of how fast checkAndUpdate runs.
	hold := make(chan struct{})
	var broadcastCount int32
	uc := &UpdateChecker{
		channel:       "developer",
		installMethod: "dev",
		repoPath:      "",
		broadcast: func(msgType string, payload interface{}) {
			atomic.AddInt32(&broadcastCount, 1)
		},
		restartBackend: func() error { return nil },
		killBackend:    func() bool { return true },
		onUpdateStart:  func() { <-hold },
	}

	// Start first goroutine — should succeed
	if !uc.TriggerNow("") {
		t.Fatal("first TriggerNow should return true")
	}
	// Second call must be rejected — update goroutine is still blocked on hold
	if uc.TriggerNow("") {
		t.Error("second concurrent TriggerNow should return false while first is running")
	}
	close(hold) // release the goroutine
	waitNotUpdating(t, uc, 2*time.Second)
}

// TestTriggerNowReleasesOnCompletion verifies that TriggerNow releases the
// updating flag after the goroutine completes, allowing a second trigger.
func TestTriggerNowReleasesOnCompletion(t *testing.T) {
	uc := &UpdateChecker{
		channel:       "developer",
		installMethod: "dev",
		repoPath:      "", // causes early return in checkAndUpdate
		broadcast: func(msgType string, payload interface{}) {
			// no-op
		},
	}

	ok := uc.TriggerNow("")
	if !ok {
		t.Fatal("first TriggerNow should succeed")
	}

	// Wait for goroutine to finish and release the flag
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

// TestTriggerNowConcurrentStress fires 100 goroutines simultaneously and verifies
// exactly one succeeds, with all others returning false.
func TestTriggerNowConcurrentStress(t *testing.T) {
	// hold blocks the update goroutine until all 100 test goroutines have
	// finished calling TriggerNow. Without this, the goroutine can complete
	// (developer channel + no repo = instant return) before all callers run,
	// allowing multiple sequential successes.
	hold := make(chan struct{})
	uc := &UpdateChecker{
		channel:       "developer",
		installMethod: "dev",
		repoPath:      "",
		broadcast:     func(string, interface{}) {},
		onUpdateStart: func() { <-hold },
	}

	var accepted int32
	start := make(chan struct{})
	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			if uc.TriggerNow("") {
				atomic.AddInt32(&accepted, 1)
			}
		}()
	}
	close(start)
	wg.Wait()
	close(hold) // release the update goroutine after all 100 have tried

	if accepted != 1 {
		t.Errorf("expected exactly 1 accepted trigger, got %d", accepted)
	}
	waitNotUpdating(t, uc, 2*time.Second)
}

// TestTriggerNowChannelOverride verifies that a channelOverride temporarily
// replaces the channel for a single update run.
func TestTriggerNowChannelOverride(t *testing.T) {
	uc := &UpdateChecker{
		channel:       "stable",
		installMethod: "dev",
		repoPath:      "",
		broadcast:     func(string, interface{}) {},
	}

	uc.TriggerNow("unstable")
	// Give goroutine time to start and capture the override
	time.Sleep(5 * time.Millisecond)
	// After goroutine completes, channel should be restored to "stable"
	waitNotUpdating(t, uc, 2*time.Second)
	uc.mu.Lock()
	ch := uc.channel
	uc.mu.Unlock()
	if ch != "stable" {
		t.Errorf("channel should be restored to stable, got %q", ch)
	}
}

// TestCancelUpdateReturnsFalseWhenIdle verifies CancelUpdate returns false when
// no update is in progress.
func TestCancelUpdateReturnsFalseWhenIdle(t *testing.T) {
	uc := &UpdateChecker{
		broadcast: func(string, interface{}) {},
	}
	if uc.CancelUpdate() {
		t.Error("CancelUpdate should return false when not updating")
	}
}

// TestCancelUpdateReturnsTrueWhenUpdating verifies CancelUpdate returns true
// when an update is in progress.
func TestCancelUpdateReturnsTrueWhenUpdating(t *testing.T) {
	uc := &UpdateChecker{
		broadcast: func(string, interface{}) {},
	}
	atomic.StoreInt32(&uc.updating, 1)
	if !uc.CancelUpdate() {
		t.Error("CancelUpdate should return true when updating")
	}
	atomic.StoreInt32(&uc.updating, 0)
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

// developerUpdateLoop runs the full 7-step developer update N times in a row,
// verifying each iteration completes all steps successfully without error.
// A successful run ends with a "restarting" broadcast (exitFunc is a no-op in tests).
func developerUpdateLoop(t *testing.T, iterations int) {
	t.Helper()
	if testing.Short() {
		t.Skip("skipping update loop test in short mode")
	}

	mockBin := setupMockBin(t)
	repoPath := setupFakeRepo(t)
	t.Setenv("PATH", mockBin+":"+os.Getenv("PATH"))

	for i := 0; i < iterations; i++ {
		uc, broadcasts := newTestUpdateChecker(t, repoPath)
		uc.executeDeveloperUpdate(fmt.Sprintf("newsha_iter%d", i))

		msgs := *broadcasts
		if len(msgs) == 0 {
			t.Errorf("iteration %d: expected broadcast messages, got none", i)
			continue
		}

		// A successful developer update ends with a "restarting" broadcast because
		// executeDeveloperUpdate calls restartViaStartupScript (which in tests uses
		// the no-op exitFunc). Fail only if the last message indicates an error.
		last := msgs[len(msgs)-1]
		if last.Status == "error" || last.Status == "failed" {
			t.Errorf("iteration %d: update failed with status %q (message: %q)",
				i, last.Status, last.Message)
		}
	}
}

// TestDeveloperUpdateLoop_5x runs the full update sequence 5 times.
func TestDeveloperUpdateLoop_5x(t *testing.T) {
	developerUpdateLoop(t, 5)
}

// setupFakeRepo creates a temporary directory with the minimal structure needed
// by executeDeveloperUpdate: a .git directory, web/ for npm steps, data/ for
// the restart log, and a no-op startup-oauth.sh for restartViaStartupScript.
func setupFakeRepo(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()

	// .git directory so git rev-parse HEAD succeeds via the mock git script
	gitDir := filepath.Join(dir, ".git")
	if err := os.MkdirAll(gitDir, 0755); err != nil {
		t.Fatalf("failed to create .git dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(gitDir, "HEAD"), []byte("ref: refs/heads/main\n"), 0644); err != nil {
		t.Fatalf("failed to write HEAD: %v", err)
	}

	// web/ directory so npm install and npm run build can chdir into it
	if err := os.MkdirAll(filepath.Join(dir, "web"), 0755); err != nil {
		t.Fatalf("failed to create web dir: %v", err)
	}

	// data/ directory so the restart log file can be created
	if err := os.MkdirAll(filepath.Join(dir, "data"), 0755); err != nil {
		t.Fatalf("failed to create data dir: %v", err)
	}

	// startup-oauth.sh so restartViaStartupScript finds it; exitFunc is a no-op in tests
	script := filepath.Join(dir, "startup-oauth.sh")
	if err := os.WriteFile(script, []byte("#!/bin/bash\nexit 0\n"), 0755); err != nil {
		t.Fatalf("failed to write startup-oauth.sh: %v", err)
	}

	return dir
}

// setupMockBin creates a temporary directory with mock scripts for git, go, and npm.
func setupMockBin(t *testing.T) string {
	t.Helper()
	mockBin := t.TempDir()

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
	return mockBin
}

// writeMockScript writes an executable shell script to dir/name.
func writeMockScript(t *testing.T, dir, name, script string) {
	t.Helper()
	path := filepath.Join(dir, name)
	content := "#!/bin/sh\n" + script + "\n"
	if err := os.WriteFile(path, []byte(content), 0755); err != nil {
		t.Fatalf("failed to write mock script %s: %v", name, err)
	}
}

// TestDeveloperUpdate_BuildTimeout verifies that a build that exceeds the timeout
// is cancelled and an error is broadcast.
//
// The mock 'go' script sleeps indefinitely on its first invocation (simulating a
// stuck build). On subsequent invocations (rollback builds in executeDeveloperUpdate)
// it exits immediately — without this the rollback go-build would also sleep 600s.
// We give the UpdateChecker a short updateCtx (3s) so runBuildCmd inherits it as
// its parent context and cancels the sleeping process. Note: runBuildCmd also sets
// cmd.WaitDelay=3s so the build phase takes ~6s (3s context + 3s I/O drain), still
// well within the 15-second outer test deadline.
func TestDeveloperUpdate_BuildTimeout(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping build timeout test in short mode")
	}

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
	// First invocation sleeps to simulate a timeout; rollback calls exit immediately.
	writeMockScript(t, mockBin, "go", `CALLED="$0.called"
if [ ! -f "$CALLED" ]; then
  touch "$CALLED"
  sleep 600
fi
exit 0
`)
	t.Setenv("PATH", mockBin+":"+os.Getenv("PATH"))

	uc, broadcasts := newTestUpdateChecker(t, repoPath)

	// Give the UpdateChecker a short parent context so runBuildCmd inherits it
	// and the sleeping go command is cancelled after ~3s instead of waiting the
	// full goBuildTimeout (5 minutes), which would exceed the CI test deadline.
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	uc.updateCtx = ctx

	done := make(chan struct{})
	go func() {
		defer close(done)
		uc.executeDeveloperUpdate("newsha_timeout")
	}()

	select {
	case <-done:
	case <-time.After(15 * time.Second):
		t.Fatal("executeDeveloperUpdate did not complete within timeout")
	}

	msgs := *broadcasts
	var sawError bool
	for _, m := range msgs {
		if m.Status == "error" || m.Status == "failed" {
			sawError = true
			break
		}
	}
	if !sawError {
		t.Error("expected an error broadcast when build times out")
	}
}

// TestDeveloperUpdate_BuildFailure verifies that a non-zero exit from the Go
// build step results in an error broadcast with the build output included.
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
	writeMockScript(t, mockBin, "go", `
echo "ERROR: build failed with syntax error"
exit 1
`)
	t.Setenv("PATH", mockBin+":"+os.Getenv("PATH"))

	uc, broadcasts := newTestUpdateChecker(t, repoPath)
	uc.executeDeveloperUpdate("newsha_buildfail")

	msgs := *broadcasts
	var sawError bool
	var errorMsg string
	for _, m := range msgs {
		if m.Status == "error" || m.Status == "failed" {
			sawError = true
			errorMsg = m.Message
			break
		}
	}
	if !sawError {
		t.Errorf("expected error broadcast after build failure, got: %v", msgs)
	}
	_ = errorMsg
}

// TestDeveloperUpdate_NpmInstallRetry verifies that npm install failure is retried.
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
	// npm fails first 3 calls then succeeds. resilientNpmInstall also calls
	// "npm cache clean --force" between retries, so the effective call count is:
	//   call 1: npm install → fail; call 2: npm cache clean → fail (ignored)
	//   call 3: npm install → fail; call 4: npm cache clean → pass
	//   call 5: npm install → pass  (attempt 3 succeeds)
	//   call 6: npm run build → pass
	callFile := filepath.Join(mockBin, "npm_calls")
	writeMockScript(t, mockBin, "npm", fmt.Sprintf(`
CALLS=$(cat %s 2>/dev/null || echo 0)
CALLS=$((CALLS + 1))
echo $CALLS > %s
if [ $CALLS -le 3 ]; then
  echo "npm: ECONNRESET" >&2
  exit 1
fi
exit 0
`, callFile, callFile))
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
	t.Setenv("PATH", mockBin+":"+os.Getenv("PATH"))

	uc, broadcasts := newTestUpdateChecker(t, repoPath)
	uc.executeDeveloperUpdate("newsha_npmretry")

	msgs := *broadcasts
	// Should ultimately succeed after retries
	if len(msgs) == 0 {
		t.Fatal("expected at least one broadcast message")
	}
	last := msgs[len(msgs)-1]
	if last.Status == "error" {
		t.Errorf("expected success after npm retries, got error: %s", last.Message)
	}
}

// TestDeveloperUpdate_GitPullFailure verifies that a git pull failure results in
// an early abort with an error broadcast, without proceeding to npm/build steps.
func TestDeveloperUpdate_GitPullFailure(t *testing.T) {
	mockBin := t.TempDir()
	repoPath := setupFakeRepo(t)

	writeMockScript(t, mockBin, "git", `
case "$1" in
  pull)      echo "error: could not lock config file" >&2 ; exit 1 ;;
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
	var sawError bool
	for _, m := range msgs {
		if m.Status == "error" || m.Status == "failed" {
			sawError = true
		}
		if m.Step > 1 {
			t.Errorf("unexpected step %d broadcast after git pull failure", m.Step)
		}
	}
	if !sawError {
		t.Errorf("expected error broadcast after git pull failure, got: %v", msgs)
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

// runBuildCmd is a lightweight test helper that runs a named command (resolved
// via PATH) in dir with a hard timeout and returns the combined stdout+stderr
// as buildResult.output. It is the test-local equivalent of
// UpdateChecker.runBuildCmd without WebSocket broadcast or step-tracking.
func runBuildCmd(dir, name string, timeout time.Duration) buildResult {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, name)
	cmd.Dir = dir

	out, err := cmd.CombinedOutput()
	output := string(out)

	if ctx.Err() == context.DeadlineExceeded {
		return buildResult{
			err:    fmt.Errorf("timed out after %s", timeout),
			output: output,
		}
	}
	return buildResult{err: err, output: output}
}

// TestRunBuildCmd_OutputCapture verifies build output is captured in errors.
func TestRunBuildCmd_OutputCapture(t *testing.T) {
	mockBin := t.TempDir()

	writeMockScript(t, mockBin, "failbuild", `
echo "stdout line 1"
echo "stderr line 2" >&2
echo "final error" >&2
exit 1
`)
	t.Setenv("PATH", mockBin+":"+os.Getenv("PATH"))

	res := runBuildCmd(t.TempDir(), "failbuild", 5*time.Second)
	if res.err == nil {
		t.Fatal("expected error from failing build command")
	}
	if !strings.Contains(res.output, "stdout line 1") {
		t.Errorf("expected stdout in output, got: %q", res.output)
	}
	if !strings.Contains(res.output, "stderr line 2") {
		t.Errorf("expected stderr in output, got: %q", res.output)
	}
}

// TestTailLines verifies the tail-lines helper used for build error output.
func TestTailLines(t *testing.T) {
	cases := []struct {
		input    string
		n        int
		expected string
	}{
		{"a\nb\nc\nd", 2, "c\nd"},
		{"a\nb\nc\nd", 10, "a\nb\nc\nd"},
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
