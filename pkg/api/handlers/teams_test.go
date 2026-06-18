package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/services/team"
)

// mockTeamService implements team.Service for testing
type mockTeamService struct {
	mock.Mock
}

func (m *mockTeamService) Create(ctx context.Context, userID uuid.UUID, req models.CreateTeamRequest) (*models.Team, error) {
	args := m.Called(userID, req)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.Team), args.Error(1)
}

func (m *mockTeamService) Get(ctx context.Context, teamID uuid.UUID) (*models.TeamWithMembers, error) {
	args := m.Called(teamID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.TeamWithMembers), args.Error(1)
}

func (m *mockTeamService) Delete(ctx context.Context, teamID uuid.UUID, userID uuid.UUID) error {
	args := m.Called(teamID, userID)
	return args.Error(0)
}

func (m *mockTeamService) List(ctx context.Context, userID *uuid.UUID, limit, offset int) ([]models.Team, error) {
	args := m.Called(userID, limit, offset)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]models.Team), args.Error(1)
}

func (m *mockTeamService) RemoveMember(ctx context.Context, teamID, userID, actorID uuid.UUID) error {
	args := m.Called(teamID, userID, actorID)
	return args.Error(0)
}

func (m *mockTeamService) UpdateMemberRole(ctx context.Context, teamID, userID, actorID uuid.UUID, role models.TeamRole) error {
	args := m.Called(teamID, userID, actorID, role)
	return args.Error(0)
}

func (m *mockTeamService) ListMembers(ctx context.Context, teamID uuid.UUID) ([]models.TeamMemberInfo, error) {
	args := m.Called(teamID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]models.TeamMemberInfo), args.Error(1)
}

func (m *mockTeamService) GetUserTeams(ctx context.Context, userID uuid.UUID) ([]models.Team, error) {
	args := m.Called(userID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]models.Team), args.Error(1)
}

func (m *mockTeamService) Update(ctx context.Context, teamID uuid.UUID, actorID uuid.UUID, req models.UpdateTeamRequest) (*models.Team, error) {
	args := m.Called(teamID, actorID, req)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.Team), args.Error(1)
}

func (m *mockTeamService) AddMember(ctx context.Context, teamID, userID, actorID uuid.UUID, role models.TeamRole) error {
	args := m.Called(teamID, userID, actorID, role)
	return args.Error(0)
}

const teamsTestTimeout = 5000

func newTeamsTestApp(t *testing.T, svc team.Service) *fiber.App {
	t.Helper()
	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", testAdminUserID)
		return c.Next()
	})
	h := NewTeamHandler(svc)
	app.Get("/api/teams", h.ListTeams)
	app.Post("/api/teams", h.CreateTeam)
	app.Get("/api/teams/:id", h.GetTeam)
	app.Put("/api/teams/:id", h.UpdateTeam)
	app.Delete("/api/teams/:id", h.DeleteTeam)
	app.Get("/api/teams/:id/members", h.ListTeamMembers)
	app.Post("/api/teams/:id/members", h.AddTeamMember)
	app.Delete("/api/teams/:id/members/:userId", h.RemoveTeamMember)
	app.Put("/api/teams/:id/members/:userId/role", h.UpdateTeamMemberRole)
	app.Get("/api/user/teams", h.GetUserTeams)
	app.Get("/api/admin/teams", h.ListAllTeams)
	return app
}

func TestListTeams_Success(t *testing.T) {
	svc := new(mockTeamService)
	app := newTeamsTestApp(t, svc)

	expected := []models.Team{
		{ID: uuid.New(), Name: "platform"},
		{ID: uuid.New(), Name: "security"},
	}
	// ParsePageParams returns (0, 0) when no limit/offset query params
	svc.On("List", &testAdminUserID, 0, 0).Return(expected, nil)

	req, _ := http.NewRequest(http.MethodGet, "/api/teams", nil)
	resp, err := app.Test(req, teamsTestTimeout)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var teams []map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&teams))
	assert.Len(t, teams, 2)
	svc.AssertExpectations(t)
}

func TestListTeams_ServiceError(t *testing.T) {
	svc := new(mockTeamService)
	app := newTeamsTestApp(t, svc)

	svc.On("List", &testAdminUserID, 0, 0).Return(nil, assert.AnError)

	req, _ := http.NewRequest(http.MethodGet, "/api/teams", nil)
	resp, err := app.Test(req, teamsTestTimeout)
	require.NoError(t, err)
	require.Equal(t, http.StatusInternalServerError, resp.StatusCode)
	svc.AssertExpectations(t)
}

func TestCreateTeam_Success(t *testing.T) {
	svc := new(mockTeamService)
	app := newTeamsTestApp(t, svc)

	teamReq := models.CreateTeamRequest{Name: "new-team", Description: "A new team"}
	created := &models.Team{ID: uuid.New(), Name: "new-team", Description: "A new team"}
	svc.On("Create", testAdminUserID, teamReq).Return(created, nil)

	raw, _ := json.Marshal(teamReq)
	req, _ := http.NewRequest(http.MethodPost, "/api/teams", bytes.NewReader(raw))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, teamsTestTimeout)
	require.NoError(t, err)
	require.Equal(t, http.StatusCreated, resp.StatusCode)

	var result map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&result))
	assert.Equal(t, "new-team", result["name"])
	svc.AssertExpectations(t)
}

func TestCreateTeam_EmptyName(t *testing.T) {
	svc := new(mockTeamService)
	app := newTeamsTestApp(t, svc)

	body := map[string]any{"name": "", "description": "no name"}
	raw, _ := json.Marshal(body)
	req, _ := http.NewRequest(http.MethodPost, "/api/teams", bytes.NewReader(raw))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, teamsTestTimeout)
	require.NoError(t, err)
	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestCreateTeam_InvalidBody(t *testing.T) {
	svc := new(mockTeamService)
	app := newTeamsTestApp(t, svc)

	req, _ := http.NewRequest(http.MethodPost, "/api/teams", bytes.NewReader([]byte(`not json`)))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, teamsTestTimeout)
	require.NoError(t, err)
	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestGetTeam_Success(t *testing.T) {
	svc := new(mockTeamService)
	app := newTeamsTestApp(t, svc)

	teamID := uuid.New()
	teamResp := &models.TeamWithMembers{
		Team:    models.Team{ID: teamID, Name: "platform"},
		Members: []models.TeamMemberInfo{},
	}
	svc.On("Get", teamID).Return(teamResp, nil)

	req, _ := http.NewRequest(http.MethodGet, "/api/teams/"+teamID.String(), nil)
	resp, err := app.Test(req, teamsTestTimeout)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	svc.AssertExpectations(t)
}

func TestGetTeam_InvalidID(t *testing.T) {
	svc := new(mockTeamService)
	app := newTeamsTestApp(t, svc)

	req, _ := http.NewRequest(http.MethodGet, "/api/teams/not-a-uuid", nil)
	resp, err := app.Test(req, teamsTestTimeout)
	require.NoError(t, err)
	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestGetTeam_NotFound(t *testing.T) {
	svc := new(mockTeamService)
	app := newTeamsTestApp(t, svc)

	teamID := uuid.New()
	svc.On("Get", teamID).Return(nil, team.ErrNotFound)

	req, _ := http.NewRequest(http.MethodGet, "/api/teams/"+teamID.String(), nil)
	resp, err := app.Test(req, teamsTestTimeout)
	require.NoError(t, err)
	require.Equal(t, http.StatusNotFound, resp.StatusCode)
	svc.AssertExpectations(t)
}

func TestDeleteTeam_Success(t *testing.T) {
	svc := new(mockTeamService)
	app := newTeamsTestApp(t, svc)

	teamID := uuid.New()
	svc.On("Delete", teamID, testAdminUserID).Return(nil)

	req, _ := http.NewRequest(http.MethodDelete, "/api/teams/"+teamID.String(), nil)
	resp, err := app.Test(req, teamsTestTimeout)
	require.NoError(t, err)
	require.Equal(t, http.StatusNoContent, resp.StatusCode)
	svc.AssertExpectations(t)
}

func TestDeleteTeam_NotFound(t *testing.T) {
	svc := new(mockTeamService)
	app := newTeamsTestApp(t, svc)

	teamID := uuid.New()
	svc.On("Delete", teamID, testAdminUserID).Return(team.ErrNotFound)

	req, _ := http.NewRequest(http.MethodDelete, "/api/teams/"+teamID.String(), nil)
	resp, err := app.Test(req, teamsTestTimeout)
	require.NoError(t, err)
	require.Equal(t, http.StatusNotFound, resp.StatusCode)
	svc.AssertExpectations(t)
}

func TestDeleteTeam_Forbidden(t *testing.T) {
	svc := new(mockTeamService)
	app := newTeamsTestApp(t, svc)

	teamID := uuid.New()
	svc.On("Delete", teamID, testAdminUserID).Return(team.ErrNoPermission)

	req, _ := http.NewRequest(http.MethodDelete, "/api/teams/"+teamID.String(), nil)
	resp, err := app.Test(req, teamsTestTimeout)
	require.NoError(t, err)
	require.Equal(t, http.StatusForbidden, resp.StatusCode)
	svc.AssertExpectations(t)
}

func TestListTeamMembers_Success(t *testing.T) {
	svc := new(mockTeamService)
	app := newTeamsTestApp(t, svc)

	teamID := uuid.New()
	members := []models.TeamMemberInfo{
		{UserID: uuid.New(), Role: models.TeamRoleAdmin},
	}
	svc.On("ListMembers", teamID).Return(members, nil)

	req, _ := http.NewRequest(http.MethodGet, "/api/teams/"+teamID.String()+"/members", nil)
	resp, err := app.Test(req, teamsTestTimeout)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var result []map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&result))
	assert.Len(t, result, 1)
	svc.AssertExpectations(t)
}

func TestListTeamMembers_NotFound(t *testing.T) {
	svc := new(mockTeamService)
	app := newTeamsTestApp(t, svc)

	teamID := uuid.New()
	svc.On("ListMembers", teamID).Return(nil, team.ErrNotFound)

	req, _ := http.NewRequest(http.MethodGet, "/api/teams/"+teamID.String()+"/members", nil)
	resp, err := app.Test(req, teamsTestTimeout)
	require.NoError(t, err)
	require.Equal(t, http.StatusNotFound, resp.StatusCode)
	svc.AssertExpectations(t)
}

func TestAddTeamMember_Success(t *testing.T) {
	svc := new(mockTeamService)
	app := newTeamsTestApp(t, svc)

	teamID := uuid.New()
	memberID := uuid.New()
	svc.On("AddMember", teamID, memberID, testAdminUserID, models.TeamRoleMember).Return(nil)

	body := map[string]any{"userId": memberID.String(), "role": "member"}
	raw, _ := json.Marshal(body)
	req, _ := http.NewRequest(http.MethodPost, "/api/teams/"+teamID.String()+"/members", bytes.NewReader(raw))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, teamsTestTimeout)
	require.NoError(t, err)
	require.Equal(t, http.StatusCreated, resp.StatusCode)
	svc.AssertExpectations(t)
}

func TestAddTeamMember_InvalidUserID(t *testing.T) {
	svc := new(mockTeamService)
	app := newTeamsTestApp(t, svc)

	teamID := uuid.New()
	body := map[string]any{"userId": "not-a-uuid", "role": "member"}
	raw, _ := json.Marshal(body)
	req, _ := http.NewRequest(http.MethodPost, "/api/teams/"+teamID.String()+"/members", bytes.NewReader(raw))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, teamsTestTimeout)
	require.NoError(t, err)
	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestRemoveTeamMember_Success(t *testing.T) {
	svc := new(mockTeamService)
	app := newTeamsTestApp(t, svc)

	teamID := uuid.New()
	memberID := uuid.New()
	svc.On("RemoveMember", teamID, memberID, testAdminUserID).Return(nil)

	req, _ := http.NewRequest(http.MethodDelete, "/api/teams/"+teamID.String()+"/members/"+memberID.String(), nil)
	resp, err := app.Test(req, teamsTestTimeout)
	require.NoError(t, err)
	require.Equal(t, http.StatusNoContent, resp.StatusCode)
	svc.AssertExpectations(t)
}

func TestRemoveTeamMember_NotFound(t *testing.T) {
	svc := new(mockTeamService)
	app := newTeamsTestApp(t, svc)

	teamID := uuid.New()
	memberID := uuid.New()
	svc.On("RemoveMember", teamID, memberID, testAdminUserID).Return(team.ErrNotFound)

	req, _ := http.NewRequest(http.MethodDelete, "/api/teams/"+teamID.String()+"/members/"+memberID.String(), nil)
	resp, err := app.Test(req, teamsTestTimeout)
	require.NoError(t, err)
	require.Equal(t, http.StatusNotFound, resp.StatusCode)
	svc.AssertExpectations(t)
}

func TestGetUserTeams_Success(t *testing.T) {
	svc := new(mockTeamService)
	app := newTeamsTestApp(t, svc)

	teams := []models.Team{
		{ID: uuid.New(), Name: "my-team"},
	}
	svc.On("GetUserTeams", testAdminUserID).Return(teams, nil)

	req, _ := http.NewRequest(http.MethodGet, "/api/user/teams", nil)
	resp, err := app.Test(req, teamsTestTimeout)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var result []map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&result))
	assert.Len(t, result, 1)
	svc.AssertExpectations(t)
}

func TestListAllTeams_Success(t *testing.T) {
	svc := new(mockTeamService)
	app := newTeamsTestApp(t, svc)

	teams := []models.Team{
		{ID: uuid.New(), Name: "team-a"},
		{ID: uuid.New(), Name: "team-b"},
	}
	// ListAllTeams passes nil for userID, ParsePageParams returns (0,0)
	svc.On("List", (*uuid.UUID)(nil), 0, 0).Return(teams, nil)

	req, _ := http.NewRequest(http.MethodGet, "/api/admin/teams", nil)
	resp, err := app.Test(req, teamsTestTimeout)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var result []map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&result))
	assert.Len(t, result, 2)
	svc.AssertExpectations(t)
}

func TestUpdateTeam_Success(t *testing.T) {
	svc := new(mockTeamService)
	app := newTeamsTestApp(t, svc)

	teamID := uuid.New()
	newName := "updated-name"
	updateReq := models.UpdateTeamRequest{Name: &newName}
	updated := &models.Team{ID: teamID, Name: newName}
	svc.On("Update", teamID, testAdminUserID, updateReq).Return(updated, nil)

	raw, _ := json.Marshal(map[string]any{"name": newName})
	req, _ := http.NewRequest(http.MethodPut, "/api/teams/"+teamID.String(), bytes.NewReader(raw))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, teamsTestTimeout)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	svc.AssertExpectations(t)
}

func TestUpdateTeam_InvalidID(t *testing.T) {
	svc := new(mockTeamService)
	app := newTeamsTestApp(t, svc)

	raw, _ := json.Marshal(map[string]any{"name": "x"})
	req, _ := http.NewRequest(http.MethodPut, "/api/teams/bad-id", bytes.NewReader(raw))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, teamsTestTimeout)
	require.NoError(t, err)
	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestUpdateTeamMemberRole_Success(t *testing.T) {
	svc := new(mockTeamService)
	app := newTeamsTestApp(t, svc)

	teamID := uuid.New()
	memberID := uuid.New()
	svc.On("UpdateMemberRole", teamID, memberID, testAdminUserID, models.TeamRoleAdmin).Return(nil)

	raw, _ := json.Marshal(map[string]any{"role": "admin"})
	req, _ := http.NewRequest(http.MethodPut, "/api/teams/"+teamID.String()+"/members/"+memberID.String()+"/role", bytes.NewReader(raw))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, teamsTestTimeout)
	require.NoError(t, err)
	require.Equal(t, http.StatusNoContent, resp.StatusCode)
	svc.AssertExpectations(t)
}

func TestUpdateTeamMemberRole_InvalidTeamID(t *testing.T) {
	svc := new(mockTeamService)
	app := newTeamsTestApp(t, svc)

	memberID := uuid.New()
	raw, _ := json.Marshal(map[string]any{"role": "admin"})
	req, _ := http.NewRequest(http.MethodPut, "/api/teams/bad-id/members/"+memberID.String()+"/role", bytes.NewReader(raw))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, teamsTestTimeout)
	require.NoError(t, err)
	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
}
