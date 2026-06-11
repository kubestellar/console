package feedback

import (
	"context"
	"log/slog"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/models"
)

// CloseRequest closes a feature request.
func (h *FeedbackHandler) CloseRequest(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	if userID == uuid.Nil {
		return fiber.NewError(fiber.StatusUnauthorized, "User authentication required")
	}

	var input models.CloseFeatureRequestInput
	if len(c.Body()) > 0 {
		if err := c.BodyParser(&input); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Invalid request body")
		}
	}

	clientAuth := extractClientAuth(c)
	idParam := c.Params("id")
	if targetRepo, issueNum, ok := parseGitHubRequestID(idParam); ok {
		repoName := h.resolveRepoName(targetRepo)
		currentLogin := middleware.GetGitHubLogin(c)
		if ownerErr := h.verifyGitHubIssueOwnership(c.UserContext(), issueNum, repoName, currentLogin); ownerErr != nil {
			return ownerErr
		}
		if h.getEffectiveToken() != "" {
			if closeErr := h.closeGitHubIssueForUser(c.UserContext(), issueNum, repoName, clientAuth); closeErr != nil {
				slog.Error("[Feedback] failed to close GitHub issue", "issue", issueNum, "repo", repoName, "error", closeErr)
				return fiber.NewError(fiber.StatusBadGateway, "Failed to close issue on GitHub")
			}
		}
		storedRequest, err := h.findStoredFeatureRequestByIssue(c.UserContext(), userID, targetRepo, issueNum)
		if err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Failed to load feature request")
		}
		if storedRequest != nil {
			if err := h.store.CloseFeatureRequest(c.UserContext(), storedRequest.ID, true); err != nil {
				return fiber.NewError(fiber.StatusInternalServerError, "Failed to close request")
			}
			updatedRequest, getErr := h.store.GetFeatureRequest(c.UserContext(), storedRequest.ID)
			if getErr == nil && updatedRequest != nil {
				return c.JSON(updatedRequest)
			}
		}
		return c.JSON(map[string]any{
			"id":                  idParam,
			"github_issue_number": issueNum,
			"status":              string(models.RequestStatusClosed),
			"closed_by_user":      true,
			"message":             "Issue closed",
		})
	}

	requestID, err := uuid.Parse(idParam)
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid request ID")
	}
	request, err := h.store.GetFeatureRequest(c.UserContext(), requestID)
	if err != nil || request == nil {
		return fiber.NewError(fiber.StatusNotFound, "Feature request not found")
	}
	if request.UserID != userID {
		return fiber.NewError(fiber.StatusForbidden, "Access denied")
	}

	if request.GitHubIssueNumber != nil && h.getEffectiveToken() != "" {
		if err := h.closeGitHubIssueForUser(c.UserContext(), *request.GitHubIssueNumber, h.resolveRepoName(request.TargetRepo), clientAuth); err != nil {
			return fiber.NewError(fiber.StatusBadGateway, "Failed to close issue on GitHub")
		}
	}
	if err := h.store.CloseFeatureRequest(c.UserContext(), requestID, true); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to close request")
	}
	if refreshed, err := h.store.GetFeatureRequest(c.UserContext(), requestID); err == nil && refreshed != nil {
		request = refreshed
	} else if err != nil {
		slog.Warn("[Feedback] failed to refresh request after close", "id", requestID, "error", err)
	} else {
		slog.Warn("[Feedback] refresh returned nil request after close", "id", requestID)
	}
	return c.JSON(request)
}

// ReopenRequest posts the reporter's follow-up comment and reopens the issue.
func (h *FeedbackHandler) ReopenRequest(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	if userID == uuid.Nil {
		return fiber.NewError(fiber.StatusUnauthorized, "User authentication required")
	}

	var input models.ReopenFeatureRequestInput
	if err := c.BodyParser(&input); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid request body")
	}
	input.Comment = strings.TrimSpace(input.Comment)
	if input.Comment == "" {
		return fiber.NewError(fiber.StatusBadRequest, "Comment is required")
	}
	if len(input.Comment) > maxVerificationCommentChars {
		return fiber.NewError(fiber.StatusBadRequest, "Comment is too long")
	}

	clientAuth := extractClientAuth(c)
	idParam := c.Params("id")
	if targetRepo, issueNum, ok := parseGitHubRequestID(idParam); ok {
		repoName := h.resolveRepoName(targetRepo)
		currentLogin := middleware.GetGitHubLogin(c)
		if ownerErr := h.verifyGitHubIssueOwnership(c.UserContext(), issueNum, repoName, currentLogin); ownerErr != nil {
			return ownerErr
		}
		commentBody := verificationCommentBody(input.Comment)
		if h.getEffectiveToken() != "" {
			if err := h.addIssueCommentForUser(c.UserContext(), issueNum, commentBody, repoName, clientAuth); err != nil {
				return fiber.NewError(fiber.StatusBadGateway, "Failed to add issue comment")
			}
			if err := h.updateGitHubIssueStateForUser(c.UserContext(), issueNum, repoName, "open", clientAuth); err != nil {
				return fiber.NewError(fiber.StatusBadGateway, "Failed to reopen issue on GitHub")
			}
			h.addIssueLabels(c.UserContext(), issueNum, repoName, []string{"ai-fix-requested", "needs-triage"})
		}
		storedRequest, err := h.findStoredFeatureRequestByIssue(c.UserContext(), userID, targetRepo, issueNum)
		if err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Failed to load feature request")
		}
		if storedRequest != nil {
			if err := h.store.UpdateFeatureRequestLatestComment(c.UserContext(), storedRequest.ID, input.Comment); err != nil {
				return fiber.NewError(fiber.StatusInternalServerError, "Failed to save verification comment")
			}
			if err := h.store.UpdateFeatureRequestStatus(c.UserContext(), storedRequest.ID, models.RequestStatusTriageAccepted); err != nil {
				return fiber.NewError(fiber.StatusInternalServerError, "Failed to reopen request")
			}
			updatedRequest, getErr := h.store.GetFeatureRequest(c.UserContext(), storedRequest.ID)
			if getErr == nil && updatedRequest != nil {
				return c.JSON(updatedRequest)
			}
		}
		return c.JSON(map[string]any{
			"id":                  idParam,
			"github_issue_number": issueNum,
			"status":              string(models.RequestStatusTriageAccepted),
			"latest_comment":      input.Comment,
			"message":             "Issue reopened",
		})
	}

	requestID, err := uuid.Parse(idParam)
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid request ID")
	}
	request, err := h.store.GetFeatureRequest(c.UserContext(), requestID)
	if err != nil || request == nil {
		return fiber.NewError(fiber.StatusNotFound, "Feature request not found")
	}
	if request.UserID != userID {
		return fiber.NewError(fiber.StatusForbidden, "Access denied")
	}

	commentBody := verificationCommentBody(input.Comment)
	if request.GitHubIssueNumber != nil && h.getEffectiveToken() != "" {
		if err := h.addIssueCommentForUser(c.UserContext(), *request.GitHubIssueNumber, commentBody, h.resolveRepoName(request.TargetRepo), clientAuth); err != nil {
			return fiber.NewError(fiber.StatusBadGateway, "Failed to add issue comment")
		}
		if err := h.updateGitHubIssueStateForUser(c.UserContext(), *request.GitHubIssueNumber, h.resolveRepoName(request.TargetRepo), "open", clientAuth); err != nil {
			return fiber.NewError(fiber.StatusBadGateway, "Failed to reopen issue on GitHub")
		}
		h.addIssueLabels(c.UserContext(), *request.GitHubIssueNumber, h.resolveRepoName(request.TargetRepo), []string{"ai-fix-requested", "needs-triage"})
	}
	if err := h.store.UpdateFeatureRequestLatestComment(c.UserContext(), requestID, input.Comment); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to save verification comment")
	}
	if err := h.store.UpdateFeatureRequestStatus(c.UserContext(), requestID, models.RequestStatusTriageAccepted); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to reopen request")
	}
	if refreshed, err := h.store.GetFeatureRequest(c.UserContext(), requestID); err == nil && refreshed != nil {
		request = refreshed
	} else if err != nil {
		slog.Warn("[Feedback] failed to refresh request after reopen", "id", requestID, "error", err)
	} else {
		slog.Warn("[Feedback] refresh returned nil request after reopen", "id", requestID)
	}
	return c.JSON(request)
}

// RequestUpdate requests an update on a feature request (pings the issue)
func (h *FeedbackHandler) RequestUpdate(c *fiber.Ctx) error {
	idParam := c.Params("id")

	if targetRepo, issueNum, ok := parseGitHubRequestID(idParam); ok {
		repoName := h.resolveRepoName(targetRepo)
		currentLogin := middleware.GetGitHubLogin(c)
		if ownerErr := h.verifyGitHubIssueOwnership(c.UserContext(), issueNum, repoName, currentLogin); ownerErr != nil {
			return ownerErr
		}
		if h.getEffectiveToken() != "" {
			runAsyncGitHubOp("addIssueComment", func(ctx context.Context) {
				h.addIssueComment(ctx, issueNum, "The user has requested an update on this issue.", repoName)
			})
		}
		return c.JSON(map[string]interface{}{
			"id":                  idParam,
			"github_issue_number": issueNum,
			"message":             "Update requested",
		})
	}

	userID := middleware.GetUserID(c)
	if userID == uuid.Nil {
		return fiber.NewError(fiber.StatusUnauthorized, "User authentication required")
	}
	requestID, err := uuid.Parse(idParam)
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid request ID")
	}
	request, err := h.store.GetFeatureRequest(c.UserContext(), requestID)
	if err != nil || request == nil {
		return fiber.NewError(fiber.StatusNotFound, "Feature request not found")
	}
	if request.UserID != userID {
		return fiber.NewError(fiber.StatusForbidden, "Access denied")
	}
	if h.getEffectiveToken() != "" && request.GitHubIssueNumber != nil {
		runAsyncGitHubOp("addIssueComment", func(ctx context.Context) {
			h.addIssueComment(ctx, *request.GitHubIssueNumber, "The user has requested an update on this issue.", h.resolveRepoName(request.TargetRepo))
		})
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

	if input.FeedbackType != models.FeedbackTypePositive && input.FeedbackType != models.FeedbackTypeNegative {
		return fiber.NewError(fiber.StatusBadRequest, "Feedback type must be 'positive' or 'negative'")
	}

	request, err := h.store.GetFeatureRequest(c.UserContext(), requestID)
	if err != nil || request == nil {
		return fiber.NewError(fiber.StatusNotFound, "Feature request not found")
	}

	if request.UserID != userID {
		return fiber.NewError(fiber.StatusForbidden, "Access denied")
	}

	if request.PRNumber == nil {
		return fiber.NewError(fiber.StatusBadRequest, "No PR available for feedback")
	}

	feedback := &models.PRFeedback{
		FeatureRequestID: requestID,
		UserID:           userID,
		FeedbackType:     input.FeedbackType,
		Comment:          input.Comment,
	}

	if err := h.store.CreatePRFeedback(c.UserContext(), feedback); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to submit feedback")
	}

	if h.getEffectiveToken() != "" && request.PRNumber != nil {
		runAsyncGitHubOp("addPRComment", func(ctx context.Context) {
			h.addPRComment(ctx, request, feedback)
		})
	}

	return c.Status(fiber.StatusCreated).JSON(feedback)
}
