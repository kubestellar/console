package store

import (
	"context"
	"database/sql"
	"time"

	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
)

func (s *SQLiteStore) CreateTeam(ctx context.Context, team *models.Team, memberIDs []uuid.UUID) error {
	if team.ID == uuid.Nil {
		team.ID = uuid.New()
	}
	now := time.Now()
	team.CreatedAt = now
	team.UpdatedAt = now

	return s.WithTransaction(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx,
			`INSERT INTO teams (id, name, description, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
			team.ID.String(), team.Name, nullString(team.Description), team.CreatedBy.String(), now, now)
		if err != nil {
			return err
		}

		for _, memberID := range memberIDs {
        membershipID := uuid.New()
        
        // FIX: Assign Admin role if the member is the creator
        role := models.TeamRoleMember
        if memberID == team.CreatedBy {
            role = models.TeamRoleAdmin
        }

        _, err := tx.ExecContext(ctx,
            `INSERT INTO team_members (id, team_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)`,
            membershipID.String(), team.ID.String(), memberID.String(), string(role), now)
        if err != nil {
            return err
        }
    }

		team.MemberCount = len(memberIDs)
		return nil
	})
}

func (s *SQLiteStore) GetTeam(ctx context.Context, id uuid.UUID) (*models.Team, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT t.id, t.name, t.description, t.created_by, t.created_at, t.updated_at,
		        (SELECT COUNT(*) FROM team_members WHERE team_id = t.id) as member_count
		 FROM teams t WHERE t.id = ?`, id.String())

	var t models.Team
	var idStr, createdByStr string
	var description sql.NullString

	err := row.Scan(&idStr, &t.Name, &description, &createdByStr, &t.CreatedAt, &t.UpdatedAt, &t.MemberCount)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	t.ID = parseUUID(idStr, "team.ID")
	t.CreatedBy = parseUUID(createdByStr, "team.CreatedBy")
	if description.Valid {
		t.Description = description.String
	}
	return &t, nil
}

func (s *SQLiteStore) GetTeamWithMembers(ctx context.Context, id uuid.UUID) (*models.TeamWithMembers, error) {
	team, err := s.GetTeam(ctx, id)
	if err != nil || team == nil {
		return nil, err
	}

	members, err := s.ListTeamMembers(ctx, id)
	if err != nil {
		return nil, err
	}

	return &models.TeamWithMembers{
		Team:    *team,
		Members: members,
	}, nil
}

func (s *SQLiteStore) UpdateTeam(ctx context.Context, team *models.Team) error {
	team.UpdatedAt = time.Now()
	_, err := s.db.ExecContext(ctx,
		`UPDATE teams SET name = ?, description = ?, updated_at = ? WHERE id = ?`,
		team.Name, nullString(team.Description), team.UpdatedAt, team.ID.String())
	return err
}

func (s *SQLiteStore) DeleteTeam(ctx context.Context, id uuid.UUID) error {
	return s.WithTransaction(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `DELETE FROM team_members WHERE team_id = ?`, id.String())
		if err != nil {
			return err
		}
		_, err = tx.ExecContext(ctx, `DELETE FROM teams WHERE id = ?`, id.String())
		return err
	})
}

func (s *SQLiteStore) ListTeams(ctx context.Context, userID *uuid.UUID, limit, offset int) ([]models.Team, error) {
	lim := resolvePageLimit(limit, defaultPageLimit)
	off := resolvePageOffset(offset)

	var rows *sql.Rows
	var err error

	if userID != nil {
		rows, err = s.db.QueryContext(ctx,
			`SELECT t.id, t.name, t.description, t.created_by, t.created_at, t.updated_at,
			        (SELECT COUNT(*) FROM team_members WHERE team_id = t.id) as member_count
			 FROM teams t
			 JOIN team_members tm ON tm.team_id = t.id
			 WHERE tm.user_id = ?
			 ORDER BY t.name COLLATE NOCASE ASC
			 LIMIT ? OFFSET ?`, userID.String(), lim, off)
	} else {
		rows, err = s.db.QueryContext(ctx,
			`SELECT t.id, t.name, t.description, t.created_by, t.created_at, t.updated_at,
			        (SELECT COUNT(*) FROM team_members WHERE team_id = t.id) as member_count
			 FROM teams t
			 ORDER BY t.name COLLATE NOCASE ASC
			 LIMIT ? OFFSET ?`, lim, off)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	teams := make([]models.Team, 0)
	for rows.Next() {
		var t models.Team
		var idStr, createdByStr string
		var description sql.NullString

		if err := rows.Scan(&idStr, &t.Name, &description, &createdByStr, &t.CreatedAt, &t.UpdatedAt, &t.MemberCount); err != nil {
			return nil, err
		}

		t.ID = parseUUID(idStr, "t.ID")
		t.CreatedBy = parseUUID(createdByStr, "t.CreatedBy")
		if description.Valid {
			t.Description = description.String
		}
		teams = append(teams, t)
	}
	return teams, rows.Err()
}

func (s *SQLiteStore) AddTeamMember(ctx context.Context, teamID, userID uuid.UUID, role models.TeamRole) error {
	id := uuid.New()
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO team_members (id, team_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)`,
		id.String(), teamID.String(), userID.String(), string(role), time.Now())
	return err
}

func (s *SQLiteStore) RemoveTeamMember(ctx context.Context, teamID, userID uuid.UUID) error {
	_, err := s.db.ExecContext(ctx,
		`DELETE FROM team_members WHERE team_id = ? AND user_id = ?`,
		teamID.String(), userID.String())
	return err
}

func (s *SQLiteStore) UpdateTeamMemberRole(ctx context.Context, teamID, userID uuid.UUID, role models.TeamRole) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE team_members SET role = ? WHERE team_id = ? AND user_id = ?`,
		string(role), teamID.String(), userID.String())
	return err
}

func (s *SQLiteStore) ListTeamMembers(ctx context.Context, teamID uuid.UUID) ([]models.TeamMemberInfo, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT tm.user_id, u.github_login, u.avatar_url, tm.role, u.email
		 FROM team_members tm
		 JOIN users u ON u.id = tm.user_id
		 WHERE tm.team_id = ?
		 ORDER BY tm.role ASC, u.github_login COLLATE NOCASE ASC`, teamID.String())
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	members := make([]models.TeamMemberInfo, 0)
	for rows.Next() {
		var m models.TeamMemberInfo
		var userIDStr, githubLogin, role string
		var avatarURL, email sql.NullString

		if err := rows.Scan(&userIDStr, &githubLogin, &avatarURL, &role, &email); err != nil {
			return nil, err
		}

		m.UserID = parseUUID(userIDStr, "m.UserID")
		m.GitHubLogin = githubLogin
		m.Role = models.TeamRole(role)
		if avatarURL.Valid {
			m.AvatarURL = avatarURL.String
		}
		if email.Valid {
			m.Email = email.String
		}
		members = append(members, m)
	}
	return members, rows.Err()
}

func (s *SQLiteStore) GetUserTeams(ctx context.Context, userID uuid.UUID) ([]models.Team, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT t.id, t.name, t.description, t.created_by, t.created_at, t.updated_at,
		        (SELECT COUNT(*) FROM team_members WHERE team_id = t.id) as member_count
		 FROM teams t
		 JOIN team_members tm ON tm.team_id = t.id
		 WHERE tm.user_id = ?
		 ORDER BY t.name COLLATE NOCASE ASC`, userID.String())
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	teams := make([]models.Team, 0)
	for rows.Next() {
		var t models.Team
		var idStr, createdByStr string
		var description sql.NullString

		if err := rows.Scan(&idStr, &t.Name, &description, &createdByStr, &t.CreatedAt, &t.UpdatedAt, &t.MemberCount); err != nil {
			return nil, err
		}

		t.ID = parseUUID(idStr, "t.ID")
		t.CreatedBy = parseUUID(createdByStr, "t.CreatedBy")
		if description.Valid {
			t.Description = description.String
		}
		teams = append(teams, t)
	}
	return teams, rows.Err()
}
