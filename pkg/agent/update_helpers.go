package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"
)

// githubHTTPClient is reused across all GitHub API calls to enable connection
// pooling and reduce per-request allocation overhead.
var githubHTTPClient = &http.Client{Timeout: githubAPITimeout}

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
	resp, err := githubHTTPClient.Get(githubMainRefURL())
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
	resp, err := githubHTTPClient.Get(githubReleasesURL())
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
