// Package handlers — GitHub Pipelines dashboard
//
// Go port of web/netlify/functions/github-pipelines.mts. Same six views,
// same response shapes, same behavior. Lets the /ci-cd pipeline cards
// work with live data in localhost and in-cluster deployments (the
// Netlify Function only covers console.kubestellar.io).
//
// If two versions drift, the Netlify function is the canonical source.
package handlers

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
)

// Types, constants, and shared variables are in github_pipelines_types.go

// HandleHealth validates the GitHub token by calling GitHub's /user endpoint.
// Returns 503 if token is missing or invalid, 200 if token is valid.
func (h *GitHubPipelinesHandler) HandleHealth(c *fiber.Ctx) error {
	if h.token == "" {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "GITHUB_TOKEN not configured"})
	}

	ctx, cancel := context.WithTimeout(c.UserContext(), 10*time.Second)
	defer cancel()

	res, err := h.ghGet(ctx, "/user")
	if err != nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "GitHub token validation failed"})
	}
	defer res.Body.Close()

	if res.StatusCode >= 400 {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "GitHub token validation failed"})
	}

	return c.JSON(fiber.Map{"status": "ok"})
}

// Serve routes a request to the right view.
func (h *GitHubPipelinesHandler) Serve(c *fiber.Ctx) error {
	view := c.Query("view", "pulse")
	method := c.Method()

	if view == "mutate" {
		if method != fiber.MethodPost {
			return c.Status(fiber.StatusMethodNotAllowed).JSON(fiber.Map{"error": "Mutations require POST"})
		}
		return h.handleMutate(c)
	}
	if method != fiber.MethodGet {
		return c.Status(fiber.StatusMethodNotAllowed).JSON(fiber.Map{"error": "GET required"})
	}

	if h.token == "" {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "GITHUB_TOKEN not configured"})
	}

	switch view {
	case "pulse":
		return h.serveCached(c, h.cacheKey(c), h.buildPulse)
	case "matrix":
		return h.serveCached(c, h.cacheKey(c), h.buildMatrixFromQuery)
	case "flow":
		return h.serveCached(c, h.cacheKey(c), h.buildFlowFromQuery)
	case "failures":
		return h.serveCached(c, h.cacheKey(c), h.buildFailuresFromQuery)
	case "all":
		return h.serveCached(c, h.cacheKey(c), h.buildAll)
	case "log":
		return h.handleLog(c)
	default:
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid view parameter"})
	}
}

func (h *GitHubPipelinesHandler) buildPulse(c *fiber.Ctx) (any, error) {
	ctx := c.UserContext()
	pulseRepo := c.Query("repo")
	if pulseRepo == "" {
		pulseRepo = ghpNightlyReleaseRepo
	} else if !ghpIsAllowedRepo(pulseRepo) {
		return nil, fiber.NewError(fiber.StatusBadRequest, "invalid repo slug")
	}

	releaseRuns, err := h.fetchWorkflowRuns(
		ctx,
		pulseRepo,
		ghpNightlyReleaseWFFile,
		fmt.Sprintf("per_page=%d", ghpPulseWindowDays),
	)
	if err != nil {
		return nil, err
	}
	if releaseRuns == nil {
		releaseRuns = make([]ghpWorkflowRun, 0)
	}
	h.history.merge(releaseRuns)

	// Fetch release tag and weekly tag in parallel — independent GitHub API calls.
	var releaseTag, weeklyTag *string
	var tagWg sync.WaitGroup
	tagWg.Add(2)
	go func() {
		defer tagWg.Done()
		releaseTag = ghpLatestReleaseTag(ctx, h, pulseRepo)
	}()
	go func() {
		defer tagWg.Done()
		weeklyTag = ghpLatestWeeklyTag(ctx, h, pulseRepo)
	}()
	tagWg.Wait()

	var lastRun *ghpPulseLastRun
	streak := 0
	streakKind := "mixed"
	if len(releaseRuns) > 0 {
		first := releaseRuns[0]
		lastRun = &ghpPulseLastRun{
			Conclusion: first.Conclusion,
			CreatedAt:  first.CreatedAt,
			HTMLURL:    first.HTMLURL,
			RunNumber:  first.RunNumber,
			ReleaseTag: releaseTag,
			WeeklyTag:  weeklyTag,
		}
		kind := ghpStreakKind(first.Conclusion)
		if kind != "" {
			streakKind = kind
			for _, r := range releaseRuns {
				if ghpStreakKind(r.Conclusion) == kind {
					streak++
				} else {
					break
				}
			}
		}
	}

	return ghpPulsePayload{
		LastRun:    lastRun,
		Streak:     streak,
		StreakKind: streakKind,
		Recent:     ghpBuildPulseRecent(releaseRuns),
		NextCron:   ghpNightlyReleaseCron,
	}, nil
}

func (h *GitHubPipelinesHandler) buildMatrixFromQuery(c *fiber.Ctx) (any, error) {
	days := ghpParseMatrixDays(c.Query("days"))
	repos, err := ghpResolveRepos(c.Query("repo"))
	if err != nil {
		return nil, err
	}

	ctx := c.UserContext()
	fresh := make([]ghpWorkflowRun, 0, 256)
	var mu sync.Mutex
	var wg sync.WaitGroup
	sem := make(chan struct{}, ghpMaxConcurrentFetches)
	for _, repo := range repos {
		wg.Add(1)
		go func(r string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			runs, fetchErr := h.fetchRuns(ctx, r, fmt.Sprintf("per_page=%d", ghpMatrixRunsPerRepo))
			if fetchErr != nil {
				return
			}
			mu.Lock()
			fresh = append(fresh, runs...)
			mu.Unlock()
		}(repo)
	}
	wg.Wait()
	h.history.merge(fresh)
	snap := h.history.snapshot()

	rangeDates := ghpBuildRangeDates(days)
	workflows := make([]ghpMatrixWorkflow, 0, 32)
	for _, repo := range repos {
		byWF, ok := snap[repo]
		if !ok {
			continue
		}
		wfNames := make([]string, 0, len(byWF))
		for name := range byWF {
			wfNames = append(wfNames, name)
		}
		sort.Strings(wfNames)
		for _, name := range wfNames {
			cells := make([]ghpMatrixCell, 0, len(rangeDates))
			populated := 0
			for _, d := range rangeDates {
				day, had := byWF[name][d]
				if had {
					populated++
					cells = append(cells, ghpMatrixCell{Date: d, Conclusion: day.Conclusion, HTMLURL: day.HTMLURL})
				} else {
					cells = append(cells, ghpMatrixCell{Date: d, Conclusion: nil, HTMLURL: ""})
				}
			}
			if populated < ghpMatrixSparseMinCells {
				continue
			}
			workflows = append(workflows, ghpMatrixWorkflow{Repo: repo, Name: name, Cells: cells})
		}
	}
	return ghpMatrixPayload{Days: days, Range: rangeDates, Workflows: workflows}, nil
}

func (h *GitHubPipelinesHandler) buildFlowFromQuery(c *fiber.Ctx) (any, error) {
	repos, err := ghpResolveRepos(c.Query("repo"))
	if err != nil {
		return nil, err
	}

	ctx := c.UserContext()
	all := make([]ghpFlowRun, 0)
	var flowMu sync.Mutex
	var repoWg sync.WaitGroup
	repoSem := make(chan struct{}, ghpMaxConcurrentFetches)
	for _, repo := range repos {
		repoWg.Add(1)
		go func(repo string) {
			defer repoWg.Done()
			repoSem <- struct{}{}
			defer func() { <-repoSem }()
			inProgress, errP := h.fetchRuns(ctx, repo, fmt.Sprintf("status=in_progress&per_page=%d", ghpFlowMaxRunsPerRepo))
			if errP != nil {
				return
			}
			queued, errQ := h.fetchRuns(ctx, repo, fmt.Sprintf("status=queued&per_page=%d", ghpFlowMaxRunsPerRepo))
			if errQ != nil {
				queued = nil
			}
			runs := append(inProgress, queued...)
			// Fetch jobs in parallel (bounded) to avoid N+1 sequential API calls.
			type flowResult struct {
				run  ghpWorkflowRun
				jobs []ghpJob
			}
			results := make([]flowResult, len(runs))
			var wg sync.WaitGroup
			jobSem := make(chan struct{}, ghpMaxConcurrentFetches)
			for i, r := range runs {
				wg.Add(1)
				go func(idx int, run ghpWorkflowRun) {
					defer wg.Done()
					jobSem <- struct{}{}
					defer func() { <-jobSem }()
					jobs, jobsErr := h.fetchJobs(ctx, repo, run.ID)
					if jobsErr != nil {
						return
					}
					results[idx] = flowResult{run: run, jobs: jobs}
				}(i, r)
			}
			wg.Wait()
			flowMu.Lock()
			for _, res := range results {
				if res.jobs != nil {
					all = append(all, ghpFlowRun{Run: res.run, Jobs: res.jobs})
				}
			}
			flowMu.Unlock()
		}(repo)
	}
	repoWg.Wait()
	// Newest first by createdAt (lexical works for ISO strings)
	sort.Slice(all, func(i, j int) bool {
		return all[i].Run.CreatedAt > all[j].Run.CreatedAt
	})
	return ghpFlowPayload{Runs: all}, nil
}

func (h *GitHubPipelinesHandler) buildFailuresFromQuery(c *fiber.Ctx) (any, error) {
	repos, err := ghpResolveRepos(c.Query("repo"))
	if err != nil {
		return nil, err
	}

	ctx := c.UserContext()
	rows := make([]ghpFailureRow, 0)
	var failMu sync.Mutex
	var failWg sync.WaitGroup
	repoSem := make(chan struct{}, ghpMaxConcurrentFetches)
	for _, repo := range repos {
		failWg.Add(1)
		go func(repo string) {
			defer failWg.Done()
			repoSem <- struct{}{}
			defer func() { <-repoSem }()
			runs, fetchErr := h.fetchRuns(ctx, repo, fmt.Sprintf("status=failure&per_page=%d", ghpFailuresOverfetch))
			if fetchErr != nil {
				return
			}
			localRows := make([]ghpFailureRow, 0, len(runs))
			for _, r := range runs {
				localRows = append(localRows, ghpFailureRow{
					Repo:         repo,
					RunID:        r.ID,
					Workflow:     r.Name,
					HTMLURL:      r.HTMLURL,
					Branch:       r.HeadBranch,
					Event:        r.Event,
					Conclusion:   r.Conclusion,
					CreatedAt:    r.CreatedAt,
					DurationMs:   ghpFailureDuration(r),
					PullRequests: r.PullRequests,
				})
			}
			failMu.Lock()
			rows = append(rows, localRows...)
			failMu.Unlock()
		}(repo)
	}
	failWg.Wait()
	sort.Slice(rows, func(i, j int) bool {
		return rows[i].CreatedAt > rows[j].CreatedAt
	})
	if len(rows) > ghpFailuresLimit {
		rows = rows[:ghpFailuresLimit]
	}
	// Fetch failed steps in parallel (bounded) to avoid N+1 sequential API calls.
	{
		var wg sync.WaitGroup
		jobSem := make(chan struct{}, ghpMaxConcurrentFetches)
		for i := range rows {
			wg.Add(1)
			go func(idx int) {
				defer wg.Done()
				jobSem <- struct{}{}
				defer func() { <-jobSem }()
				jobs, jobsErr := h.fetchJobs(ctx, rows[idx].Repo, rows[idx].RunID)
				if jobsErr != nil {
					return
				}
				rows[idx].FailedStep = ghpFirstFailedStep(jobs)
			}(i)
		}
		wg.Wait()
	}
	return ghpFailuresPayload{Runs: rows}, nil
}

// ghpAllPayload bundles all four pipeline views into a single response.
func (h *GitHubPipelinesHandler) buildAll(c *fiber.Ctx) (any, error) {
	pulse, pulseErr := h.buildPulse(c)
	matrix, matrixErr := h.buildMatrixFromQuery(c)
	failures, failuresErr := h.buildFailuresFromQuery(c)
	flow, flowErr := h.buildFlowFromQuery(c)

	if pulseErr != nil && matrixErr != nil && failuresErr != nil && flowErr != nil {
		return nil, fmt.Errorf("all views failed: pulse=%v, matrix=%v, failures=%v, flow=%v",
			pulseErr, matrixErr, failuresErr, flowErr)
	}

	return ghpAllPayload{
		Pulse:    pulse,
		Matrix:   matrix,
		Failures: failures,
		Flow:     flow,
	}, nil
}

func (h *GitHubPipelinesHandler) handleLog(c *fiber.Ctx) error {
	repo := c.Query("repo")
	jobStr := c.Query("job")
	if !ghpIsAllowedRepo(repo) || jobStr == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "repo and job required"})
	}
	if _, err := strconv.ParseInt(jobStr, 10, 64); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "job must be a numeric ID"})
	}
	ctx := c.UserContext()
	res, err := h.ghGet(ctx, fmt.Sprintf("/repos/%s/actions/jobs/%s/logs", repo, jobStr))
	if err != nil {
		slog.Error("[GitHubPipelines] failed to fetch job logs", "repo", repo, "job", jobStr, "error", err)
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": "upstream service error"})
	}
	defer res.Body.Close()
	if res.StatusCode == http.StatusNotFound {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Log not available (may have been purged)"})
	}
	if res.StatusCode >= 400 {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": fmt.Sprintf("github %d", res.StatusCode)})
	}
	ghpForwardRateLimitHeaders(c, res)
	body, err := io.ReadAll(io.LimitReader(res.Body, ghpMaxLogBytes))
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "read failed"})
	}
	lines := strings.Split(string(body), "\n")
	total := len(lines)
	start := total - ghpLogTailLines
	if start < 0 {
		start = 0
	}
	return c.JSON(ghpLogPayload{
		Lines:         ghpLogTailLines,
		TruncatedFrom: total,
		Log:           strings.Join(lines[start:], "\n"),
	})
}

func (h *GitHubPipelinesHandler) handleMutate(c *fiber.Ctx) error {
	if h.mutationToken == "" {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "Workflow mutations disabled on this deployment"})
	}
	op := c.Query("op")
	repo := c.Query("repo")
	run := c.Query("run")
	if !ghpIsAllowedRepo(repo) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Unknown repo"})
	}
	if _, err := strconv.ParseInt(run, 10, 64); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "run must be a numeric ID"})
	}

	var path string
	switch op {
	case "rerun":
		path = fmt.Sprintf("/repos/%s/actions/runs/%s/rerun", repo, run)
	case "cancel":
		path = fmt.Sprintf("/repos/%s/actions/runs/%s/cancel", repo, run)
	default:
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Unknown op"})
	}

	ctx, cancel := context.WithTimeout(c.UserContext(), ghpMutationHTTPTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, ghpGitHubAPIBase+path, nil)
	if err != nil {
		slog.Error("[GitHubPipelines] failed to create mutation request", "repo", repo, "run", run, "op", op, "error", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
	}
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("Authorization", "Bearer "+h.mutationToken)
	res, err := h.httpClient.Do(req)
	if err != nil {
		slog.Error("[GitHubPipelines] failed to send mutation request", "repo", repo, "run", run, "op", op, "error", err)
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": "upstream service error"})
	}
	defer res.Body.Close()
	if res.StatusCode >= 400 {
		body, readErr := io.ReadAll(io.LimitReader(res.Body, ghpMaxErrorBodyBytes))
		if readErr != nil {
			slog.Warn("failed to read response body", "error", readErr)
		}
		slog.Error("[GitHubPipelines] upstream error", "repo", repo, "run", run, "op", op, "status", res.StatusCode, "body", string(body))
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": "upstream service error"})
	}
	return c.JSON(fiber.Map{"ok": true, "op": op, "run": run, "repo": repo})
}
