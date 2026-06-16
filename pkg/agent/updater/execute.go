package updater

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"time"
)

// semverTagRE validates that a GitHub release tag is a well-formed semver
// string (with or without the leading "v"). This guards against git flag
// injection via a crafted tag_name in the GitHub Releases API response:
// a tag starting with "--" would otherwise be interpreted by git as a flag
// rather than a refspec (CWE-20).
var semverTagRE = regexp.MustCompile(`^v?\d+\.\d+\.\d+`)

// validateTagName returns an error if tag does not look like a semver string.
func validateTagName(tag string) error {
	if !semverTagRE.MatchString(tag) {
		return fmt.Errorf("release tag %q does not match expected semver pattern (v?X.Y.Z)", tag)
	}
	return nil
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
			Error:   "check server logs for details",
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
			Error:   "check server logs for details (try: sudo chown -R $(id -u):$(id -g) ~/.npm)",
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

func (uc *UpdateChecker) executeBinaryUpdate(release *githubReleaseInfo) {
	uc.executeBinaryUpdateFlow(release)
}

func (uc *UpdateChecker) executeDevReleaseUpdate(release *githubReleaseInfo) {
	uc.mu.Lock()
	repoPath := uc.repoPath
	uc.mu.Unlock()

	if repoPath == "" {
		return
	}

	// Validate the tag name before passing it to git to prevent git flag injection
	// via a crafted tag_name in the GitHub Releases API response (CWE-20, #18488).
	if err := validateTagName(release.TagName); err != nil {
		slog.Error("[AutoUpdate] invalid release tag name", "tag", release.TagName, "error", err)
		uc.recordError(fmt.Sprintf("invalid release tag: %v", err))
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
