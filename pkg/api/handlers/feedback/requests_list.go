package feedback

import (
	"fmt"
	"log/slog"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/models"
	"golang.org/x/sync/errgroup"
)

// ListFeatureRequests returns the user's feature requests
// Only returns requests that have been triaged (to prevent abuse/profanity in UI)
func (h *FeedbackHandler) ListFeatureRequests(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	if userID == uuid.Nil {
		return fiber.NewError(fiber.StatusUnauthorized, "User authentication required")
	}

	limit, offset, err := parsePageParams(c)
	if err != nil {
		return err
	}

	requests, err := h.store.GetUserFeatureRequests(c.UserContext(), userID, limit, offset)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to list feature requests")
	}

	if requests == nil {
		requests = []models.FeatureRequest{}
	}

	triaged := make([]models.FeatureRequest, 0, len(requests))
	for _, r := range requests {
		if r.Status != models.RequestStatusOpen && r.Status != models.RequestStatusNeedsTriage {
			triaged = append(triaged, r)
		}
	}

	pendingReview, err := h.store.CountUserPendingFeatureRequests(c.UserContext(), userID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to count pending feature requests")
	}

	type listResponse struct {
		Items         []models.FeatureRequest `json:"items"`
		Total         int                     `json:"total"`
		PendingReview int                     `json:"pending_review"`
	}

	return c.JSON(listResponse{
		Items:         triaged,
		Total:         len(triaged) + pendingReview,
		PendingReview: pendingReview,
	})
}

// ListAllFeatureRequests returns all issues from GitHub as a queue
// For untriaged issues that don't belong to the current user, title and description are redacted
// Frontend will display these with blur effect
//
// PR #6518 item G — supports `?count_only=true` which returns a minimal
// payload of just {id, status} pairs for every queue item. The navbar
// FeatureRequestButton only needs closed-request IDs (to filter notifications
// for the badge count) and does not render titles/descriptions/bodies on
// mount, so requesting the full queue on every page load wastes bandwidth
// and CPU. The lean response still requires the GitHub round-trip (we need
// each issue's current status/labels) but avoids serializing bodies, titles,
// and user-blurring logic the client doesn't consume.
func (h *FeedbackHandler) ListAllFeatureRequests(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	if userID == uuid.Nil {
		return fiber.NewError(fiber.StatusUnauthorized, "User authentication required")
	}
	countOnly := c.Query("count_only") == "true"

	user, err := h.store.GetUser(c.UserContext(), userID)
	if err != nil {
		slog.Warn("[Feedback] failed to get user for queue", "user_id", userID, "error", err)
	}
	currentGitHubLogin := ""
	if user != nil {
		currentGitHubLogin = user.GitHubLogin
	}

	storedRequestsByIssue := map[string]models.FeatureRequest{}
	storedRequests, storedErr := h.store.GetUserFeatureRequests(c.UserContext(), userID, 0, 0)
	if storedErr != nil {
		slog.Warn("[Feedback] failed to load stored feature requests for queue merge", "error", storedErr)
	} else {
		for _, stored := range storedRequests {
			if stored.GitHubIssueNumber == nil {
				continue
			}
			storedRequestsByIssue[featureRequestIssueKey(stored.TargetRepo, *stored.GitHubIssueNumber)] = stored
		}
	}

	var consoleIssues, docsIssues []GitHubIssue
	g, ctx := errgroup.WithContext(c.UserContext())
	g.Go(func() error {
		var fetchErr error
		consoleIssues, fetchErr = h.fetchGitHubIssuesFromRepo(ctx, currentGitHubLogin, h.repoName)
		return fetchErr
	})
	g.Go(func() error {
		var fetchErr error
		docsIssues, fetchErr = h.fetchGitHubIssuesFromRepo(ctx, currentGitHubLogin, docsRepoName)
		if fetchErr != nil {
			slog.Warn("[Feedback] failed to fetch docs repo issues", "error", fetchErr)
			return nil
		}
		return nil
	})
	if err := g.Wait(); err != nil {
		slog.Error("[Feedback] failed to fetch GitHub issues from console repo", "error", err)
		return h.listLocalFeatureRequests(c, userID)
	}

	type taggedIssue struct {
		GitHubIssue
		TargetRepo string
	}
	taggedIssues := make([]taggedIssue, 0, len(consoleIssues)+len(docsIssues))
	for _, issue := range consoleIssues {
		taggedIssues = append(taggedIssues, taggedIssue{issue, "console"})
	}
	for _, issue := range docsIssues {
		taggedIssues = append(taggedIssues, taggedIssue{issue, "docs"})
	}

	linkedPRs := h.fetchLinkedPRs(c.UserContext(), consoleIssues)

	queueItems := make([]QueueItem, 0, len(taggedIssues))
	queueItemCounts := make([]QueueItemCount, 0, len(taggedIssues))
	for _, tagged := range taggedIssues {
		issue := tagged.GitHubIssue
		status := "needs_triage"
		requestType := "feature"
		for _, label := range issue.Labels {
			switch label.Name {
			case "triage/accepted":
				if status == "needs_triage" {
					status = "triage_accepted"
				}
			case "copilot/working", "feasibility-study", "ai-processing", "ai-awaiting-fix":
				status = "feasibility_study"
			case "ai-pr-active":
				status = "fix_in_progress"
			case "fix-ready", "copilot/fix-ready", "ai-pr-ready", "ai-pr-draft":
				status = "fix_ready"
			case "fix-complete", "ai-processing-complete":
				status = "fix_complete"
			case "unable-to-fix", "needs-human-review", "ai-needs-human":
				status = "unable_to_fix"
			case "bug", "kind/bug":
				requestType = "bug"
			case "enhancement", "feature":
				requestType = "feature"
			}
		}

		var prNumber int
		var prURL string
		if pr, ok := linkedPRs[issue.Number]; ok {
			prNumber = pr.Number
			prURL = pr.HTMLURL
			if pr.MergedAt != nil {
				status = "fix_complete"
			} else if pr.Draft {
				if status == "needs_triage" || status == "triage_accepted" {
					status = "feasibility_study"
				}
			} else if status == "needs_triage" || status == "triage_accepted" || status == "feasibility_study" {
				status = "fix_ready"
			}
		}

		if issue.State == "closed" && status != "fix_complete" {
			status = "closed"
		}

		isOwnedByUser := issue.User.Login == currentGitHubLogin
		isTriaged := status != "needs_triage"

		title := issue.Title
		description := issue.Body
		if !isTriaged && !isOwnedByUser {
			title = "[Pending Review]"
			description = "This request is pending maintainer review."
		}

		closedByUser := issue.State == "closed" && issue.ClosedBy != nil && issue.ClosedBy.Login == currentGitHubLogin
		queueID := fmt.Sprintf("gh-%s-%d", tagged.TargetRepo, issue.Number)
		if stored, ok := storedRequestsByIssue[featureRequestIssueKey(models.TargetRepo(tagged.TargetRepo), issue.Number)]; ok {
			queueID = stored.ID.String()
			if stored.ClosedByUser {
				closedByUser = true
				status = string(models.RequestStatusClosed)
			}
		}

		if countOnly {
			queueItemCounts = append(queueItemCounts, QueueItemCount{
				ID:     queueID,
				Status: status,
			})
			continue
		}

		latestComment := ""
		if stored, ok := storedRequestsByIssue[featureRequestIssueKey(models.TargetRepo(tagged.TargetRepo), issue.Number)]; ok {
			latestComment = stored.LatestComment
		}

		queueItems = append(queueItems, QueueItem{
			ID:                queueID,
			UserID:            fmt.Sprintf("gh-%d", issue.User.ID),
			GitHubLogin:       issue.User.Login,
			Title:             title,
			Description:       description,
			RequestType:       requestType,
			TargetRepo:        tagged.TargetRepo,
			GitHubIssueNumber: issue.Number,
			GitHubIssueURL:    issue.HTMLURL,
			Status:            status,
			PRNumber:          prNumber,
			PRURL:             prURL,
			ClosedByUser:      closedByUser,
			LatestComment:     latestComment,
			CreatedAt:         issue.CreatedAt,
			UpdatedAt:         issue.UpdatedAt,
		})
	}

	if countOnly {
		return c.JSON(queueItemCounts)
	}
	return c.JSON(queueItems)
}

// listLocalFeatureRequests falls back to local database when GitHub is unavailable.
//
// #9896: the happy path in ListAllFeatureRequests emits []QueueItem with fields
// like github_issue_url, github_login, and pr_number that the frontend Queue UI
// consumes. Previously this fallback returned raw []models.FeatureRequest which
// has different JSON field names and no URL/login fields — so when GitHub is
// unreachable the client silently received an incompatible shape and rendered
// broken rows. We now normalize to []QueueItem via featureRequestsToQueueItems
// so both paths emit the same contract.
func (h *FeedbackHandler) listLocalFeatureRequests(c *fiber.Ctx, userID uuid.UUID) error {
	limit, offset, err := parsePageParams(c)
	if err != nil {
		return err
	}
	requests, err := h.store.GetAllFeatureRequests(c.UserContext(), limit, offset)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to list feature requests")
	}

	if requests == nil {
		requests = []models.FeatureRequest{}
	}

	for i := range requests {
		r := &requests[i]
		isUntriaged := r.Status == models.RequestStatusOpen || r.Status == models.RequestStatusNeedsTriage
		isOwnedByUser := r.UserID == userID
		if isUntriaged && !isOwnedByUser {
			r.Title = "[Pending Review]"
			r.Description = "This request is pending maintainer review."
		}
	}

	return c.JSON(h.featureRequestsToQueueItems(requests))
}

// featureRequestsToQueueItems converts persisted models.FeatureRequest records
// into the QueueItem shape the frontend expects from ListAllFeatureRequests.
//
// #9896: called from the GitHub-down fallback path. Fields derivable from
// local data are populated (e.g. github_issue_url is reconstructed from the
// owner/repo/number); fields that aren't persisted locally (github_login,
// PR preview URL when absent, etc.) are left at zero value. QueueItem tags
// the optional fields with ,omitempty so empty strings/ints are dropped
// from the wire response.
func (h *FeedbackHandler) featureRequestsToQueueItems(requests []models.FeatureRequest) []QueueItem {
	items := make([]QueueItem, 0, len(requests))
	for _, r := range requests {
		repoName := h.resolveRepoName(r.TargetRepo)

		issueNumber := 0
		issueURL := ""
		if r.GitHubIssueNumber != nil {
			issueNumber = *r.GitHubIssueNumber
			if h.repoOwner != "" && repoName != "" {
				issueURL = fmt.Sprintf("https://github.com/%s/%s/issues/%d", h.repoOwner, repoName, issueNumber)
			}
		}

		prNumber := 0
		if r.PRNumber != nil {
			prNumber = *r.PRNumber
		}

		updatedAt := ""
		if r.UpdatedAt != nil {
			updatedAt = r.UpdatedAt.UTC().Format(time.RFC3339)
		}

		items = append(items, QueueItem{
			ID:                r.ID.String(),
			UserID:            r.UserID.String(),
			GitHubLogin:       "",
			Title:             r.Title,
			Description:       r.Description,
			RequestType:       string(r.RequestType),
			TargetRepo:        string(r.TargetRepo),
			GitHubIssueNumber: issueNumber,
			GitHubIssueURL:    issueURL,
			Status:            string(r.Status),
			PRNumber:          prNumber,
			PRURL:             r.PRURL,
			PreviewURL:        r.NetlifyPreviewURL,
			CopilotSessionURL: r.CopilotSessionURL,
			ClosedByUser:      r.ClosedByUser,
			LatestComment:     r.LatestComment,
			CreatedAt:         r.CreatedAt.UTC().Format(time.RFC3339),
			UpdatedAt:         updatedAt,
		})
	}
	return items
}
