// Package handlers provides HTTP handlers for the console API.
package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
)

const (
	nightlyCacheIdleTTL   = 5 * time.Minute // cache when no jobs running
	nightlyCacheActiveTTL = 2 * time.Minute // cache when jobs are in progress
	nightlyRunsPerPage    = 7
	githubAPIBase         = "https://api.github.com"

	failureReasonGPU  = "gpu_unavailable"
	failureReasonTest = "test_failure"
)

// NightlyWorkflow defines a GitHub Actions workflow to monitor.
type NightlyWorkflow struct {
	Repo         string `json:"repo"`
	WorkflowFile string `json:"workflowFile"`
	Guide        string `json:"guide"`
	Acronym      string `json:"acronym"`
	Platform     string `json:"platform"`
	Model        string `json:"model"`
	GPUType      string `json:"gpuType"`
	GPUCount     int    `json:"gpuCount"`
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
	Guide            string       `json:"guide"`
	Acronym          string       `json:"acronym"`
	Platform         string       `json:"platform"`
	Repo             string       `json:"repo"`
	WorkflowFile     string       `json:"workflowFile"`
	Runs             []NightlyRun `json:"runs"`
	PassRate         int          `json:"passRate"`
	Trend            string       `json:"trend"`
	LatestConclusion *string      `json:"latestConclusion"`
	Model            string       `json:"model"`
	GPUType          string       `json:"gpuType"`
	GPUCount         int          `json:"gpuCount"`
}

// NightlyE2EResponse is the JSON response from the /api/nightly-e2e/runs endpoint.
type NightlyE2EResponse struct {
	Guides    []NightlyGuideStatus `json:"guides"`
	CachedAt  string               `json:"cachedAt"`
	FromCache bool                 `json:"fromCache"`
}

// NightlyE2EHandler serves nightly E2E workflow data proxied from GitHub.
type NightlyE2EHandler struct {
	githubToken string
	httpClient  *http.Client

	mu       sync.RWMutex
	cache    *NightlyE2EResponse
	cacheExp time.Time
}

// nightlyWorkflows is the canonical list of nightly E2E workflows to monitor.
// Model/GPU metadata is sourced from each workflow's YAML in GitHub Actions.
var nightlyWorkflows = []NightlyWorkflow{
	// OCP — all OCP guides run on H100 except WVA (A100) and SA (CPU)
	{Repo: "llm-d/llm-d", WorkflowFile: "nightly-e2e-inference-scheduling-ocp.yaml", Guide: "Inference Scheduling", Acronym: "IS", Platform: "OCP", Model: "Qwen3-32B", GPUType: "H100", GPUCount: 2},
	{Repo: "llm-d/llm-d", WorkflowFile: "nightly-e2e-pd-disaggregation-ocp.yaml", Guide: "PD Disaggregation", Acronym: "PD", Platform: "OCP", Model: "Qwen3-0.6B", GPUType: "H100", GPUCount: 2},
	{Repo: "llm-d/llm-d", WorkflowFile: "nightly-e2e-precise-prefix-cache-ocp.yaml", Guide: "Precise Prefix Cache", Acronym: "PPC", Platform: "OCP", Model: "Qwen3-32B", GPUType: "H100", GPUCount: 2},
	{Repo: "llm-d/llm-d", WorkflowFile: "nightly-e2e-simulated-accelerators.yaml", Guide: "Simulated Accelerators", Acronym: "SA", Platform: "OCP", Model: "Simulated", GPUType: "CPU", GPUCount: 0},
	{Repo: "llm-d/llm-d", WorkflowFile: "nightly-e2e-tiered-prefix-cache-ocp.yaml", Guide: "Tiered Prefix Cache", Acronym: "TPC", Platform: "OCP", Model: "Qwen3-0.6B", GPUType: "H100", GPUCount: 1},
	{Repo: "llm-d/llm-d", WorkflowFile: "nightly-e2e-wide-ep-lws-ocp.yaml", Guide: "Wide EP + LWS", Acronym: "WEP", Platform: "OCP", Model: "Qwen3-0.6B", GPUType: "H100", GPUCount: 2},
	{Repo: "llm-d/llm-d", WorkflowFile: "nightly-e2e-wva-ocp.yaml", Guide: "WVA", Acronym: "WVA", Platform: "OCP", Model: "Llama-3.1-8B", GPUType: "A100", GPUCount: 2},
	{Repo: "llm-d/llm-d-benchmark", WorkflowFile: "ci-nighly-benchmark-ocp.yaml", Guide: "Benchmarking", Acronym: "BM", Platform: "OCP", Model: "opt-125m", GPUType: "A100", GPUCount: 1},
	// GKE — all GKE guides run on L4
	{Repo: "llm-d/llm-d", WorkflowFile: "nightly-e2e-inference-scheduling-gke.yaml", Guide: "Inference Scheduling", Acronym: "IS", Platform: "GKE", Model: "Qwen3-32B", GPUType: "L4", GPUCount: 2},
	{Repo: "llm-d/llm-d", WorkflowFile: "nightly-e2e-pd-disaggregation-gke.yaml", Guide: "PD Disaggregation", Acronym: "PD", Platform: "GKE", Model: "Qwen3-0.6B", GPUType: "L4", GPUCount: 2},
	{Repo: "llm-d/llm-d", WorkflowFile: "nightly-e2e-wide-ep-lws-gke.yaml", Guide: "Wide EP + LWS", Acronym: "WEP", Platform: "GKE", Model: "Qwen3-0.6B", GPUType: "L4", GPUCount: 2},
	{Repo: "llm-d/llm-d-benchmark", WorkflowFile: "ci-nighly-benchmark-gke.yaml", Guide: "Benchmarking", Acronym: "BM", Platform: "GKE", Model: "opt-125m", GPUType: "L4", GPUCount: 1},
	// CKS — all CKS guides run on H100
	{Repo: "llm-d/llm-d", WorkflowFile: "nightly-e2e-inference-scheduling-cks.yaml", Guide: "Inference Scheduling", Acronym: "IS", Platform: "CKS", Model: "Qwen3-32B", GPUType: "H100", GPUCount: 2},
	{Repo: "llm-d/llm-d", WorkflowFile: "nightly-e2e-pd-disaggregation-cks.yaml", Guide: "PD Disaggregation", Acronym: "PD", Platform: "CKS", Model: "Qwen3-0.6B", GPUType: "H100", GPUCount: 2},
	{Repo: "llm-d/llm-d", WorkflowFile: "nightly-e2e-wide-ep-lws-cks.yaml", Guide: "Wide EP + LWS", Acronym: "WEP", Platform: "CKS", Model: "Qwen3-0.6B", GPUType: "H100", GPUCount: 2},
	{Repo: "llm-d/llm-d", WorkflowFile: "nightly-e2e-wva-cks.yaml", Guide: "WVA", Acronym: "WVA", Platform: "CKS", Model: "Llama-3.1-8B", GPUType: "H100", GPUCount: 2},
	{Repo: "llm-d/llm-d-benchmark", WorkflowFile: "ci-nightly-benchmark-cks.yaml", Guide: "Benchmarking", Acronym: "BM", Platform: "CKS", Model: "opt-125m", GPUType: "H100", GPUCount: 1},
}

// NewNightlyE2EHandler creates a handler using the given GitHub token for API access.
// It pre-warms the cache in the background so the first request returns instantly.
func NewNightlyE2EHandler(githubToken string) *NightlyE2EHandler {
	h := &NightlyE2EHandler{
		githubToken: githubToken,
		httpClient:  &http.Client{Timeout: 30 * time.Second},
	}
	go h.prewarm()
	return h
}

func (h *NightlyE2EHandler) prewarm() {
	resp, err := h.fetchAll()
	if err != nil {
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

	// Fetch fresh data
	resp, err := h.fetchAll()
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{
			"error": fmt.Sprintf("failed to fetch nightly E2E data: %v", err),
		})
	}

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
	type result struct {
		idx  int
		runs []NightlyRun
		err  error
	}

	ch := make(chan result, len(nightlyWorkflows))
	for i, wf := range nightlyWorkflows {
		go func(idx int, wf NightlyWorkflow) {
			runs, err := h.fetchWorkflowRuns(wf)
			ch <- result{idx: idx, runs: runs, err: err}
		}(i, wf)
	}

	// Collect results
	runsByIdx := make(map[int][]NightlyRun, len(nightlyWorkflows))
	for range nightlyWorkflows {
		r := <-ch
		if r.err == nil {
			runsByIdx[r.idx] = r.runs
		}
		// Workflows that 404 (not yet created) just get empty runs
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
		githubAPIBase, wf.Repo, wf.WorkflowFile, nightlyRunsPerPage)

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
		body, _ := io.ReadAll(resp.Body)
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

// classifyFailures fetches jobs for failed runs and sets FailureReason.
func (h *NightlyE2EHandler) classifyFailures(repo string, runs []NightlyRun) {
	var wg sync.WaitGroup
	for i := range runs {
		if runs[i].Conclusion == nil || *runs[i].Conclusion != "failure" {
			continue
		}
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			runs[idx].FailureReason = h.detectGPUFailure(repo, runs[idx].ID)
		}(i)
	}
	wg.Wait()
}

// detectGPUFailure checks if a run failed due to GPU unavailability.
func (h *NightlyE2EHandler) detectGPUFailure(repo string, runID int64) string {
	url := fmt.Sprintf("%s/repos/%s/actions/runs/%d/jobs?per_page=30",
		githubAPIBase, repo, runID)

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

// isGPUStep returns true if the step name indicates a GPU availability check.
func isGPUStep(name string) bool {
	lower := strings.ToLower(name)
	return strings.Contains(lower, "gpu") && strings.Contains(lower, "availab")
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
