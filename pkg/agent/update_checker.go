package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"time"
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
)

// githubRepo returns the GitHub owner/repo slug, preferring the GITHUB_REPO
// environment variable so forks and GHE instances work out-of-the-box.
func githubRepo() string {
	if v := os.Getenv("GITHUB_REPO"); v != "" {
		return v
	}
	return defaultGitHubRepo
}

// githubMainRefURL builds the GitHub API URL for the main branch ref.
func githubMainRefURL() string {
	return fmt.Sprintf("https://api.github.com/repos/%s/git/ref/heads/main", githubRepo())
}

// githubReleasesURL builds the GitHub API URL for releases.
func githubReleasesURL() string {
	return fmt.Sprintf("https://api.github.com/repos/%s/releases", githubRepo())
}

// UpdateChecker periodically checks for updates and applies them.
type UpdateChecker struct {
	mu              sync.Mutex
	enabled         bool
	channel         string // "stable", "unstable", "developer"
	installMethod   string // "dev", "binary", "helm"
	repoPath        string
	currentVersion  string
	currentSHA      string
	broadcast       func(string, interface{})
	restartBackend  func() error
	killBackend     func() bool
	lastUpdateTime  time.Time
	lastUpdateError string
	cancel          context.CancelFunc
	updating        int32 // atomic: 1 = update in progress, 0 = idle

	// updateCtx/updateCancel allow the currently-running update goroutine
	// to be cancelled by the user via the /auto-update/cancel endpoint.
	// Cancellation is honored at step boundaries and by exec.CommandContext
	// calls that use updateCtx — partial commands may still complete but the
	// update will abort before the next step runs. If the update has already
	// passed the restart step, cancellation has no effect (the restart script
	// is already detached).
	updateCtx    context.Context
	updateCancel context.CancelFunc
	// updateCancelled is set to 1 (atomic) when the user requests cancellation.
	// Step boundaries check this to exit early with a "cancelled" status.
	updateCancelled int32

	// exitFunc terminates the process after spawning the restart script.
	// Defaults to os.Exit. Overridden in tests to prevent the test runner from exiting.
	exitFunc func(code int)
}

// UpdateCheckerConfig holds initialization parameters.
type UpdateCheckerConfig struct {
	Broadcast      func(string, interface{})
	RestartBackend func() error
	KillBackend    func() bool
}

// UpdateProgressPayload is broadcast via WebSocket during updates.
type UpdateProgressPayload struct {
	Status     string `json:"status"`
	Message    string `json:"message"`
	Progress   int    `json:"progress"`
	Error      string `json:"error,omitempty"`
	Step       int    `json:"step,omitempty"`       // current step number (1-based)
	TotalSteps int    `json:"totalSteps,omitempty"` // total steps in the update sequence
}

// Developer update step count — git pull, npm install, frontend build,
// console binary, kc-agent binary, stop services, restart
const devUpdateTotalSteps = 7

// AutoUpdateStatusResponse is returned by GET /auto-update/status.
type AutoUpdateStatusResponse struct {
	InstallMethod         string `json:"installMethod"`
	RepoPath              string `json:"repoPath"`
	CurrentSHA            string `json:"currentSHA"`
	LatestSHA             string `json:"latestSHA"`
	HasUpdate             bool   `json:"hasUpdate"`
	HasUncommittedChanges bool   `json:"hasUncommittedChanges"`
	AutoUpdateEnabled     bool   `json:"autoUpdateEnabled"`
	Channel               string `json:"channel"`
	LastUpdateTime        string `json:"lastUpdateTime,omitempty"`
	LastUpdateResult      string `json:"lastUpdateResult,omitempty"`
	UpdateInProgress      bool   `json:"updateInProgress"`
}

// AutoUpdateConfigRequest is the body for POST /auto-update/config.
type AutoUpdateConfigRequest struct {
	Enabled bool   `json:"enabled"`
	Channel string `json:"channel"`
}

// NewUpdateChecker creates a checker but does not start it.
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

	go uc.run(ctx)
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
		resp.LastUpdateResult = uc.lastUpdateError
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
		go func() {
			defer cleanup()
			defer func() {
				if r := recover(); r != nil {
					slog.Error("[AutoUpdate] PANIC recovered in update goroutine", "panic", r)
				}
			}()

			uc.mu.Lock()
			origChannel := uc.channel
			uc.channel = channelOverride
			uc.mu.Unlock()

			uc.checkAndUpdate()

			uc.mu.Lock()
			uc.channel = origChannel
			uc.mu.Unlock()
		}()
	} else {
		go func() {
			defer cleanup()
			defer func() {
				if r := recover(); r != nil {
					slog.Error("[AutoUpdate] PANIC recovered in update goroutine", "panic", r)
				}
			}()
			uc.checkAndUpdate()
		}()
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

func (uc *UpdateChecker) run(ctx context.Context) {
	uc.mu.Lock()
	interval := releaseCheckInterval
	if uc.channel == "developer" {
		interval = developerCheckInterval
	}
	uc.mu.Unlock()

	// Initial delay to let everything start up
	select {
	case <-ctx.Done():
		return
	case <-time.After(30 * time.Second):
	}

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			uc.mu.Lock()
			enabled := uc.enabled
			uc.mu.Unlock()
			if enabled {
				uc.checkAndUpdate()
			}
		}
	}
}

func (uc *UpdateChecker) checkAndUpdate() {
	uc.mu.Lock()
	channel := uc.channel
	installMethod := uc.installMethod
	uc.mu.Unlock()

	if installMethod == "helm" {
		return // helm installs are managed externally
	}

	switch channel {
	case "developer":
		uc.checkDeveloperChannel()
	case "stable", "unstable":
		uc.checkReleaseChannel(channel)
	}
}

func (uc *UpdateChecker) checkDeveloperChannel() {
	uc.mu.Lock()
	repoPath := uc.repoPath
	currentSHA := uc.currentSHA
	uc.mu.Unlock()

	if repoPath == "" {
		slog.Info("[AutoUpdate] Developer channel requires a git repo, skipping")
		return
	}

	latestSHA, err := fetchLatestMainSHAWithRepo(repoPath)
	if err != nil {
		slog.Error("[AutoUpdate] failed to check main SHA", "error", err)
		return
	}

	// Re-read currentSHA from repo in case it was updated externally
	if freshSHA := detectCurrentSHA(repoPath); freshSHA != "" {
		uc.mu.Lock()
		uc.currentSHA = freshSHA
		currentSHA = freshSHA
		uc.mu.Unlock()
	}

	if latestSHA == currentSHA || currentSHA == "" {
		slog.Info("[AutoUpdate] already up to date, no update needed", "sha", short(currentSHA))
		uc.broadcast("update_progress", UpdateProgressPayload{
			Status:   "done",
			Message:  "Already up to date — no changes on main",
			Progress: 100,
		})
		return
	}

	slog.Info("[AutoUpdate] new commit on main", "from", short(currentSHA), "to", short(latestSHA))
	uc.executeDeveloperUpdate(latestSHA)
}

// checkCancelled returns true if the user has requested cancellation. It
// broadcasts a "cancelled" status with the current progress percentage and
// logs the abort. Callers should return immediately after a true result.
// previousSHA is used to roll back any partial git changes.
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

func (uc *UpdateChecker) executeDeveloperUpdate(newSHA string) {
	uc.mu.Lock()
	repoPath := uc.repoPath
	previousSHA := uc.currentSHA
	uc.mu.Unlock()

	start := time.Now()
	total := devUpdateTotalSteps
	slog.Info("[AutoUpdate] starting update", "from", short(previousSHA), "to", short(newSHA))

	// Check for cancellation before step 1 (git pull has not yet run, no rollback needed)
	if uc.checkCancelled("step1-git-pull", "", "", 0) {
		return
	}

	// Step 1/7: Git pull
	slog.Info("[AutoUpdate] step progress", "step", 1, "total", total, "description", "git pull --rebase origin main")
	uc.broadcast("update_progress", UpdateProgressPayload{
		Status:     "pulling",
		Message:    fmt.Sprintf("Pulling %s from main...", short(newSHA)),
		Progress:   8,
		Step:       1,
		TotalSteps: total,
	})

	if err := runGitPullWithTimeout(repoPath, gitPullTimeout); err != nil {
		slog.Error("[AutoUpdate] FAILED at step 1 (git pull)", "elapsed", time.Since(start), "error", err)
		uc.recordError(fmt.Sprintf("git pull failed: %v", err))
		uc.broadcast("update_progress", UpdateProgressPayload{
			Status:  "failed",
			Message: "git pull failed",
			Error:   err.Error(),
		})
		return
	}
	slog.Info("[AutoUpdate] step complete", "step", 1, "total", total, "description", "git pull", "elapsed", time.Since(start))

	// Cancellation check after git pull — safe to roll back at this point
	if uc.checkCancelled("step2-npm-install", repoPath, previousSHA, 8) {
		return
	}

	// Step 2/7: npm install (with automatic cache recovery)
	webDir := repoPath + "/web"
	slog.Info("[AutoUpdate] step progress", "step", 2, "total", total, "description", "npm install")
	uc.broadcast("update_progress", UpdateProgressPayload{
		Status:     "building",
		Message:    "Installing npm dependencies...",
		Progress:   18,
		Step:       2,
		TotalSteps: total,
	})

	stepStart := time.Now()
	if err := uc.resilientNpmInstall(webDir, 2, total, npmInstallTimeout); err != nil {
		slog.Error("[AutoUpdate] FAILED at step 2 (npm install)", "elapsed", time.Since(start), "error", err)
		uc.recordError(fmt.Sprintf("npm install failed: %v", err))
		uc.broadcast("update_progress", UpdateProgressPayload{
			Status:  "failed",
			Message: "npm install failed after retries, rolling back...",
			Error:   err.Error() + " (try: sudo chown -R $(id -u):$(id -g) ~/.npm)",
		})
		rollbackGit(repoPath, previousSHA)
		if rbErr := rebuildFrontend(repoPath); rbErr != nil {
			slog.Error("[AutoUpdate] rollback rebuildFrontend failed", "error", rbErr)
		}
		return
	}
	slog.Info("[AutoUpdate] step complete", "step", 2, "total", total, "description", "npm install", "elapsed", time.Since(stepStart))

	// Cancellation check after npm install
	if uc.checkCancelled("step3-frontend-build", repoPath, previousSHA, 18) {
		return
	}

	// Step 3/7: Frontend build (Vite)
	slog.Info("[AutoUpdate] step progress", "step", 3, "total", total, "description", "npm run build")
	uc.broadcast("update_progress", UpdateProgressPayload{
		Status:     "building",
		Message:    "Building frontend with Vite...",
		Progress:   30,
		Step:       3,
		TotalSteps: total,
	})

	stepStart = time.Now()
	res := uc.runBuildCmd(frontendBuildTimeout, "Building frontend with Vite", 3, total, 30,
		"npm", []string{"run", "build"}, webDir, nil)
	if res.err != nil {
		slog.Error("[AutoUpdate] FAILED at step 3 (frontend build)", "elapsed", time.Since(start), "error", res.err)
		uc.recordError(fmt.Sprintf("frontend build failed: %v", res.err))
		uc.broadcast("update_progress", UpdateProgressPayload{
			Status:  "failed",
			Message: "Frontend build failed, rolling back...",
			Error:   buildErrorDetail(res.err, res.output),
		})
		rollbackGit(repoPath, previousSHA)
		if rbErr := rebuildFrontend(repoPath); rbErr != nil {
			slog.Error("[AutoUpdate] rollback rebuildFrontend failed", "error", rbErr)
		}
		return
	}
	slog.Info("[AutoUpdate] step complete", "step", 3, "total", total, "description", "frontend build", "elapsed", time.Since(stepStart))

	// Cancellation check after frontend build
	if uc.checkCancelled("step4-console-build", repoPath, previousSHA, 30) {
		// Rebuild frontend from previous SHA since we rolled back
		if rbErr := rebuildFrontend(repoPath); rbErr != nil {
			slog.Error("[AutoUpdate] cancel rebuildFrontend failed", "error", rbErr)
		}
		return
	}

	// Step 4/7: Build console binary
	slog.Info("[AutoUpdate] step progress", "step", 4, "total", total, "description", "go build ./cmd/console")
	uc.broadcast("update_progress", UpdateProgressPayload{
		Status:     "building",
		Message:    "Building console binary...",
		Progress:   45,
		Step:       4,
		TotalSteps: total,
	})

	stepStart = time.Now()
	// Ensure bin/ directory exists (matches Makefile mkdir -p bin)
	if err := os.MkdirAll(filepath.Join(repoPath, "bin"), 0o755); err != nil {
		slog.Error("[AutoUpdate] failed to create bin directory", "error", err)
	}
	consolePath, err := exec.LookPath("console")
	if err != nil {
		consolePath = filepath.Join(repoPath, "bin", "console")
	}
	// Build to a temp file first, then atomically rename to the final path.
	// This prevents a half-written binary if the build is killed or times out.
	consoleTmp := consolePath + ".update-tmp"
	res = uc.runBuildCmd(goBuildTimeout, "Building console binary", 4, total, 45,
		"go", []string{"build", "-o", consoleTmp, "./cmd/console"}, repoPath, []string{"GOWORK=off"})
	if res.err != nil {
		os.Remove(consoleTmp) // clean up partial build
		slog.Error("[AutoUpdate] FAILED at step 4 (console build)", "elapsed", time.Since(start), "error", res.err)
		uc.recordError(fmt.Sprintf("go build console failed: %v", res.err))
		uc.broadcast("update_progress", UpdateProgressPayload{
			Status:  "failed",
			Message: "Console build failed, rolling back...",
			Error:   buildErrorDetail(res.err, res.output),
		})
		rollbackGit(repoPath, previousSHA)
		if rbErr := rebuildFrontend(repoPath); rbErr != nil {
			slog.Error("[AutoUpdate] rollback rebuildFrontend failed", "error", rbErr)
		}
		if rbErr := rebuildGoBinaries(repoPath); rbErr != nil {
			slog.Error("[AutoUpdate] rollback rebuildGoBinaries failed", "error", rbErr)
		}
		return
	}
	if err := os.Rename(consoleTmp, consolePath); err != nil {
		slog.Error("[AutoUpdate] failed to move console binary", "error", err)
		os.Remove(consoleTmp)
	}
	slog.Info("[AutoUpdate] step complete", "step", 4, "total", total, "description", "console binary", "elapsed", time.Since(stepStart))

	// Cancellation check after console binary build
	if uc.checkCancelled("step5-agent-build", repoPath, previousSHA, 45) {
		if rbErr := rebuildFrontend(repoPath); rbErr != nil {
			slog.Error("[AutoUpdate] cancel rebuildFrontend failed", "error", rbErr)
		}
		if rbErr := rebuildGoBinaries(repoPath); rbErr != nil {
			slog.Error("[AutoUpdate] cancel rebuildGoBinaries failed", "error", rbErr)
		}
		return
	}

	// Step 5/7: Build kc-agent binary
	slog.Info("[AutoUpdate] step progress", "step", 5, "total", total, "description", "go build ./cmd/kc-agent")
	uc.broadcast("update_progress", UpdateProgressPayload{
		Status:     "building",
		Message:    "Building kc-agent binary...",
		Progress:   58,
		Step:       5,
		TotalSteps: total,
	})

	stepStart = time.Now()
	agentPath, err := exec.LookPath("kc-agent")
	if err != nil {
		agentPath = filepath.Join(repoPath, "bin", "kc-agent")
	}
	// Build to a temp file first, then atomically rename.
	agentTmp := agentPath + ".update-tmp"
	res = uc.runBuildCmd(goBuildTimeout, "Building kc-agent binary", 5, total, 58,
		"go", []string{"build", "-o", agentTmp, "./cmd/kc-agent"}, repoPath, []string{"GOWORK=off"})
	if res.err != nil {
		os.Remove(agentTmp) // clean up partial build
		slog.Error("[AutoUpdate] FAILED at step 5 (kc-agent build)", "elapsed", time.Since(start), "error", res.err)
		uc.recordError(fmt.Sprintf("go build kc-agent failed: %v", res.err))
		uc.broadcast("update_progress", UpdateProgressPayload{
			Status:  "failed",
			Message: "kc-agent build failed, rolling back...",
			Error:   buildErrorDetail(res.err, res.output),
		})
		rollbackGit(repoPath, previousSHA)
		if rbErr := rebuildFrontend(repoPath); rbErr != nil {
			slog.Error("[AutoUpdate] rollback rebuildFrontend failed", "error", rbErr)
		}
		if rbErr := rebuildGoBinaries(repoPath); rbErr != nil {
			slog.Error("[AutoUpdate] rollback rebuildGoBinaries failed", "error", rbErr)
		}
		return
	}
	if err := os.Rename(agentTmp, agentPath); err != nil {
		slog.Error("[AutoUpdate] failed to move kc-agent binary", "error", err)
		os.Remove(agentTmp)
	}
	slog.Info("[AutoUpdate] step complete", "step", 5, "total", total, "description", "kc-agent binary", "elapsed", time.Since(stepStart))

	// Last chance to cancel — after this point we commit the new SHA and restart.
	// Once restartViaStartupScript runs, the script is detached and cannot be stopped.
	if uc.checkCancelled("step6-restart", repoPath, previousSHA, 58) {
		if rbErr := rebuildFrontend(repoPath); rbErr != nil {
			slog.Error("[AutoUpdate] cancel rebuildFrontend failed", "error", rbErr)
		}
		if rbErr := rebuildGoBinaries(repoPath); rbErr != nil {
			slog.Error("[AutoUpdate] cancel rebuildGoBinaries failed", "error", rbErr)
		}
		return
	}

	// Step 6/7: Stopping services
	slog.Info("[AutoUpdate] step progress", "step", 6, "total", total, "description", "preparing restart")
	uc.broadcast("update_progress", UpdateProgressPayload{
		Status:     "restarting",
		Message:    "Stopping current services...",
		Progress:   72,
		Step:       6,
		TotalSteps: total,
	})

	uc.mu.Lock()
	uc.currentSHA = newSHA
	uc.lastUpdateTime = time.Now()
	uc.lastUpdateError = ""
	uc.mu.Unlock()

	slog.Info("[AutoUpdate] build complete, restarting", "from", short(previousSHA), "to", short(newSHA), "elapsed", time.Since(start))

	// Step 7/7: Restart via startup-oauth.sh
	slog.Info("[AutoUpdate] step progress", "step", 7, "total", total, "description", "restart via startup-oauth.sh")
	uc.broadcast("update_progress", UpdateProgressPayload{
		Status:     "restarting",
		Message:    "Restarting via startup-oauth.sh...",
		Progress:   82,
		Step:       7,
		TotalSteps: total,
	})

	// Spawn startup-oauth.sh as a detached process and exit.
	// The script handles port cleanup, env loading, and starting all processes
	// (kc-agent, backend, frontend). This process will be replaced.
	uc.restartViaStartupScript(repoPath)
}

// restartViaStartupScript spawns startup-oauth.sh as a detached process.
// startup-oauth.sh handles killing existing processes (including this one),
// port cleanup, .env loading, and starting kc-agent, backend, and frontend.
// After spawning, this process exits so the script can replace it.
func (uc *UpdateChecker) restartViaStartupScript(repoPath string) {
	scriptPath := repoPath + "/startup-oauth.sh"
	if _, err := os.Stat(scriptPath); err != nil {
		slog.Info("[AutoUpdate] startup-oauth.sh not found, falling back to exec", "path", scriptPath)
		uc.selfUpdateFallback(repoPath)
		return
	}

	// Redirect output to a log file so the child survives our exit.
	// If stdout/stderr inherit from this process, they become broken pipes
	// when os.Exit(0) closes the file descriptors, killing the child via SIGPIPE.
	logPath := repoPath + "/data/auto-update-restart.log"
	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
	if err != nil {
		slog.Warn("[AutoUpdate] cannot create restart log", "path", logPath, "error", err)
		logFile = nil
	}

	// Spawn the script in a new process group so it survives our exit
	cmd := exec.Command("bash", scriptPath) // #nosec G204 -- scriptPath is repoPath+"/startup-oauth.sh", not user input
	cmd.Dir = repoPath
	if logFile != nil {
		cmd.Stdout = logFile
		cmd.Stderr = logFile
	}
	// #6297: Setpgid is Unix-only; routed through a build-tagged helper
	// (restart_unix.go / restart_windows.go) so kc-agent compiles on Windows.
	setDetachedProcessGroup(cmd)

	if err := cmd.Start(); err != nil {
		slog.Error("[AutoUpdate] failed to spawn startup-oauth.sh", "error", err)
		if logFile != nil {
			logFile.Close()
		}
		uc.selfUpdateFallback(repoPath)
		return
	}

	slog.Info("[AutoUpdate] startup-oauth.sh spawned, exiting for restart", "pid", cmd.Process.Pid, "log", logPath)

	// Give the script a moment to start before we exit
	time.Sleep(1 * time.Second)

	if logFile != nil {
		logFile.Close()
	}

	// Exit this process — startup-oauth.sh will start fresh instances
	exit := uc.exitFunc
	if exit == nil {
		exit = os.Exit
	}
	exit(0)
}

// selfUpdateFallback rebuilds the kc-agent binary and replaces the running
// process via exec. Used as fallback when startup-oauth.sh is not available.
func (uc *UpdateChecker) selfUpdateFallback(repoPath string) {
	currentBinary, err := os.Executable()
	if err != nil {
		slog.Warn("[AutoUpdate] cannot determine kc-agent binary path", "error", err)
		return
	}

	slog.Info("[AutoUpdate] Falling back to self-update via exec...")

	// Kill and restart backend using the pre-built binary
	uc.killBackend()
	if err := uc.restartBackend(); err != nil {
		slog.Error("[AutoUpdate] backend restart failed", "error", err)
	}

	// Re-exec with the same args — replaces this process atomically on Unix.
	// #6297: Windows can't replace the current process image in place;
	// execReplace returns an error there and kc-agent logs it and keeps
	// running the old binary until the user restarts manually.
	if err := execReplace(currentBinary, os.Args, os.Environ()); err != nil {
		slog.Error("[AutoUpdate] exec into new kc-agent failed", "error", err)
	}
	// If exec succeeds on Unix, this line is never reached
}

func (uc *UpdateChecker) checkReleaseChannel(channel string) {
	uc.mu.Lock()
	currentVersion := uc.currentVersion
	installMethod := uc.installMethod
	uc.mu.Unlock()

	targetType := "weekly"
	if channel == "unstable" {
		targetType = "nightly"
	}

	releases, err := fetchGitHubReleases()
	if err != nil {
		slog.Error("[AutoUpdate] failed to fetch releases", "error", err)
		return
	}

	var latest *githubReleaseInfo
	for i := range releases {
		if strings.Contains(releases[i].TagName, targetType) {
			latest = &releases[i]
			break
		}
	}

	if latest == nil || latest.TagName == currentVersion {
		slog.Info("[AutoUpdate] already on latest release", "channel", channel, "version", currentVersion)
		uc.broadcast("update_progress", UpdateProgressPayload{
			Status:   "done",
			Message:  fmt.Sprintf("Already up to date — running latest %s release", channel),
			Progress: 100,
		})
		return
	}

	slog.Info("[AutoUpdate] new release available", "current", currentVersion, "latest", latest.TagName)

	switch installMethod {
	case "binary":
		uc.executeBinaryUpdate(latest)
	case "dev":
		uc.executeDevReleaseUpdate(latest)
	}
}

func (uc *UpdateChecker) executeBinaryUpdate(release *githubReleaseInfo) {
	uc.broadcast("update_progress", UpdateProgressPayload{
		Status:   "pulling",
		Message:  fmt.Sprintf("Downloading %s...", release.TagName),
		Progress: 20,
	})

	platform := fmt.Sprintf("%s_%s", runtime.GOOS, runtime.GOARCH)
	assetName := fmt.Sprintf("console_%s_%s.tar.gz", strings.TrimPrefix(release.TagName, "v"), platform)

	var assetURL string
	for _, a := range release.Assets {
		if a.Name == assetName {
			assetURL = a.BrowserDownloadURL
			break
		}
	}

	if assetURL == "" {
		uc.recordError("no matching asset found for platform " + platform)
		uc.broadcast("update_progress", UpdateProgressPayload{
			Status:  "failed",
			Message: "No download available for your platform",
			Error:   "Asset not found: " + assetName,
		})
		return
	}

	// Download to temp file — use os.TempDir() for cross-platform support (#7239).
	tmpFile := filepath.Join(os.TempDir(), fmt.Sprintf("kc-update-%s.tar.gz", release.TagName))
	if err := downloadFile(assetURL, tmpFile); err != nil {
		uc.recordError(fmt.Sprintf("download failed: %v", err))
		uc.broadcast("update_progress", UpdateProgressPayload{
			Status:  "failed",
			Message: "Download failed",
			Error:   err.Error(),
		})
		return
	}

	uc.broadcast("update_progress", UpdateProgressPayload{
		Status:   "building",
		Message:  "Extracting update...",
		Progress: 50,
	})

	// Extract to staging directory — use os.TempDir() for cross-platform support (#7239).
	stagingDir := filepath.Join(os.TempDir(), "kc-update-staging")
	if err := os.RemoveAll(stagingDir); err != nil {
		uc.recordError(fmt.Sprintf("failed to clean staging dir: %v", err))
		uc.broadcast("update_progress", UpdateProgressPayload{
			Status:  "failed",
			Message: "Failed to prepare staging directory",
			Error:   err.Error(),
		})
		return
	}
	// stagingDirMode is the permission bits for the update staging directory.
	const stagingDirMode = 0755
	if err := os.MkdirAll(stagingDir, stagingDirMode); err != nil {
		uc.recordError(fmt.Sprintf("failed to create staging dir: %v", err))
		uc.broadcast("update_progress", UpdateProgressPayload{
			Status:  "failed",
			Message: "Failed to prepare staging directory",
			Error:   err.Error(),
		})
		return
	}

	// extractTimeout bounds the tar extraction to prevent hanging on corrupt
	// archives or stalled I/O (#7241). Use uc.updateCtx as the parent so
	// user cancellation propagates to the extraction process (#7440).
	const extractTimeout = 5 * time.Minute
	parentCtx := uc.updateCtx
	if parentCtx == nil {
		parentCtx = context.Background()
	}
	extractCtx, extractCancel := context.WithTimeout(parentCtx, extractTimeout)
	defer extractCancel()
	extractCmd := exec.CommandContext(extractCtx, "tar", "xzf", tmpFile, "-C", stagingDir)
	if err := extractCmd.Run(); err != nil {
		// If cancelled by the user, report as cancellation rather than failure (#7440)
		if uc.isCancelled() {
			uc.broadcast("update_progress", UpdateProgressPayload{
				Status:  "cancelled",
				Message: "Update cancelled by user during extraction",
			})
			os.Remove(tmpFile)
			os.RemoveAll(stagingDir)
			return
		}
		uc.recordError(fmt.Sprintf("extract failed: %v", err))
		uc.broadcast("update_progress", UpdateProgressPayload{
			Status:  "failed",
			Message: "Extract failed",
			Error:   err.Error(),
		})
		return
	}

	// Check for cancellation after extraction (#7440, #7443)
	if uc.isCancelled() {
		uc.broadcast("update_progress", UpdateProgressPayload{
			Status:  "cancelled",
			Message: "Update cancelled by user",
		})
		os.Remove(tmpFile)
		os.RemoveAll(stagingDir)
		return
	}

	// Find current binary location
	consolePath, err := exec.LookPath("console")
	if err != nil {
		// Try relative path under bin/
		consolePath = "./bin/console"
	}

	// Backup current binary. On Windows, os.Rename on a running executable
	// fails with ETXTBSY-equivalent locking (#7444). Use renameOrCopy which
	// falls back to copy+remove when rename fails.
	backupPath := consolePath + ".backup"
	if err := renameOrCopy(consolePath, backupPath); err != nil {
		uc.recordError(fmt.Sprintf("backup failed: %v", err))
		uc.broadcast("update_progress", UpdateProgressPayload{
			Status:  "failed",
			Message: "Failed to back up current binary",
			Error:   err.Error(),
		})
		return
	}

	// Set permissions on the staged binary *before* moving it to the final
	// location. This prevents a window where power loss leaves a non-executable
	// binary at consolePath (#7445).
	// On Windows, chmod is a no-op — Windows does not use POSIX permission
	// bits and attempting to set them can return "Permission denied" (#11075).
	stagedBinary := filepath.Join(stagingDir, "console")
	// fileModeBinary is the permission bits for the installed console binary.
	const fileModeBinary = 0755
	if err := chmodIfSupported(stagedBinary, fileModeBinary); err != nil {
		if rbErr := renameOrCopy(backupPath, consolePath); rbErr != nil {
			slog.Error("[AutoUpdate] backup restore failed after chmod error", "error", rbErr)
		}
		uc.recordError(fmt.Sprintf("chmod staged binary failed: %v", err))
		uc.broadcast("update_progress", UpdateProgressPayload{
			Status:  "failed",
			Message: "Failed to set binary permissions, rolled back",
			Error:   err.Error(),
		})
		return
	}

	// Replace with new binary. os.Rename fails with EXDEV when staging
	// and target are on different filesystems (#7242), so fall back to
	// copy+sync when rename returns a *os.LinkError.
	if err := renameOrCopy(stagedBinary, consolePath); err != nil {
		// Attempt to restore the backup before returning
		if rbErr := renameOrCopy(backupPath, consolePath); rbErr != nil {
			slog.Error("[AutoUpdate] backup restore failed after rename error", "error", rbErr)
		}
		uc.recordError(fmt.Sprintf("replace rename failed: %v", err))
		uc.broadcast("update_progress", UpdateProgressPayload{
			Status:  "failed",
			Message: "Failed to install new binary, rolled back",
			Error:   err.Error(),
		})
		return
	}

	uc.broadcast("update_progress", UpdateProgressPayload{
		Status:   "restarting",
		Message:  "Restarting backend...",
		Progress: 80,
	})

	uc.killBackend()
	if err := uc.restartBackend(); err != nil {
		// Rollback
		if rbErr := os.Rename(backupPath, consolePath); rbErr != nil {
			slog.Error("[AutoUpdate] backup restore failed after restart error", "error", rbErr)
		}
		uc.recordError(fmt.Sprintf("restart failed: %v", err))
		uc.broadcast("update_progress", UpdateProgressPayload{
			Status:  "failed",
			Message: "Restart failed, rolled back",
			Error:   err.Error(),
		})
		return
	}

	if !waitForBackendHealth() {
		if rbErr := os.Rename(backupPath, consolePath); rbErr != nil {
			slog.Error("[AutoUpdate] backup restore failed after health check failure", "error", rbErr)
		}
		uc.killBackend()
		if rbErr := uc.restartBackend(); rbErr != nil {
			slog.Error("[AutoUpdate] rollback restartBackend failed", "error", rbErr)
		}
		uc.recordError("new version failed health check")
		uc.broadcast("update_progress", UpdateProgressPayload{
			Status:  "failed",
			Message: "New version unhealthy, rolled back",
		})
		return
	}

	// Cleanup
	os.Remove(backupPath)
	os.Remove(tmpFile)
	os.RemoveAll(stagingDir)

	uc.mu.Lock()
	uc.currentVersion = release.TagName
	uc.lastUpdateTime = time.Now()
	uc.lastUpdateError = ""
	uc.mu.Unlock()

	slog.Info("[AutoUpdate] binary updated", "version", release.TagName)
	uc.broadcast("update_progress", UpdateProgressPayload{
		Status:   "done",
		Message:  fmt.Sprintf("Updated to %s", release.TagName),
		Progress: 100,
	})
}

func (uc *UpdateChecker) executeDevReleaseUpdate(release *githubReleaseInfo) {
	uc.mu.Lock()
	repoPath := uc.repoPath
	uc.mu.Unlock()

	if repoPath == "" {
		return
	}

	// Stash any local changes so the checkout succeeds
	stashed := gitStash(repoPath)

	uc.broadcast("update_progress", UpdateProgressPayload{
		Status:   "pulling",
		Message:  fmt.Sprintf("Checking out %s...", release.TagName),
		Progress: 10,
	})

	// Use uc.updateCtx as the parent so cancellation propagates (#7441, #7442, #7443).
	parentCtx := uc.updateCtx
	if parentCtx == nil {
		parentCtx = context.Background()
	}

	// Fetch and checkout the release tag — use context timeout so a flaky
	// remote cannot wedge the update subsystem indefinitely (#7280).
	fetchCtx, fetchCancel := context.WithTimeout(parentCtx, gitPullTimeout)
	defer fetchCancel()

	cmd := exec.CommandContext(fetchCtx, "git", "fetch", "origin", "tag", release.TagName)
	cmd.Dir = repoPath
	if err := cmd.Run(); err != nil {
		uc.recordError(fmt.Sprintf("git fetch tag failed: %v", err))
		if stashed {
			gitStashPop(repoPath)
		}
		return
	}

	checkoutCtx, checkoutCancel := context.WithTimeout(parentCtx, gitPullTimeout)
	defer checkoutCancel()

	cmd = exec.CommandContext(checkoutCtx, "git", "checkout", release.TagName)
	cmd.Dir = repoPath
	if err := cmd.Run(); err != nil {
		uc.recordError(fmt.Sprintf("git checkout failed: %v", err))
		if stashed {
			gitStashPop(repoPath)
		}
		return
	}

	uc.broadcast("update_progress", UpdateProgressPayload{
		Status:   "building",
		Message:  "Building frontend...",
		Progress: 30,
	})

	if err := rebuildFrontendCtx(parentCtx, repoPath); err != nil {
		uc.recordError(fmt.Sprintf("build failed: %v", err))
		return
	}

	uc.broadcast("update_progress", UpdateProgressPayload{
		Status:   "building",
		Message:  "Building Go binaries...",
		Progress: 60,
	})

	if err := rebuildGoBinariesCtx(parentCtx, repoPath); err != nil {
		uc.recordError(fmt.Sprintf("go build failed: %v", err))
		return
	}

	uc.broadcast("update_progress", UpdateProgressPayload{
		Status:   "restarting",
		Message:  "Restarting via startup-oauth.sh...",
		Progress: 80,
	})

	uc.mu.Lock()
	uc.currentVersion = release.TagName
	uc.lastUpdateTime = time.Now()
	uc.lastUpdateError = ""
	uc.mu.Unlock()

	slog.Info("[AutoUpdate] build complete, restarting via startup-oauth.sh", "version", release.TagName)
	uc.restartViaStartupScript(repoPath)
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
		cacheClean := exec.Command("npm", "cache", "clean", "--force")
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

// --- Utility functions ---

type githubReleaseInfo struct {
	TagName string `json:"tag_name"`
	Assets  []struct {
		Name               string `json:"name"`
		BrowserDownloadURL string `json:"browser_download_url"`
	} `json:"assets"`
}

type githubRefResponse struct {
	Object struct {
		SHA string `json:"sha"`
	} `json:"object"`
}

func detectAgentInstallMethod() string {
	if os.Getenv("KUBERNETES_SERVICE_HOST") != "" {
		return "helm"
	}
	if _, err := os.Stat("go.mod"); err == nil {
		return "dev"
	}
	return "binary"
}

// gitStartupTimeout bounds git commands run during agent startup (#7281).
const gitStartupTimeout = 5 * time.Second

func detectRepoPath() string {
	ctx, cancel := context.WithTimeout(context.Background(), gitStartupTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, "git", "rev-parse", "--show-toplevel")
	out, err := cmd.Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

func detectCurrentSHA(repoPath string) string {
	if repoPath == "" {
		return ""
	}
	ctx, cancel := context.WithTimeout(context.Background(), gitStartupTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, "git", "rev-parse", "HEAD")
	cmd.Dir = repoPath
	out, err := cmd.Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

// fetchLatestMainSHA gets the latest SHA on origin/main.
// For dev installs with a git repo, it uses `git fetch` (fast, no rate limits).
// Falls back to GitHub API for non-repo installs.
func fetchLatestMainSHA() (string, error) {
	return fetchLatestMainSHAWithRepo("")
}

// fetchLatestMainSHAWithRepo uses git fetch when repoPath is available,
// falling back to the GitHub API otherwise.
func fetchLatestMainSHAWithRepo(repoPath string) (string, error) {
	// Try git fetch + rev-parse first — instant, no rate limits, works offline
	if repoPath != "" {
		sha, err := gitFetchLatestSHA(repoPath)
		if err == nil {
			return sha, nil
		}
		slog.Error("[AutoUpdate] git fetch failed, falling back to GitHub API", "error", err)
	}

	// Fallback: GitHub API (unauthenticated, 60 req/hour rate limit)
	return fetchLatestMainSHAFromGitHub()
}

// gitFetchLatestSHA runs git fetch origin main and returns the SHA of origin/main.
func gitFetchLatestSHA(repoPath string) (string, error) {
	const gitFetchTimeout = 15 * time.Second

	ctx, cancel := context.WithTimeout(context.Background(), gitFetchTimeout)
	defer cancel()

	// Fetch only the main branch (fast, minimal data)
	fetchCmd := exec.CommandContext(ctx, "git", "fetch", "origin", "main", "--no-tags")
	fetchCmd.Dir = repoPath
	if out, err := fetchCmd.CombinedOutput(); err != nil {
		return "", fmt.Errorf("git fetch: %w (%s)", err, strings.TrimSpace(string(out)))
	}

	// Read the fetched SHA
	revCmd := exec.CommandContext(ctx, "git", "rev-parse", "origin/main")
	revCmd.Dir = repoPath
	out, err := revCmd.Output()
	if err != nil {
		return "", fmt.Errorf("git rev-parse origin/main: %w", err)
	}
	return strings.TrimSpace(string(out)), nil
}

// fetchLatestMainSHAFromGitHub calls the GitHub API to get the latest main SHA.
func fetchLatestMainSHAFromGitHub() (string, error) {
	const githubAPITimeout = 10 * time.Second
	client := &http.Client{Timeout: githubAPITimeout}
	resp, err := client.Get(githubMainRefURL())
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("github API returned %d", resp.StatusCode)
	}

	var ref githubRefResponse
	if err := json.NewDecoder(resp.Body).Decode(&ref); err != nil {
		return "", err
	}
	return ref.Object.SHA, nil
}

func fetchGitHubReleases() ([]githubReleaseInfo, error) {
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(githubReleasesURL())
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("github API returned %d", resp.StatusCode)
	}

	var releases []githubReleaseInfo
	if err := json.NewDecoder(resp.Body).Decode(&releases); err != nil {
		return nil, err
	}
	return releases, nil
}

// renameOrCopy attempts os.Rename first. When that fails with EXDEV
// (cross-device link — common when /tmp is tmpfs), it falls back to a
// copy-then-remove strategy so auto-update works regardless of filesystem
// layout (#7242).
func renameOrCopy(src, dst string) error {
	err := os.Rename(src, dst)
	if err == nil {
		return nil
	}
	// If not a cross-device error, return immediately.
	if !strings.Contains(err.Error(), "cross-device") &&
		!strings.Contains(err.Error(), "invalid cross-device link") {
		return err
	}

	slog.Info("[AutoUpdate] rename failed with EXDEV, falling back to copy", "src", src, "dst", dst)

	in, openErr := os.Open(src)
	if openErr != nil {
		return fmt.Errorf("copy fallback: open source: %w", openErr)
	}
	defer in.Close()

	// copyBinaryMode is the permission bits for the copied binary during update.
	const copyBinaryMode = 0755
	out, createErr := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, copyBinaryMode)
	if createErr != nil {
		return fmt.Errorf("copy fallback: create dest: %w", createErr)
	}

	if _, cpErr := io.Copy(out, in); cpErr != nil {
		out.Close()
		return fmt.Errorf("copy fallback: copy data: %w", cpErr)
	}
	if syncErr := out.Sync(); syncErr != nil {
		out.Close()
		return fmt.Errorf("copy fallback: sync: %w", syncErr)
	}
	if closeErr := out.Close(); closeErr != nil {
		return fmt.Errorf("copy fallback: close: %w", closeErr)
	}

	// Best-effort cleanup of the source file.
	os.Remove(src)
	return nil
}

func hasUncommittedChanges(repoPath string) bool {
	if repoPath == "" {
		return false
	}
	cmd := exec.Command("git", "status", "--porcelain", "-uno")
	cmd.Dir = repoPath
	out, err := cmd.Output()
	if err != nil {
		return true // assume dirty on error
	}
	return len(strings.TrimSpace(string(out))) > 0
}

// runGitPullWithTimeout runs git pull with a hard timeout to prevent hanging on network issues.
func runGitPullWithTimeout(repoPath string, timeout time.Duration) error {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, "git", "pull", "--ff-only", "origin", "main")
	cmd.Dir = repoPath
	out, err := cmd.CombinedOutput()
	if ctx.Err() == context.DeadlineExceeded {
		return fmt.Errorf("timed out after %s", timeout)
	}
	if err != nil {
		return fmt.Errorf("%w: %s", err, strings.TrimSpace(string(out)))
	}
	return nil
}

// gitStashTimeout is the hard deadline for git stash operations.
const gitStashTimeout = 60 * time.Second

// gitStash stashes uncommitted changes if any exist. Returns true if a stash was created.
func gitStash(repoPath string) bool {
	if !hasUncommittedChanges(repoPath) {
		return false
	}
	slog.Info("[AutoUpdate] Stashing uncommitted changes before update")
	ctx, cancel := context.WithTimeout(context.Background(), gitStashTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, "git", "stash", "push", "-m", "auto-update: stashed by kc-agent")
	cmd.Dir = repoPath
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		slog.Error("[AutoUpdate] git stash failed", "error", err)
		return false
	}
	return true
}

// gitStashPop restores previously stashed changes.
func gitStashPop(repoPath string) {
	slog.Info("[AutoUpdate] Restoring stashed changes")
	ctx, cancel := context.WithTimeout(context.Background(), gitStashTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, "git", "stash", "pop")
	cmd.Dir = repoPath
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		slog.Error("[AutoUpdate] git stash pop failed (changes saved in stash)", "error", err)
	}
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

func rollbackGit(repoPath, sha string) {
	if sha == "" || repoPath == "" {
		return
	}
	// gitRollbackTimeout is the hard deadline for a rollback git-reset.
	const gitRollbackTimeout = 30 * time.Second
	ctx, cancel := context.WithTimeout(context.Background(), gitRollbackTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, "git", "reset", "--hard", sha)
	cmd.Dir = repoPath
	if err := cmd.Run(); err != nil {
		slog.Error("[AutoUpdate] rollback failed", "sha", short(sha), "error", err)
	}
}

func waitForBackendHealth() bool {
	client := &http.Client{Timeout: healthCheckTimeout}
	// URL is resolved once per poll so that a BACKEND_PORT env var change
	// mid-run (e.g. an operator re-running startup-oauth.sh) is picked up.
	healthURL := backendHealthURL()
	for i := 0; i < healthCheckRetries; i++ {
		resp, err := client.Get(healthURL)
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				return true
			}
		}
		time.Sleep(healthCheckDelay)
	}
	return false
}

func downloadFile(url, dest string) error {
	client := &http.Client{Timeout: 5 * time.Minute}
	resp, err := client.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download returned %d", resp.StatusCode)
	}

	f, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer f.Close()

	_, err = io.Copy(f, resp.Body)
	return err
}

func short(sha string) string {
	if len(sha) > 7 {
		return sha[:7]
	}
	return sha
}

// --- Build execution with timeout, heartbeat, and output capture ---

// buildResult holds the outcome of a build command.
type buildResult struct {
	err    error
	output string // combined stdout+stderr (last buildOutputTailLines lines)
}

// writerFunc adapts a plain function to the io.Writer interface.
type writerFunc func([]byte) (int, error)

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
	go func() {
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
	}()

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
