package agent

import (
	"context"
	"log/slog"
	"sync/atomic"
	"time"

	"github.com/kubestellar/console/pkg/safego"
)


const (
	developerCheckInterval = 15 * time.Minute
	releaseCheckInterval   = 60 * time.Minute
	healthCheckRetries     = 15
	healthCheckDelay       = 2 * time.Second
	// defaultGitHubRepo is the fallback GitHub owner/repo used when
	// GITHUB_REPO is not set. Override via env var for forks or GHE.
	defaultGitHubRepo = "kubestellar/console"

	// Timeouts for each build step — prevents updates from hanging indefinitely
	gitPullTimeout       = 2 * time.Minute
	npmInstallTimeout    = 5 * time.Minute
	frontendBuildTimeout = 5 * time.Minute
	goBuildTimeout       = 5 * time.Minute

	// Heartbeat interval — periodic progress broadcasts during long builds
	// so the frontend knows the agent is still alive
	buildHeartbeatInterval = 15 * time.Second

	// Max lines of build output to include in error messages sent to the frontend
	buildOutputTailLines = 20

	// githubAPITimeout bounds GitHub API HTTP requests (releases, main ref).
	githubAPITimeout = 10 * time.Second
)

// githubRepo returns the GitHub owner/repo slug, preferring the GITHUB_REPO
// environment variable so forks and GHE instances work out-of-the-box.
func NewUpdateChecker(cfg UpdateCheckerConfig) *UpdateChecker {
	installMethod := detectAgentInstallMethod()
	repoPath := detectRepoPath()
	currentSHA := detectCurrentSHA(repoPath)

	return &UpdateChecker{
		channel:        "stable",
		installMethod:  installMethod,
		repoPath:       repoPath,
		currentVersion: Version,
		currentSHA:     currentSHA,
		broadcast:      cfg.Broadcast,
		restartBackend: cfg.RestartBackend,
		killBackend:    cfg.KillBackend,
	}
}

// Start begins the periodic update check loop. Call Stop() to cancel.
func (uc *UpdateChecker) Start() {
	uc.mu.Lock()
	if uc.cancel != nil {
		uc.cancel() // stop previous loop
	}
	ctx, cancel := context.WithCancel(context.Background())
	uc.cancel = cancel
	uc.mu.Unlock()

	safego.GoWith("update-checker/run", func() { uc.run(ctx) })
}

// Stop cancels the update check loop.
func (uc *UpdateChecker) Stop() {
	uc.mu.Lock()
	defer uc.mu.Unlock()
	if uc.cancel != nil {
		uc.cancel()
		uc.cancel = nil
	}
}

// Configure updates the channel and enabled state. Restarts the loop if needed.
func (uc *UpdateChecker) Configure(enabled bool, channel string) {
	uc.mu.Lock()
	changed := uc.enabled != enabled || uc.channel != channel
	uc.enabled = enabled
	uc.channel = channel
	uc.mu.Unlock()

	if changed && enabled {
		uc.Start()
	} else if !enabled {
		uc.Stop()
	}
}

// Status returns the current auto-update status for the API.
// Reads cached state under the lock, then performs network operations (git fetch)
// outside the lock so concurrent callers are not serialized behind a 15s fetch (#7282).
func (uc *UpdateChecker) Status() AutoUpdateStatusResponse {
	uc.mu.Lock()
	resp := AutoUpdateStatusResponse{
		InstallMethod:         uc.installMethod,
		RepoPath:              uc.repoPath,
		CurrentSHA:            uc.currentSHA,
		AutoUpdateEnabled:     uc.enabled,
		Channel:               uc.channel,
		HasUncommittedChanges: hasUncommittedChanges(uc.repoPath),
		UpdateInProgress:      uc.IsUpdating(),
	}

	if !uc.lastUpdateTime.IsZero() {
		resp.LastUpdateTime = uc.lastUpdateTime.Format(time.RFC3339)
	}
	if uc.lastUpdateError != "" {
		// Sanitize error message for client - don't leak raw git/npm/build errors
		resp.LastUpdateResult = "Update failed - check server logs for details"
	}
	repoPath := uc.repoPath
	uc.mu.Unlock()

	// Re-read current SHA from repo (may have changed if someone pulled locally).
	// These git operations run outside the lock to avoid blocking other callers.
	if repoPath != "" {
		if freshSHA := detectCurrentSHA(repoPath); freshSHA != "" {
			resp.CurrentSHA = freshSHA
			uc.mu.Lock()
			uc.currentSHA = freshSHA
			uc.mu.Unlock()
		}
	}

	// Fetch latest SHA from origin/main (uses git fetch, no rate limits)
	if repoPath != "" {
		if sha, err := fetchLatestMainSHAWithRepo(repoPath); err == nil {
			resp.LatestSHA = sha
			resp.HasUpdate = sha != resp.CurrentSHA && resp.CurrentSHA != ""
		} else {
			slog.Error("[AutoUpdate] failed to fetch latest SHA", "error", err)
		}
	}

	return resp
}

// TriggerNow runs an immediate update check (non-blocking).
// If channelOverride is non-empty, it temporarily uses that channel for this check.
// Returns false if an update is already in progress.
func (uc *UpdateChecker) TriggerNow(channelOverride string) bool {
	// Reset the cancellation flag *before* the CAS so that a concurrent
	// CancelUpdate() call between the CAS and context creation cannot have
	// its intent silently dropped (#7439).
	atomic.StoreInt32(&uc.updateCancelled, 0)

	if !atomic.CompareAndSwapInt32(&uc.updating, 0, 1) {
		slog.Info("[AutoUpdate] Update already in progress, ignoring duplicate trigger")
		return false
	}

	// Create a fresh cancellation context for this update run. The cancel
	// function is stored on the struct so CancelUpdate() can call it.
	uc.mu.Lock()
	ctx, cancel := context.WithCancel(context.Background())
	uc.updateCtx = ctx
	uc.updateCancel = cancel
	uc.mu.Unlock()

	cleanup := func() {
		atomic.StoreInt32(&uc.updating, 0)
		uc.mu.Lock()
		if uc.updateCancel != nil {
			uc.updateCancel()
		}
		uc.updateCtx = nil
		uc.updateCancel = nil
		uc.mu.Unlock()
	}

	if channelOverride != "" {
		safego.GoWith("auto-update-override", func() {
			defer cleanup()

			uc.mu.Lock()
			origChannel := uc.channel
			uc.channel = channelOverride
			uc.mu.Unlock()

			uc.checkAndUpdate()

			uc.mu.Lock()
			uc.channel = origChannel
			uc.mu.Unlock()
		})
	} else {
		safego.GoWith("auto-update", func() {
			defer cleanup()
			uc.checkAndUpdate()
		})
	}
	return true
}

// CancelUpdate marks the currently-running update for cancellation and cancels
// its context. Commands running via exec.CommandContext will receive SIGKILL;
// step boundaries check the cancelled flag and abort early with a "cancelled"
// status broadcast. Returns true if an update was in progress and has been
// asked to cancel, false if no update was running.
//
// NOTE: Cancellation is best-effort. The in-flight step may complete before
// the abort is honored (e.g. a git pull that has already succeeded). Once the
// restart step begins, cancellation has no effect because startup-oauth.sh has
// already been spawned as a detached process.
func (uc *UpdateChecker) CancelUpdate() bool {
	if !uc.IsUpdating() {
		return false
	}
	atomic.StoreInt32(&uc.updateCancelled, 1)
	uc.mu.Lock()
	cancel := uc.updateCancel
	uc.mu.Unlock()
	if cancel != nil {
		cancel()
	}
	slog.Info("[AutoUpdate] cancellation requested by user")
	uc.broadcast("update_progress", UpdateProgressPayload{
		Status:  "cancelled",
		Message: "Update cancelled by user — rolling back if needed...",
	})
	return true
}

// isCancelled returns true if the current update has been asked to cancel.
func (uc *UpdateChecker) isCancelled() bool {
	return atomic.LoadInt32(&uc.updateCancelled) == 1
}

// IsUpdating returns true if an update is currently in progress.
func (uc *UpdateChecker) IsUpdating() bool {
	return atomic.LoadInt32(&uc.updating) == 1
}

func (uc *UpdateChecker) checkCancelled(stepName, repoPath, previousSHA string, progress int) bool {
	if !uc.isCancelled() {
		return false
	}
	slog.Info("[AutoUpdate] cancelled before step", "step", stepName, "elapsed", "aborting")
	// Attempt to roll back git if we've already pulled
	if previousSHA != "" && repoPath != "" {
		rollbackGit(repoPath, previousSHA)
	}
	uc.broadcast("update_progress", UpdateProgressPayload{
		Status:   "cancelled",
		Message:  "Update cancelled by user",
		Progress: progress,
	})
	return true
}

func (uc *UpdateChecker) recordError(msg string) {
	uc.mu.Lock()
	uc.lastUpdateError = msg
	uc.lastUpdateTime = time.Now()
	uc.mu.Unlock()
	slog.Error("[AutoUpdate] error", "message", msg)
}

// --- npm install with resilience ---

const npmInstallMaxRetries = 3 // Max retries for npm install with cache recovery

// resilientNpmInstall runs npm install with automatic recovery from cache corruption.
// On failure it runs npm cache clean --force and retries. On 2nd+ failure it also
// removes node_modules for a completely clean install. Broadcasts progress via WebSocket.
// Each attempt has a hard timeout to prevent indefinite hangs.
