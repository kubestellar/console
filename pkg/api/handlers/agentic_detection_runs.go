// Package handlers — Agentic Workflows Detection Runs
//
// Fetches detection run data from the current GitHub "[aw] Detection Runs"
// tracking issue, which records workflow runs where threat detection flagged problems.
package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	neturl "net/url"
	"os"
	"regexp"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/client"
)

const (
	awDetectionRunsTimeout         = 15 * time.Second
	awDetectionRunsRepo            = "kubestellar/console"
	awDetectionRunsIssueTitle      = "[aw] Detection Runs"
	awDetectionRunsIssueLabel      = "agentic-workflows"
	awDetectionRunsDemoIssueNumber = 16283
	awDetectionRunsSearchLimit     = 1
	awMaxDetectionRuns             = 50
	awMaxResponseBytes             = 5 * 1024 * 1024 // 5 MB
)

// detectionRunCommentPattern extracts detection run metadata from issue comments.
// Matches lines like: "Conclusion: warning | Reason: parse_error"
var detectionRunCommentPattern = regexp.MustCompile(`(?m)^Conclusion:\s*(\w+)\s*\|\s*Reason:\s*(\w+)`)

// workflowRunURLPattern extracts workflow run URLs from issue comments.
// URLs must appear on their own line so embedded attacker-controlled text cannot bypass validation.
var workflowRunURLPattern = regexp.MustCompile(`(?m)^https://github\.com/[\w-]+/[\w-]+/actions/runs/(\d+)\s*$`)

type AgenticDetectionRunsHandler struct{}

func NewAgenticDetectionRunsHandler() *AgenticDetectionRunsHandler {
	return &AgenticDetectionRunsHandler{}
}

// DetectionRun represents a single detection run entry.
type DetectionRun struct {
	Conclusion  string    `json:"conclusion"`
	Reason      string    `json:"reason"`
	WorkflowURL string    `json:"workflowUrl"`
	RunID       string    `json:"runId"`
	CommentedAt time.Time `json:"commentedAt"`
	CommentURL  string    `json:"commentUrl"`
}

// DetectionRunsResponse is the API response shape.
type DetectionRunsResponse struct {
	Runs       []DetectionRun `json:"runs"`
	IssueURL   string         `json:"issueUrl"`
	TotalCount int            `json:"totalCount"`
	Source     string         `json:"source"`
	CachedAt   time.Time      `json:"cachedAt"`
	IsDemoData bool           `json:"isDemoData"`
}

// DetectionRunIssueComment represents a GitHub issue comment from the API.
type DetectionRunIssueComment struct {
	ID        int64     `json:"id"`
	Body      string    `json:"body"`
	CreatedAt time.Time `json:"created_at"`
	HTMLURL   string    `json:"html_url"`
	User      struct {
		Login string `json:"login"`
	} `json:"user"`
}

// DetectionRunIssueSearchResponse represents a GitHub issue search response.
type DetectionRunIssueSearchResponse struct {
	Items []DetectionRunIssue `json:"items"`
}

// DetectionRunIssue represents a GitHub issue result.
type DetectionRunIssue struct {
	Number  int    `json:"number"`
	HTMLURL string `json:"html_url"`
}

// GetDetectionRuns returns detection runs from the active detection tracking issue.
func (h *AgenticDetectionRunsHandler) GetDetectionRuns(c *fiber.Ctx) error {
	if IsDemoMode(c) {
		return DemoResponse(c, "agentic-detection-runs", GetDemoDetectionRuns())
	}

	runs, err := h.fetchDetectionRuns(c.UserContext())
	if err != nil {
		slog.Error("[AgenticDetectionRuns] Failed to fetch detection runs", "error", err)
		return DemoResponse(c, "agentic-detection-runs", GetDemoDetectionRuns())
	}

	return c.JSON(runs)
}

// fetchDetectionRuns fetches detection run data from GitHub issue comments.
func (h *AgenticDetectionRunsHandler) fetchDetectionRuns(ctx context.Context) (*DetectionRunsResponse, error) {
	token := os.Getenv("GITHUB_TOKEN")
	if token == "" {
		return nil, fmt.Errorf("GITHUB_TOKEN not configured")
	}

	ctx, cancel := context.WithTimeout(ctx, awDetectionRunsTimeout)
	defer cancel()

	issue, err := h.fetchDetectionRunsIssue(ctx, token)
	if err != nil {
		return nil, err
	}

	commentsURL := fmt.Sprintf("https://api.github.com/repos/%s/issues/%d/comments?per_page=%d&sort=created&direction=desc",
		awDetectionRunsRepo, issue.Number, awMaxDetectionRuns)

	commentsBody, err := fetchGitHubResponseBody(ctx, token, commentsURL)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch comments: %w", err)
	}

	var comments []DetectionRunIssueComment
	if err := json.Unmarshal(commentsBody, &comments); err != nil {
		return nil, fmt.Errorf("failed to parse comments: %w", err)
	}

	// Parse comments to extract detection runs
	runs := make([]DetectionRun, 0)
	for _, comment := range comments {
		// Only process comments from github-actions bot
		if comment.User.Login != "github-actions" {
			continue
		}

		// Extract conclusion and reason
		matches := detectionRunCommentPattern.FindStringSubmatch(comment.Body)
		if len(matches) < 3 {
			continue
		}

		conclusion := matches[1]
		reason := matches[2]

		// Extract workflow run URL
		urlMatches := workflowRunURLPattern.FindStringSubmatch(comment.Body)
		workflowURL := ""
		runID := ""
		if len(urlMatches) >= 2 {
			workflowURL = urlMatches[0]
			runID = urlMatches[1]
		}

		runs = append(runs, DetectionRun{
			Conclusion:  conclusion,
			Reason:      reason,
			WorkflowURL: workflowURL,
			RunID:       runID,
			CommentedAt: comment.CreatedAt,
			CommentURL:  comment.HTMLURL,
		})
	}

	return &DetectionRunsResponse{
		Runs:       runs,
		IssueURL:   issue.HTMLURL,
		TotalCount: len(runs),
		Source:     "github",
		CachedAt:   time.Now(),
		IsDemoData: false,
	}, nil
}

func (h *AgenticDetectionRunsHandler) fetchDetectionRunsIssue(ctx context.Context, token string) (*DetectionRunIssue, error) {
	searchQuery := neturl.QueryEscape(fmt.Sprintf(
		"repo:%s is:issue is:open label:%s in:title %q",
		awDetectionRunsRepo,
		awDetectionRunsIssueLabel,
		awDetectionRunsIssueTitle,
	))
	searchURL := fmt.Sprintf("https://api.github.com/search/issues?q=%s&per_page=%d", searchQuery, awDetectionRunsSearchLimit)

	searchBody, err := fetchGitHubResponseBody(ctx, token, searchURL)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch detection runs issue: %w", err)
	}

	var searchResponse DetectionRunIssueSearchResponse
	if err := json.Unmarshal(searchBody, &searchResponse); err != nil {
		return nil, fmt.Errorf("failed to parse detection runs issue: %w", err)
	}
	if len(searchResponse.Items) == 0 {
		return nil, fmt.Errorf("detection runs issue not found")
	}

	return &searchResponse.Items[0], nil
}

func fetchGitHubResponseBody(ctx context.Context, token, requestURL string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, requestURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Authorization", "token "+token)
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("User-Agent", "kubestellar-console")

	resp, err := client.GitHub.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GitHub API returned status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, awMaxResponseBytes))
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	return body, nil
}

// GetDemoDetectionRuns returns demo data for detection runs.
func GetDemoDetectionRuns() DetectionRunsResponse {
	now := time.Now()
	issueURL := fmt.Sprintf("https://github.com/%s/issues/%d", awDetectionRunsRepo, awDetectionRunsDemoIssueNumber)

	return DetectionRunsResponse{
		Runs: []DetectionRun{
			{
				Conclusion:  "warning",
				Reason:      "parse_error",
				WorkflowURL: "https://github.com/kubestellar/console/actions/runs/25864572226",
				RunID:       "25864572226",
				CommentedAt: now.Add(-2 * time.Hour),
				CommentURL:  issueURL + "#issuecomment-12345",
			},
			{
				Conclusion:  "warning",
				Reason:      "threat_detected",
				WorkflowURL: "https://github.com/kubestellar/console/actions/runs/25864572225",
				RunID:       "25864572225",
				CommentedAt: now.Add(-5 * time.Hour),
				CommentURL:  issueURL + "#issuecomment-12344",
			},
			{
				Conclusion:  "failure",
				Reason:      "agent_failure",
				WorkflowURL: "https://github.com/kubestellar/console/actions/runs/25864572224",
				RunID:       "25864572224",
				CommentedAt: now.Add(-8 * time.Hour),
				CommentURL:  issueURL + "#issuecomment-12343",
			},
		},
		IssueURL:   issueURL,
		TotalCount: 3,
		Source:     "demo",
		CachedAt:   now,
		IsDemoData: true,
	}
}
