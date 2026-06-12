package feedback

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/safego"
)

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

	clientAuth := extractClientAuth(c)
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
