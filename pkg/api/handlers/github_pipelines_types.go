// Package handlers — GitHub Pipelines types and constants
//
// Type definitions, constants, and package-level variables extracted from
// github_pipelines.go. Shared by handler methods and helper functions.
package handlers

import (
	"os"
	"regexp"
	"strings"
	"sync"
	"time"

	"log/slog"
)

// ---------------------------------------------------------------------------
// Constants — mirror web/netlify/functions/github-pipelines.mts
// ---------------------------------------------------------------------------

const (
	ghpCacheTTL             = 5 * time.Minute
	ghpCacheStaleTTL        = 1 * time.Hour // Serve stale data for 1h after expiration when GitHub rate-limits
	ghpMatrixDefaultDays    = 14
	ghpMatrixMaxDays        = 90
	ghpHistoryRetentionDays = 90
	ghpFailuresLimit        = 10
	ghpFailuresOverfetch    = 30
	ghpLogTailLines         = 500
	ghpMatrixRunsPerRepo    = 200
	ghpFlowMaxRunsPerRepo   = 8
	ghpPulseWindowDays      = 14
	ghpGitHubAPIBase        = "https://api.github.com"
	ghpNightlyReleaseRepo   = "kubestellar/console"
	ghpNightlyReleaseWFFile = "release.yml"
	ghpNightlyReleaseCron   = "0 5 * * *"
	ghpHTTPTimeout          = 15 * time.Second
	ghpFetchTimeout         = 45 * time.Second
	ghpMutationHTTPTimeout  = 15 * time.Second
	ghpMaxErrorBodyBytes    = 10_000
	ghpMaxLogBytes          = 10 * 1024 * 1024 // 10 MB cap on job log downloads
	ghpMatrixSparseMinCells = 1
	ghpReleaseOverfetch     = 10 // fetch recent releases so we can sort by published_at

	// ghpMaxConcurrentFetches bounds per-request goroutine fan-out for GitHub
	// API calls (job fetches, repo fetches). Prevents spike in outbound
	// connections and memory when many repos/runs are queried.
	ghpMaxConcurrentFetches = 8

	// ghpMaxAllocItems is the upper bound for slice sizes derived from API
	// responses. Prevents allocation-size-overflow if GitHub returns a
	// malformed or unexpectedly large total_count / array (go/allocation-size-overflow).
	ghpMaxAllocItems = 10_000

	// ghGetWithRetry tuning — see issue #9059. Mirrors the retry pattern in
	// benchmarks.go (driveGetWithRetry). Only 403/429 trigger a retry;
	// other statuses (including 5xx) are returned as-is to the caller so
	// existing error handling continues to work.
	GH_RETRY_MAX_ATTEMPTS  = 3
	GH_RETRY_BASE_DELAY_MS = 1000
	GH_RETRY_MAX_DELAY_MS  = 10_000
)

// ghpDefaultRepos is the default when PIPELINE_REPOS env var is not set.
var ghpDefaultRepos = []string{
	"kubestellar/console",
	"kubestellar/docs",
	"kubestellar/console-kb",
	"kubestellar/kubestellar-mcp",
	"kubestellar/console-marketplace",
	"kubestellar/homebrew-tap",
}

// ghpGetRepos reads the PIPELINE_REPOS env var (comma-separated owner/repo
// list). Falls back to ghpDefaultRepos if unset. Called once at handler
// construction time — not on every request.
func ghpGetRepos() []string {
	env := os.Getenv("PIPELINE_REPOS")
	if env == "" {
		return ghpDefaultRepos
	}
	repos := make([]string, 0)
	for _, s := range strings.Split(env, ",") {
		s = strings.TrimSpace(s)
		if s != "" {
			if !ghpValidRepoPattern.MatchString(s) {
				slog.Warn("[GitHubPipelines] Invalid repo slug in PIPELINE_REPOS, skipping", "repo", s)
				continue
			}
			repos = append(repos, s)
		}
	}
	if len(repos) == 0 {
		return ghpDefaultRepos
	}
	return repos
}

// ghpRepos is populated once at init from PIPELINE_REPOS env var.
var ghpRepos = ghpGetRepos()

// ghpRateLimitHeadersKey is the context key for storing GitHub API rate limit headers.
type ghpContextKey string

const ghpRateLimitHeadersKey ghpContextKey = "rateLimitHeaders"

// ghpValidRepoPattern enforces strict owner/repo format to prevent path
// traversal — the repo value is interpolated into GitHub API paths.
var ghpValidRepoPattern = regexp.MustCompile(`^[a-zA-Z0-9._-]+/[a-zA-Z0-9._-]+$`)

// ghpNightlyTagRe matches nightly release tags like "v0.3.21-nightly.20260417".
// Anchored to prevent partial substring collisions on tag names that contain
// "nightly" as a fragment of a larger word (go/regex/missing-regexp-anchor).
var ghpNightlyTagRe = regexp.MustCompile(`(?i)^.*nightly.*$`)

// ghpPRFromCommitRe extracts a PR number from merge-commit messages like
// "feat: something (#8673)". Anchored at end only — the leading content is
// arbitrary; the PR reference must appear at the very end of the line.
var ghpPRFromCommitRe = regexp.MustCompile(`^.*\(#(\d+)\)\s*$`)

func ghpIsAllowedRepo(repo string) bool {
	// Accept any valid owner/repo slug — the GitHub token's permissions
	// are the real access control. The preconfigured list only controls
	// which repos are fetched by default (no filter), not which repos
	// a user is allowed to query.
	if ghpValidRepoPattern.MatchString(repo) {
		return true
	}
	for _, r := range ghpRepos {
		if r == repo {
			return true
		}
	}
	return false
}

// ---------------------------------------------------------------------------
// Wire shapes — match the Netlify function's JSON exactly so the TS hook
// doesn't have to know which backend served the response.
// ---------------------------------------------------------------------------

// ghpPullRequestRef is a compact reference to a PR associated with a run.
type ghpPullRequestRef struct {
	Number int    `json:"number"`
	URL    string `json:"url"`
}

type ghpWorkflowRun struct {
	ID           int64               `json:"id"`
	Repo         string              `json:"repo"`
	Name         string              `json:"name"`
	WorkflowID   int64               `json:"workflowId"`
	HeadBranch   string              `json:"headBranch"`
	Status       string              `json:"status"`
	Conclusion   *string             `json:"conclusion"`
	Event        string              `json:"event"`
	RunNumber    int                 `json:"runNumber"`
	HTMLURL      string              `json:"htmlUrl"`
	CreatedAt    string              `json:"createdAt"`
	UpdatedAt    string              `json:"updatedAt"`
	PullRequests []ghpPullRequestRef `json:"pullRequests,omitempty"`
}

type ghpStep struct {
	Name        string  `json:"name"`
	Status      string  `json:"status"`
	Conclusion  *string `json:"conclusion"`
	Number      int     `json:"number"`
	StartedAt   string  `json:"startedAt,omitempty"`
	CompletedAt string  `json:"completedAt,omitempty"`
}

type ghpJob struct {
	ID          int64     `json:"id"`
	Name        string    `json:"name"`
	Status      string    `json:"status"`
	Conclusion  *string   `json:"conclusion"`
	StartedAt   *string   `json:"startedAt"`
	CompletedAt *string   `json:"completedAt"`
	HTMLURL     string    `json:"htmlUrl"`
	Steps       []ghpStep `json:"steps"`
}

type ghpPulseLastRun struct {
	Conclusion *string `json:"conclusion"`
	CreatedAt  string  `json:"createdAt"`
	HTMLURL    string  `json:"htmlUrl"`
	RunNumber  int     `json:"runNumber"`
	ReleaseTag *string `json:"releaseTag"`
	WeeklyTag  *string `json:"weeklyTag,omitempty"`
}

type ghpPulseRecent struct {
	Conclusion *string `json:"conclusion"`
	CreatedAt  string  `json:"createdAt"`
	HTMLURL    string  `json:"htmlUrl"`
}

type ghpPulsePayload struct {
	LastRun    *ghpPulseLastRun `json:"lastRun"`
	Streak     int              `json:"streak"`
	StreakKind string           `json:"streakKind"`
	Recent     []ghpPulseRecent `json:"recent"`
	NextCron   string           `json:"nextCron"`
}

type ghpMatrixCell struct {
	Date       string  `json:"date"`
	Conclusion *string `json:"conclusion"`
	HTMLURL    string  `json:"htmlUrl"`
}

type ghpMatrixWorkflow struct {
	Repo  string          `json:"repo"`
	Name  string          `json:"name"`
	Cells []ghpMatrixCell `json:"cells"`
}

type ghpMatrixPayload struct {
	Days      int                 `json:"days"`
	Range     []string            `json:"range"`
	Workflows []ghpMatrixWorkflow `json:"workflows"`
}

type ghpFlowRun struct {
	Run  ghpWorkflowRun `json:"run"`
	Jobs []ghpJob       `json:"jobs"`
}

type ghpFlowPayload struct {
	Runs []ghpFlowRun `json:"runs"`
}

type ghpFailedStep struct {
	JobID    int64  `json:"jobId"`
	JobName  string `json:"jobName"`
	StepName string `json:"stepName"`
}

type ghpFailureRow struct {
	Repo         string              `json:"repo"`
	RunID        int64               `json:"runId"`
	Workflow     string              `json:"workflow"`
	HTMLURL      string              `json:"htmlUrl"`
	Branch       string              `json:"branch"`
	Event        string              `json:"event"`
	Conclusion   *string             `json:"conclusion"`
	CreatedAt    string              `json:"createdAt"`
	DurationMs   int64               `json:"durationMs"`
	FailedStep   *ghpFailedStep      `json:"failedStep"`
	PullRequests []ghpPullRequestRef `json:"pullRequests,omitempty"`
}

type ghpFailuresPayload struct {
	Runs []ghpFailureRow `json:"runs"`
}

type ghpLogPayload struct {
	Lines         int    `json:"lines"`
	TruncatedFrom int    `json:"truncatedFrom"`
	Log           string `json:"log"`
}

// History — in-memory rolling 90-day record of per-workflow daily outcomes.
// Lost on process restart; re-seeded from GitHub on the next request. GitHub
// keeps 14 days of run history, so restart means the 30/90 day views are
// thin until the process accumulates again.
// ---------------------------------------------------------------------------

type ghpHistoryDay struct {
	RunID      int64
	Conclusion *string
	HTMLURL    string
}

type ghpHistory struct {
	mu sync.RWMutex
	// repo -> workflow name -> dateKey (YYYY-MM-DD) -> ghpHistoryDay
	days map[string]map[string]map[string]ghpHistoryDay
}

func newGHPHistory() *ghpHistory {
	return &ghpHistory{days: make(map[string]map[string]map[string]ghpHistoryDay)}
}

func (h *ghpHistory) merge(runs []ghpWorkflowRun) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for _, r := range runs {
		if len(r.CreatedAt) < 10 {
			continue
		}
		day := r.CreatedAt[:10]
		byRepo, ok := h.days[r.Repo]
		if !ok {
			byRepo = make(map[string]map[string]ghpHistoryDay)
			h.days[r.Repo] = byRepo
		}
		byWF, ok := byRepo[r.Name]
		if !ok {
			byWF = make(map[string]ghpHistoryDay)
			byRepo[r.Name] = byWF
		}
		conclusion := r.Conclusion
		if conclusion == nil && (r.Status == "in_progress" || r.Status == "queued") {
			inProg := "in_progress"
			conclusion = &inProg
		}
		existing, had := byWF[day]
		if !had || r.ID > existing.RunID {
			byWF[day] = ghpHistoryDay{RunID: r.ID, Conclusion: conclusion, HTMLURL: r.HTMLURL}
		}
	}
	cutoff := time.Now().UTC().AddDate(0, 0, -ghpHistoryRetentionDays).Format("2006-01-02")
	for repo, byRepo := range h.days {
		for wf, byWF := range byRepo {
			for d := range byWF {
				if d < cutoff {
					delete(byWF, d)
				}
			}
			if len(byWF) == 0 {
				delete(byRepo, wf)
			}
		}
		if len(byRepo) == 0 {
			delete(h.days, repo)
		}
	}
}

func (h *ghpHistory) snapshot() map[string]map[string]map[string]ghpHistoryDay {
	h.mu.RLock()
	defer h.mu.RUnlock()
	out := make(map[string]map[string]map[string]ghpHistoryDay, len(h.days))
	for repo, byRepo := range h.days {
		rMap := make(map[string]map[string]ghpHistoryDay, len(byRepo))
		out[repo] = rMap
		for wf, byWF := range byRepo {
			wMap := make(map[string]ghpHistoryDay, len(byWF))
			rMap[wf] = wMap
			for d, v := range byWF {
				wMap[d] = v
			}
		}
	}
	return out
}

// ghpCacheEntry holds a cached response with expiration time.
type ghpCacheEntry struct {
	body []byte
	exp  time.Time
}

// workflowRunRaw is the raw GitHub API response shape for workflow runs.
type workflowRunRaw struct {
	ID           int64   `json:"id"`
	Name         string  `json:"name"`
	WorkflowID   int64   `json:"workflow_id"`
	HeadBranch   string  `json:"head_branch"`
	Status       string  `json:"status"`
	Conclusion   *string `json:"conclusion"`
	Event        string  `json:"event"`
	RunNumber    int     `json:"run_number"`
	HTMLURL      string  `json:"html_url"`
	CreatedAt    string  `json:"created_at"`
	UpdatedAt    string  `json:"updated_at"`
	PullRequests []struct {
		Number int    `json:"number"`
		URL    string `json:"url"`
	} `json:"pull_requests"`
	HeadCommit struct {
		Message string `json:"message"`
	} `json:"head_commit"`
}

// ghpMaxPerPage is the GitHub API maximum for per_page.
const ghpMaxPerPage = 100

// ghpMaxPages caps pagination depth to avoid runaway API calls.
const ghpMaxPages = 5

type ghpAllPayload struct {
	Pulse    any `json:"pulse"`
	Matrix   any `json:"matrix"`
	Failures any `json:"failures"`
	Flow     any `json:"flow"`
}
