package handlers

import (
	"encoding/json"
	"fmt"
	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/client"
	"github.com/kubestellar/console/pkg/safego"
	"golang.org/x/sync/singleflight"
	"io"
	"log/slog"
	"net/http"
	"sync"
	"time"
)

// NightlyWorkflow defines a GitHub Actions workflow to monitor.
type NightlyWorkflow struct {
	Repo         string            `json:"repo"`
	WorkflowFile string            `json:"workflowFile"`
	Guide        string            `json:"guide"`
	Acronym      string            `json:"acronym"`
	Platform     string            `json:"platform"`
	Model        string            `json:"model"`
	GPUType      string            `json:"gpuType"`
	GPUCount     int               `json:"gpuCount"`
	GuidePath    string            `json:"-"`           // directory under guides/ in llm-d/llm-d repo
	LLMDImages   map[string]string `json:"llmdImages"`  // llm-d component → tag (populated dynamically)
	OtherImages  map[string]string `json:"otherImages"` // non-llm-d containers → tag
}

// NightlyRun represents a single workflow run from the GitHub Actions API.
// Per-run metadata (Model, GPUType, GPUCount) is populated from the workflow
// defaults so the UI can display infrastructure details per dot on hover.
type NightlyRun struct {
	ID            int64   `json:"id"`
	Status        string  `json:"status"`
	Conclusion    *string `json:"conclusion"`
	CreatedAt     string  `json:"createdAt"`
	UpdatedAt     string  `json:"updatedAt"`
	HTMLURL       string  `json:"htmlUrl"`
	RunNumber     int     `json:"runNumber"`
	FailureReason string  `json:"failureReason,omitempty"`
	Model         string  `json:"model"`
	GPUType       string  `json:"gpuType"`
	GPUCount      int     `json:"gpuCount"`
	Event         string  `json:"event"`
}

// NightlyGuideStatus holds runs and computed stats for a single guide.
type NightlyGuideStatus struct {
	Guide            string            `json:"guide"`
	Acronym          string            `json:"acronym"`
	Platform         string            `json:"platform"`
	Repo             string            `json:"repo"`
	WorkflowFile     string            `json:"workflowFile"`
	Runs             []NightlyRun      `json:"runs"`
	PassRate         int               `json:"passRate"`
	Trend            string            `json:"trend"`
	LatestConclusion *string           `json:"latestConclusion"`
	Model            string            `json:"model"`
	GPUType          string            `json:"gpuType"`
	GPUCount         int               `json:"gpuCount"`
	LLMDImages       map[string]string `json:"llmdImages"`  // llm-d component → tag
	OtherImages      map[string]string `json:"otherImages"` // non-llm-d containers → tag
}

// NightlyE2EResponse is the JSON response from the /api/nightly-e2e/runs endpoint.
type NightlyE2EResponse struct {
	Guides    []NightlyGuideStatus `json:"guides"`
	CachedAt  string               `json:"cachedAt"`
	FromCache bool                 `json:"fromCache"`
}

// JobLog holds the name, conclusion, and truncated log output for one job.
type JobLog struct {
	Name       string `json:"name"`
	Conclusion string `json:"conclusion"`
	Log        string `json:"log"`
}

// RunLogsResponse is the JSON response from the /api/nightly-e2e/run-logs endpoint.
type RunLogsResponse struct {
	Jobs []JobLog `json:"jobs"`
}

// NightlyE2EHandler serves nightly E2E workflow data proxied from GitHub.
type NightlyE2EHandler struct {
	githubToken string
	httpClient  *http.Client

	mu       sync.RWMutex
	cache    *NightlyE2EResponse
	cacheExp time.Time
	// #7053 — singleflight group coalesces concurrent cold-cache GetRuns
	// callers into a single fetchAllWithContext call.
	fetchGroup singleflight.Group

	logMu       sync.RWMutex
	logCache    map[string]*RunLogsResponse // key: "repo/runId"
	logCacheExp map[string]time.Time

	imgMu       sync.RWMutex
	imgCache    map[string]map[string]string // guidePath → image name → tag
	imgCacheExp time.Time
}

// nightlyWorkflows is the canonical list of nightly E2E workflows to monitor.
// GuidePath maps to the directory under guides/ in llm-d/llm-d whose YAML files
// contain the image references. LLMDImages is populated dynamically at runtime.
var nightlyWorkflows = []NightlyWorkflow{
	// OCP — all OCP guides run on H100 except WVA (A100)
	{Repo: "llm-d/llm-d", WorkflowFile: "nightly-e2e-optimized-baseline-ocp.yaml", Guide: "Optimized Baseline", Acronym: "IS", Platform: "OCP", Model: "Qwen3-32B", GPUType: "H100", GPUCount: 2, GuidePath: "optimized-baseline"},
	{Repo: "llm-d/llm-d", WorkflowFile: "nightly-e2e-pd-disaggregation-ocp.yaml", Guide: "PD Disaggregation", Acronym: "PD", Platform: "OCP", Model: "Qwen3-0.6B", GPUType: "H100", GPUCount: 2, GuidePath: "pd-disaggregation"},
	{Repo: "llm-d/llm-d", WorkflowFile: "nightly-e2e-precise-prefix-cache-ocp.yaml", Guide: "Precise Prefix Cache", Acronym: "PPC", Platform: "OCP", Model: "Qwen3-32B", GPUType: "H100", GPUCount: 2, GuidePath: "precise-prefix-cache-aware"},
	{Repo: "llm-d/llm-d", WorkflowFile: "nightly-e2e-tiered-prefix-cache-ocp.yaml", Guide: "Tiered Prefix Cache", Acronym: "TPC", Platform: "OCP", Model: "Qwen3-0.6B", GPUType: "H100", GPUCount: 1, GuidePath: "tiered-prefix-cache"},
	{Repo: "llm-d/llm-d", WorkflowFile: "nightly-e2e-wide-ep-lws-ocp.yaml", Guide: "Wide EP + LWS", Acronym: "WEP", Platform: "OCP", Model: "Qwen3-0.6B", GPUType: "H100", GPUCount: 2, GuidePath: "wide-ep-lws"},
	{Repo: "llm-d/llm-d", WorkflowFile: "nightly-e2e-wva-ocp.yaml", Guide: "WVA", Acronym: "WVA", Platform: "OCP", Model: "Llama-3.1-8B", GPUType: "A100", GPUCount: 2, GuidePath: "workload-autoscaling"},
	// GKE — all GKE guides run on L4
	{Repo: "llm-d/llm-d", WorkflowFile: "nightly-e2e-optimized-baseline-gke.yaml", Guide: "Optimized Baseline", Acronym: "IS", Platform: "GKE", Model: "Qwen3-32B", GPUType: "L4", GPUCount: 2, GuidePath: "optimized-baseline"},
	{Repo: "llm-d/llm-d", WorkflowFile: "nightly-e2e-pd-disaggregation-gke.yaml", Guide: "PD Disaggregation", Acronym: "PD", Platform: "GKE", Model: "Qwen3-0.6B", GPUType: "L4", GPUCount: 2, GuidePath: "pd-disaggregation"},
	{Repo: "llm-d/llm-d", WorkflowFile: "nightly-e2e-wide-ep-lws-gke.yaml", Guide: "Wide EP + LWS", Acronym: "WEP", Platform: "GKE", Model: "Qwen3-0.6B", GPUType: "L4", GPUCount: 2, GuidePath: "wide-ep-lws"},
	// CKS — all CKS guides run on H100
	{Repo: "llm-d/llm-d", WorkflowFile: "nightly-e2e-optimized-baseline-cks.yaml", Guide: "Optimized Baseline", Acronym: "IS", Platform: "CKS", Model: "Qwen3-32B", GPUType: "H100", GPUCount: 2, GuidePath: "optimized-baseline"},
	{Repo: "llm-d/llm-d", WorkflowFile: "nightly-e2e-pd-disaggregation-cks.yaml", Guide: "PD Disaggregation", Acronym: "PD", Platform: "CKS", Model: "Qwen3-0.6B", GPUType: "H100", GPUCount: 2, GuidePath: "pd-disaggregation"},
	{Repo: "llm-d/llm-d", WorkflowFile: "nightly-e2e-wide-ep-lws-cks.yaml", Guide: "Wide EP + LWS", Acronym: "WEP", Platform: "CKS", Model: "Qwen3-0.6B", GPUType: "H100", GPUCount: 2, GuidePath: "wide-ep-lws"},
	{Repo: "llm-d/llm-d", WorkflowFile: "nightly-e2e-wva-cks.yaml", Guide: "WVA", Acronym: "WVA", Platform: "CKS", Model: "Llama-3.1-8B", GPUType: "H100", GPUCount: 2, GuidePath: "workload-autoscaling"},
}

// isAllowedRepo checks if a repo is in the allowlist derived from nightlyWorkflows.
// SECURITY: Prevents arbitrary GitHub API calls via user-controlled repo parameter.
func isAllowedRepo(repo string) bool {
	for _, w := range nightlyWorkflows {
		if w.Repo == repo {
			return true
		}
	}
	return false
}

func NewNightlyE2EHandler(githubToken string) *NightlyE2EHandler {
	h := &NightlyE2EHandler{
		githubToken: githubToken,
		httpClient:  client.External,
		logCache:    make(map[string]*RunLogsResponse),
		logCacheExp: make(map[string]time.Time),
		imgCache:    make(map[string]map[string]string),
	}
	safego.GoWith("nightly-e2e/prewarm", func() { h.prewarm() })
	return h
}

// GetRuns returns aggregated nightly E2E workflow data.
// Cache TTL is 2 min when jobs are in progress, 5 min when idle.
func (h *NightlyE2EHandler) GetRuns(c *fiber.Ctx) error {
	// Check cache
	h.mu.RLock()
	if h.cache != nil && time.Now().Before(h.cacheExp) {
		resp := *h.cache
		resp.FromCache = true
		h.mu.RUnlock()
		return c.JSON(resp)
	}
	h.mu.RUnlock()

	// #7053 — Use singleflight to coalesce concurrent cold-cache fetches
	// into a single fetchAllWithContext call, preventing N × 17+ goroutine fan-out.
	v, err, _ := h.fetchGroup.Do("runs", func() (interface{}, error) {
		return h.fetchAllWithContext(c.Context())
	})
	if err != nil {
		slog.Error("failed to fetch nightly E2E data", "error", err)
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{
			"error": "failed to fetch nightly E2E data",
		})
	}
	resp := v.(*NightlyE2EResponse)

	// Use shorter cache TTL when any jobs are in progress
	ttl := nightlyCacheIdleTTL
	if hasInProgressRuns(resp.Guides) {
		ttl = nightlyCacheActiveTTL
	}

	// Update cache
	h.mu.Lock()
	h.cache = resp
	h.cacheExp = time.Now().Add(ttl)
	h.mu.Unlock()

	return c.JSON(resp)
}

// GetRunLogs fetches GitHub Actions logs for a specific workflow run.
// Query params: repo (e.g. "llm-d/llm-d"), runId (numeric).
// Returns JSON with job names and their truncated log output.
func (h *NightlyE2EHandler) GetRunLogs(c *fiber.Ctx) error {
	repo := c.Query("repo")
	runID := c.QueryInt("runId", 0)
	if repo == "" || runID == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "repo and runId query params are required",
		})
	}

	// SECURITY: Validate repo against allowlist derived from nightlyWorkflows
	if !isAllowedRepo(repo) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "repo is not in the allowed list of monitored repositories",
		})
	}

	cacheKey := fmt.Sprintf("%s/%d", repo, runID)

	// Check cache
	h.logMu.RLock()
	if cached, ok := h.logCache[cacheKey]; ok {
		if time.Now().Before(h.logCacheExp[cacheKey]) {
			h.logMu.RUnlock()
			return c.JSON(cached)
		}
	}
	h.logMu.RUnlock()

	// Fetch jobs for this run
	jobsURL := fmt.Sprintf("%s/repos/%s/actions/runs/%d/jobs?per_page=30",
		resolveGitHubAPIBase(), repo, runID)

	req, err := http.NewRequest("GET", jobsURL, nil)
	if err != nil {
		slog.Warn("[NightlyE2E] internal error", "error", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal server error"})
	}
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	if h.githubToken != "" {
		req.Header.Set("Authorization", "Bearer "+h.githubToken)
	}

	resp, err := h.httpClient.Do(req)
	if err != nil {
		slog.Warn("[NightlyE2E] bad gateway", "error", err)
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": "bad gateway"})
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		// #7055 — Use LimitReader to prevent unbounded memory on large error pages.
		body, readErr := io.ReadAll(io.LimitReader(resp.Body, maxErrorBodyBytes))
		if readErr != nil {
			body = []byte("(failed to read response body)")
		}
		slog.Error("[NightlyE2E] GitHub API error fetching run jobs", "status", resp.StatusCode, "body", string(body))
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{
			"error": "upstream API error",
		})
	}

	var jobData struct {
		Jobs []struct {
			ID         int64   `json:"id"`
			Name       string  `json:"name"`
			Conclusion *string `json:"conclusion"`
		} `json:"jobs"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&jobData); err != nil {
		slog.Warn("[NightlyE2E] internal error", "error", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal server error"})
	}

	// Fetch logs for failed jobs concurrently (limit concurrency)
	type logResult struct {
		idx int
		log JobLog
	}
	ch := make(chan logResult, len(jobData.Jobs))
	sem := make(chan struct{}, maxLogFetchJobs)

	for i, job := range jobData.Jobs {
		conclusion := ""
		if job.Conclusion != nil {
			conclusion = *job.Conclusion
		}
		// Only fetch logs for failed jobs to limit API calls and payload
		if conclusion != "failure" {
			ch <- logResult{idx: i, log: JobLog{Name: job.Name, Conclusion: conclusion}}
			continue
		}
		sem <- struct{}{}
		safego.GoWith("nightly-e2e-fetch-job-logs", func() {
			defer func() { <-sem }()
			logText := h.fetchJobLog(repo, job.ID)
			ch <- logResult{idx: i, log: JobLog{Name: job.Name, Conclusion: conclusion, Log: logText}}
		})
	}

	logs := make([]JobLog, len(jobData.Jobs))
	for range jobData.Jobs {
		r := <-ch
		logs[r.idx] = r.log
	}

	result := &RunLogsResponse{Jobs: logs}

	// Cache result
	h.logMu.Lock()
	h.logCache[cacheKey] = result
	h.logCacheExp[cacheKey] = time.Now().Add(logCacheTTL)
	h.logMu.Unlock()

	return c.JSON(result)
}

func computePassRate(runs []NightlyRun) int {
	var completed, passed int
	for _, r := range runs {
		if r.Status == "completed" {
			completed++
			if r.Conclusion != nil && *r.Conclusion == "success" {
				passed++
			}
		}
	}
	if completed == 0 {
		return 0
	}
	return int(float64(passed) / float64(completed) * 100)
}

func computeTrend(runs []NightlyRun) string {
	if len(runs) < 4 {
		return "steady"
	}
	recent := runs[:3]
	older := runs[3:]

	recentPass := successRate(recent)
	olderPass := successRate(older)

	if recentPass > olderPass+0.1 {
		return "up"
	}
	if recentPass < olderPass-0.1 {
		return "down"
	}
	return "steady"
}

func hasInProgressRuns(guides []NightlyGuideStatus) bool {
	for _, g := range guides {
		for _, r := range g.Runs {
			if r.Status == "in_progress" {
				return true
			}
		}
	}
	return false
}

func successRate(runs []NightlyRun) float64 {
	if len(runs) == 0 {
		return 0
	}
	var passed int
	for _, r := range runs {
		if r.Conclusion != nil && *r.Conclusion == "success" {
			passed++
		}
	}
	return float64(passed) / float64(len(runs))
}
