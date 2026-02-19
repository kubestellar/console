package models

import (
	"time"

	"github.com/google/uuid"
)

// RequestType represents the type of feature request
type RequestType string

const (
	RequestTypeBug     RequestType = "bug"
	RequestTypeFeature RequestType = "feature"
)

// RequestStatus represents the status of a feature request
type RequestStatus string

const (
	RequestStatusOpen             RequestStatus = "open"
	RequestStatusNeedsTriage      RequestStatus = "needs_triage"
	RequestStatusTriageAccepted   RequestStatus = "triage_accepted"
	RequestStatusFeasibilityStudy RequestStatus = "feasibility_study"
	RequestStatusAIStuck          RequestStatus = "ai_stuck"
	RequestStatusFixReady         RequestStatus = "fix_ready"
	RequestStatusFixComplete      RequestStatus = "fix_complete"
	RequestStatusUnableToFix      RequestStatus = "unable_to_fix"
	RequestStatusClosed           RequestStatus = "closed"
)

// FeedbackType represents the type of feedback on a PR
type FeedbackType string

const (
	FeedbackTypePositive FeedbackType = "positive"
	FeedbackTypeNegative FeedbackType = "negative"
)

// NotificationType represents the type of notification
type NotificationType string

const (
	NotificationTypeIssueCreated      NotificationType = "issue_created"
	NotificationTypeTriageAccepted    NotificationType = "triage_accepted"
	NotificationTypeFeasibilityStudy  NotificationType = "feasibility_study"
	NotificationTypeAIStuck           NotificationType = "ai_stuck"
	NotificationTypeFixReady          NotificationType = "fix_ready"
	NotificationTypePreviewReady      NotificationType = "preview_ready"
	NotificationTypeFixComplete       NotificationType = "fix_complete"
	NotificationTypeUnableToFix       NotificationType = "unable_to_fix"
	NotificationTypeClosed            NotificationType = "closed"
	NotificationTypeFeedbackReceived  NotificationType = "feedback_received"
)

// FeatureRequest represents a bug or feature request submitted by a user
type FeatureRequest struct {
	ID                uuid.UUID     `json:"id"`
	UserID            uuid.UUID     `json:"user_id"`
	Title             string        `json:"title"`
	Description       string        `json:"description"`
	RequestType       RequestType   `json:"request_type"`
	GitHubIssueNumber *int          `json:"github_issue_number,omitempty"`
	Status            RequestStatus `json:"status"`
	PRNumber          *int          `json:"pr_number,omitempty"`
	PRURL             string        `json:"pr_url,omitempty"`
	CopilotSessionURL string        `json:"copilot_session_url,omitempty"`
	NetlifyPreviewURL string        `json:"netlify_preview_url,omitempty"`
	LatestComment     string        `json:"latest_comment,omitempty"`
	ClosedByUser      bool          `json:"closed_by_user"`
	CreatedAt         time.Time     `json:"created_at"`
	UpdatedAt         *time.Time    `json:"updated_at,omitempty"`
}

// PRFeedback represents user feedback on an AI-generated PR
type PRFeedback struct {
	ID               uuid.UUID    `json:"id"`
	FeatureRequestID uuid.UUID    `json:"feature_request_id"`
	UserID           uuid.UUID    `json:"user_id"`
	FeedbackType     FeedbackType `json:"feedback_type"`
	Comment          string       `json:"comment,omitempty"`
	CreatedAt        time.Time    `json:"created_at"`
}

// Notification represents a notification for a user
type Notification struct {
	ID               uuid.UUID        `json:"id"`
	UserID           uuid.UUID        `json:"user_id"`
	FeatureRequestID *uuid.UUID       `json:"feature_request_id,omitempty"`
	NotificationType NotificationType `json:"notification_type"`
	Title            string           `json:"title"`
	Message          string           `json:"message"`
	Read             bool             `json:"read"`
	ActionURL        string           `json:"action_url,omitempty"`
	CreatedAt        time.Time        `json:"created_at"`
}

// CreateFeatureRequestInput is the input for creating a feature request
type CreateFeatureRequestInput struct {
	Title       string      `json:"title" validate:"required,min=5,max=200"`
	Description string      `json:"description" validate:"required,min=10,max=5000"`
	RequestType RequestType `json:"request_type" validate:"required,oneof=bug feature"`
}

// SubmitFeedbackInput is the input for submitting PR feedback
type SubmitFeedbackInput struct {
	FeedbackType FeedbackType `json:"feedback_type" validate:"required,oneof=positive negative"`
	Comment      string       `json:"comment,omitempty" validate:"max=1000"`
}

// WebhookPayload represents the payload from GitHub webhooks for status updates
type WebhookPayload struct {
	Action           string `json:"action"`
	IssueNumber      int    `json:"issue_number,omitempty"`
	PRNumber         int    `json:"pr_number,omitempty"`
	PRURL            string `json:"pr_url,omitempty"`
	PreviewURL       string `json:"preview_url,omitempty"`
	Status           string `json:"status,omitempty"`
	FeatureRequestID string `json:"feature_request_id,omitempty"`
}
