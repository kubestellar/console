package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/api/audit"
	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/services/team"
)

// TeamHandler handles team management HTTP endpoints
type TeamHandler struct {
	svc team.Service
}

// NewTeamHandler creates a new team handler
func NewTeamHandler(svc team.Service) *TeamHandler {
	return &TeamHandler{svc: svc}
}

// ListTeams returns all teams the user can see
func (h *TeamHandler) ListTeams(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	limit, offset, err := ParsePageParams(c)
	if err != nil {
		return err
	}

	teams, err := h.svc.List(c.UserContext(), &userID, limit, offset)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	if teams == nil {
		teams = []models.Team{}
	}
	return c.JSON(teams)
}

// CreateTeam creates a new team
func (h *TeamHandler) CreateTeam(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	var req models.CreateTeamRequest
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid request body")
	}

	if req.Name == "" {
		return fiber.NewError(fiber.StatusBadRequest, "Team name is required")
	}

	team, err := h.svc.Create(c.UserContext(), userID, req)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}

	audit.Log(c, audit.ActionCreateTeam, "target_type", "team", "target_id", team.ID.String())
	return c.Status(fiber.StatusCreated).JSON(team)
}

// GetTeam returns a team with its members
func (h *TeamHandler) GetTeam(c *fiber.Ctx) error {
	teamID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid team ID")
	}

	teamResp, err := h.svc.Get(c.UserContext(), teamID)
	if err != nil {
        // Now 'team' correctly refers to the imported package
		if err == team.ErrNotFound {
			return fiber.NewError(fiber.StatusNotFound, "Team not found")
		}
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}

	return c.JSON(teamResp)
}

// UpdateTeam updates a team's mutable fields
func (h *TeamHandler) UpdateTeam(c *fiber.Ctx) error {
	teamID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid team ID")
	}

	var req models.UpdateTeamRequest
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid request body")
	}

	actorID := middleware.GetUserID(c)
	updated, err := h.svc.Update(c.UserContext(), teamID, actorID, req)
	if err != nil {
		if err == team.ErrNotFound {
			return fiber.NewError(fiber.StatusNotFound, "Team not found")
		}
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}

	audit.Log(c, audit.ActionUpdateTeam, "target_type", "team", "target_id", teamID.String())
	return c.JSON(updated)
}

// DeleteTeam removes a team
func (h *TeamHandler) DeleteTeam(c *fiber.Ctx) error {
	teamID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid team ID")
	}

	userID := middleware.GetUserID(c)
	if err := h.svc.Delete(c.UserContext(), teamID, userID); err != nil {
		if err == team.ErrNotFound {
			return fiber.NewError(fiber.StatusNotFound, "Team not found")
		}
		if err == team.ErrNoPermission {
			return fiber.NewError(fiber.StatusForbidden, "Only team admins can delete teams")
		}
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}

	audit.Log(c, audit.ActionDeleteTeam, "target_type", "team", "target_id", teamID.String())
	return c.SendStatus(fiber.StatusNoContent)
}

// ListTeamMembers returns members of a team
func (h *TeamHandler) ListTeamMembers(c *fiber.Ctx) error {
	teamID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid team ID")
	}

	members, err := h.svc.ListMembers(c.UserContext(), teamID)
	if err != nil {
		if err == team.ErrNotFound {
			return fiber.NewError(fiber.StatusNotFound, "Team not found")
		}
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	if members == nil {
		members = []models.TeamMemberInfo{}
	}
	return c.JSON(members)
}

// AddTeamMember adds a user to a team
func (h *TeamHandler) AddTeamMember(c *fiber.Ctx) error {
	teamID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid team ID")
	}

	var req models.AddTeamMemberRequest
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid request body")
	}

	if req.Role == "" {
		req.Role = models.TeamRoleMember
	}

	userID, err := uuid.Parse(req.UserID)
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid user ID")
	}

	actorID := middleware.GetUserID(c)
	if err := h.svc.AddMember(c.UserContext(), teamID, userID, actorID, req.Role); err != nil {
		if err == team.ErrNotFound {
			return fiber.NewError(fiber.StatusNotFound, "Team not found")
		}
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}

	audit.Log(c, audit.ActionAddTeamMember, "target_type", "team_member", "target_id", teamID.String()+"."+req.UserID)
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"success": true})
}

// RemoveTeamMember removes a user from a team
func (h *TeamHandler) RemoveTeamMember(c *fiber.Ctx) error {
	teamID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid team ID")
	}

	memberID, err := uuid.Parse(c.Params("userId"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid user ID")
	}

	actorID := middleware.GetUserID(c)
	if err := h.svc.RemoveMember(c.UserContext(), teamID, memberID, actorID); err != nil {
		if err == team.ErrNotFound {
			return fiber.NewError(fiber.StatusNotFound, "Team not found")
		}
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}

	audit.Log(c, audit.ActionRemoveTeamMember, "target_type", "team_member", "target_id", teamID.String()+"."+memberID.String())
	return c.SendStatus(fiber.StatusNoContent)
}

// GetUserTeams returns all teams the current user belongs to
func (h *TeamHandler) GetUserTeams(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	teams, err := h.svc.GetUserTeams(c.UserContext(), userID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	if teams == nil {
		teams = []models.Team{}
	}
	return c.JSON(teams)
}

// ListAllTeams returns all teams (admin-only)
func (h *TeamHandler) ListAllTeams(c *fiber.Ctx) error {
	limit, offset, err := ParsePageParams(c)
	if err != nil {
		return err
	}

	teams, err := h.svc.List(c.UserContext(), nil, limit, offset)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	if teams == nil {
		teams = []models.Team{}
	}
	return c.JSON(teams)
}
// Add the handler implementation
func (h *TeamHandler) UpdateTeamMemberRole(c *fiber.Ctx) error {
    teamID, err := uuid.Parse(c.Params("id"))
    if err != nil { return fiber.NewError(fiber.StatusBadRequest, "Invalid team ID") }

    memberID, err := uuid.Parse(c.Params("userId"))
    if err != nil { return fiber.NewError(fiber.StatusBadRequest, "Invalid user ID") }

    var req struct {
        Role models.TeamRole `json:"role"`
    }
    if err := c.BodyParser(&req); err != nil {
        return fiber.NewError(fiber.StatusBadRequest, "Invalid request body")
    }

    actorID := middleware.GetUserID(c)
    if err := h.svc.UpdateMemberRole(c.UserContext(), teamID, memberID, actorID, req.Role); err != nil {
        if err == team.ErrNotFound { return fiber.NewError(fiber.StatusNotFound, "Team not found") }
        if err == team.ErrNoPermission { return fiber.NewError(fiber.StatusForbidden, "Permission denied") }
        return fiber.NewError(fiber.StatusInternalServerError, err.Error())
    }

    return c.SendStatus(fiber.StatusNoContent)
}