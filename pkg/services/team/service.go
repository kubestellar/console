// Package team provides a service layer for team management business logic.
// Handlers delegate to this service instead of coupling directly to the store,
// making the domain logic independently testable and reusable.
package team

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/store"
)

var (
	ErrNotFound      = errors.New("team not found")
	ErrNoPermission  = errors.New("permission denied")
	ErrDuplicateName = errors.New("a team with this name already exists")
)

// Service defines the contract for team business operations.
type Service interface {
	Create(ctx context.Context, userID uuid.UUID, req models.CreateTeamRequest) (*models.Team, error)
	Get(ctx context.Context, teamID uuid.UUID) (*models.TeamWithMembers, error)
	// Update(ctx context.Context, teamID uuid.UUID, req models.UpdateTeamRequest) (*models.Team, error)
	Delete(ctx context.Context, teamID uuid.UUID, userID uuid.UUID) error
	List(ctx context.Context, userID *uuid.UUID, limit, offset int) ([]models.Team, error)
	// AddMember(ctx context.Context, teamID, userID uuid.UUID, role models.TeamRole) error
	RemoveMember(ctx context.Context, teamID, userID, actorID uuid.UUID) error
	UpdateMemberRole(ctx context.Context, teamID, userID, actorID uuid.UUID, role models.TeamRole) error
	ListMembers(ctx context.Context, teamID uuid.UUID) ([]models.TeamMemberInfo, error)
	GetUserTeams(ctx context.Context, userID uuid.UUID) ([]models.Team, error)
	Update(ctx context.Context, teamID uuid.UUID, actorID uuid.UUID, req models.UpdateTeamRequest) (*models.Team, error)
	AddMember(ctx context.Context, teamID, userID, actorID uuid.UUID, role models.TeamRole) error
}

type service struct {
	teams store.TeamStore
	users store.UserStore
}

func New(teams store.TeamStore, users store.UserStore) Service {
	return &service{teams: teams, users: users}
}

func (s *service) Create(ctx context.Context, userID uuid.UUID, req models.CreateTeamRequest) (*models.Team, error) {
	if req.Name == "" {
		return nil, errors.New("team name is required")
	}

	team := &models.Team{
		ID:          uuid.New(),
		Name:        req.Name,
		Description: req.Description,
		CreatedBy:   userID,
	}

	uniqueMembers := make(map[uuid.UUID]bool)
	uniqueMembers[userID] = true // Explicitly add the creator

	for _, idStr := range req.MemberIDs {
		uid, err := uuid.Parse(idStr)
		if err != nil {
			return nil, fmt.Errorf("invalid member ID %q: %w", idStr, err)
		}
		uniqueMembers[uid] = true
	}

	// Convert back to slice
	memberIDs := make([]uuid.UUID, 0, len(uniqueMembers))
	for uid := range uniqueMembers {
		memberIDs = append(memberIDs, uid)
	}

	if err := s.teams.CreateTeam(ctx, team, memberIDs); err != nil {
		return nil, err
	}

	team.MemberCount = len(memberIDs)
	return team, nil
}

func (s *service) Get(ctx context.Context, teamID uuid.UUID) (*models.TeamWithMembers, error) {
	team, err := s.teams.GetTeamWithMembers(ctx, teamID)
	if err != nil {
		return nil, err
	}
	if team == nil {
		return nil, ErrNotFound
	}
	return team, nil
}

// func (s *service) Update(ctx context.Context, teamID uuid.UUID, req models.UpdateTeamRequest) (*models.Team, error) {
// 	team, err := s.teams.GetTeam(ctx, teamID)
// 	if err != nil {
// 		return nil, err
// 	}
// 	if team == nil {
// 		return nil, ErrNotFound
// 	}

// 	if req.Name != nil {
// 		team.Name = *req.Name
// 	}
// 	if req.Description != nil {
// 		team.Description = *req.Description
// 	}

// 	if err := s.teams.UpdateTeam(ctx, team); err != nil {
// 		return nil, err
// 	}
// 	return team, nil
// }

func (s *service) Delete(ctx context.Context, teamID uuid.UUID, userID uuid.UUID) error {
	team, err := s.teams.GetTeam(ctx, teamID)
	if err != nil {
		return err
	}
	if team == nil {
		return ErrNotFound
	}

	if team.CreatedBy != userID {
		members, err := s.teams.ListTeamMembers(ctx, teamID)
		if err != nil {
			return err
		}
		isAdmin := false
		for _, m := range members {
			if m.UserID == userID && m.Role == models.TeamRoleAdmin {
				isAdmin = true
				break
			}
		}
		if !isAdmin {
			return ErrNoPermission
		}
	}

	return s.teams.DeleteTeam(ctx, teamID)
}

func (s *service) List(ctx context.Context, userID *uuid.UUID, limit, offset int) ([]models.Team, error) {
	return s.teams.ListTeams(ctx, userID, limit, offset)
}

func (s *service) RemoveMember(ctx context.Context, teamID, userID, actorID uuid.UUID) error {
	tm, err := s.teams.GetTeam(ctx, teamID)
	if err != nil {
		return err
	}
	if tm == nil {
		return ErrNotFound
	}

	// SECURITY FIX: Validate permissions before removing a member
	if tm.CreatedBy != actorID && userID != actorID {
		members, err := s.teams.ListTeamMembers(ctx, teamID)
		if err != nil {
			return err
		}
		isAdmin := false
		for _, m := range members {
			if m.UserID == actorID && m.Role == models.TeamRoleAdmin {
				isAdmin = true
				break
			}
		}
		if !isAdmin {
			return ErrNoPermission
		}
	}

	return s.teams.RemoveTeamMember(ctx, teamID, userID)
}

func (s *service) ListMembers(ctx context.Context, teamID uuid.UUID) ([]models.TeamMemberInfo, error) {
	team, err := s.teams.GetTeam(ctx, teamID)
	if err != nil {
		return nil, err
	}
	if team == nil {
		return nil, ErrNotFound
	}
	return s.teams.ListTeamMembers(ctx, teamID)
}

func (s *service) GetUserTeams(ctx context.Context, userID uuid.UUID) ([]models.Team, error) {
	return s.teams.GetUserTeams(ctx, userID)
}
func (s *service) isTeamAdmin(ctx context.Context, team *models.Team, actorID uuid.UUID) (bool, error) {
	if team.CreatedBy == actorID {
		return true, nil
	}
	members, err := s.teams.ListTeamMembers(ctx, team.ID)
	if err != nil {
		return false, err
	}
	for _, m := range members {
		if m.UserID == actorID && m.Role == models.TeamRoleAdmin {
			return true, nil
		}
	}
	return false, nil
}

func (s *service) AddMember(ctx context.Context, teamID, userID, actorID uuid.UUID, role models.TeamRole) error {
	team, err := s.teams.GetTeam(ctx, teamID)
	if err != nil {
		return err
	}
	if team == nil {
		return ErrNotFound
	}

	isAdmin, err := s.isTeamAdmin(ctx, team, actorID)
	if err != nil {
		return err
	}
	if !isAdmin {
		return ErrNoPermission
	}

	return s.teams.AddTeamMember(ctx, teamID, userID, role)
}
func (s *service) Update(ctx context.Context, teamID uuid.UUID, actorID uuid.UUID, req models.UpdateTeamRequest) (*models.Team, error) {
	team, err := s.teams.GetTeam(ctx, teamID)
	if err != nil {
		return nil, err
	}
	if team == nil {
		return nil, ErrNotFound
	}

	isAdmin, err := s.isTeamAdmin(ctx, team, actorID)
	if err != nil {
		return nil, err
	}
	if !isAdmin {
		return nil, ErrNoPermission
	}

	if req.Name != nil {
		team.Name = *req.Name
	}

	if err := s.teams.UpdateTeam(ctx, team); err != nil {
		return nil, err
	}

	return team, nil
}
func (s *service) UpdateMemberRole(ctx context.Context, teamID uuid.UUID, userID uuid.UUID, actorID uuid.UUID, role models.TeamRole) error {
	team, err := s.teams.GetTeam(ctx, teamID)
	if err != nil {
		return err
	}
	if team == nil {
		return ErrNotFound
	}

	isAdmin, err := s.isTeamAdmin(ctx, team, actorID)
	if err != nil {
		return err
	}
	if !isAdmin {
		return ErrNoPermission
	}

	return s.teams.UpdateTeamMemberRole(ctx, teamID, userID, role)
}
