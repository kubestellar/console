package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
)

type ghpJobsResponse struct {
	Jobs []ghpJobRaw `json:"jobs"`
}

type ghpJobRaw struct {
	ID          int64        `json:"id"`
	Name        string       `json:"name"`
	Status      string       `json:"status"`
	Conclusion  *string      `json:"conclusion"`
	StartedAt   *string      `json:"started_at"`
	CompletedAt *string      `json:"completed_at"`
	HTMLURL     string       `json:"html_url"`
	Steps       []ghpStepRaw `json:"steps"`
}

type ghpStepRaw struct {
	Name        string  `json:"name"`
	Status      string  `json:"status"`
	Conclusion  *string `json:"conclusion"`
	Number      int     `json:"number"`
	StartedAt   string  `json:"started_at"`
	CompletedAt string  `json:"completed_at"`
}

func (h *GitHubPipelinesHandler) ghGet(ctx context.Context, path string) (*http.Response, error) {
	fullURL := path
	if parsed, err := url.Parse(path); err != nil || parsed.Scheme == "" {
		fullURL = ghpGitHubAPIBase + path
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, fullURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("Authorization", "Bearer "+h.token)
	return h.httpClient.Do(req)
}

// ghGetWithRetry wraps ghGet with exponential-backoff retries on GitHub
// rate-limit responses (403 and 429). Per issue #9059, the GitHub Pipelines
// dashboard fails immediately on rate-limit errors even though the 5000/hour
// limit is temporary; a few retries usually succeed.
func (h *GitHubPipelinesHandler) ghGetWithRetry(ctx context.Context, path string) (*http.Response, error) {
	var lastResp *http.Response
	var lastErr error
	for attempt := 1; attempt <= GH_RETRY_MAX_ATTEMPTS; attempt++ {
		resp, err := h.ghGet(ctx, path)
		if err != nil {
			return nil, err
		}
		if resp.StatusCode != http.StatusForbidden && resp.StatusCode != http.StatusTooManyRequests {
			return resp, nil
		}
		lastErr = fmt.Errorf("github rate-limited (status %d)", resp.StatusCode)
		if attempt == GH_RETRY_MAX_ATTEMPTS {
			lastResp = resp
			break
		}
		backoff := time.Duration(GH_RETRY_BASE_DELAY_MS*(1<<(attempt-1))) * time.Millisecond
		maxBackoff := time.Duration(GH_RETRY_MAX_DELAY_MS) * time.Millisecond
		if ra := resp.Header.Get("Retry-After"); ra != "" {
			if secs, parseErr := strconv.Atoi(strings.TrimSpace(ra)); parseErr == nil && secs > 0 {
				backoff = time.Duration(secs) * time.Second
			}
		}
		if backoff > maxBackoff {
			backoff = maxBackoff
		}
		slog.Info("[github-pipelines] retrying after rate-limit",
			"path", path,
			"status", resp.StatusCode,
			"attempt", attempt,
			"maxAttempts", GH_RETRY_MAX_ATTEMPTS,
			"backoff", backoff,
		)
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 1<<20))
		resp.Body.Close()
		select {
		case <-time.After(backoff):
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
	return lastResp, lastErr
}

func (h *GitHubPipelinesHandler) fetchRuns(ctx context.Context, repo, query string) ([]ghpWorkflowRun, error) {
	desired, baseQuery := ghpPaginatedRunsQuery(query)
	pageSize := desired
	if pageSize > ghpMaxPerPage {
		pageSize = ghpMaxPerPage
	}
	maxPages := (desired + pageSize - 1) / pageSize
	if maxPages > ghpMaxPages {
		maxPages = ghpMaxPages
	}

	out := make([]ghpWorkflowRun, 0)
	for page := 1; page <= maxPages; page++ {
		pageQuery := fmt.Sprintf("%sper_page=%d&page=%d", baseQuery, pageSize, page)
		res, err := h.ghGetWithRetry(ctx, fmt.Sprintf("/repos/%s/actions/runs?%s", repo, pageQuery))
		if err != nil {
			return out, err
		}
		if res == nil {
			return out, fmt.Errorf("github: nil response with no error")
		}
		runs, done, loopErr := ghpDecodeWorkflowRuns(ctx, res)
		if loopErr != nil {
			return out, loopErr
		}
		if done {
			return out, nil
		}
		for _, r := range runs {
			out = append(out, normalizeRunRaw(r, repo))
		}
		if len(runs) < pageSize || len(out) >= desired {
			break
		}
	}
	return out, nil
}

func ghpPaginatedRunsQuery(query string) (int, string) {
	desired := ghpMaxPerPage
	parts := strings.Split(query, "&")
	baseParams := make([]string, 0, len(parts))
	for _, p := range parts {
		if strings.HasPrefix(p, "per_page=") {
			n, err := strconv.Atoi(strings.TrimPrefix(p, "per_page="))
			if err == nil && n > 0 {
				desired = n
			}
		} else {
			baseParams = append(baseParams, p)
		}
	}
	baseQuery := strings.Join(baseParams, "&")
	if baseQuery != "" {
		baseQuery += "&"
	}
	return desired, baseQuery
}

func ghpDecodeWorkflowRuns(ctx context.Context, res *http.Response) ([]workflowRunRaw, bool, error) {
	defer res.Body.Close()
	if res.StatusCode == http.StatusNotFound {
		return nil, true, nil
	}
	if res.StatusCode >= 400 {
		return nil, false, ghpGitHubResponseError(res)
	}
	ctx = ghpStoreRateLimitHeaders(ctx, res)
	_ = ctx
	var data struct {
		WorkflowRuns []workflowRunRaw `json:"workflow_runs"`
	}
	if err := json.NewDecoder(res.Body).Decode(&data); err != nil {
		return nil, false, err
	}
	return data.WorkflowRuns, false, nil
}

// fetchWorkflowRuns fetches runs for a specific workflow file (e.g. "release.yml")
// via /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs.
func (h *GitHubPipelinesHandler) fetchWorkflowRuns(ctx context.Context, repo, workflowFile, query string) ([]ghpWorkflowRun, error) {
	res, err := h.ghGetWithRetry(ctx, fmt.Sprintf("/repos/%s/actions/workflows/%s/runs?%s", repo, workflowFile, query))
	if err != nil {
		return nil, err
	}
	if res == nil {
		return nil, fmt.Errorf("github: nil response with no error")
	}
	defer res.Body.Close()
	if res.StatusCode == http.StatusNotFound {
		return nil, nil
	}
	if res.StatusCode >= 400 {
		return nil, ghpGitHubResponseError(res)
	}
	ctx = ghpStoreRateLimitHeaders(ctx, res)
	_ = ctx
	var data struct {
		WorkflowRuns []workflowRunRaw `json:"workflow_runs"`
	}
	if err := json.NewDecoder(res.Body).Decode(&data); err != nil {
		return nil, err
	}
	n := len(data.WorkflowRuns)
	if n < 0 || n > ghpMaxAllocItems {
		return nil, fiber.NewError(fiber.StatusBadGateway, "GitHub API returned invalid workflow run count")
	}
	out := make([]ghpWorkflowRun, 0, n)
	for _, r := range data.WorkflowRuns {
		out = append(out, normalizeRunRaw(r, repo))
	}
	return out, nil
}

func (h *GitHubPipelinesHandler) fetchJobs(ctx context.Context, repo string, runID int64) ([]ghpJob, error) {
	res, err := h.ghGet(ctx, fmt.Sprintf("/repos/%s/actions/runs/%d/jobs", repo, runID))
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode >= 400 {
		return nil, ghpGitHubResponseError(res)
	}
	ctx = ghpStoreRateLimitHeaders(ctx, res)
	_ = ctx
	var data ghpJobsResponse
	if err := json.NewDecoder(res.Body).Decode(&data); err != nil {
		return nil, err
	}
	nJobs := len(data.Jobs)
	if nJobs < 0 || nJobs > ghpMaxAllocItems {
		return nil, fiber.NewError(fiber.StatusBadGateway, "GitHub API returned invalid job count")
	}
	jobs := make([]ghpJob, 0, nJobs)
	for _, j := range data.Jobs {
		jobs = append(jobs, ghpNormalizeJob(j))
	}
	return jobs, nil
}

func ghpNormalizeJob(j ghpJobRaw) ghpJob {
	steps := make([]ghpStep, 0, len(j.Steps))
	for _, s := range j.Steps {
		steps = append(steps, ghpStep{
			Name:        s.Name,
			Status:      s.Status,
			Conclusion:  s.Conclusion,
			Number:      s.Number,
			StartedAt:   s.StartedAt,
			CompletedAt: s.CompletedAt,
		})
	}
	return ghpJob{
		ID:          j.ID,
		Name:        j.Name,
		Status:      j.Status,
		Conclusion:  j.Conclusion,
		StartedAt:   j.StartedAt,
		CompletedAt: j.CompletedAt,
		HTMLURL:     j.HTMLURL,
		Steps:       steps,
	}
}

func ghpGitHubResponseError(res *http.Response) error {
	body, err := io.ReadAll(io.LimitReader(res.Body, ghpMaxErrorBodyBytes))
	if err != nil {
		slog.Warn("failed to read response body", "error", err)
	}
	return fmt.Errorf("github %d: %s", res.StatusCode, string(body))
}
