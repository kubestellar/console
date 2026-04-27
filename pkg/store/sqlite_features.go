package store

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
)

// Feature Request methods

func (s *SQLiteStore) CreateFeatureRequest(ctx context.Context, request *models.FeatureRequest) error {
	if request.ID == uuid.Nil {
		request.ID = uuid.New()
	}
	request.CreatedAt = time.Now()
	if request.Status == "" {
		request.Status = models.RequestStatusOpen
	}

	_, err := s.db.ExecContext(ctx, `INSERT INTO feature_requests (id, user_id, title, description, request_type, github_issue_number, status, pr_number, pr_url, copilot_session_url, netlify_preview_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		request.ID.String(), request.UserID.String(), request.Title, request.Description, string(request.RequestType),
		request.GitHubIssueNumber, string(request.Status),
		request.PRNumber, nullString(request.PRURL), nullString(request.CopilotSessionURL), nullString(request.NetlifyPreviewURL), request.CreatedAt)
	return err
}

func (s *SQLiteStore) GetFeatureRequest(ctx context.Context, id uuid.UUID) (*models.FeatureRequest, error) {
	row := s.db.QueryRowContext(ctx, `SELECT id, user_id, title, description, request_type, github_issue_number, status, pr_number, pr_url, copilot_session_url, netlify_preview_url, closed_by_user, latest_comment, created_at, updated_at FROM feature_requests WHERE id = ?`, id.String())
	return s.scanFeatureRequest(row)
}

func (s *SQLiteStore) GetFeatureRequestByIssueNumber(ctx context.Context, issueNumber int) (*models.FeatureRequest, error) {
	row := s.db.QueryRowContext(ctx, `SELECT id, user_id, title, description, request_type, github_issue_number, status, pr_number, pr_url, copilot_session_url, netlify_preview_url, closed_by_user, latest_comment, created_at, updated_at FROM feature_requests WHERE github_issue_number = ?`, issueNumber)
	return s.scanFeatureRequest(row)
}

func (s *SQLiteStore) GetFeatureRequestByPRNumber(ctx context.Context, prNumber int) (*models.FeatureRequest, error) {
	row := s.db.QueryRowContext(ctx, `SELECT id, user_id, title, description, request_type, github_issue_number, status, pr_number, pr_url, copilot_session_url, netlify_preview_url, closed_by_user, latest_comment, created_at, updated_at FROM feature_requests WHERE pr_number = ?`, prNumber)
	return s.scanFeatureRequest(row)
}

// GetUserFeatureRequests returns a page of a user's feature requests,
// newest first.
// #6601: LIMIT/OFFSET prevent unbounded per-user reads.
// #6621: id DESC tie-breaker ensures OFFSET paging is stable when rows share
// created_at (e.g. seeded data, bulk imports).
func (s *SQLiteStore) GetUserFeatureRequests(ctx context.Context, userID uuid.UUID, limit, offset int) ([]models.FeatureRequest, error) {
	lim := resolvePageLimit(limit, defaultPageLimit)
	off := resolvePageOffset(offset)
	rows, err := s.db.QueryContext(ctx, `SELECT id, user_id, title, description, request_type, github_issue_number, status, pr_number, pr_url, copilot_session_url, netlify_preview_url, closed_by_user, latest_comment, created_at, updated_at FROM feature_requests WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`, userID.String(), lim, off)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var requests []models.FeatureRequest
	for rows.Next() {
		r, err := s.scanFeatureRequestRow(ctx, rows)
		if err != nil {
			return nil, err
		}
		requests = append(requests, *r)
	}
	return requests, rows.Err()
}

// CountUserPendingFeatureRequests returns how many of the user's submissions
// are still untriaged (open or needs_triage). #10174
func (s *SQLiteStore) CountUserPendingFeatureRequests(ctx context.Context, userID uuid.UUID) (int, error) {
	var count int
	err := s.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM feature_requests WHERE user_id = ? AND status IN (?, ?)`,
		userID.String(), string(models.RequestStatusOpen), string(models.RequestStatusNeedsTriage),
	).Scan(&count)
	return count, err
}

// GetAllFeatureRequests returns a single page of feature_requests, newest
// first. Callers that need to walk the full table must page by passing
// successive offsets; this function never returns more than `limit` rows
// (clamped to maxSQLLimit) and applies the admin default when limit <= 0.
// #6602: LIMIT/OFFSET required. The admin dashboard hits this on every load,
// so the default page size (defaultAdminPageLimit) is intentionally smaller
// than the generic defaultPageLimit.
// #6621: id DESC tie-breaker ensures OFFSET paging is stable when rows share
// created_at (e.g. seeded data, bulk imports).
func (s *SQLiteStore) GetAllFeatureRequests(ctx context.Context, limit, offset int) ([]models.FeatureRequest, error) {
	lim := resolvePageLimit(limit, defaultAdminPageLimit)
	off := resolvePageOffset(offset)
	rows, err := s.db.QueryContext(ctx, `SELECT id, user_id, title, description, request_type, github_issue_number, status, pr_number, pr_url, copilot_session_url, netlify_preview_url, closed_by_user, latest_comment, created_at, updated_at FROM feature_requests ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`, lim, off)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var requests []models.FeatureRequest
	for rows.Next() {
		r, err := s.scanFeatureRequestRow(ctx, rows)
		if err != nil {
			return nil, err
		}
		requests = append(requests, *r)
	}
	return requests, rows.Err()
}

func (s *SQLiteStore) scanFeatureRequest(row *sql.Row) (*models.FeatureRequest, error) {
	var r models.FeatureRequest
	var idStr, userIDStr string
	var requestType, status string
	var issueNumber, prNumber sql.NullInt64
	var prURL, copilotSessionURL, previewURL, latestComment sql.NullString
	var closedByUser sql.NullInt64
	var updatedAt sql.NullTime

	err := row.Scan(&idStr, &userIDStr, &r.Title, &r.Description, &requestType, &issueNumber, &status, &prNumber, &prURL, &copilotSessionURL, &previewURL, &closedByUser, &latestComment, &r.CreatedAt, &updatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	r.ID = parseUUID(idStr, "r.ID")
	r.UserID = parseUUID(userIDStr, "r.UserID")
	r.RequestType = models.RequestType(requestType)
	r.Status = models.RequestStatus(status)
	if issueNumber.Valid {
		num := int(issueNumber.Int64)
		r.GitHubIssueNumber = &num
	}
	if prNumber.Valid {
		num := int(prNumber.Int64)
		r.PRNumber = &num
	}
	if prURL.Valid {
		r.PRURL = prURL.String
	}
	if copilotSessionURL.Valid {
		r.CopilotSessionURL = copilotSessionURL.String
	}
	if previewURL.Valid {
		r.NetlifyPreviewURL = previewURL.String
	}
	if closedByUser.Valid {
		r.ClosedByUser = closedByUser.Int64 == 1
	}
	if latestComment.Valid {
		r.LatestComment = latestComment.String
	}
	if updatedAt.Valid {
		r.UpdatedAt = &updatedAt.Time
	}
	return &r, nil
}

func (s *SQLiteStore) scanFeatureRequestRow(ctx context.Context, rows *sql.Rows) (*models.FeatureRequest, error) {
	var r models.FeatureRequest
	var idStr, userIDStr string
	var requestType, status string
	var issueNumber, prNumber sql.NullInt64
	var prURL, copilotSessionURL, previewURL, latestComment sql.NullString
	var closedByUser sql.NullInt64
	var updatedAt sql.NullTime

	err := rows.Scan(&idStr, &userIDStr, &r.Title, &r.Description, &requestType, &issueNumber, &status, &prNumber, &prURL, &copilotSessionURL, &previewURL, &closedByUser, &latestComment, &r.CreatedAt, &updatedAt)
	if err != nil {
		return nil, err
	}

	r.ID = parseUUID(idStr, "r.ID")
	r.UserID = parseUUID(userIDStr, "r.UserID")
	r.RequestType = models.RequestType(requestType)
	r.Status = models.RequestStatus(status)
	if issueNumber.Valid {
		num := int(issueNumber.Int64)
		r.GitHubIssueNumber = &num
	}
	if prNumber.Valid {
		num := int(prNumber.Int64)
		r.PRNumber = &num
	}
	if prURL.Valid {
		r.PRURL = prURL.String
	}
	if copilotSessionURL.Valid {
		r.CopilotSessionURL = copilotSessionURL.String
	}
	if previewURL.Valid {
		r.NetlifyPreviewURL = previewURL.String
	}
	if closedByUser.Valid {
		r.ClosedByUser = closedByUser.Int64 == 1
	}
	if latestComment.Valid {
		r.LatestComment = latestComment.String
	}
	if updatedAt.Valid {
		r.UpdatedAt = &updatedAt.Time
	}
	return &r, nil
}

func (s *SQLiteStore) UpdateFeatureRequest(ctx context.Context, request *models.FeatureRequest) error {
	now := time.Now()
	request.UpdatedAt = &now

	_, err := s.db.ExecContext(ctx, `UPDATE feature_requests SET title = ?, description = ?, request_type = ?, github_issue_number = ?, status = ?, pr_number = ?, pr_url = ?, copilot_session_url = ?, netlify_preview_url = ?, updated_at = ? WHERE id = ?`,
		request.Title, request.Description, string(request.RequestType),
		request.GitHubIssueNumber, string(request.Status),
		request.PRNumber, nullString(request.PRURL), nullString(request.CopilotSessionURL), nullString(request.NetlifyPreviewURL),
		request.UpdatedAt, request.ID.String())
	return err
}

func (s *SQLiteStore) UpdateFeatureRequestStatus(ctx context.Context, id uuid.UUID, status models.RequestStatus) error {
	now := time.Now()
	_, err := s.db.ExecContext(ctx, `UPDATE feature_requests SET status = ?, updated_at = ? WHERE id = ?`, string(status), now, id.String())
	return err
}

func (s *SQLiteStore) CloseFeatureRequest(ctx context.Context, id uuid.UUID, closedByUser bool) error {
	now := time.Now()
	closedByUserInt := 0
	if closedByUser {
		closedByUserInt = 1
	}
	_, err := s.db.ExecContext(ctx, `UPDATE feature_requests SET status = ?, closed_by_user = ?, updated_at = ? WHERE id = ?`,
		string(models.RequestStatusClosed), closedByUserInt, now, id.String())
	return err
}

func (s *SQLiteStore) UpdateFeatureRequestPR(ctx context.Context, id uuid.UUID, prNumber int, prURL string) error {
	now := time.Now()
	_, err := s.db.ExecContext(ctx, `UPDATE feature_requests SET pr_number = ?, pr_url = ?, status = ?, updated_at = ? WHERE id = ?`,
		prNumber, prURL, string(models.RequestStatusFixReady), now, id.String())
	return err
}

func (s *SQLiteStore) UpdateFeatureRequestPreview(ctx context.Context, id uuid.UUID, previewURL string) error {
	now := time.Now()
	_, err := s.db.ExecContext(ctx, `UPDATE feature_requests SET netlify_preview_url = ?, updated_at = ? WHERE id = ?`,
		previewURL, now, id.String())
	return err
}

func (s *SQLiteStore) UpdateFeatureRequestLatestComment(ctx context.Context, id uuid.UUID, comment string) error {
	now := time.Now()
	_, err := s.db.ExecContext(ctx, `UPDATE feature_requests SET latest_comment = ?, updated_at = ? WHERE id = ?`,
		comment, now, id.String())
	return err
}

// PR Feedback methods

func (s *SQLiteStore) CreatePRFeedback(ctx context.Context, feedback *models.PRFeedback) error {
	if feedback.ID == uuid.Nil {
		feedback.ID = uuid.New()
	}
	feedback.CreatedAt = time.Now()

	_, err := s.db.ExecContext(ctx, `INSERT INTO pr_feedback (id, feature_request_id, user_id, feedback_type, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
		feedback.ID.String(), feedback.FeatureRequestID.String(), feedback.UserID.String(),
		string(feedback.FeedbackType), nullString(feedback.Comment), feedback.CreatedAt)
	return err
}

// prFeedbackMaxRows caps how many rows GetPRFeedback will return in a single
// call. PR feedback is usually a handful of entries per feature request, so
// 500 is generous; the cap is defense-in-depth against an unbounded scan if
// a bug ever let one feature_request_id accumulate thousands of rows (#6603).
const prFeedbackMaxRows = 500

func (s *SQLiteStore) GetPRFeedback(ctx context.Context, featureRequestID uuid.UUID) ([]models.PRFeedback, error) {
	// #6603: bound the result set — the previous query had no LIMIT, so a
	// single feature request could return an arbitrarily large slice and
	// starve the caller's memory. No handler has ever passed offset/limit
	// so we cap internally at prFeedbackMaxRows; if future callers need
	// pagination they should add an explicit limit/offset signature.
	rows, err := s.db.QueryContext(ctx, `SELECT id, feature_request_id, user_id, feedback_type, comment, created_at FROM pr_feedback WHERE feature_request_id = ? ORDER BY created_at DESC LIMIT ?`, featureRequestID.String(), prFeedbackMaxRows)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var feedbacks []models.PRFeedback
	for rows.Next() {
		var f models.PRFeedback
		var idStr, requestIDStr, userIDStr string
		var feedbackType string
		var comment sql.NullString

		if err := rows.Scan(&idStr, &requestIDStr, &userIDStr, &feedbackType, &comment, &f.CreatedAt); err != nil {
			return nil, err
		}

		f.ID = parseUUID(idStr, "f.ID")
		f.FeatureRequestID = parseUUID(requestIDStr, "f.FeatureRequestID")
		f.UserID = parseUUID(userIDStr, "f.UserID")
		f.FeedbackType = models.FeedbackType(feedbackType)
		if comment.Valid {
			f.Comment = comment.String
		}
		feedbacks = append(feedbacks, f)
	}
	return feedbacks, rows.Err()
}

// Notification methods

func (s *SQLiteStore) CreateNotification(ctx context.Context, notification *models.Notification) error {
	if notification.ID == uuid.Nil {
		notification.ID = uuid.New()
	}
	notification.CreatedAt = time.Now()

	var featureRequestID *string
	if notification.FeatureRequestID != nil {
		str := notification.FeatureRequestID.String()
		featureRequestID = &str
	}

	_, err := s.db.ExecContext(ctx, `INSERT INTO notifications (id, user_id, feature_request_id, notification_type, title, message, read, action_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		notification.ID.String(), notification.UserID.String(), featureRequestID,
		string(notification.NotificationType), notification.Title, notification.Message,
		boolToInt(notification.Read), notification.ActionURL, notification.CreatedAt)
	return err
}

func (s *SQLiteStore) GetUserNotifications(ctx context.Context, userID uuid.UUID, limit int) ([]models.Notification, error) {
	// #6286: clamp the limit to safe bounds before passing to SQL.
	// SQLite treats negative LIMIT as "no limit", which would let a
	// caller bypass resource controls and return arbitrarily large
	// result sets. Match the card_history query's hardening.
	limit = clampLimit(limit)
	rows, err := s.db.QueryContext(ctx, `SELECT id, user_id, feature_request_id, notification_type, title, message, read, action_url, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`, userID.String(), limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var notifications []models.Notification
	for rows.Next() {
		var n models.Notification
		var idStr, userIDStr string
		var featureRequestID sql.NullString
		var notificationType string
		var read int

		if err := rows.Scan(&idStr, &userIDStr, &featureRequestID, &notificationType, &n.Title, &n.Message, &read, &n.ActionURL, &n.CreatedAt); err != nil {
			return nil, err
		}

		n.ID = parseUUID(idStr, "n.ID")
		n.UserID = parseUUID(userIDStr, "n.UserID")
		n.NotificationType = models.NotificationType(notificationType)
		n.Read = read == 1
		if featureRequestID.Valid {
			id := parseUUID(featureRequestID.String, "id")
			n.FeatureRequestID = &id
		}
		notifications = append(notifications, n)
	}
	return notifications, rows.Err()
}

func (s *SQLiteStore) GetUnreadNotificationCount(ctx context.Context, userID uuid.UUID) (int, error) {
	var count int
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM notifications WHERE user_id = ? AND read = 0`, userID.String()).Scan(&count)
	return count, err
}

// MarkNotificationRead is intentionally removed from the public Store
// interface. #6611: the unscoped "UPDATE notifications SET read = 1 WHERE
// id = ?" let any authenticated user mark any other user's notification as
// read, which is a privilege-escalation class bug. All callers now go
// through MarkNotificationReadByUser, which ownership-checks the row in
// the same UPDATE. The method is kept here as a private helper only for
// back-compat with existing admin/background code paths that have already
// resolved ownership; regular handlers MUST use MarkNotificationReadByUser.
func (s *SQLiteStore) MarkNotificationRead(ctx context.Context, id uuid.UUID) error {
	_, err := s.db.ExecContext(ctx, `UPDATE notifications SET read = 1 WHERE id = ?`, id.String())
	return err
}

// MarkNotificationReadByUser marks a single notification as read, but only if it
// belongs to the given user. Returns an error wrapping "not found" when the
// notification does not exist or is not owned by the caller.
func (s *SQLiteStore) MarkNotificationReadByUser(ctx context.Context, id uuid.UUID, userID uuid.UUID) error {
	res, err := s.db.ExecContext(ctx, `UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?`, id.String(), userID.String())
	if err != nil {
		return err
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return fmt.Errorf("notification not found or not owned by user")
	}
	return nil
}

func (s *SQLiteStore) MarkAllNotificationsRead(ctx context.Context, userID uuid.UUID) error {
	_, err := s.db.ExecContext(ctx, `UPDATE notifications SET read = 1 WHERE user_id = ?`, userID.String())
	return err
}
