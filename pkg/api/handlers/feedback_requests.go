package handlers

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/safego"
	"github.com/kubestellar/console/pkg/store"
	"golang.org/x/sync/singleflight"
)

const maxVerificationCommentChars = 1000

// FeedbackHandler handles feature requests and feedback
type FeedbackHandler struct {
	store         store.Store
	githubToken   string
	webhookSecret string
	repoOwner     string
	repoName      string
	httpClient    *http.Client // shared HTTP client for connection reuse
	// appTokenProvider is the kubestellar-console-bot GitHub App. When
	// configured, issues are created authenticated as the App so the
	// rewards classifier can distinguish console submissions from
	// github.com submissions (anti-gaming). Nil means App auth is not
	// configured and the handler falls back to the PAT in githubToken.
	appTokenProvider *GitHubAppTokenProvider
	// attributionProxyURL is the Netlify Function URL that acts as the
	// central App-attribution proxy. When set and a per-user client
	// credential is present, issue creation is proxied here first so
	// GitHub stamps `performed_via_github_app.slug`. Falls back to
	// direct App token or PAT when proxy is unavailable or unconfigured.
	attributionProxyURL string

	prCacheMu   sync.RWMutex
	prCache     []GitHubPR
	prCacheTime time.Time
	// #7057 — singleflight group coalesces concurrent cold-cache PR fetches.
	prFetchGroup singleflight.Group
}

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

func (h *FeedbackHandler) CreateFeatureRequest(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	if userID == uuid.Nil {
		return fiber.NewError(fiber.StatusUnauthorized, "User authentication required")
	}

	var input models.CreateFeatureRequestInput
	if err := c.BodyParser(&input); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid request body")
	}

	targetRepo, targetRepoName, err := h.validateFeatureRequest(&input)
	if err != nil {
		return err
	}

	user, err := h.store.GetUser(c.UserContext(), userID)
	if err != nil || user == nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to get user")
	}

	request, err := h.persistRequest(c.UserContext(), userID, &input, targetRepo)
	if err != nil {
		return err
	}

	clientAuth := c.Get("X-KC-Client-Auth")
	issueNumber, issueWarning, validScreenshots, ssResult, err := h.notifyUpstream(c.UserContext(), request, user, targetRepoName, &input, clientAuth)
	if err != nil {
		slog.Error("[Feedback] failed to create GitHub issue", "error", err)
		if cErr := h.store.CloseFeatureRequest(c.UserContext(), request.ID, false); cErr != nil {
			slog.Warn("[Feedback] failed to close orphaned feature request",
				"request_id", request.ID, "error", cErr)
		}
		if errors.Is(err, errGitHubUnauthorized) {
			return fiber.NewError(fiber.StatusUnauthorized, "FEEDBACK_GITHUB_TOKEN is invalid or expired. Refresh the PAT in your .env and restart the console.")
		}
		if errors.Is(err, errGitHubInsufficientPermissions) {
			return fiber.NewError(fiber.StatusForbidden, "GitHub could not create the issue because the current token does not have permission to open issues in this repository. Re-authenticate with GitHub OAuth and try again, or open the issue directly on GitHub.")
		}
		return fiber.NewError(fiber.StatusBadGateway, "Failed to create GitHub issue")
	}

	request.GitHubIssueNumber = &issueNumber
	request.Status = models.RequestStatusOpen
	if err := h.store.UpdateFeatureRequest(c.UserContext(), request); err != nil {
		slog.Error("[Feedback] failed to persist GitHub issue number",
			"request_id", request.ID, "issue", issueNumber, "error", err)
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to persist feature request state")
	}

	if len(validScreenshots) > 0 {
		asyncCtx, cancel := context.WithTimeout(context.Background(), asyncScreenshotUploadTimeout)
		safego.GoWith("feedback-screenshot-upload", func() {
			defer cancel()
			h.uploadScreenshotCommentsAsync(asyncCtx, issueNumber, h.repoOwner, targetRepoName, request.ID.String(), validScreenshots)
		})
	}

	notifTitle := "Request Submitted"
	actionURL := ""
	if request.GitHubIssueNumber != nil {
		notifTitle = fmt.Sprintf("Issue #%d Created", *request.GitHubIssueNumber)
		actionURL = fmt.Sprintf("https://github.com/%s/%s/issues/%d", h.repoOwner, targetRepoName, *request.GitHubIssueNumber)
	}
	notification := &models.Notification{
		UserID:           userID,
		FeatureRequestID: &request.ID,
		NotificationType: models.NotificationTypeIssueCreated,
		Title:            notifTitle,
		Message:          fmt.Sprintf("Your %s request '%s' has been submitted.", request.RequestType, request.Title),
		ActionURL:        actionURL,
	}
	if err := h.store.CreateNotification(c.UserContext(), notification); err != nil {
		slog.Warn("[Feedback] failed to create issue notification",
			"user", userID, "request_id", request.ID, "error", err)
	}

	type createResponse struct {
		*models.FeatureRequest
		ScreenshotsUploaded int    `json:"screenshots_uploaded"`
		ScreenshotsFailed   int    `json:"screenshots_failed"`
		Warning             string `json:"warning,omitempty"`
	}
	return c.Status(fiber.StatusCreated).JSON(createResponse{
		FeatureRequest:      request,
		ScreenshotsUploaded: ssResult.Uploaded,
		ScreenshotsFailed:   ssResult.Failed,
		Warning:             issueWarning,
	})
}

// validateFeatureRequest validates the input and returns the target repo details.
func (h *FeedbackHandler) validateFeatureRequest(input *models.CreateFeatureRequestInput) (models.TargetRepo, string, error) {
	if input.Title == "" || len(input.Title) < 10 {
		return "", "", fiber.NewError(fiber.StatusBadRequest, "Title must be at least 10 characters")
	}
	if input.Description == "" || len(input.Description) < 20 {
		return "", "", fiber.NewError(fiber.StatusBadRequest, "Description must be at least 20 characters")
	}
	if len(strings.Fields(input.Description)) < 3 {
		return "", "", fiber.NewError(fiber.StatusBadRequest, "Description must contain at least 3 words")
	}
	if input.RequestType != models.RequestTypeBug && input.RequestType != models.RequestTypeFeature {
		return "", "", fiber.NewError(fiber.StatusBadRequest, "Request type must be 'bug' or 'feature'")
	}
	if input.ParentIssueNumber != nil && *input.ParentIssueNumber < 1 {
		return "", "", fiber.NewError(fiber.StatusBadRequest, "Parent issue number must be a positive integer")
	}

	if h.getEffectiveToken() == "" || h.repoOwner == "" || h.repoName == "" {
		return "", "", fiber.NewError(fiber.StatusServiceUnavailable, "Issue submission is not available: FEEDBACK_GITHUB_TOKEN is not configured. "+
			"Add FEEDBACK_GITHUB_TOKEN=<your-pat> to your .env file. "+
			"Classic PAT: needs 'repo' scope. Fine-grained PAT: needs 'Issues' + 'Contents' read/write permissions.")
	}

	targetRepo := input.TargetRepo
	if targetRepo != models.TargetRepoConsole && targetRepo != models.TargetRepoDocs {
		targetRepo = models.TargetRepoConsole
	}

	targetRepoName := h.resolveRepoName(targetRepo)
	return targetRepo, targetRepoName, nil
}

// persistRequest creates the feature request in the database.
func (h *FeedbackHandler) persistRequest(ctx context.Context, userID uuid.UUID, input *models.CreateFeatureRequestInput, targetRepo models.TargetRepo) (*models.FeatureRequest, error) {
	request := &models.FeatureRequest{
		UserID:      userID,
		Title:       input.Title,
		Description: input.Description,
		RequestType: input.RequestType,
		TargetRepo:  targetRepo,
		Status:      models.RequestStatusOpen,
	}

	if err := h.store.CreateFeatureRequest(ctx, request); err != nil {
		return nil, fiber.NewError(fiber.StatusInternalServerError, "Failed to create feature request")
	}

	return request, nil
}

func (h *FeedbackHandler) GetIssueLinkCapabilities(c *fiber.Ctx) error {
	clientAuth := c.Get("X-KC-Client-Auth")
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

	// Ensure user owns this request
	if request.UserID != userID {
		return fiber.NewError(fiber.StatusForbidden, "Access denied")
	}

	return c.JSON(request)
}

// SubmitFeedback submits thumbs up/down feedback on a PR
func (h *FeedbackHandler) SubmitFeedback(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	if userID == uuid.Nil {
		return fiber.NewError(fiber.StatusUnauthorized, "User authentication required")
	}
	requestID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid request ID")
	}

	var input models.SubmitFeedbackInput
	if err := c.BodyParser(&input); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid request body")
	}

	// Validate feedback type
	if input.FeedbackType != models.FeedbackTypePositive && input.FeedbackType != models.FeedbackTypeNegative {
		return fiber.NewError(fiber.StatusBadRequest, "Feedback type must be 'positive' or 'negative'")
	}

	// Get the feature request
	request, err := h.store.GetFeatureRequest(c.UserContext(), requestID)
	if err != nil || request == nil {
		return fiber.NewError(fiber.StatusNotFound, "Feature request not found")
	}

	// Ensure user owns this request
	if request.UserID != userID {
		return fiber.NewError(fiber.StatusForbidden, "Access denied")
	}

	// Ensure there's a PR to provide feedback on
	if request.PRNumber == nil {
		return fiber.NewError(fiber.StatusBadRequest, "No PR available for feedback")
	}

	// Create feedback
	feedback := &models.PRFeedback{
		FeatureRequestID: requestID,
		UserID:           userID,
		FeedbackType:     input.FeedbackType,
		Comment:          input.Comment,
	}

	if err := h.store.CreatePRFeedback(c.UserContext(), feedback); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to submit feedback")
	}

	// Add comment to GitHub PR if configured
	if h.getEffectiveToken() != "" && request.PRNumber != nil {
		runAsyncGitHubOp("addPRComment", func(ctx context.Context) {
			h.addPRComment(ctx, request, feedback)
		})
	}

	return c.Status(fiber.StatusCreated).JSON(feedback)
}
