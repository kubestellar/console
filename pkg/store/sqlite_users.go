package store

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
)

// User methods

func (s *SQLiteStore) GetUser(ctx context.Context, id uuid.UUID) (*models.User, error) {
	row := s.db.QueryRowContext(ctx, `SELECT id, github_id, github_login, email, slack_id, avatar_url, role, onboarded, created_at, last_login FROM users WHERE id = ?`, id.String())
	return s.scanUser(row)
}

func (s *SQLiteStore) GetUserByGitHubID(ctx context.Context, githubID string) (*models.User, error) {
	row := s.db.QueryRowContext(ctx, `SELECT id, github_id, github_login, email, slack_id, avatar_url, role, onboarded, created_at, last_login FROM users WHERE github_id = ?`, githubID)
	return s.scanUser(row)
}

func (s *SQLiteStore) GetUserByGitHubLogin(ctx context.Context, login string) (*models.User, error) {
	row := s.db.QueryRowContext(ctx, `SELECT id, github_id, github_login, email, slack_id, avatar_url, role, onboarded, created_at, last_login FROM users WHERE github_login = ? COLLATE NOCASE`, login)
	return s.scanUser(row)
}

func (s *SQLiteStore) scanUser(row *sql.Row) (*models.User, error) {
	var u models.User
	var idStr string
	var onboarded int
	var email, slackID, avatar, role sql.NullString
	var lastLogin sql.NullTime

	err := row.Scan(&idStr, &u.GitHubID, &u.GitHubLogin, &email, &slackID, &avatar, &role, &onboarded, &u.CreatedAt, &lastLogin)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	u.ID = parseUUID(idStr, "user.ID")
	u.Onboarded = onboarded == 1
	if email.Valid {
		u.Email = email.String
	}
	if slackID.Valid {
		u.SlackID = slackID.String
	}
	if avatar.Valid {
		u.AvatarURL = avatar.String
	}
	if role.Valid {
		u.Role = models.UserRole(role.String)
	} else {
		u.Role = models.UserRoleViewer // default role
	}
	if lastLogin.Valid {
		u.LastLogin = &lastLogin.Time
	}
	return &u, nil
}

func (s *SQLiteStore) CreateUser(ctx context.Context, user *models.User) error {
	if user.ID == uuid.Nil {
		user.ID = uuid.New()
	}
	user.CreatedAt = time.Now()
	if user.Role == "" {
		user.Role = models.UserRoleViewer // default role
	}

	_, err := s.db.ExecContext(ctx, `INSERT INTO users (id, github_id, github_login, email, slack_id, avatar_url, role, onboarded, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		user.ID.String(), user.GitHubID, user.GitHubLogin, nullString(user.Email), nullString(user.SlackID), nullString(user.AvatarURL), user.Role, boolToInt(user.Onboarded), user.CreatedAt)
	return err
}

func (s *SQLiteStore) UpdateUser(ctx context.Context, user *models.User) error {
	_, err := s.db.ExecContext(ctx, `UPDATE users SET github_login = ?, email = ?, slack_id = ?, avatar_url = ?, role = ?, onboarded = ? WHERE id = ?`,
		user.GitHubLogin, nullString(user.Email), nullString(user.SlackID), nullString(user.AvatarURL), user.Role, boolToInt(user.Onboarded), user.ID.String())
	return err
}

func (s *SQLiteStore) UpdateLastLogin(ctx context.Context, userID uuid.UUID) error {
	_, err := s.db.ExecContext(ctx, `UPDATE users SET last_login = ? WHERE id = ?`, time.Now(), userID.String())
	return err
}

// ListUsers returns a page of users ordered newest first.
// #6595: limit/offset are required to prevent an unbounded full-table scan.
// Pass 0 for limit to use the store default (defaultPageLimit). The secondary
// ORDER BY id DESC is a stable tie-breaker for rows with identical created_at
// timestamps so pagination is deterministic across calls.
func (s *SQLiteStore) ListUsers(ctx context.Context, limit, offset int) ([]models.User, error) {
	lim := resolvePageLimit(limit, defaultPageLimit)
	off := resolvePageOffset(offset)
	rows, err := s.db.QueryContext(ctx, `SELECT id, github_id, github_login, email, slack_id, avatar_url, role, onboarded, created_at, last_login FROM users ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`, lim, off)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []models.User
	for rows.Next() {
		var u models.User
		var idStr string
		var onboarded int
		var email, slackID, avatar, role sql.NullString
		var lastLogin sql.NullTime

		if err := rows.Scan(&idStr, &u.GitHubID, &u.GitHubLogin, &email, &slackID, &avatar, &role, &onboarded, &u.CreatedAt, &lastLogin); err != nil {
			return nil, err
		}

		u.ID = parseUUID(idStr, "u.ID")
		u.Onboarded = onboarded == 1
		if email.Valid {
			u.Email = email.String
		}
		if slackID.Valid {
			u.SlackID = slackID.String
		}
		if avatar.Valid {
			u.AvatarURL = avatar.String
		}
		if role.Valid {
			u.Role = models.UserRole(role.String)
		} else {
			u.Role = models.UserRoleViewer
		}
		if lastLogin.Valid {
			u.LastLogin = &lastLogin.Time
		}
		users = append(users, u)
	}
	return users, rows.Err()
}

// DeleteUser removes a user by ID
func (s *SQLiteStore) DeleteUser(ctx context.Context, id uuid.UUID) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM users WHERE id = ?`, id.String())
	return err
}

// validUserRoles is the set of allowed role values for user accounts.
var validUserRoles = map[string]bool{
	"admin":  true,
	"editor": true,
	"viewer": true,
}

// UpdateUserRole updates only the user's role after validating it against
// the allowed set (admin, editor, viewer).
func (s *SQLiteStore) UpdateUserRole(ctx context.Context, userID uuid.UUID, role string) error {
	if !validUserRoles[role] {
		return fmt.Errorf("invalid role %q: must be one of admin, editor, viewer", role)
	}
	_, err := s.db.ExecContext(ctx, `UPDATE users SET role = ? WHERE id = ?`, role, userID.String())
	return err
}

// CountUsersByRole returns the count of users by role.
//
// #6607: previously the default switch branch lumped every unrecognized role
// (including empty strings from pre-migration rows, or any typo in the DB)
// into the "viewers" bucket, so a corrupted row could silently inflate the
// viewer count and nothing would alert an operator. We now only count rows
// whose role matches the allowlist ("admin", "editor", "viewer") and log a
// warning for anything else so corruption is surfaced instead of hidden.
func (s *SQLiteStore) CountUsersByRole(ctx context.Context) (admins, editors, viewers int, err error) {
	rows, err := s.db.QueryContext(ctx, `SELECT role, COUNT(*) FROM users GROUP BY role`)
	if err != nil {
		return 0, 0, 0, err
	}
	defer rows.Close()

	for rows.Next() {
		var role string
		var count int
		if err := rows.Scan(&role, &count); err != nil {
			return 0, 0, 0, err
		}
		switch role {
		case "admin":
			admins = count
		case "editor":
			editors = count
		case "viewer", "":
			// Treat NULL/empty as "viewer" — that is the documented default
			// applied by the users.role column default and scanUser fallback.
			viewers += count
		default:
			slog.Warn("[Store] CountUsersByRole: unknown role in users table — excluded from counts",
				"role", role, "count", count)
		}
	}
	return admins, editors, viewers, rows.Err()
}

// Onboarding methods

// SaveOnboardingResponse upserts a single onboarding answer for (user_id,
// question_key). #6606: the previous implementation used INSERT OR REPLACE,
// which under SQLite is a delete-then-insert that bumps the autoincrement
// sequence and fires DELETE triggers — effectively renaming the row's
// identity on every save. We now use ON CONFLICT (user_id, question_key)
// DO UPDATE so repeated saves keep the same row id and never trip any
// ON DELETE cascade wired up against onboarding_responses.
func (s *SQLiteStore) SaveOnboardingResponse(ctx context.Context, response *models.OnboardingResponse) error {
	if response.ID == uuid.Nil {
		response.ID = uuid.New()
	}
	response.CreatedAt = time.Now()

	_, err := s.db.ExecContext(ctx,
		`INSERT INTO onboarding_responses (id, user_id, question_key, answer, created_at)
		 VALUES (?, ?, ?, ?, ?)
		 ON CONFLICT(user_id, question_key) DO UPDATE SET
		   answer = excluded.answer,
		   created_at = excluded.created_at`,
		response.ID.String(), response.UserID.String(), response.QuestionKey, response.Answer, response.CreatedAt)
	return err
}

func (s *SQLiteStore) GetOnboardingResponses(ctx context.Context, userID uuid.UUID) ([]models.OnboardingResponse, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, user_id, question_key, answer, created_at FROM onboarding_responses WHERE user_id = ?`, userID.String())
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var responses []models.OnboardingResponse
	for rows.Next() {
		var r models.OnboardingResponse
		var idStr, userIDStr string
		if err := rows.Scan(&idStr, &userIDStr, &r.QuestionKey, &r.Answer, &r.CreatedAt); err != nil {
			return nil, err
		}
		r.ID = parseUUID(idStr, "r.ID")
		r.UserID = parseUUID(userIDStr, "r.UserID")
		responses = append(responses, r)
	}
	return responses, rows.Err()
}

func (s *SQLiteStore) SetUserOnboarded(ctx context.Context, userID uuid.UUID) error {
	_, err := s.db.ExecContext(ctx, `UPDATE users SET onboarded = 1 WHERE id = ?`, userID.String())
	return err
}
