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
	TargetRepo        TargetRepo    `json:"target_repo,omitempty"`
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

// TargetRepo identifies which GitHub repository an issue should be created in
type TargetRepo string

const (
	// TargetRepoConsole routes issues to kubestellar/console (default)
	TargetRepoConsole TargetRepo = "console"
	// TargetRepoDocs routes issues to kubestellar/docs (for documentation issues)
	TargetRepoDocs TargetRepo = "docs"
)

// ConsoleError represents a browser console error captured by the ring buffer.
type ConsoleError struct {
	Timestamp string `json:"timestamp"`
	Level     string `json:"level"`
	Message   string `json:"message"`
	Source    string `json:"source,omitempty"`
}

// DiagnosticInfo contains environment details collected from the agent and browser
// to help debug issues (e.g. CORS mismatches from old agent builds).
type DiagnosticInfo struct {
	AgentVersion            string `json:"agent_version,omitempty"`
	CommitSHA               string `json:"commit_sha,omitempty"`
	BuildTime               string `json:"build_time,omitempty"`
	GoVersion               string `json:"go_version,omitempty"`
	AgentOS                 string `json:"agent_os,omitempty"`
	AgentArch               string `json:"agent_arch,omitempty"`
	InstallMethod           string `json:"install_method,omitempty"`
	Clusters                int    `json:"clusters,omitempty"`
	AgentConnectionStatus   string `json:"agent_connection_status,omitempty"`
	AgentConnectionFailures int    `json:"agent_connection_failures,omitempty"`
	AgentLastError          string `json:"agent_last_error,omitempty"`
	BrowserUA               string `json:"browser_user_agent,omitempty"`
	BrowserPlatform         string `json:"browser_platform,omitempty"`
	BrowserLanguage         string `json:"browser_language,omitempty"`
	ScreenResolution        string `json:"screen_resolution,omitempty"`
	WindowSize              string `json:"window_size,omitempty"`
	PageURL                 string `json:"page_url,omitempty"`
}

// FailedApiCall represents a recent failed API call captured by the ring buffer.
type FailedApiCall struct {
	Timestamp string `json:"timestamp"`
	Status    string `json:"status"`
	Endpoint  string `json:"endpoint"`
	Detail    string `json:"detail,omitempty"`
}

// CreateFeatureRequestInput is the input for creating a feature request
type CreateFeatureRequestInput struct {
	Title       string      `json:"title" validate:"required,min=10,max=200"`
	Description string      `json:"description" validate:"required,min=20,max=5000"`
	RequestType RequestType `json:"request_type" validate:"required,oneof=bug feature"`
	TargetRepo  TargetRepo  `json:"target_repo,omitempty"`
	// Screenshots contains base64-encoded data URIs (e.g. "data:image/png;base64,...")
	// that will be uploaded to GitHub and embedded in the issue body.
	Screenshots []string `json:"screenshots,omitempty"`
	// ConsoleErrors contains recent browser console errors captured automatically.
	// Only populated for bug reports. Rendered as a collapsible section in the issue body.
	ConsoleErrors []ConsoleError `json:"console_errors,omitempty"`
	// FailedApiCalls contains recent 4xx/5xx API responses captured automatically.
	FailedApiCalls []FailedApiCall `json:"failed_api_calls,omitempty"`
	// Diagnostics contains agent and browser environment info for debugging.
	Diagnostics *DiagnosticInfo `json:"diagnostics,omitempty"`
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
