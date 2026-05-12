// Package handlers provides HTTP handlers for the console API.
package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/settings"
)

// ACMM scan constants
const (
	acmmGitHubAPI    = "https://api.github.com"
	acmmAPITimeoutMS = 15000
	weeksOfHistory   = 16
	// GitHub search API max pages/size
	searchPageSize = 100
	searchMaxPages = 10
	// AI contribution detection
	aiLabel = "ai-generated"
	// githubGet response body limit (10 MB)
	acmmMaxBodyBytes = 10 * 1024 * 1024
	// User-Agent sent with GitHub API requests
	acmmUserAgent = "kubestellar-console/1.0"
)

// acmmHTTPClient is a dedicated client for ACMM GitHub API calls.
// Using http.DefaultClient would race under concurrent requests and
// lacks a timeout, risking indefinite hangs on unresponsive upstreams.
var acmmHTTPClient = &http.Client{Timeout: 30 * time.Second}


var (
	repoSlugRE = regexp.MustCompile(`^[\w.\-]+/[\w.\-]+$`)
	aiAuthors  = map[string]bool{
		"clubanderson":           true,
		"Copilot":                true,
		"copilot-swe-agent[bot]": true,
	}
	// acmmScanInFlight tracks repo scans currently being processed to avoid
	// redundant GitHub API calls from concurrent requests.
	acmmScanInFlight sync.Map
)

// acmmCriterion describes a single maturity detection rule.
type acmmCriterion struct {
	ID       string   `json:"id"`
	Patterns []string `json:"patterns"` // file paths or directory prefixes
}

// acmmScanResult is the JSON response from /api/acmm/scan.
type acmmScanResult struct {
	Repo           string               `json:"repo"`
	ScannedAt      string               `json:"scannedAt"`
	DetectedIDs    []string             `json:"detectedIds"`
	WeeklyActivity []acmmWeeklyActivity `json:"weeklyActivity"`
}

type acmmWeeklyActivity struct {
	Week        string `json:"week"`
	AIPrs       int    `json:"aiPrs"`
	HumanPrs    int    `json:"humanPrs"`
	AIIssues    int    `json:"aiIssues"`
	HumanIssues int    `json:"humanIssues"`
}

// criteria catalog — mirrors the Netlify Function and frontend sources.
// Each entry has an ID and a list of path patterns to check against the repo tree.
//
//nolint:lll // catalog entries are intentionally wide for readability
var acmmCriteria = []acmmCriterion{
	// ACMM L0 — Prerequisites (soft indicator)
	{ID: "acmm:prereq-test-suite", Patterns: []string{"vitest.config.ts", "vitest.config.js", "jest.config.js", "jest.config.ts", "go.mod", "pytest.ini", "pyproject.toml", "test/", "tests/", "__tests__/", "spec/"}},
	{ID: "acmm:prereq-e2e", Patterns: []string{"playwright.config.ts", "playwright.config.js", "cypress.config.ts", "e2e/"}},
	{ID: "acmm:prereq-cicd", Patterns: []string{".github/workflows/", ".gitlab-ci.yml", "Jenkinsfile", ".circleci/"}},
	{ID: "acmm:prereq-pr-template", Patterns: []string{".github/pull_request_template.md", ".github/PULL_REQUEST_TEMPLATE.md"}},
	{ID: "acmm:prereq-issue-template", Patterns: []string{".github/ISSUE_TEMPLATE/", ".github/issue_template.md"}},
	{ID: "acmm:prereq-contrib-guide", Patterns: []string{"CONTRIBUTING.md", "docs/contributing.md", ".github/CONTRIBUTING.md"}},
	{ID: "acmm:prereq-code-style", Patterns: []string{".eslintrc", ".eslintrc.json", ".eslintrc.js", "eslint.config.js", "eslint.config.mjs", ".prettierrc", ".prettierrc.json", "prettier.config.js", "ruff.toml", ".golangci.yml", "biome.json"}},
	{ID: "acmm:prereq-coverage-gate", Patterns: []string{"codecov.yml", ".codecov.yml", ".github/workflows/coverage-gate.yml", "coverage.yml", ".coverage-thresholds.json"}},
	// ACMM L2 — Instructed
	{ID: "acmm:claude-md", Patterns: []string{"CLAUDE.md", ".claude/CLAUDE.md"}},
	{ID: "acmm:copilot-instructions", Patterns: []string{".github/copilot-instructions.md"}},
	{ID: "acmm:agents-md", Patterns: []string{"AGENTS.md"}},
	{ID: "acmm:cursor-rules", Patterns: []string{".cursorrules", ".cursor/rules"}},
	{ID: "acmm:prompts-catalog", Patterns: []string{"prompts/", ".prompts/", "docs/prompts/", ".github/prompts/", ".github/agents/"}},
	{ID: "acmm:editor-config", Patterns: []string{".editorconfig"}},
	{ID: "acmm:simple-skills", Patterns: []string{".claude/skills/", ".claude/commands/", "skills/"}},
	{ID: "acmm:correction-capture", Patterns: []string{".claude/memory/", ".memory/", "corrections.jsonl"}},
	// ACMM L3 — Measured / Enforced
	{ID: "acmm:pr-acceptance-metric", Patterns: []string{"scripts/build-accm-history.mjs", ".github/workflows/accm-history-update.yml", "scripts/pr-metrics.mjs", ".github/workflows/pr-metrics.yml", "docs/metrics.md"}},
	{ID: "acmm:pr-review-rubric", Patterns: []string{".github/workflows/review.yml", "docs/review-rubric.md", ".github/review-checklist.md", ".github/prompts/review.md", "docs/qa/"}},
	{ID: "acmm:quality-dashboard", Patterns: []string{"public/analytics.js", "web/public/analytics.js", "web/src/components/analytics/", "docs/quality.md", ".github/workflows/quality-report.yml", "docs/AI-QUALITY-ASSURANCE.md"}},
	{ID: "acmm:ci-matrix", Patterns: []string{".github/workflows/ci.yml", ".github/workflows/test.yml", ".github/workflows/build.yml", ".github/workflows/build-deploy.yml"}},
	{ID: "acmm:layered-safety", Patterns: []string{".claude/settings.json", ".claude/settings.local.json"}},
	{ID: "acmm:mechanical-enforcement", Patterns: []string{".claude/settings.json"}},
	{ID: "acmm:session-summary", Patterns: []string{".claude/session-summary.md", ".claude/checkpoint.md"}},
	{ID: "acmm:structural-gates", Patterns: []string{".claude/settings.json"}},
	// ACMM L4 — Adaptive / Structured
	{ID: "acmm:auto-qa-tuning", Patterns: []string{".github/auto-qa-tuning.json", ".github/workflows/auto-qa.yml", "scripts/auto-qa-tuner.mjs"}},
	{ID: "acmm:nightly-compliance", Patterns: []string{".github/workflows/nightly-compliance.yml", ".github/workflows/nightly.yml", ".github/workflows/nightly-test.yml", ".github/workflows/nightly-test-suite.yml"}},
	{ID: "acmm:copilot-review-apply", Patterns: []string{".github/workflows/copilot-review-apply.yml", ".github/workflows/apply-copilot.yml", ".github/workflows/ai-fix.yml", ".github/workflows/auto-review.yml"}},
	{ID: "acmm:auto-label", Patterns: []string{".github/labeler.yml", ".github/workflows/labeler.yml", ".github/workflows/triage.yml"}},
	{ID: "acmm:ai-fix-workflow", Patterns: []string{".github/workflows/ai-fix.yml", ".github/workflows/ai-fix-requested.yml", ".github/workflows/claude.yml"}},
	{ID: "acmm:tier-classifier", Patterns: []string{".github/workflows/tier-classifier.yml", "docs/risk-tiers.md", ".github/risk-tiers.yml", ".github/workflows/pr-size.yml"}},
	{ID: "acmm:security-ai-md", Patterns: []string{"docs/security/SECURITY-AI.md", "SECURITY-AI.md", "docs/SECURITY-AI.md"}},
	{ID: "acmm:session-continuity", Patterns: []string{".claude/checkpoint.md", ".claude/session-summary.md"}},
	{ID: "acmm:cross-session-knowledge", Patterns: []string{"knowledge.jsonl", ".knowledge/", "docs/reflections/"}},
	// ACMM L5 — Automated / Self-Sustaining
	{ID: "acmm:github-actions-ai", Patterns: []string{".github/workflows/claude.yml", ".github/workflows/claude-code-review.yml"}},
	{ID: "acmm:auto-qa-self-tuning", Patterns: []string{".github/workflows/auto-qa.yml", ".github/auto-qa-tuning.json"}},
	{ID: "acmm:public-metrics", Patterns: []string{"web/netlify/functions/analytics-accm.mts", "web/public/analytics.js", "docs/metrics/"}},
	{ID: "acmm:policy-as-code", Patterns: []string{"policies/", ".github/policies/", "kyverno/", "conftest.yaml", "opa/"}},
	{ID: "acmm:reflection-log", Patterns: []string{".claude/reflections/", "memory/", ".memory/", "docs/reflections/", "REFLECTIONS.md"}},
	// ACMM L6 — Autonomous
	{ID: "acmm:auto-issue-gen", Patterns: []string{".github/workflows/auto-issues.yml", ".github/workflows/auto-issue.yml", ".github/workflows/issue-gen.yml", ".github/workflows/auto-generate-issues.yml", "scripts/generate-issues.mjs"}},
	{ID: "acmm:multi-agent-orchestration", Patterns: []string{".github/workflows/dispatcher.yml", ".github/workflows/orchestrate.yml", "scripts/orchestrate.mjs", "docs/multi-agent.md", ".claude/dispatcher/", "orchestrator/"}},
	{ID: "acmm:strategic-dashboard", Patterns: []string{"web/src/components/acmm/", "docs/strategy.md", ".github/workflows/strategy-report.yml", "docs/autonomous-work-log.md"}},
	{ID: "acmm:merge-queue", Patterns: []string{".github/workflows/merge-queue.yml", ".github/merge-queue.yml", ".prow.yaml", "tide.yaml"}},
	{ID: "acmm:risk-assessment-config", Patterns: []string{"risk-config.json", ".claude/risk-config.json", ".github/risk-assessment.yml"}},
	{ID: "acmm:observability-runbook", Patterns: []string{"docs/ai-ops-runbook.md", "docs/runbook/", "RUNBOOK.md"}},
	// Fullsend
	{ID: "fullsend:test-coverage", Patterns: []string{"codecov.yml", ".codecov.yml", "coverage.yml", ".github/workflows/coverage-gate.yml"}},
	{ID: "fullsend:ci-cd-maturity", Patterns: []string{".github/workflows/"}},
	{ID: "fullsend:auto-merge-policy", Patterns: []string{".github/auto-merge.yml", ".prow.yaml", "tide.yaml", ".github/workflows/auto-merge.yml"}},
	{ID: "fullsend:branch-protection-doc", Patterns: []string{"docs/branch-protection.md", "docs/governance.md", ".github/branch-protection.yml"}},
	{ID: "fullsend:production-feedback", Patterns: []string{"monitoring/", "grafana/", ".github/workflows/post-deploy-check.yml", "scripts/production-feedback.mjs"}},
	{ID: "fullsend:observability-runbook", Patterns: []string{"docs/runbook.md", "docs/runbooks/", "RUNBOOK.md", "docs/operations/"}},
	{ID: "fullsend:risk-assessment", Patterns: []string{".github/risk-assessment.yml", "docs/risk-tiers.md", ".github/workflows/tier-classifier.yml"}},
	{ID: "fullsend:rollback-drill", Patterns: []string{"docs/rollback.md", ".github/workflows/rollback.yml", "scripts/rollback.sh"}},
	// Agentic Engineering Framework
	{ID: "aef:task-traceability", Patterns: []string{".agent/tasks/", "docs/agent-tasks/", ".github/agent-log/", "agent-tasks.md"}},
	{ID: "aef:structural-gates", Patterns: []string{"CODEOWNERS", ".github/CODEOWNERS", ".agent/boundaries.yml", "docs/agent-boundaries.md"}},
	{ID: "aef:session-continuity", Patterns: []string{"CLAUDE.md", "AGENTS.md", ".cursorrules", ".github/copilot-instructions.md", "docs/agent-context.md"}},
	{ID: "aef:audit-trail", Patterns: []string{".github/workflows/ai-audit.yml", ".github/workflows/agent-audit.yml", "scripts/ai-audit-report.mjs"}},
	{ID: "aef:cross-tool-config", Patterns: []string{"AGENTS.md", "docs/ai-contributors.md", ".github/ai-config.yml"}},
	{ID: "aef:change-classification", Patterns: []string{"docs/change-classification.md", ".github/change-tiers.yml", "docs/risk-tiers.md"}},
	// Claude Reflect
	{ID: "claude-reflect:correction-capture", Patterns: []string{".claude/reflections/", "memory/feedback_", ".github/ai-corrections.yml", "scripts/capture-corrections.mjs"}},
	{ID: "claude-reflect:positive-reinforcement", Patterns: []string{".claude/reflections/", "memory/feedback_", "docs/ai-reinforcement.md"}},
	{ID: "claude-reflect:claude-md-sync", Patterns: []string{".github/workflows/claude-md-sync.yml", "scripts/sync-claude-md.mjs", "scripts/update-claude-md.mjs"}},
	{ID: "claude-reflect:preference-index", Patterns: []string{".claude/preferences.json", "memory/MEMORY.md", ".github/agent-preferences.yml"}},
	{ID: "claude-reflect:reflection-review", Patterns: []string{".github/workflows/reflection-review.yml", "scripts/review-reflections.mjs", "docs/reflection-review.md"}},
	{ID: "claude-reflect:session-summary", Patterns: []string{".claude/sessions/", "docs/session-summaries/", "memory/session_"}},
}

// ACMMScanHandler handles GET /api/acmm/scan?repo=owner/name.
// It calls the GitHub API to scan the repo tree and weekly activity.
func ACMMScanHandler(c *fiber.Ctx) error {
	repo := c.Query("repo")
	if repo == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Missing repo query parameter"})
	}
	if !repoSlugRE.MatchString(repo) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid repo — must be owner/name"})
	}

	// Demo mode support
	if isDemoMode(c) {
		return c.JSON(demoACMMScan(repo))
	}

	// Coordination: collapse concurrent requests for the same repo (#6842).
	// We use a channel that is closed when the scan finishes.
	// value is the result/error from the scan.
	type scanWaiter struct {
		done   chan struct{}
		result *acmmScanResult
		err    error
	}

	actual, loaded := acmmScanInFlight.LoadOrStore(repo, &scanWaiter{
		done: make(chan struct{}),
	})
	waiter := actual.(*scanWaiter)

	if loaded {
		// Another request is already scanning this repo. Wait for it.
		select {
		case <-waiter.done:
			if waiter.err != nil {
				return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{
					"error": waiter.err.Error(),
					"repo":  repo,
				})
			}
			return c.JSON(waiter.result)
		case <-c.Context().Done():
			return c.Status(fiber.StatusRequestTimeout).JSON(fiber.Map{"error": "Request timed out while waiting for in-flight scan"})
		}
	}

	// We are the primary scanner.
	// Use a detached context so the scan continues even if the primary
	// requester disconnects — other concurrent waiters should still
	// receive the result (#9527).
	defer func() {
		acmmScanInFlight.Delete(repo)
		close(waiter.done)
	}()

	token := settings.ResolveGitHubTokenEnv()
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(acmmAPITimeoutMS)*time.Millisecond)
	defer cancel()

	// Fetch repo tree
	treePaths, err := fetchACMMTreePaths(ctx, repo, token)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			waiter.err = fmt.Errorf("repo not found")
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Repo not found", "detail": repo})
		}
		waiter.err = fmt.Errorf("GitHub API error: %s", err.Error())
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{
			"error": waiter.err.Error(),
			"repo":  repo,
		})
	}

	// Detect criteria
	detected := make([]string, 0)
	for _, crit := range acmmCriteria {
		if matchesPatterns(treePaths, crit.Patterns) {
			detected = append(detected, crit.ID)
		}
	}
	if detected == nil {
		detected = []string{}
	}

	// Fetch weekly activity (best-effort — don't fail if rate-limited)
	weekly := fetchACMMWeeklyActivity(ctx, repo, token)

	waiter.result = &acmmScanResult{
		Repo:           repo,
		ScannedAt:      time.Now().UTC().Format(time.RFC3339),
		DetectedIDs:    detected,
		WeeklyActivity: weekly,
	}

	return c.JSON(waiter.result)
}

// fetchACMMTreePaths gets all file paths in a GitHub repo via the trees API.
func fetchACMMTreePaths(ctx context.Context, repo, token string) (map[string]bool, error) {
	// Get default branch
	repoURL := fmt.Sprintf("%s/repos/%s", acmmGitHubAPI, repo)
	repoBody, err := githubGet(ctx, repoURL, token)
	if err != nil {
		return nil, err
	}

	var repoInfo struct {
		DefaultBranch string `json:"default_branch"`
	}
	if err := json.Unmarshal(repoBody, &repoInfo); err != nil {
		return nil, fmt.Errorf("parse repo info: %w", err)
	}
	branch := repoInfo.DefaultBranch
	if branch == "" {
		branch = "main"
	}

	// Get recursive tree
	// URL-encode the branch name — branches like "release/v1" contain "/" which
	// would break the path segment without encoding.
	treeURL := fmt.Sprintf("%s/repos/%s/git/trees/%s?recursive=1", acmmGitHubAPI, repo, url.PathEscape(branch))
	treeBody, err := githubGet(ctx, treeURL, token)
	if err != nil {
		return nil, err
	}

	var treeResp struct {
		Tree []struct {
			Path string `json:"path"`
		} `json:"tree"`
	}
	if err := json.Unmarshal(treeBody, &treeResp); err != nil {
		return nil, fmt.Errorf("parse tree: %w", err)
	}

	paths := make(map[string]bool, len(treeResp.Tree))
	for _, entry := range treeResp.Tree {
		paths[entry.Path] = true
	}
	return paths, nil
}

// matchesPatterns checks if any pattern matches any path in the tree.
func matchesPatterns(treePaths map[string]bool, patterns []string) bool {
	for _, pattern := range patterns {
		if strings.HasSuffix(pattern, "/") {
			// Directory pattern
			for path := range treePaths {
				if strings.HasPrefix(path, pattern) ||
					path == strings.TrimSuffix(pattern, "/") ||
					strings.Contains(path, "/"+pattern) {
					return true
				}
			}
		} else {
			// File pattern
			for path := range treePaths {
				if path == pattern ||
					strings.HasSuffix(path, "/"+pattern) ||
					strings.HasPrefix(path, pattern+"/") {
					return true
				}
			}
		}
	}
	return false
}

// isoWeek returns the ISO 8601 week string for a date.
func isoWeek(t time.Time) string {
	year, week := t.ISOWeek()
	return fmt.Sprintf("%d-W%02d", year, week)
}

// fetchACMMWeeklyActivity gets PR and issue counts per week from GitHub Search API.
func fetchACMMWeeklyActivity(ctx context.Context, repo, token string) []acmmWeeklyActivity {
	weeks := lastNWeeks(weeksOfHistory)
	buckets := make(map[string]*acmmWeeklyActivity, len(weeks))
	for _, w := range weeks {
		buckets[w] = &acmmWeeklyActivity{Week: w}
	}

	since := time.Now().UTC().AddDate(0, 0, -weeksOfHistory*7).Format("2006-01-02")

	// PRs
	prURL := fmt.Sprintf("%s/search/issues?q=repo:%s+type:pr+created:>=%s", acmmGitHubAPI, repo, since)
	prItems := searchAllACMMPages(ctx, prURL, token)
	for _, item := range prItems {
		t, err := time.Parse(time.RFC3339, item.CreatedAt)
		if err != nil {
			continue
		}
		w := isoWeek(t)
		b, ok := buckets[w]
		if !ok {
			continue
		}
		if isACMMAIContribution(item.Labels, item.User.Login) {
			b.AIPrs++
		} else {
			b.HumanPrs++
		}
	}

	// Issues
	issueURL := fmt.Sprintf("%s/search/issues?q=repo:%s+type:issue+created:>=%s", acmmGitHubAPI, repo, since)
	issueItems := searchAllACMMPages(ctx, issueURL, token)
	for _, item := range issueItems {
		if item.PullRequest != nil {
			continue
		}
		t, err := time.Parse(time.RFC3339, item.CreatedAt)
		if err != nil {
			continue
		}
		w := isoWeek(t)
		b, ok := buckets[w]
		if !ok {
			continue
		}
		if isACMMAIContribution(item.Labels, item.User.Login) {
			b.AIIssues++
		} else {
			b.HumanIssues++
		}
	}

	result := make([]acmmWeeklyActivity, 0, len(weeks))
	for _, w := range weeks {
		if b := buckets[w]; b != nil {
			result = append(result, *b)
		}
	}
	return result
}

func lastNWeeks(n int) []string {
	seen := make(map[string]bool)
	weeks := make([]string, 0)
	now := time.Now().UTC()
	for i := n - 1; i >= 0; i-- {
		d := now.AddDate(0, 0, -i*7)
		w := isoWeek(d)
		if !seen[w] {
			seen[w] = true
			weeks = append(weeks, w)
		}
	}
	return weeks
}

type acmmSearchItem struct {
	CreatedAt   string `json:"created_at"`
	PullRequest *struct {
		MergedAt *string `json:"merged_at"`
	} `json:"pull_request"`
	User struct {
		Login string `json:"login"`
	} `json:"user"`
	Labels []acmmLabel `json:"labels"`
}

func searchAllACMMPages(ctx context.Context, baseURL, token string) []acmmSearchItem {
	items := make([]acmmSearchItem, 0)
	for page := 1; page <= searchMaxPages; page++ {
		url := fmt.Sprintf("%s&per_page=%d&page=%d", baseURL, searchPageSize, page)
		body, err := githubGet(ctx, url, token)
		if err != nil {
			break
		}
		var resp struct {
			Items []acmmSearchItem `json:"items"`
		}
		if err := json.Unmarshal(body, &resp); err != nil {
			break
		}
		items = append(items, resp.Items...)
		if len(resp.Items) < searchPageSize {
			break
		}
	}
	return items
}

type acmmLabel struct {
	Name string `json:"name"`
}

func isACMMAIContribution(labels []acmmLabel, author string) bool {
	if aiAuthors[author] {
		return true
	}
	if strings.HasSuffix(author, "[bot]") {
		return true
	}
	for _, l := range labels {
		if l.Name == aiLabel {
			return true
		}
	}
	return false
}

// githubGet performs an authenticated GET request to the GitHub API.
func githubGet(ctx context.Context, url, token string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("User-Agent", acmmUserAgent)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := acmmHTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("GitHub API request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, fmt.Errorf("not found")
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GitHub API %d", resp.StatusCode)
	}

	// Read body with a size limit; io.ReadAll + LimitReader properly checks
	// for io.EOF vs non-EOF read errors (the manual loop previously swallowed
	// non-EOF errors, potentially returning truncated JSON).
	body, err := io.ReadAll(io.LimitReader(resp.Body, acmmMaxBodyBytes+1))
	if err != nil {
		return nil, fmt.Errorf("reading response body: %w", err)
	}
	if int64(len(body)) > acmmMaxBodyBytes {
		return nil, fmt.Errorf("response too large (>%d bytes)", acmmMaxBodyBytes)
	}

	return body, nil
}

// demoACMMScan returns demo data for when the GitHub API is unavailable.
func demoACMMScan(repo string) acmmScanResult {
	weeks := lastNWeeks(weeksOfHistory)
	activity := make([]acmmWeeklyActivity, len(weeks))
	for i, w := range weeks {
		activity[i] = acmmWeeklyActivity{
			Week:        w,
			AIPrs:       25 + int(math.Floor(math.Sin(float64(i))*5+10)),
			HumanPrs:    4 + int(math.Floor(math.Cos(float64(i))*2+1)),
			AIIssues:    12 + int(math.Floor(math.Sin(float64(i)*2)*3)),
			HumanIssues: 3,
		}
	}
	return acmmScanResult{
		Repo:      repo,
		ScannedAt: time.Now().UTC().Format(time.RFC3339),
		DetectedIDs: []string{
			// Prerequisites
			"acmm:prereq-test-suite", "acmm:prereq-e2e", "acmm:prereq-cicd",
			"acmm:prereq-pr-template", "acmm:prereq-contrib-guide", "acmm:prereq-code-style",
			"acmm:prereq-coverage-gate",
			// L2
			"acmm:claude-md", "acmm:copilot-instructions", "acmm:editor-config",
			"acmm:simple-skills", "acmm:correction-capture",
			// L3
			"acmm:ci-matrix", "acmm:layered-safety", "acmm:mechanical-enforcement",
			"acmm:structural-gates",
			// L4
			"acmm:nightly-compliance", "acmm:auto-label", "acmm:ai-fix-workflow",
			"acmm:security-ai-md",
			// L5
			"acmm:public-metrics", "acmm:reflection-log",
			// Other sources
			"fullsend:test-coverage", "fullsend:ci-cd-maturity",
			"aef:structural-gates", "aef:session-continuity",
			"claude-reflect:preference-index", "claude-reflect:session-summary",
		},
		WeeklyActivity: activity,
	}
}
