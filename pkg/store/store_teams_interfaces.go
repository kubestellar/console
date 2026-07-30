package store

import (
	"context"

	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
)

// TeamStore manages team groupings of console users.
type TeamStore interface {
	// CreateTeam creates a new team. MemberIDs in the request are added as members
	// with the "member" role. The caller's userID is set as the team creator.
	CreateTeam(ctx context.Context, team *models.Team, memberIDs []uuid.UUID) error

	// GetTeam retrieves a team by ID, returning nil if not found.
	GetTeam(ctx context.Context, id uuid.UUID) (*models.Team, error)

	// GetTeamWithMembers retrieves a team with its member list.
	GetTeamWithMembers(ctx context.Context, id uuid.UUID) (*models.TeamWithMembers, error)

	// UpdateTeam updates mutable team fields (name, description).
	UpdateTeam(ctx context.Context, team *models.Team) error

	// DeleteTeam removes a team and its membership records.
	DeleteTeam(ctx context.Context, id uuid.UUID) error

	// ListTeams returns all teams the user can see. If userID is nil, returns all teams.
	ListTeams(ctx context.Context, userID *uuid.UUID, limit, offset int) ([]models.Team, error)

	// AddTeamMember adds a user to a team with the given role.
	AddTeamMember(ctx context.Context, teamID, userID uuid.UUID, role models.TeamRole) error

	// RemoveTeamMember removes a user from a team.
	RemoveTeamMember(ctx context.Context, teamID, userID uuid.UUID) error

	// UpdateTeamMemberRole changes a member's role within the team.
	UpdateTeamMemberRole(ctx context.Context, teamID, userID uuid.UUID, role models.TeamRole) error

	// ListTeamMembers returns all members of a team.
	ListTeamMembers(ctx context.Context, teamID uuid.UUID) ([]models.TeamMemberInfo, error)

	// GetUserTeams returns all teams a user belongs to.
	GetUserTeams(ctx context.Context, userID uuid.UUID) ([]models.Team, error)
}
