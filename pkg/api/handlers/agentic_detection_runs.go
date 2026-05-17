// Package handlers — Agentic Workflows Detection Runs
//
// Fetches detection run data from GitHub issue #13634, which tracks
// all workflow runs where threat detection flagged problems.
package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"regexp"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/client"
)

const (
	awDetectionRunsTimeout     = 15 * time.Second
	awDetectionRunsIssueNumber = 13634
	awDetectionRunsRepo        = "kubestellar/console"
	awMaxDetectionRuns         = 50
	awMaxResponseBytes         = 5 * 1024 * 1024 // 5 MB
)

// detectionRunCommentPattern extracts detection run metadata from issue comments.
// Matches lines like: "Conclusion: warning | Reason: parse_error"
var detectionRunCommentPattern = regexp.MustCompile(`(?m)^Conclusion:\s*(\w+)\s*\|\s*Reason:\s*(\w+)`)

// workflowRunURLPattern extracts workflow run URLs from issue comments.
var workflowRunURLPattern = regexp.MustCompile(`https://github\.com/[\w-]+/[\w-]+/actions/runs/(\d+)`)

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

// GitHubIssueComment represents a GitHub issue comment from the API.
type GitHubIssueComment struct {
	ID        int64     `json:"id"`
	Body      string    `json:"body"`
	CreatedAt time.Time `json:"created_at"`
	HTMLURL   string    `json:"html_url"`
	User      struct {
		Login string `json:"login"`
	} `json:"user"`
}

// GetDetectionRuns returns detection runs from issue #13634.
func (h *AgenticDetectionRunsHandler) GetDetectionRuns(c *fiber.Ctx) error {
	if isDemoMode(c) {
		return demoResponse(c, "agentic-detection-runs", getDemoDetectionRuns())
	}

	runs, err := h.fetchDetectionRuns(c.UserContext())
	if err != nil {
		slog.Error("[AgenticDetectionRuns] Failed to fetch detection runs", "error", err)
		return demoResponse(c, "agentic-detection-runs", getDemoDetectionRuns())
	}

	return c.JSON(runs)
}

// fetchDetectionRuns fetches detection run data from GitHub issue comments.
func (h *AgenticDetectionRunsHandler) fetchDetectionRuns(ctx context.Context) (*DetectionRunsResponse, error) {
	token := os.Getenv("GITHUB_TOKEN")
	if token == "" {
		return nil, fmt.Errorf("GITHUB_TOKEN not configured")
	}

	// Fetch issue comments from GitHub API
	url := fmt.Sprintf("https://api.github.com/repos/%s/issues/%d/comments?per_page=%d&sort=created&direction=desc",
		awDetectionRunsRepo, awDetectionRunsIssueNumber, awMaxDetectionRuns)

	ctx, cancel := context.WithTimeout(ctx, awDetectionRunsTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Authorization", "token "+token)
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("User-Agent", "kubestellar-console")

	resp, err := client.GitHub.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch comments: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GitHub API returned status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, awMaxResponseBytes))
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	var comments []GitHubIssueComment
	if err := json.Unmarshal(body, &comments); err != nil {
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

	issueURL := fmt.Sprintf("https://github.com/%s/issues/%d", awDetectionRunsRepo, awDetectionRunsIssueNumber)

	return &DetectionRunsResponse{
		Runs:       runs,
		IssueURL:   issueURL,
		TotalCount: len(runs),
		Source:     "github",
		CachedAt:   time.Now(),
		IsDemoData: false,
	}, nil
}

// getDemoDetectionRuns returns demo data for detection runs.
func getDemoDetectionRuns() DetectionRunsResponse {
	now := time.Now()
	issueURL := fmt.Sprintf("https://github.com/%s/issues/%d", awDetectionRunsRepo, awDetectionRunsIssueNumber)

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
