package feedback

import (
	"context"
	"fmt"
	"log/slog"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/models"
)

const maxVerificationCommentChars = 1000

func featureRequestIssueKey(targetRepo models.TargetRepo, issueNumber int) string {
	if targetRepo == "" {
		targetRepo = models.TargetRepoConsole
	}
	return fmt.Sprintf("%s:%d", targetRepo, issueNumber)
}

func parseGitHubRequestID(idParam string) (models.TargetRepo, int, bool) {
	if !strings.HasPrefix(idParam, "gh-") {
		return "", 0, false
	}
	parts := strings.Split(strings.TrimPrefix(idParam, "gh-"), "-")
	switch len(parts) {
	case 1:
		issueNum, err := strconv.Atoi(parts[0])
		if err != nil {
			return "", 0, false
		}
		return models.TargetRepoConsole, issueNum, true
	case 2:
		issueNum, err := strconv.Atoi(parts[1])
		if err != nil {
			return "", 0, false
		}
		targetRepo := models.TargetRepo(parts[0])
		if targetRepo != models.TargetRepoConsole && targetRepo != models.TargetRepoDocs {
			return "", 0, false
		}
		return targetRepo, issueNum, true
	default:
		return "", 0, false
	}
}

func verificationCommentBody(comment string) string {
	trimmedComment := strings.TrimSpace(comment)
	body := ""
	if trimmedComment == "" {
		body = "The reporter tested the merged fix and it is still broken."
	} else {
		body = fmt.Sprintf("The reporter tested the merged fix and it is still broken.\n\nStill failing:\n%s", trimmedComment)
	}
	return body + "\n\n*This comment was posted from the KubeStellar Console.*"
}

func (h *FeedbackHandler) findStoredFeatureRequestByIssue(ctx context.Context, userID uuid.UUID, targetRepo models.TargetRepo, issueNumber int) (*models.FeatureRequest, error) {
	request, err := h.store.GetFeatureRequestByIssueNumber(ctx, issueNumber)
	if err != nil || request == nil {
		return request, err
	}
	storedTargetRepo := request.TargetRepo
	if storedTargetRepo == "" {
		storedTargetRepo = models.TargetRepoConsole
	}
	if request.UserID != userID || storedTargetRepo != targetRepo {
		return nil, nil
	}
	return request, nil
}

// GitHubIssue represents an issue from GitHub API
type GitHubIssue struct {
	Number    int    `json:"number"`
	Title     string `json:"title"`
	Body      string `json:"body"`
	State     string `json:"state"`
	HTMLURL   string `json:"html_url"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
	User      struct {
		Login string `json:"login"`
		ID    int    `json:"id"`
	} `json:"user"`
	ClosedBy *struct {
		Login string `json:"login"`
	} `json:"closed_by"`
	Labels []struct {
		Name string `json:"name"`
	} `json:"labels"`
	// PullRequest is non-nil when the issue is actually a pull request.
	// GitHub's issues API returns PRs as issues with this field populated.
	PullRequest *struct {
		URL string `json:"url"`
	} `json:"pull_request"`
}

// QueueItem represents an issue in the queue for the frontend
type QueueItem struct {
	ID                string `json:"id"`
	UserID            string `json:"user_id"`
	GitHubLogin       string `json:"github_login"`
	Title             string `json:"title"`
	Description       string `json:"description"`
	RequestType       string `json:"request_type"`
	TargetRepo        string `json:"target_repo,omitempty"`
	GitHubIssueNumber int    `json:"github_issue_number"`
	GitHubIssueURL    string `json:"github_issue_url"`
	Status            string `json:"status"`
	PRNumber          int    `json:"pr_number,omitempty"`
	PRURL             string `json:"pr_url,omitempty"`
	PreviewURL        string `json:"netlify_preview_url,omitempty"`
	CopilotSessionURL string `json:"copilot_session_url,omitempty"`
	ClosedByUser      bool   `json:"closed_by_user,omitempty"`
	LatestComment     string `json:"latest_comment,omitempty"`
	CreatedAt         string `json:"created_at"`
	UpdatedAt         string `json:"updated_at,omitempty"`
}

// QueueItemCount — minimal shape returned by ListAllFeatureRequests when
// count_only=true. Only the navbar badge (and the closed-request set it
// filters against) consumes this path, so we serialize just id + status
// instead of every QueueItem field as empty strings.
//
// PR #6573 item E — a standalone struct is preferable to sprinkling
// ,omitempty on QueueItem because the full QueueItem shape is consumed
// by the queue UI which DOES want zero-value title/description rendered
// as "" (blurred placeholder for untriaged items), not omitted entirely.
type QueueItemCount struct {
	ID     string `json:"id"`
	Status string `json:"status"`
}

func (h *FeedbackHandler) GetIssueLinkCapabilities(c *fiber.Ctx) error {
	clientAuth := extractClientAuth(c)
	if clientAuth == "" {
		return c.JSON(fiber.Map{"can_link_parent": false})
	}

	targetRepo := models.TargetRepo(c.Query("target_repo"))
	if targetRepo != models.TargetRepoConsole && targetRepo != models.TargetRepoDocs {
		targetRepo = models.TargetRepoConsole
	}

	canLinkParent, err := h.canLinkParentIssue(c.UserContext(), h.repoOwner, h.resolveRepoName(targetRepo), clientAuth)
	if err != nil {
		slog.Warn("[Feedback] failed to determine issue link capabilities", "target_repo", targetRepo, "error", err)
		return c.JSON(fiber.Map{"can_link_parent": false})
	}

	return c.JSON(fiber.Map{"can_link_parent": canLinkParent})
}

// GetFeatureRequest returns a single feature request
func (h *FeedbackHandler) GetFeatureRequest(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	if userID == uuid.Nil {
		return fiber.NewError(fiber.StatusUnauthorized, "User authentication required")
	}
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid request ID")
	}

	request, err := h.store.GetFeatureRequest(c.UserContext(), id)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to get feature request")
	}
	if request == nil {
		return fiber.NewError(fiber.StatusNotFound, "Feature request not found")
	}

	if request.UserID != userID {
		return fiber.NewError(fiber.StatusForbidden, "Access denied")
	}

	return c.JSON(request)
}
