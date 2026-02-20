package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"sync"
	"time"
)

const (
	developerCheckInterval = 5 * time.Minute
	releaseCheckInterval   = 60 * time.Minute
	healthCheckRetries     = 15
	healthCheckDelay       = 2 * time.Second
	githubMainRefURL       = "https://api.github.com/repos/kubestellar/console/git/ref/heads/main"
	githubReleasesURL      = "https://api.github.com/repos/kubestellar/console/releases"
)

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
}

// UpdateCheckerConfig holds initialization parameters.
type UpdateCheckerConfig struct {
	Broadcast      func(string, interface{})
	RestartBackend func() error
	KillBackend    func() bool
}

// UpdateProgressPayload is broadcast via WebSocket during updates.
type UpdateProgressPayload struct {
	Status   string `json:"status"`
	Message  string `json:"message"`
	Progress int    `json:"progress"`
	Error    string `json:"error,omitempty"`
}

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
func (uc *UpdateChecker) Status() AutoUpdateStatusResponse {
	uc.mu.Lock()
	defer uc.mu.Unlock()

	resp := AutoUpdateStatusResponse{
		InstallMethod:         uc.installMethod,
		RepoPath:              uc.repoPath,
		CurrentSHA:            uc.currentSHA,
		AutoUpdateEnabled:     uc.enabled,
		Channel:               uc.channel,
		HasUncommittedChanges: hasUncommittedChanges(uc.repoPath),
	}

	if !uc.lastUpdateTime.IsZero() {
		resp.LastUpdateTime = uc.lastUpdateTime.Format(time.RFC3339)
	}
	if uc.lastUpdateError != "" {
		resp.LastUpdateResult = uc.lastUpdateError
	}

	// Fetch latest SHA for developer channel
	if uc.channel == "developer" && uc.repoPath != "" {
		if sha, err := fetchLatestMainSHA(); err == nil {
			resp.LatestSHA = sha
			resp.HasUpdate = sha != uc.currentSHA && uc.currentSHA != ""
		}
	}

	return resp
}

// TriggerNow runs an immediate update check (non-blocking).
func (uc *UpdateChecker) TriggerNow() {
	go uc.checkAndUpdate()
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
		log.Println("[AutoUpdate] Developer channel requires a git repo, skipping")
		return
	}

	if hasUncommittedChanges(repoPath) {
		log.Println("[AutoUpdate] Uncommitted changes detected, skipping update")
		uc.broadcast("update_progress", UpdateProgressPayload{
			Status:  "idle",
			Message: "Update paused: uncommitted changes",
		})
		return
	}

	latestSHA, err := fetchLatestMainSHA()
	if err != nil {
		log.Printf("[AutoUpdate] Failed to check main SHA: %v", err)
		return
	}

	if latestSHA == currentSHA || currentSHA == "" {
		return
	}

	log.Printf("[AutoUpdate] New commit on main: %s -> %s", short(currentSHA), short(latestSHA))
	uc.executeDeveloperUpdate(latestSHA)
}

func (uc *UpdateChecker) executeDeveloperUpdate(newSHA string) {
	uc.mu.Lock()
	repoPath := uc.repoPath
	previousSHA := uc.currentSHA
	uc.mu.Unlock()

	uc.broadcast("update_progress", UpdateProgressPayload{
		Status:   "pulling",
		Message:  fmt.Sprintf("Pulling %s from main...", short(newSHA)),
		Progress: 20,
	})

	if err := runGitPull(repoPath); err != nil {
		uc.recordError(fmt.Sprintf("git pull failed: %v", err))
		uc.broadcast("update_progress", UpdateProgressPayload{
			Status:  "failed",
			Message: "git pull failed",
			Error:   err.Error(),
		})
		return
	}

	uc.broadcast("update_progress", UpdateProgressPayload{
		Status:   "building",
		Message:  "Installing dependencies and building frontend...",
		Progress: 50,
	})

	if err := rebuildFrontend(repoPath); err != nil {
		uc.recordError(fmt.Sprintf("build failed: %v", err))
		uc.broadcast("update_progress", UpdateProgressPayload{
			Status:  "failed",
			Message: "Frontend build failed, rolling back...",
			Error:   err.Error(),
		})
		// Rollback
		rollbackGit(repoPath, previousSHA)
		rebuildFrontend(repoPath) //nolint:errcheck
		return
	}

	uc.broadcast("update_progress", UpdateProgressPayload{
		Status:   "restarting",
		Message:  "Restarting backend...",
		Progress: 80,
	})

	uc.killBackend()
	if err := uc.restartBackend(); err != nil {
		uc.recordError(fmt.Sprintf("restart failed: %v", err))
		uc.broadcast("update_progress", UpdateProgressPayload{
			Status:  "failed",
			Message: "Backend restart failed",
			Error:   err.Error(),
		})
		return
	}

	// Wait for backend health
	if !waitForBackendHealth() {
		uc.recordError("backend not healthy after restart")
		uc.broadcast("update_progress", UpdateProgressPayload{
			Status:  "failed",
			Message: "Backend not healthy after update",
			Error:   "Health check timed out",
		})
		return
	}

	uc.mu.Lock()
	uc.currentSHA = newSHA
	uc.lastUpdateTime = time.Now()
	uc.lastUpdateError = ""
	uc.mu.Unlock()

	log.Printf("[AutoUpdate] Successfully updated to %s", short(newSHA))
	uc.broadcast("update_progress", UpdateProgressPayload{
		Status:   "done",
		Message:  fmt.Sprintf("Updated to %s", short(newSHA)),
		Progress: 100,
	})
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
		log.Printf("[AutoUpdate] Failed to fetch releases: %v", err)
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
		return
	}

	log.Printf("[AutoUpdate] New release available: %s -> %s", currentVersion, latest.TagName)

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

	// Download to temp file
	tmpFile := fmt.Sprintf("/tmp/kc-update-%s.tar.gz", release.TagName)
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

	// Extract to staging directory
	stagingDir := "/tmp/kc-update-staging"
	os.RemoveAll(stagingDir)
	os.MkdirAll(stagingDir, 0755)

	extractCmd := exec.Command("tar", "xzf", tmpFile, "-C", stagingDir)
	if err := extractCmd.Run(); err != nil {
		uc.recordError(fmt.Sprintf("extract failed: %v", err))
		uc.broadcast("update_progress", UpdateProgressPayload{
			Status:  "failed",
			Message: "Extract failed",
			Error:   err.Error(),
		})
		return
	}

	// Find current binary location
	consolePath, err := exec.LookPath("console")
	if err != nil {
		// Try relative path
		consolePath = "./console"
	}

	// Backup current binary
	os.Rename(consolePath, consolePath+".backup")

	// Replace
	os.Rename(stagingDir+"/console", consolePath)
	os.Chmod(consolePath, 0755)

	uc.broadcast("update_progress", UpdateProgressPayload{
		Status:   "restarting",
		Message:  "Restarting backend...",
		Progress: 80,
	})

	uc.killBackend()
	if err := uc.restartBackend(); err != nil {
		// Rollback
		os.Rename(consolePath+".backup", consolePath)
		uc.recordError(fmt.Sprintf("restart failed: %v", err))
		uc.broadcast("update_progress", UpdateProgressPayload{
			Status:  "failed",
			Message: "Restart failed, rolled back",
			Error:   err.Error(),
		})
		return
	}

	if !waitForBackendHealth() {
		os.Rename(consolePath+".backup", consolePath)
		uc.killBackend()
		uc.restartBackend() //nolint:errcheck
		uc.recordError("new version failed health check")
		uc.broadcast("update_progress", UpdateProgressPayload{
			Status:  "failed",
			Message: "New version unhealthy, rolled back",
		})
		return
	}

	// Cleanup
	os.Remove(consolePath + ".backup")
	os.Remove(tmpFile)
	os.RemoveAll(stagingDir)

	uc.mu.Lock()
	uc.currentVersion = release.TagName
	uc.lastUpdateTime = time.Now()
	uc.lastUpdateError = ""
	uc.mu.Unlock()

	log.Printf("[AutoUpdate] Binary updated to %s", release.TagName)
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

	if repoPath == "" || hasUncommittedChanges(repoPath) {
		return
	}

	uc.broadcast("update_progress", UpdateProgressPayload{
		Status:   "pulling",
		Message:  fmt.Sprintf("Checking out %s...", release.TagName),
		Progress: 20,
	})

	// Fetch and checkout the release tag
	cmd := exec.Command("git", "fetch", "origin", "tag", release.TagName)
	cmd.Dir = repoPath
	if err := cmd.Run(); err != nil {
		uc.recordError(fmt.Sprintf("git fetch tag failed: %v", err))
		return
	}

	cmd = exec.Command("git", "checkout", release.TagName)
	cmd.Dir = repoPath
	if err := cmd.Run(); err != nil {
		uc.recordError(fmt.Sprintf("git checkout failed: %v", err))
		return
	}

	uc.broadcast("update_progress", UpdateProgressPayload{
		Status:   "building",
		Message:  "Building frontend...",
		Progress: 50,
	})

	if err := rebuildFrontend(repoPath); err != nil {
		uc.recordError(fmt.Sprintf("build failed: %v", err))
		return
	}

	uc.broadcast("update_progress", UpdateProgressPayload{
		Status:   "restarting",
		Message:  "Restarting backend...",
		Progress: 80,
	})

	uc.killBackend()
	uc.restartBackend() //nolint:errcheck

	if waitForBackendHealth() {
		uc.mu.Lock()
		uc.currentVersion = release.TagName
		uc.lastUpdateTime = time.Now()
		uc.lastUpdateError = ""
		uc.mu.Unlock()

		uc.broadcast("update_progress", UpdateProgressPayload{
			Status:   "done",
			Message:  fmt.Sprintf("Updated to %s", release.TagName),
			Progress: 100,
		})
	}
}

func (uc *UpdateChecker) recordError(msg string) {
	uc.mu.Lock()
	uc.lastUpdateError = msg
	uc.lastUpdateTime = time.Now()
	uc.mu.Unlock()
	log.Printf("[AutoUpdate] Error: %s", msg)
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

func detectRepoPath() string {
	cmd := exec.Command("git", "rev-parse", "--show-toplevel")
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
	cmd := exec.Command("git", "rev-parse", "HEAD")
	cmd.Dir = repoPath
	out, err := cmd.Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

func fetchLatestMainSHA() (string, error) {
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(githubMainRefURL)
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
	resp, err := client.Get(githubReleasesURL)
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

func hasUncommittedChanges(repoPath string) bool {
	if repoPath == "" {
		return false
	}
	cmd := exec.Command("git", "status", "--porcelain")
	cmd.Dir = repoPath
	out, err := cmd.Output()
	if err != nil {
		return true // assume dirty on error
	}
	return len(strings.TrimSpace(string(out))) > 0
}

func runGitPull(repoPath string) error {
	cmd := exec.Command("git", "pull", "--rebase", "origin", "main")
	cmd.Dir = repoPath
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

func rebuildFrontend(repoPath string) error {
	webDir := repoPath + "/web"

	npmInstall := exec.Command("npm", "install", "--prefer-offline")
	npmInstall.Dir = webDir
	npmInstall.Stdout = os.Stdout
	npmInstall.Stderr = os.Stderr
	if err := npmInstall.Run(); err != nil {
		return fmt.Errorf("npm install: %w", err)
	}

	npmBuild := exec.Command("npm", "run", "build")
	npmBuild.Dir = webDir
	npmBuild.Stdout = os.Stdout
	npmBuild.Stderr = os.Stderr
	if err := npmBuild.Run(); err != nil {
		return fmt.Errorf("npm run build: %w", err)
	}

	return nil
}

func rollbackGit(repoPath, sha string) {
	if sha == "" {
		return
	}
	cmd := exec.Command("git", "reset", "--hard", sha)
	cmd.Dir = repoPath
	if err := cmd.Run(); err != nil {
		log.Printf("[AutoUpdate] Rollback to %s failed: %v", short(sha), err)
	}
}

func waitForBackendHealth() bool {
	client := &http.Client{Timeout: healthCheckTimeout}
	for i := 0; i < healthCheckRetries; i++ {
		resp, err := client.Get(defaultHealthCheckURL)
		if err == nil && resp.StatusCode == http.StatusOK {
			resp.Body.Close()
			return true
		}
		if resp != nil {
			resp.Body.Close()
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
