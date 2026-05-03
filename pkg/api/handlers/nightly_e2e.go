// Package handlers provides HTTP handlers for the console API.
package handlers

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"golang.org/x/sync/singleflight"
)

const (
	nightlyCacheIdleTTL   = 5 * time.Minute  // cache when no jobs running
	nightlyCacheActiveTTL = 2 * time.Minute  // cache when jobs are in progress
	imageCacheTTL         = 30 * time.Minute // image tags change less frequently
	nightlyRunsPerPage = 7

	failureReasonGPU  = "gpu_unavailable"
	failureReasonTest = "test_failure"

	// maxErrorBodyBytes is the maximum number of bytes to read from GitHub error
	// response bodies. Prevents unbounded memory consumption on large HTML error
	// pages during outages (#7055).
	maxErrorBodyBytes = 10_000 // 10 KB
	maxLogBytes       = 200_000 // 200KB tail per job log
	logCacheTTL     = 10 * time.Minute // immutable once run completes
	maxLogFetchJobs = 5                // limit concurrent job log fetches

	// imageRepo is the GitHub repo whose guide directories contain image references
	imageRepo = "llm-d/llm-d"
)

// imageRe matches direct image references: ghcr.io/llm-d/<name>:<tag>
// imageRe matches direct image references: ghcr.io/llm-d/<name>:<tag>.
// (?m) enables per-line ^/$ so FindAllStringSubmatch anchors each match to
// a complete line, preventing partial-substring bypass across line boundaries
// (go/regex/missing-regexp-anchor).
var imageRe = regexp.MustCompile(`(?m)^.*ghcr\.io/llm-d/([\w][\w.-]*?):([\w][\w.+-]*).*$`)

// hubRe, nameRe, tagRe are applied to individual YAML lines via MatchString /
// FindStringSubmatch.  ^ and $ anchor each to the full line it is called on,
// preventing partial-line false positives (go/regex/missing-regexp-anchor).
var hubRe = regexp.MustCompile(`(?i)^.*hub:\s*ghcr\.io/llm-d\b.*$`)
var nameRe = regexp.MustCompile(`(?i)^.*name:\s*([\w][\w.-]*).*$`)
var tagRe = regexp.MustCompile(`(?i)^.*tag:\s*([\w][\w.+-]*).*$`)

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
	// callers into a single fetchAll call.
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
	// OCP — all OCP guides run on H100 except WVA (A100) and SA (CPU)
	{Repo: "llm-d/llm-d", WorkflowFile: "nightly-e2e-inference-scheduling-ocp.yaml", Guide: "Inference Scheduling", Acronym: "IS", Platform: "OCP", Model: "Qwen3-32B", GPUType: "H100", GPUCount: 2, GuidePath: "inference-scheduling"},
	{Repo: "llm-d/llm-d", WorkflowFile: "nightly-e2e-pd-disaggregation-ocp.yaml", Guide: "PD Disaggregation", Acronym: "PD", Platform: "OCP", Model: "Qwen3-0.6B", GPUType: "H100", GPUCount: 2, GuidePath: "pd-disaggregation"},
	{Repo: "llm-d/llm-d", WorkflowFile: "nightly-e2e-precise-prefix-cache-ocp.yaml", Guide: "Precise Prefix Cache", Acronym: "PPC", Platform: "OCP", Model: "Qwen3-32B", GPUType: "H100", GPUCount: 2, GuidePath: "precise-prefix-cache-aware"},
	{Repo: "llm-d/llm-d", WorkflowFile: "nightly-e2e-simulated-accelerators.yaml", Guide: "Simulated Accelerators", Acronym: "SA", Platform: "OCP", Model: "Simulated", GPUType: "CPU", GPUCount: 0, GuidePath: "simulated-accelerators"},
	{Repo: "llm-d/llm-d", WorkflowFile: "nightly-e2e-tiered-prefix-cache-ocp.yaml", Guide: "Tiered Prefix Cache", Acronym: "TPC", Platform: "OCP", Model: "Qwen3-0.6B", GPUType: "H100", GPUCount: 1, GuidePath: "tiered-prefix-cache"},
	{Repo: "llm-d/llm-d", WorkflowFile: "nightly-e2e-wide-ep-lws-ocp.yaml", Guide: "Wide EP + LWS", Acronym: "WEP", Platform: "OCP", Model: "Qwen3-0.6B", GPUType: "H100", GPUCount: 2, GuidePath: "wide-ep-lws"},
	{Repo: "llm-d/llm-d", WorkflowFile: "nightly-e2e-wva-ocp.yaml", Guide: "WVA", Acronym: "WVA", Platform: "OCP", Model: "Llama-3.1-8B", GPUType: "A100", GPUCount: 2, GuidePath: "workload-autoscaling"},
	{Repo: "llm-d/llm-d-benchmark", WorkflowFile: "ci-nighly-benchmark-ocp.yaml", Guide: "Benchmarking", Acronym: "BM", Platform: "OCP", Model: "opt-125m", GPUType: "A100", GPUCount: 1},
	// GKE — all GKE guides run on L4
	{Repo: "llm-d/llm-d", WorkflowFile: "nightly-e2e-inference-scheduling-gke.yaml", Guide: "Inference Scheduling", Acronym: "IS", Platform: "GKE", Model: "Qwen3-32B", GPUType: "L4", GPUCount: 2, GuidePath: "inference-scheduling"},
	{Repo: "llm-d/llm-d", WorkflowFile: "nightly-e2e-pd-disaggregation-gke.yaml", Guide: "PD Disaggregation", Acronym: "PD", Platform: "GKE", Model: "Qwen3-0.6B", GPUType: "L4", GPUCount: 2, GuidePath: "pd-disaggregation"},
	{Repo: "llm-d/llm-d", WorkflowFile: "nightly-e2e-wide-ep-lws-gke.yaml", Guide: "Wide EP + LWS", Acronym: "WEP", Platform: "GKE", Model: "Qwen3-0.6B", GPUType: "L4", GPUCount: 2, GuidePath: "wide-ep-lws"},
	{Repo: "llm-d/llm-d-benchmark", WorkflowFile: "ci-nighly-benchmark-gke.yaml", Guide: "Benchmarking", Acronym: "BM", Platform: "GKE", Model: "opt-125m", GPUType: "L4", GPUCount: 1},
	// CKS — all CKS guides run on H100
	{Repo: "llm-d/llm-d", WorkflowFile: "nightly-e2e-inference-scheduling-cks.yaml", Guide: "Inference Scheduling", Acronym: "IS", Platform: "CKS", Model: "Qwen3-32B", GPUType: "H100", GPUCount: 2, GuidePath: "inference-scheduling"},
	{Repo: "llm-d/llm-d", WorkflowFile: "nightly-e2e-pd-disaggregation-cks.yaml", Guide: "PD Disaggregation", Acronym: "PD", Platform: "CKS", Model: "Qwen3-0.6B", GPUType: "H100", GPUCount: 2, GuidePath: "pd-disaggregation"},
	{Repo: "llm-d/llm-d", WorkflowFile: "nightly-e2e-wide-ep-lws-cks.yaml", Guide: "Wide EP + LWS", Acronym: "WEP", Platform: "CKS", Model: "Qwen3-0.6B", GPUType: "H100", GPUCount: 2, GuidePath: "wide-ep-lws"},
	{Repo: "llm-d/llm-d", WorkflowFile: "nightly-e2e-wva-cks.yaml", Guide: "WVA", Acronym: "WVA", Platform: "CKS", Model: "Llama-3.1-8B", GPUType: "H100", GPUCount: 2, GuidePath: "workload-autoscaling"},
	{Repo: "llm-d/llm-d-benchmark", WorkflowFile: "ci-nightly-benchmark-cks.yaml", Guide: "Benchmarking", Acronym: "BM", Platform: "CKS", Model: "opt-125m", GPUType: "H100", GPUCount: 1},
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

// NewNightlyE2EHandler creates a handler using the given GitHub token for API access.
// It pre-warms the cache in the background so the first request returns instantly.
// prewarmTimeout is the maximum time allowed for the background cache prewarm.
const prewarmTimeout = 30 * time.Second

func NewNightlyE2EHandler(githubToken string) *NightlyE2EHandler {
	h := &NightlyE2EHandler{
		githubToken: githubToken,
		httpClient:  &http.Client{Timeout: 30 * time.Second},
		logCache:    make(map[string]*RunLogsResponse),
		logCacheExp: make(map[string]time.Time),
		imgCache:    make(map[string]map[string]string),
	}
	go h.prewarm()
	return h
}

func (h *NightlyE2EHandler) prewarm() {
	// #7052 — Use a cancellable context so that on timeout, all goroutines
	// spawned by fetchAll are cancelled instead of abandoned.
	ctx, cancel := context.WithTimeout(context.Background(), prewarmTimeout)
	defer cancel()

	done := make(chan struct{})
	var resp *NightlyE2EResponse
	var fetchErr error

	go func() {
		resp, fetchErr = h.fetchAllWithContext(ctx)
		close(done)
	}()

	select {
	case <-done:
		if fetchErr != nil {
			slog.Warn("[NightlyE2E] prewarm failed", "error", fetchErr)
			return
		}
	case <-ctx.Done():
		slog.Warn("[NightlyE2E] prewarm timed out", "timeout", prewarmTimeout)
		return
	}

	ttl := nightlyCacheIdleTTL
	if hasInProgressRuns(resp.Guides) {
		ttl = nightlyCacheActiveTTL
	}
	h.mu.Lock()
	h.cache = resp
	h.cacheExp = time.Now().Add(ttl)
	h.mu.Unlock()
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
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{
			"error": fmt.Sprintf("failed to fetch nightly E2E data: %v", err),
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

func (h *NightlyE2EHandler) fetchAll() (*NightlyE2EResponse, error) {
	return h.fetchAllWithContext(context.Background())
}

// fetchAllWithContext is the context-aware version of fetchAll (#7052).
// When ctx is cancelled, HTTP requests made by sub-goroutines will be
// interrupted instead of running to completion.
func (h *NightlyE2EHandler) fetchAllWithContext(ctx context.Context) (*NightlyE2EResponse, error) {
	type result struct {
		idx  int
		runs []NightlyRun
		err  error
	}

	// Fetch workflow runs and guide images concurrently.
	// #7052 — Check context before spawning goroutines and bail early on
	// cancellation so prewarm timeouts don't leave goroutines running.
	ch := make(chan result, len(nightlyWorkflows))
	for i, wf := range nightlyWorkflows {
		go func(idx int, wf NightlyWorkflow) {
			defer func() {
				if r := recover(); r != nil {
					slog.Error("panic in nightly workflow fetch", "workflow", wf.WorkflowFile, "error", r)
					ch <- result{idx: idx, err: fmt.Errorf("panic: %v", r)}
				}
			}()
			select {
			case <-ctx.Done():
				ch <- result{idx: idx, err: ctx.Err()}
				return
			default:
			}
			runs, err := h.fetchWorkflowRuns(wf)
			ch <- result{idx: idx, runs: runs, err: err}
		}(i, wf)
	}

	// Fetch dynamic image tags (cached separately with longer TTL)
	guideImages := h.getGuideImages()

	// Collect results
	runsByIdx := make(map[int][]NightlyRun, len(nightlyWorkflows))
	for range nightlyWorkflows {
		r := <-ch
		if r.err == nil {
			runsByIdx[r.idx] = r.runs
		}
	}

	guides := make([]NightlyGuideStatus, len(nightlyWorkflows))
	for i, wf := range nightlyWorkflows {
		runs := runsByIdx[i]
		if runs == nil {
			runs = []NightlyRun{}
		}
		var latest *string
		if len(runs) > 0 {
			if runs[0].Conclusion != nil {
				latest = runs[0].Conclusion
			} else {
				s := runs[0].Status
				latest = &s
			}
		}

		// Use dynamically fetched images for this guide
		images := guideImages[wf.GuidePath]
		if images == nil {
			images = map[string]string{}
		}

		guides[i] = NightlyGuideStatus{
			Guide:            wf.Guide,
			Acronym:          wf.Acronym,
			Platform:         wf.Platform,
			Repo:             wf.Repo,
			WorkflowFile:     wf.WorkflowFile,
			Runs:             runs,
			PassRate:         computePassRate(runs),
			Trend:            computeTrend(runs),
			LatestConclusion: latest,
			Model:            wf.Model,
			GPUType:          wf.GPUType,
			GPUCount:         wf.GPUCount,
			LLMDImages:       images,
			OtherImages:      wf.OtherImages,
		}
	}

	return &NightlyE2EResponse{
		Guides:    guides,
		CachedAt:  time.Now().UTC().Format(time.RFC3339),
		FromCache: false,
	}, nil
}

func (h *NightlyE2EHandler) fetchWorkflowRuns(wf NightlyWorkflow) ([]NightlyRun, error) {
	url := fmt.Sprintf("%s/repos/%s/actions/workflows/%s/runs?per_page=%d",
		resolveGitHubAPIBase(), wf.Repo, wf.WorkflowFile, nightlyRunsPerPage)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	if h.githubToken != "" {
		req.Header.Set("Authorization", "Bearer "+h.githubToken)
	}

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		// Workflow doesn't exist yet — return empty
		return []NightlyRun{}, nil
	}
	if resp.StatusCode != http.StatusOK {
		// #7055 — Use LimitReader to prevent unbounded memory on large error pages.
		body, readErr := io.ReadAll(io.LimitReader(resp.Body, maxErrorBodyBytes))
		if readErr != nil {
			body = []byte("(failed to read response body)")
		}
		return nil, fmt.Errorf("GitHub API returned %d: %s", resp.StatusCode, string(body))
	}

	var data struct {
		WorkflowRuns []struct {
			ID         int64   `json:"id"`
			Status     string  `json:"status"`
			Conclusion *string `json:"conclusion"`
			CreatedAt  string  `json:"created_at"`
			UpdatedAt  string  `json:"updated_at"`
			HTMLURL    string  `json:"html_url"`
			RunNumber  int     `json:"run_number"`
			Event      string  `json:"event"`
		} `json:"workflow_runs"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, err
	}

	runs := make([]NightlyRun, 0, len(data.WorkflowRuns))
	for _, r := range data.WorkflowRuns {
		// Skip runs that are still queued (never started executing)
		if r.Status == "queued" {
			continue
		}
		runs = append(runs, NightlyRun{
			ID:         r.ID,
			Status:     r.Status,
			Conclusion: r.Conclusion,
			CreatedAt:  r.CreatedAt,
			UpdatedAt:  r.UpdatedAt,
			HTMLURL:    r.HTMLURL,
			RunNumber:  r.RunNumber,
			Model:      wf.Model,
			GPUType:    wf.GPUType,
			GPUCount:   wf.GPUCount,
			Event:      r.Event,
		})
	}

	// Classify failures (GPU unavailable vs test failure)
	h.classifyFailures(wf.Repo, runs)

	return runs, nil
}

// maxConcurrentClassify limits concurrent detectGPUFailure calls to prevent
// unbounded goroutine fan-out when many runs fail simultaneously (#7056).
const maxConcurrentClassify = 5

// classifyFailures fetches jobs for failed runs and sets FailureReason.
// #7056 — Uses a semaphore to cap concurrent GitHub API calls.
func (h *NightlyE2EHandler) classifyFailures(repo string, runs []NightlyRun) {
	var wg sync.WaitGroup
	sem := make(chan struct{}, maxConcurrentClassify)
	for i := range runs {
		if runs[i].Conclusion == nil || *runs[i].Conclusion != "failure" {
			continue
		}
		wg.Add(1)
		sem <- struct{}{}
		go func(idx int) {
			defer wg.Done()
			defer func() { <-sem }()
			runs[idx].FailureReason = h.detectGPUFailure(repo, runs[idx].ID)
		}(i)
	}
	wg.Wait()
}

// detectGPUFailure checks if a run failed due to GPU unavailability.
func (h *NightlyE2EHandler) detectGPUFailure(repo string, runID int64) string {
	url := fmt.Sprintf("%s/repos/%s/actions/runs/%d/jobs?per_page=30",
		resolveGitHubAPIBase(), repo, runID)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return failureReasonTest
	}
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	if h.githubToken != "" {
		req.Header.Set("Authorization", "Bearer "+h.githubToken)
	}

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return failureReasonTest
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return failureReasonTest
	}

	var jobData struct {
		Jobs []struct {
			Conclusion *string `json:"conclusion"`
			Steps      []struct {
				Name       string  `json:"name"`
				Conclusion *string `json:"conclusion"`
			} `json:"steps"`
		} `json:"jobs"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&jobData); err != nil {
		return failureReasonTest
	}

	for _, job := range jobData.Jobs {
		for _, step := range job.Steps {
			if step.Conclusion != nil && *step.Conclusion == "failure" &&
				isGPUStep(step.Name) {
				return failureReasonGPU
			}
		}
	}
	return failureReasonTest
}

// ---------------------------------------------------------------------------
// Dynamic image tag fetching from guide YAML files
// ---------------------------------------------------------------------------

// getGuideImages returns cached image maps or fetches fresh ones from GitHub.
func (h *NightlyE2EHandler) getGuideImages() map[string]map[string]string {
	h.imgMu.RLock()
	if h.imgCache != nil && time.Now().Before(h.imgCacheExp) {
		result := h.imgCache
		h.imgMu.RUnlock()
		return result
	}
	h.imgMu.RUnlock()

	images := h.fetchAllGuideImages()

	h.imgMu.Lock()
	h.imgCache = images
	h.imgCacheExp = time.Now().Add(imageCacheTTL)
	h.imgMu.Unlock()

	return images
}

// fetchAllGuideImages fetches image tags for all unique guide paths by scanning
// YAML files in the llm-d/llm-d repo's guides/ directory via the Git Trees API.
func (h *NightlyE2EHandler) fetchAllGuideImages() map[string]map[string]string {
	result := make(map[string]map[string]string)

	// Collect unique guide paths
	seen := make(map[string]bool)
	var guidePaths []string
	for _, wf := range nightlyWorkflows {
		if wf.GuidePath != "" && !seen[wf.GuidePath] {
			seen[wf.GuidePath] = true
			guidePaths = append(guidePaths, wf.GuidePath)
		}
	}

	// Fetch the repo tree once (single API call for all file paths)
	yamlFiles := h.fetchGuideYAMLFiles()

	// For each guide, find relevant files and fetch their contents in parallel
	type guideResult struct {
		path   string
		images map[string]string
	}
	ch := make(chan guideResult, len(guidePaths))

	for _, gp := range guidePaths {
		go func(guidePath string) {
			defer func() {
				if r := recover(); r != nil {
					slog.Error("panic in fetchAllGuideImages goroutine", "guide", guidePath, "error", r)
					ch <- guideResult{path: guidePath, images: make(map[string]string)}
				}
			}()
			prefix := "guides/" + guidePath + "/"
			images := make(map[string]string)

			// Find YAML files under this guide's directory
			var files []treeEntry
			for _, f := range yamlFiles {
				if strings.HasPrefix(f.Path, prefix) {
					files = append(files, f)
				}
			}

			// Fetch each file and parse images (sequentially per guide to limit API calls)
			for _, f := range files {
				content := h.fetchBlob(f.SHA)
				if content == "" {
					continue
				}
				for k, v := range parseImagesFromYAML(content) {
					images[k] = v
				}
			}

			ch <- guideResult{path: guidePath, images: images}
		}(gp)
	}

	for range guidePaths {
		gr := <-ch
		if len(gr.images) > 0 {
			result[gr.path] = gr.images
		}
	}

	return result
}

// treeEntry holds a file path and its blob SHA from the Git Trees API.
type treeEntry struct {
	Path string
	SHA  string
}

// fetchGuideYAMLFiles fetches the repo tree and returns YAML files under guides/
// that are likely to contain image references (values.yaml, decode.yaml, etc.).
func (h *NightlyE2EHandler) fetchGuideYAMLFiles() []treeEntry {
	url := fmt.Sprintf("%s/repos/%s/git/trees/main?recursive=1", resolveGitHubAPIBase(), imageRepo)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil
	}
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	if h.githubToken != "" {
		req.Header.Set("Authorization", "Bearer "+h.githubToken)
	}

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil
	}

	var tree struct {
		Tree []struct {
			Path string `json:"path"`
			Type string `json:"type"`
			SHA  string `json:"sha"`
		} `json:"tree"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tree); err != nil {
		return nil
	}

	var results []treeEntry
	for _, entry := range tree.Tree {
		if entry.Type != "blob" {
			continue
		}
		if !strings.HasPrefix(entry.Path, "guides/") {
			continue
		}
		if !strings.HasSuffix(entry.Path, ".yaml") {
			continue
		}
		// Only scan files likely to contain image references
		name := entry.Path[strings.LastIndex(entry.Path, "/")+1:]
		if name == "values.yaml" || name == "decode.yaml" || name == "prefill.yaml" ||
			strings.Contains(name, "inferencepool") {
			results = append(results, treeEntry{Path: entry.Path, SHA: entry.SHA})
		}
	}

	return results
}

// fetchBlob fetches a git blob's content by SHA and returns it decoded.
func (h *NightlyE2EHandler) fetchBlob(sha string) string {
	url := fmt.Sprintf("%s/repos/%s/git/blobs/%s", resolveGitHubAPIBase(), imageRepo, sha)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return ""
	}
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	if h.githubToken != "" {
		req.Header.Set("Authorization", "Bearer "+h.githubToken)
	}

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return ""
	}

	var blob struct {
		Content  string `json:"content"`
		Encoding string `json:"encoding"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&blob); err != nil {
		return ""
	}

	if blob.Encoding == "base64" {
		decoded, err := base64.StdEncoding.DecodeString(blob.Content)
		if err != nil {
			return ""
		}
		return string(decoded)
	}

	return blob.Content
}

// parseImagesFromYAML extracts ghcr.io/llm-d image references from YAML content.
// Handles two patterns:
//  1. Direct: image: ghcr.io/llm-d/<name>:<tag>
//  2. Hub/name/tag (EPP): hub: ghcr.io/llm-d + name: <name> + tag: <tag>
func parseImagesFromYAML(content string) map[string]string {
	images := make(map[string]string)

	// Pattern 1: direct image references
	for _, match := range imageRe.FindAllStringSubmatch(content, -1) {
		images[match[1]] = match[2]
	}

	// Pattern 2: hub/name/tag (EPP images)
	// Scan lines for "hub: ghcr.io/llm-d" and look for nearby name/tag
	lines := strings.Split(content, "\n")
	for i, line := range lines {
		if !hubRe.MatchString(line) {
			continue
		}
		// Search nearby lines (±5) for name and tag
		const searchRadius = 5
		var name, tag string
		start := i - searchRadius
		if start < 0 {
			start = 0
		}
		end := i + searchRadius
		if end >= len(lines) {
			end = len(lines) - 1
		}
		for j := start; j <= end; j++ {
			trimmed := strings.TrimSpace(lines[j])
			// Skip commented-out lines
			if strings.HasPrefix(trimmed, "#") {
				continue
			}
			if m := nameRe.FindStringSubmatch(lines[j]); m != nil && name == "" {
				name = m[1]
			}
			if m := tagRe.FindStringSubmatch(lines[j]); m != nil && tag == "" {
				tag = m[1]
			}
		}
		if name != "" && tag != "" {
			images[name] = tag
		}
	}

	return images
}

// isGPUStep returns true if the step name indicates a GPU availability check.
func isGPUStep(name string) bool {
	lower := strings.ToLower(name)
	return strings.Contains(lower, "gpu") && strings.Contains(lower, "availab")
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
		return c.Status(resp.StatusCode).JSON(fiber.Map{
			"error": fmt.Sprintf("GitHub API returned %d: %s", resp.StatusCode, string(body)),
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
		go func(idx int, jobID int64, name, conc string) {
			defer func() { <-sem }()
			logText := h.fetchJobLog(repo, jobID)
			ch <- logResult{idx: idx, log: JobLog{Name: name, Conclusion: conc, Log: logText}}
		}(i, job.ID, job.Name, conclusion)
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

// fetchJobLog fetches the plain-text log for a single GitHub Actions job,
// truncated to the last maxLogBytes bytes (failure info is at the tail).
func (h *NightlyE2EHandler) fetchJobLog(repo string, jobID int64) string {
	logURL := fmt.Sprintf("%s/repos/%s/actions/jobs/%d/logs", resolveGitHubAPIBase(), repo, jobID)

	req, err := http.NewRequest("GET", logURL, nil)
	if err != nil {
		return fmt.Sprintf("[error creating request: %v]", err)
	}
	if h.githubToken != "" {
		req.Header.Set("Authorization", "Bearer "+h.githubToken)
	}

	// Don't follow redirects automatically — GitHub returns 302 to a signed URL
	client := &http.Client{
		Timeout: 30 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Sprintf("[error fetching log: %v]", err)
	}
	defer resp.Body.Close()

	// Follow the redirect manually
	if resp.StatusCode == http.StatusFound {
		location := resp.Header.Get("Location")
		if location == "" {
			return "[redirect with no Location header]"
		}
		redirectReq, err := http.NewRequest("GET", location, nil)
		if err != nil {
			return fmt.Sprintf("[error following redirect: %v]", err)
		}
		redirectResp, err := h.httpClient.Do(redirectReq)
		if err != nil {
			return fmt.Sprintf("[error fetching redirected log: %v]", err)
		}
		defer redirectResp.Body.Close()
		return readTruncatedLog(redirectResp.Body)
	}

	if resp.StatusCode != http.StatusOK {
		return fmt.Sprintf("[GitHub returned %d for job logs]", resp.StatusCode)
	}

	return readTruncatedLog(resp.Body)
}

// readTruncatedLog reads a log body and returns the last maxLogBytes bytes.
func readTruncatedLog(body io.Reader) string {
	data, err := io.ReadAll(io.LimitReader(body, int64(maxLogBytes*2)))
	if err != nil {
		return fmt.Sprintf("[error reading log: %v]", err)
	}
	if len(data) > maxLogBytes {
		// Take the tail — failure info is at the end
		data = data[len(data)-maxLogBytes:]
		return "...[truncated]\n" + string(data)
	}
	return string(data)
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

