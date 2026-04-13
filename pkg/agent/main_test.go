package agent

import (
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"testing"
	"time"
)

// hardTestTimeout is a process-level safety net. If go test's own -timeout
// flag is not passed (e.g. an ad-hoc `go test ./pkg/agent/...` from a CLI
// session), this TestMain ensures the entire test binary exits after 5
// minutes rather than leaking zombie agent.test processes that spawn
// kubectl and Python subprocesses indefinitely.
//
// Context: on 2026-04-13, five leaked agent.test process trees accumulated
// 4,370 child processes, exhausting the macOS process table and blocking
// all fork() calls system-wide.
const hardTestTimeout = 5 * time.Minute

func TestMain(m *testing.M) {
	// Kill the entire process group (not just this process) so any
	// subprocess trees (kubectl, kc-agent, Python) are also reaped.
	// On Unix, setting the process group to our PID lets us kill -PGID.
	done := make(chan struct{})
	go func() {
		select {
		case <-time.After(hardTestTimeout):
			fmt.Fprintf(os.Stderr, "\n[TestMain] HARD TIMEOUT: agent tests exceeded %s — killing process group to prevent zombie leak\n", hardTestTimeout)
			// Kill our process group
			syscall.Kill(-syscall.Getpid(), syscall.SIGKILL)
		case <-done:
			// Tests finished normally
		}
	}()

	// Also handle SIGINT/SIGTERM so Ctrl+C kills subprocesses too
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sig
		fmt.Fprintf(os.Stderr, "\n[TestMain] Signal received — killing process group\n")
		syscall.Kill(-syscall.Getpid(), syscall.SIGKILL)
	}()

	code := m.Run()
	close(done)
	os.Exit(code)
}
