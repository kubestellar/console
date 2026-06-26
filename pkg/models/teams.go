package models

import (
	"time"

	"github.com/google/uuid"
)

// TeamRole represents a member's role within a team
type TeamRole string

const (
	TeamRoleAdmin  TeamRole = "admin"
	TeamRoleMember TeamRole = "member"
)

// Team represents a named group of console users for access management
type Team struct {
	ID          uuid.UUID `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description,omitempty"`
	CreatedBy   uuid.UUID `json:"createdBy"`
	MemberCount int       `json:"memberCount"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

// TeamMembership represents a user's membership in a team
type TeamMembership struct {
	ID        uuid.UUID `json:"id"`
	TeamID    uuid.UUID `json:"teamId"`
	UserID    uuid.UUID `json:"userId"`
	Role      TeamRole  `json:"role"`
	CreatedAt time.Time `json:"createdAt"`
}

// CreateTeamRequest represents a request to create a new team
type CreateTeamRequest struct {
	Name        string   `json:"name"`
	Description string   `json:"description,omitempty"`
	MemberIDs   []string `json:"memberIds"`
}

// UpdateTeamRequest represents a request to update a team
type UpdateTeamRequest struct {
	Name        *string `json:"name,omitempty"`
	Description *string `json:"description,omitempty"`
}

// AddTeamMemberRequest represents a request to add a member to a team
type AddTeamMemberRequest struct {
	UserID string   `json:"userId"`
	Role   TeamRole `json:"role"`
}

// TeamWithMembers combines a team with its member list
type TeamWithMembers struct {
	Team
	Members []TeamMemberInfo `json:"members"`
}

// TeamMemberInfo is a summary of a team member for display
type TeamMemberInfo struct {
	UserID       uuid.UUID `json:"userId"`
	GitHubLogin  string    `json:"githubLogin"`
	AvatarURL    string    `json:"avatarUrl,omitempty"`
	Role         TeamRole  `json:"role"`
	Email        string    `json:"email,omitempty"`
}
