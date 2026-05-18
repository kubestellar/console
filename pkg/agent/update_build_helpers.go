package agent

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/kubestellar/console/pkg/safego"
)

func (uc *UpdateChecker) resilientNpmInstall(webDir string, step, totalSteps int, timeout time.Duration) error {
	for attempt := 1; attempt <= npmInstallMaxRetries; attempt++ {
		// Remove stale lockfiles that can block concurrent installs
		os.Remove(webDir + "/package-lock.json.lock")
		os.Remove(webDir + "/.package-lock.json")

		res := uc.runBuildCmd(timeout, fmt.Sprintf("Installing npm dependencies (attempt %d/%d)", attempt, npmInstallMaxRetries),
			step, totalSteps, 18, "npm", []string{"install", "--prefer-offline"}, webDir, nil)
		if res.err == nil {
			return nil // success
		}

		if attempt == npmInstallMaxRetries {
			return fmt.Errorf("npm install failed after %d attempts: %s", npmInstallMaxRetries, buildErrorDetail(res.err, res.output))
		}

		// Broadcast retry status
		slog.Error("[AutoUpdate] npm install failed, cleaning cache", "attempt", attempt, "maxRetries", npmInstallMaxRetries)
		uc.broadcast("update_progress", UpdateProgressPayload{
			Status:     "building",
			Message:    fmt.Sprintf("npm install failed — cleaning cache (attempt %d/%d)...", attempt, npmInstallMaxRetries),
			Progress:   18,
			Step:       step,
			TotalSteps: totalSteps,
		})

		// Clean npm cache (fixes EACCES, sha512 corruption)
		const npmCacheTimeout = 30 * time.Second
		cacheCtx, cacheCancel := context.WithTimeout(context.Background(), npmCacheTimeout)
		defer cacheCancel()
		cacheClean := exec.CommandContext(cacheCtx, "npm", "cache", "clean", "--force")
		cacheClean.Stdout = os.Stdout
		cacheClean.Stderr = os.Stderr
		if cleanErr := cacheClean.Run(); cleanErr != nil {
			slog.Error("[AutoUpdate] npm cache clean also failed (user may need: sudo chown -R $(id -u):$(id -g) ~/.npm)", "error", cleanErr)
		}

		// On 2nd+ attempt, remove node_modules for a completely clean install
		if attempt >= 2 {
			slog.Info("[AutoUpdate] Removing node_modules for clean install...")
			uc.broadcast("update_progress", UpdateProgressPayload{
				Status:     "building",
				Message:    "Removing node_modules for clean install...",
				Progress:   18,
				Step:       step,
				TotalSteps: totalSteps,
			})
			os.RemoveAll(webDir + "/node_modules")
		}
	}
	return fmt.Errorf("npm install failed after %d attempts", npmInstallMaxRetries)
}

func rebuildFrontend(repoPath string) error {
	return rebuildFrontendCtx(context.Background(), repoPath)
}

// rebuildFrontendCtx rebuilds the frontend with context support for cancellation (#7441).
func rebuildFrontendCtx(ctx context.Context, repoPath string) error {
	webDir := repoPath + "/web"

	// Resilient npm install with cache recovery (same logic as resilientNpmInstall)
	var npmErr error
	for attempt := 1; attempt <= npmInstallMaxRetries; attempt++ {
		os.Remove(webDir + "/package-lock.json.lock")
		os.Remove(webDir + "/.package-lock.json")

		npmInstall := exec.CommandContext(ctx, "npm", "install", "--prefer-offline")
		npmInstall.Dir = webDir
		npmInstall.Stdout = os.Stdout
		npmInstall.Stderr = os.Stderr
		if npmErr = npmInstall.Run(); npmErr == nil {
			break
		}
		if ctx.Err() != nil {
			return fmt.Errorf("npm install cancelled: %w", ctx.Err())
		}
		slog.Error("[AutoUpdate] rebuildFrontend: npm install failed, cleaning cache", "attempt", attempt, "maxRetries", npmInstallMaxRetries)
		cacheClean := exec.CommandContext(ctx, "npm", "cache", "clean", "--force")
		cacheClean.Stdout = os.Stdout
		cacheClean.Stderr = os.Stderr
		if cleanErr := cacheClean.Run(); cleanErr != nil {
			slog.Error("[AutoUpdate] npm cache clean failed", "error", cleanErr)
		}
		if attempt >= 2 {
			os.RemoveAll(webDir + "/node_modules")
		}
	}
	if npmErr != nil {
		return fmt.Errorf("npm install: %w", npmErr)
	}

	npmBuild := exec.CommandContext(ctx, "npm", "run", "build")
	npmBuild.Dir = webDir
	npmBuild.Stdout = os.Stdout
	npmBuild.Stderr = os.Stderr
	if err := npmBuild.Run(); err != nil {
		return fmt.Errorf("npm run build: %w", err)
	}

	return nil
}

func rebuildGoBinaries(repoPath string) error {
	return rebuildGoBinariesCtx(context.Background(), repoPath)
}

// rebuildGoBinariesCtx rebuilds Go binaries with context support for cancellation (#7442).
func rebuildGoBinariesCtx(ctx context.Context, repoPath string) error {
	// Ensure bin/ directory exists (matches Makefile mkdir -p bin)
	if err := os.MkdirAll(filepath.Join(repoPath, "bin"), 0o755); err != nil {
		return fmt.Errorf("mkdir bin: %w", err)
	}

	// Build console binary
	consolePath, err := exec.LookPath("console")
	if err != nil {
		consolePath = filepath.Join(repoPath, "bin", "console")
	}
	consoleBuild := exec.CommandContext(ctx, "go", "build", "-o", consolePath, "./cmd/console")
	consoleBuild.Dir = repoPath
	consoleBuild.Env = append(os.Environ(), "GOWORK=off")
	consoleBuild.Stdout = os.Stdout
	consoleBuild.Stderr = os.Stderr
	if err := consoleBuild.Run(); err != nil {
		return fmt.Errorf("go build console: %w", err)
	}

	// Build kc-agent binary
	agentPath, err := exec.LookPath("kc-agent")
	if err != nil {
		agentPath = filepath.Join(repoPath, "bin", "kc-agent")
	}
	agentBuild := exec.CommandContext(ctx, "go", "build", "-o", agentPath, "./cmd/kc-agent")
	agentBuild.Dir = repoPath
	agentBuild.Env = append(os.Environ(), "GOWORK=off")
	agentBuild.Stdout = os.Stdout
	agentBuild.Stderr = os.Stderr
	if err := agentBuild.Run(); err != nil {
		return fmt.Errorf("go build kc-agent: %w", err)
	}

	return nil
}

func (f writerFunc) Write(p []byte) (int, error) { return f(p) }

// runBuildCmd executes an external command with:
//   - A hard timeout so builds can never hang indefinitely
//   - Periodic heartbeat broadcasts so the frontend knows the agent is still alive
//   - Captured stderr/stdout so error messages include the actual build output
//
// The heartbeat sends a WebSocket progress message every buildHeartbeatInterval
// with an updated elapsed-time string.
func (uc *UpdateChecker) runBuildCmd(
	timeout time.Duration,
	stepLabel string,
	step, totalSteps, progressPct int,
	name string, args []string,
	dir string,
	env []string,
) buildResult {
	// Use uc.updateCtx as the parent context so user cancellation propagates
	// to running build commands (#7441, #7442). Fall back to Background if
	// no update context is active (e.g. rollback rebuilds).
	parentCtx := uc.updateCtx
	if parentCtx == nil {
		parentCtx = context.Background()
	}
	ctx, cancel := context.WithTimeout(parentCtx, timeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Dir = dir
	// After the context cancels and the process is killed, give I/O pipes
	// this long to drain before force-closing them. Without this, cmd.Wait()
	// can hang indefinitely waiting on pipe-reader goroutines.
	const waitDelayAfterKill = 3 * time.Second
	cmd.WaitDelay = waitDelayAfterKill
	if len(env) > 0 {
		cmd.Env = append(os.Environ(), env...)
	}

	// Capture combined output for error reporting.
	// Use a mutex-protected writer: exec.Cmd copies stdout and stderr via
	// separate goroutines, so concurrent writes to strings.Builder are a race.
	var mu sync.Mutex
	var raw strings.Builder
	syncBuf := writerFunc(func(p []byte) (int, error) {
		mu.Lock()
		defer mu.Unlock()
		return raw.Write(p)
	})
	cmd.Stdout = io.MultiWriter(os.Stdout, syncBuf)
	cmd.Stderr = io.MultiWriter(os.Stderr, syncBuf)

	// Start the command
	if err := cmd.Start(); err != nil {
		return buildResult{err: err}
	}

	// Heartbeat goroutine — sends periodic "still building..." messages
	done := make(chan struct{})
	safego.GoWith("update-build-heartbeat", func() {
		ticker := time.NewTicker(buildHeartbeatInterval)
		defer ticker.Stop()
		start := time.Now()
		for {
			select {
			case <-done:
				return
			case <-ticker.C:
				elapsed := time.Since(start).Truncate(time.Second)
				uc.broadcast("update_progress", UpdateProgressPayload{
					Status:     "building",
					Message:    fmt.Sprintf("%s (%s elapsed)...", stepLabel, elapsed),
					Progress:   progressPct,
					Step:       step,
					TotalSteps: totalSteps,
				})
			}
		}
	})

	err := cmd.Wait()
	close(done)

	// Extract the tail of the output for error messages
	output := tailLines(raw.String(), buildOutputTailLines)

	if ctx.Err() == context.DeadlineExceeded {
		return buildResult{
			err:    fmt.Errorf("timed out after %s", timeout),
			output: output,
		}
	}
	return buildResult{err: err, output: output}
}

// tailLines returns the last n lines of s. If s has fewer than n lines, returns all of s.
func tailLines(s string, n int) string {
	lines := strings.Split(strings.TrimRight(s, "\n"), "\n")
	if len(lines) <= n {
		return s
	}
	return strings.Join(lines[len(lines)-n:], "\n")
}

// buildErrorDetail formats an error message that includes both the Go error and
// the tail of the build output, giving the user actionable information.
func buildErrorDetail(err error, output string) string {
	if output == "" {
		return err.Error()
	}
	return fmt.Sprintf("%v\n---\n%s", err, output)
}
