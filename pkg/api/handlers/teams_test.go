package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/services/team"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type mockTeamService struct {
	createFunc           func(context.Context, uuid.UUID, models.CreateTeamRequest) (*models.Team, error)
	getFunc              func(context.Context, uuid.UUID) (*models.TeamWithMembers, error)
	deleteFunc           func(context.Context, uuid.UUID, uuid.UUID) error
	listFunc             func(context.Context, *uuid.UUID, int, int) ([]models.Team, error)
	removeMemberFunc     func(context.Context, uuid.UUID, uuid.UUID, uuid.UUID) error
	updateMemberRoleFunc func(context.Context, uuid.UUID, uuid.UUID, uuid.UUID, models.TeamRole) error
	listMembersFunc      func(context.Context, uuid.UUID) ([]models.TeamMemberInfo, error)
	getUserTeamsFunc     func(context.Context, uuid.UUID) ([]models.Team, error)
	updateFunc           func(context.Context, uuid.UUID, uuid.UUID, models.UpdateTeamRequest) (*models.Team, error)
	addMemberFunc        func(context.Context, uuid.UUID, uuid.UUID, uuid.UUID, models.TeamRole) error
}

func (m *mockTeamService) Create(ctx context.Context, userID uuid.UUID, req models.CreateTeamRequest) (*models.Team, error) {
	if m.createFunc != nil {
		return m.createFunc(ctx, userID, req)
	}
	return &models.Team{ID: uuid.New(), Name: req.Name, Description: req.Description, CreatedBy: userID}, nil
}

func (m *mockTeamService) Get(ctx context.Context, teamID uuid.UUID) (*models.TeamWithMembers, error) {
	if m.getFunc != nil {
		return m.getFunc(ctx, teamID)
	}
	return &models.TeamWithMembers{Team: models.Team{ID: teamID, Name: "Platform"}}, nil
}

func (m *mockTeamService) Delete(ctx context.Context, teamID uuid.UUID, userID uuid.UUID) error {
	if m.deleteFunc != nil {
		return m.deleteFunc(ctx, teamID, userID)
	}
	return nil
}

func (m *mockTeamService) List(ctx context.Context, userID *uuid.UUID, limit, offset int) ([]models.Team, error) {
	if m.listFunc != nil {
		return m.listFunc(ctx, userID, limit, offset)
	}
	return []models.Team{{ID: uuid.New(), Name: "Platform"}}, nil
}

func (m *mockTeamService) RemoveMember(ctx context.Context, teamID, userID, actorID uuid.UUID) error {
	if m.removeMemberFunc != nil {
		return m.removeMemberFunc(ctx, teamID, userID, actorID)
	}
	return nil
}

func (m *mockTeamService) UpdateMemberRole(ctx context.Context, teamID, userID, actorID uuid.UUID, role models.TeamRole) error {
	if m.updateMemberRoleFunc != nil {
		return m.updateMemberRoleFunc(ctx, teamID, userID, actorID, role)
	}
	return nil
}

func (m *mockTeamService) ListMembers(ctx context.Context, teamID uuid.UUID) ([]models.TeamMemberInfo, error) {
	if m.listMembersFunc != nil {
		return m.listMembersFunc(ctx, teamID)
	}
	return []models.TeamMemberInfo{{UserID: uuid.New(), GitHubLogin: "octocat", Role: models.TeamRoleMember}}, nil
}

func (m *mockTeamService) GetUserTeams(ctx context.Context, userID uuid.UUID) ([]models.Team, error) {
	if m.getUserTeamsFunc != nil {
		return m.getUserTeamsFunc(ctx, userID)
	}
	return []models.Team{{ID: uuid.New(), Name: "Platform", CreatedBy: userID}}, nil
}

func (m *mockTeamService) Update(ctx context.Context, teamID uuid.UUID, actorID uuid.UUID, req models.UpdateTeamRequest) (*models.Team, error) {
	if m.updateFunc != nil {
		return m.updateFunc(ctx, teamID, actorID, req)
	}
	return &models.Team{ID: teamID, Name: *req.Name, CreatedBy: actorID}, nil
}

func (m *mockTeamService) AddMember(ctx context.Context, teamID, userID, actorID uuid.UUID, role models.TeamRole) error {
	if m.addMemberFunc != nil {
		return m.addMemberFunc(ctx, teamID, userID, actorID, role)
	}
	return nil
}

func setupTeamHandlerTest(userID uuid.UUID, svc team.Service) (*fiber.App, *TeamHandler) {
	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", userID)
		return c.Next()
	})

	handler := NewTeamHandler(svc)
	return app, handler
}

func performTeamRequest(t *testing.T, app *fiber.App, method, path, body string) *http.Response {
	t.Helper()

	req, err := http.NewRequest(method, path, strings.NewReader(body))
	require.NoError(t, err)
	req.Host = "localhost"
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	return resp
}

func readTeamResponseBody(t *testing.T, resp *http.Response) []byte {
	t.Helper()

	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	return body
}

func TestTeamHandler_CreateTeam(t *testing.T) {
	userID := uuid.New()
	serviceErr := errors.New("database unavailable")

	tests := []struct {
		name       string
		body       string
		service    *mockTeamService
		wantStatus int
		assertBody func(t *testing.T, body []byte)
	}{
		{
			name: "valid request",
			body: `{"name":"Platform","description":"Core team"}`,
			service: &mockTeamService{createFunc: func(_ context.Context, gotUserID uuid.UUID, req models.CreateTeamRequest) (*models.Team, error) {
				assert.Equal(t, userID, gotUserID)
				assert.Equal(t, "Platform", req.Name)
				assert.Equal(t, "Core team", req.Description)
				return &models.Team{ID: uuid.New(), Name: req.Name, Description: req.Description, CreatedBy: gotUserID}, nil
			}},
			wantStatus: http.StatusCreated,
			assertBody: func(t *testing.T, body []byte) {
				t.Helper()
				var team models.Team
				require.NoError(t, json.Unmarshal(body, &team))
				assert.Equal(t, "Platform", team.Name)
				assert.Equal(t, "Core team", team.Description)
				assert.Equal(t, userID, team.CreatedBy)
			},
		},
		{
			name: "minimal request",
			body: `{"name":"Engineering"}`,
			service: &mockTeamService{createFunc: func(_ context.Context, gotUserID uuid.UUID, req models.CreateTeamRequest) (*models.Team, error) {
				assert.Equal(t, "Engineering", req.Name)
				assert.Empty(t, req.Description)
				return &models.Team{ID: uuid.New(), Name: req.Name, CreatedBy: gotUserID}, nil
			}},
			wantStatus: http.StatusCreated,
		},
		{
			name:       "invalid body",
			body:       `{"name":`,
			service:    &mockTeamService{},
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "empty name",
			body:       `{"description":"missing name"}`,
			service:    &mockTeamService{},
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "whitespace-only name",
			body:       `{"name":"   "}`,
			service:    &mockTeamService{},
			wantStatus: http.StatusBadRequest,
		},
		{
			name: "service error",
			body: `{"name":"Platform"}`,
			service: &mockTeamService{createFunc: func(context.Context, uuid.UUID, models.CreateTeamRequest) (*models.Team, error) {
				return nil, serviceErr
			}},
			wantStatus: http.StatusInternalServerError,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			app, handler := setupTeamHandlerTest(userID, tt.service)
			app.Post("/teams", handler.CreateTeam)

			resp := performTeamRequest(t, app, http.MethodPost, "/teams", tt.body)
			assert.Equal(t, tt.wantStatus, resp.StatusCode)

			if tt.assertBody != nil {
				body := readTeamResponseBody(t, resp)
				tt.assertBody(t, body)
			}
		})
	}
}

func TestTeamHandler_GetTeam(t *testing.T) {
	teamID := uuid.New()

	tests := []struct {
		name       string
		path       string
		service    *mockTeamService
		wantStatus int
		assertBody func(t *testing.T, body []byte)
	}{
		{
			name: "valid UUID",
			path: "/teams/" + teamID.String(),
			service: &mockTeamService{getFunc: func(_ context.Context, gotTeamID uuid.UUID) (*models.TeamWithMembers, error) {
				assert.Equal(t, teamID, gotTeamID)
				return &models.TeamWithMembers{
					Team: models.Team{ID: gotTeamID, Name: "Platform", MemberCount: 5},
					Members: []models.TeamMemberInfo{
						{UserID: uuid.New(), GitHubLogin: "alice", Role: models.TeamRoleAdmin},
					},
				}, nil
			}},
			wantStatus: http.StatusOK,
			assertBody: func(t *testing.T, body []byte) {
				t.Helper()
				var teamResp models.TeamWithMembers
				require.NoError(t, json.Unmarshal(body, &teamResp))
				assert.Equal(t, "Platform", teamResp.Name)
				assert.Equal(t, 5, teamResp.MemberCount)
				assert.Len(t, teamResp.Members, 1)
				assert.Equal(t, "alice", teamResp.Members[0].GitHubLogin)
			},
		},
		{
			name:       "invalid UUID",
			path:       "/teams/not-a-uuid",
			service:    &mockTeamService{},
			wantStatus: http.StatusBadRequest,
		},
		{
			name: "not found",
			path: "/teams/" + teamID.String(),
			service: &mockTeamService{getFunc: func(context.Context, uuid.UUID) (*models.TeamWithMembers, error) {
				return nil, team.ErrNotFound
			}},
			wantStatus: http.StatusNotFound,
		},
		{
			name: "service error",
			path: "/teams/" + teamID.String(),
			service: &mockTeamService{getFunc: func(context.Context, uuid.UUID) (*models.TeamWithMembers, error) {
				return nil, errors.New("database error")
			}},
			wantStatus: http.StatusInternalServerError,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			app, handler := setupTeamHandlerTest(uuid.New(), tt.service)
			app.Get("/teams/:id", handler.GetTeam)

			resp := performTeamRequest(t, app, http.MethodGet, tt.path, "")
			assert.Equal(t, tt.wantStatus, resp.StatusCode)

			if tt.assertBody != nil {
				body := readTeamResponseBody(t, resp)
				tt.assertBody(t, body)
			}
		})
	}
}

func TestTeamHandler_DeleteTeam(t *testing.T) {
	teamID := uuid.New()

	tests := []struct {
		name       string
		path       string
		serviceErr error
		wantStatus int
	}{
		{
			name:       "success",
			path:       "/teams/" + teamID.String(),
			wantStatus: http.StatusNoContent,
		},
		{
			name:       "invalid team ID",
			path:       "/teams/not-a-uuid",
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "not found",
			path:       "/teams/" + teamID.String(),
			serviceErr: team.ErrNotFound,
			wantStatus: http.StatusNotFound,
		},
		{
			name:       "permission denied",
			path:       "/teams/" + teamID.String(),
			serviceErr: team.ErrNoPermission,
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "service error",
			path:       "/teams/" + teamID.String(),
			serviceErr: errors.New("database error"),
			wantStatus: http.StatusInternalServerError,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			userID := uuid.New()
			app, handler := setupTeamHandlerTest(userID, &mockTeamService{deleteFunc: func(_ context.Context, gotTeamID uuid.UUID, gotUserID uuid.UUID) error {
				if tt.name != "invalid team ID" {
					assert.Equal(t, teamID, gotTeamID)
					assert.Equal(t, userID, gotUserID)
				}
				return tt.serviceErr
			}})
			app.Delete("/teams/:id", handler.DeleteTeam)

			resp := performTeamRequest(t, app, http.MethodDelete, tt.path, "")
			assert.Equal(t, tt.wantStatus, resp.StatusCode)
		})
	}
}

func TestTeamHandler_AddTeamMember(t *testing.T) {
	teamID := uuid.New()
	memberID := uuid.New()

	tests := []struct {
		name       string
		path       string
		body       string
		service    *mockTeamService
		wantStatus int
		wantRole   models.TeamRole
	}{
		{
			name:       "valid request",
			path:       "/teams/" + teamID.String() + "/members",
			body:       `{"userId":"` + memberID.String() + `","role":"admin"}`,
			wantStatus: http.StatusCreated,
			wantRole:   models.TeamRoleAdmin,
		},
		{
			name:       "default role",
			path:       "/teams/" + teamID.String() + "/members",
			body:       `{"userId":"` + memberID.String() + `"}`,
			wantStatus: http.StatusCreated,
			wantRole:   models.TeamRoleMember,
		},
		{
			name:       "invalid team ID",
			path:       "/teams/not-a-uuid/members",
			body:       `{"userId":"` + memberID.String() + `"}`,
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "invalid user ID",
			path:       "/teams/" + teamID.String() + "/members",
			body:       `{"userId":"not-a-uuid"}`,
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "invalid body",
			path:       "/teams/" + teamID.String() + "/members",
			body:       `{"userId":`,
			wantStatus: http.StatusBadRequest,
		},
		{
			name: "not found",
			path: "/teams/" + teamID.String() + "/members",
			body: `{"userId":"` + memberID.String() + `"}`,
			service: &mockTeamService{addMemberFunc: func(context.Context, uuid.UUID, uuid.UUID, uuid.UUID, models.TeamRole) error {
				return team.ErrNotFound
			}},
			wantStatus: http.StatusNotFound,
		},
		{
			name: "service error",
			path: "/teams/" + teamID.String() + "/members",
			body: `{"userId":"` + memberID.String() + `"}`,
			service: &mockTeamService{addMemberFunc: func(context.Context, uuid.UUID, uuid.UUID, uuid.UUID, models.TeamRole) error {
				return errors.New("database error")
			}},
			wantStatus: http.StatusInternalServerError,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			userID := uuid.New()
			svc := tt.service
			if svc == nil {
				svc = &mockTeamService{addMemberFunc: func(_ context.Context, gotTeamID uuid.UUID, gotMemberID uuid.UUID, gotActorID uuid.UUID, gotRole models.TeamRole) error {
					assert.Equal(t, teamID, gotTeamID)
					assert.Equal(t, memberID, gotMemberID)
					assert.Equal(t, userID, gotActorID)
					assert.Equal(t, tt.wantRole, gotRole)
					return nil
				}}
			}

			app, handler := setupTeamHandlerTest(userID, svc)
			app.Post("/teams/:id/members", handler.AddTeamMember)

			resp := performTeamRequest(t, app, http.MethodPost, tt.path, tt.body)
			assert.Equal(t, tt.wantStatus, resp.StatusCode)
		})
	}
}

func TestTeamHandler_RemoveTeamMember(t *testing.T) {
	teamID := uuid.New()
	memberID := uuid.New()

	tests := []struct {
		name       string
		path       string
		serviceErr error
		wantStatus int
	}{
		{
			name:       "success",
			path:       "/teams/" + teamID.String() + "/members/" + memberID.String(),
			wantStatus: http.StatusNoContent,
		},
		{
			name:       "invalid team ID",
			path:       "/teams/not-a-uuid/members/" + memberID.String(),
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "invalid user ID",
			path:       "/teams/" + teamID.String() + "/members/not-a-uuid",
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "not found",
			path:       "/teams/" + teamID.String() + "/members/" + memberID.String(),
			serviceErr: team.ErrNotFound,
			wantStatus: http.StatusNotFound,
		},
		{
			name:       "service error",
			path:       "/teams/" + teamID.String() + "/members/" + memberID.String(),
			serviceErr: errors.New("database error"),
			wantStatus: http.StatusInternalServerError,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			userID := uuid.New()
			app, handler := setupTeamHandlerTest(userID, &mockTeamService{removeMemberFunc: func(_ context.Context, gotTeamID uuid.UUID, gotMemberID uuid.UUID, gotActorID uuid.UUID) error {
				if tt.name != "invalid team ID" && tt.name != "invalid user ID" {
					assert.Equal(t, teamID, gotTeamID)
					assert.Equal(t, memberID, gotMemberID)
					assert.Equal(t, userID, gotActorID)
				}
				return tt.serviceErr
			}})
			app.Delete("/teams/:id/members/:userId", handler.RemoveTeamMember)

			resp := performTeamRequest(t, app, http.MethodDelete, tt.path, "")
			assert.Equal(t, tt.wantStatus, resp.StatusCode)
		})
	}
}

func TestTeamHandler_ListTeams(t *testing.T) {
	userID := uuid.New()

	tests := []struct {
		name       string
		queryStr   string
		service    *mockTeamService
		wantStatus int
		assertBody func(t *testing.T, body []byte)
	}{
		{
			name:     "empty list",
			queryStr: "?limit=25&offset=5",
			service: &mockTeamService{listFunc: func(_ context.Context, gotUserID *uuid.UUID, limit, offset int) ([]models.Team, error) {
				require.NotNil(t, gotUserID)
				assert.Equal(t, userID, *gotUserID)
				assert.Equal(t, 25, limit)
				assert.Equal(t, 5, offset)
				return nil, nil
			}},
			wantStatus: http.StatusOK,
			assertBody: func(t *testing.T, body []byte) {
				t.Helper()
				assert.JSONEq(t, "[]", string(body))
			},
		},
		{
			name:     "returns teams",
			queryStr: "?limit=10&offset=0",
			service: &mockTeamService{listFunc: func(_ context.Context, gotUserID *uuid.UUID, limit, offset int) ([]models.Team, error) {
				require.NotNil(t, gotUserID)
				assert.Equal(t, userID, *gotUserID)
				return []models.Team{
					{ID: uuid.New(), Name: "Platform", MemberCount: 5},
					{ID: uuid.New(), Name: "Engineering", MemberCount: 10},
				}, nil
			}},
			wantStatus: http.StatusOK,
			assertBody: func(t *testing.T, body []byte) {
				t.Helper()
				var teams []models.Team
				require.NoError(t, json.Unmarshal(body, &teams))
				assert.Len(t, teams, 2)
				assert.Equal(t, "Platform", teams[0].Name)
				assert.Equal(t, "Engineering", teams[1].Name)
			},
		},
		{
			name:     "service error",
			queryStr: "",
			service: &mockTeamService{listFunc: func(_ context.Context, _ *uuid.UUID, _, _ int) ([]models.Team, error) {
				return nil, errors.New("database error")
			}},
			wantStatus: http.StatusInternalServerError,
		},
		{
			name:       "invalid limit",
			queryStr:   "?limit=invalid",
			service:    &mockTeamService{},
			wantStatus: http.StatusBadRequest,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			app, handler := setupTeamHandlerTest(userID, tt.service)
			app.Get("/teams", handler.ListTeams)

			resp := performTeamRequest(t, app, http.MethodGet, "/teams"+tt.queryStr, "")
			assert.Equal(t, tt.wantStatus, resp.StatusCode)

			if tt.assertBody != nil {
				body := readTeamResponseBody(t, resp)
				tt.assertBody(t, body)
			}
		})
	}
}

func TestTeamHandler_ListAllTeams(t *testing.T) {
	tests := []struct {
		name       string
		queryStr   string
		service    *mockTeamService
		wantStatus int
		assertBody func(t *testing.T, body []byte)
	}{
		{
			name:     "empty list",
			queryStr: "?limit=10&offset=2",
			service: &mockTeamService{listFunc: func(_ context.Context, gotUserID *uuid.UUID, limit, offset int) ([]models.Team, error) {
				assert.Nil(t, gotUserID)
				assert.Equal(t, 10, limit)
				assert.Equal(t, 2, offset)
				return nil, nil
			}},
			wantStatus: http.StatusOK,
			assertBody: func(t *testing.T, body []byte) {
				t.Helper()
				assert.JSONEq(t, "[]", string(body))
			},
		},
		{
			name:     "returns all teams",
			queryStr: "",
			service: &mockTeamService{listFunc: func(_ context.Context, gotUserID *uuid.UUID, _, _ int) ([]models.Team, error) {
				assert.Nil(t, gotUserID)
				return []models.Team{
					{ID: uuid.New(), Name: "Platform"},
					{ID: uuid.New(), Name: "Engineering"},
					{ID: uuid.New(), Name: "QA"},
				}, nil
			}},
			wantStatus: http.StatusOK,
			assertBody: func(t *testing.T, body []byte) {
				t.Helper()
				var teams []models.Team
				require.NoError(t, json.Unmarshal(body, &teams))
				assert.Len(t, teams, 3)
			},
		},
		{
			name:     "service error",
			queryStr: "",
			service: &mockTeamService{listFunc: func(_ context.Context, _ *uuid.UUID, _, _ int) ([]models.Team, error) {
				return nil, errors.New("database error")
			}},
			wantStatus: http.StatusInternalServerError,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			app, handler := setupTeamHandlerTest(uuid.New(), tt.service)
			app.Get("/teams", handler.ListAllTeams)

			resp := performTeamRequest(t, app, http.MethodGet, "/teams"+tt.queryStr, "")
			assert.Equal(t, tt.wantStatus, resp.StatusCode)

			if tt.assertBody != nil {
				body := readTeamResponseBody(t, resp)
				tt.assertBody(t, body)
			}
		})
	}
}

func TestTeamHandler_ListTeamMembers(t *testing.T) {
	teamID := uuid.New()

	tests := []struct {
		name       string
		path       string
		service    *mockTeamService
		wantStatus int
		assertBody func(t *testing.T, body []byte)
	}{
		{
			name: "empty list",
			path: "/teams/" + teamID.String() + "/members",
			service: &mockTeamService{listMembersFunc: func(_ context.Context, gotTeamID uuid.UUID) ([]models.TeamMemberInfo, error) {
				assert.Equal(t, teamID, gotTeamID)
				return nil, nil
			}},
			wantStatus: http.StatusOK,
			assertBody: func(t *testing.T, body []byte) {
				t.Helper()
				assert.JSONEq(t, "[]", string(body))
			},
		},
		{
			name: "returns members",
			path: "/teams/" + teamID.String() + "/members",
			service: &mockTeamService{listMembersFunc: func(_ context.Context, gotTeamID uuid.UUID) ([]models.TeamMemberInfo, error) {
				assert.Equal(t, teamID, gotTeamID)
				return []models.TeamMemberInfo{
					{UserID: uuid.New(), GitHubLogin: "alice", Role: models.TeamRoleAdmin},
					{UserID: uuid.New(), GitHubLogin: "bob", Role: models.TeamRoleMember},
				}, nil
			}},
			wantStatus: http.StatusOK,
			assertBody: func(t *testing.T, body []byte) {
				t.Helper()
				var members []models.TeamMemberInfo
				require.NoError(t, json.Unmarshal(body, &members))
				assert.Len(t, members, 2)
				assert.Equal(t, "alice", members[0].GitHubLogin)
				assert.Equal(t, models.TeamRoleAdmin, members[0].Role)
			},
		},
		{
			name:       "invalid team ID",
			path:       "/teams/not-a-uuid/members",
			service:    &mockTeamService{},
			wantStatus: http.StatusBadRequest,
		},
		{
			name: "team not found",
			path: "/teams/" + teamID.String() + "/members",
			service: &mockTeamService{listMembersFunc: func(context.Context, uuid.UUID) ([]models.TeamMemberInfo, error) {
				return nil, team.ErrNotFound
			}},
			wantStatus: http.StatusNotFound,
		},
		{
			name: "service error",
			path: "/teams/" + teamID.String() + "/members",
			service: &mockTeamService{listMembersFunc: func(context.Context, uuid.UUID) ([]models.TeamMemberInfo, error) {
				return nil, errors.New("database error")
			}},
			wantStatus: http.StatusInternalServerError,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			app, handler := setupTeamHandlerTest(uuid.New(), tt.service)
			app.Get("/teams/:id/members", handler.ListTeamMembers)

			resp := performTeamRequest(t, app, http.MethodGet, tt.path, "")
			assert.Equal(t, tt.wantStatus, resp.StatusCode)

			if tt.assertBody != nil {
				body := readTeamResponseBody(t, resp)
				tt.assertBody(t, body)
			}
		})
	}
}

func TestTeamHandler_UpdateTeamMemberRole(t *testing.T) {
	teamID := uuid.New()
	memberID := uuid.New()

	tests := []struct {
		name       string
		path       string
		body       string
		serviceErr error
		wantStatus int
	}{
		{
			name:       "valid request",
			path:       "/teams/" + teamID.String() + "/members/" + memberID.String() + "/role",
			body:       `{"role":"admin"}`,
			wantStatus: http.StatusNoContent,
		},
		{
			name:       "change to member role",
			path:       "/teams/" + teamID.String() + "/members/" + memberID.String() + "/role",
			body:       `{"role":"member"}`,
			wantStatus: http.StatusNoContent,
		},
		{
			name:       "invalid team ID",
			path:       "/teams/not-a-uuid/members/" + memberID.String() + "/role",
			body:       `{"role":"admin"}`,
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "invalid user ID",
			path:       "/teams/" + teamID.String() + "/members/not-a-uuid/role",
			body:       `{"role":"admin"}`,
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "invalid body",
			path:       "/teams/" + teamID.String() + "/members/" + memberID.String() + "/role",
			body:       `{"role":`,
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "not found",
			path:       "/teams/" + teamID.String() + "/members/" + memberID.String() + "/role",
			body:       `{"role":"admin"}`,
			serviceErr: team.ErrNotFound,
			wantStatus: http.StatusNotFound,
		},
		{
			name:       "permission denied",
			path:       "/teams/" + teamID.String() + "/members/" + memberID.String() + "/role",
			body:       `{"role":"admin"}`,
			serviceErr: team.ErrNoPermission,
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "service error",
			path:       "/teams/" + teamID.String() + "/members/" + memberID.String() + "/role",
			body:       `{"role":"admin"}`,
			serviceErr: errors.New("database error"),
			wantStatus: http.StatusInternalServerError,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			userID := uuid.New()
			app, handler := setupTeamHandlerTest(userID, &mockTeamService{updateMemberRoleFunc: func(_ context.Context, gotTeamID uuid.UUID, gotMemberID uuid.UUID, gotActorID uuid.UUID, gotRole models.TeamRole) error {
				if tt.name != "invalid team ID" && tt.name != "invalid user ID" && tt.name != "invalid body" {
					assert.Equal(t, teamID, gotTeamID)
					assert.Equal(t, memberID, gotMemberID)
					assert.Equal(t, userID, gotActorID)
					if tt.name == "change to member role" {
						assert.Equal(t, models.TeamRoleMember, gotRole)
					} else {
						assert.Equal(t, models.TeamRoleAdmin, gotRole)
					}
				}
				return tt.serviceErr
			}})
			app.Put("/teams/:id/members/:userId/role", handler.UpdateTeamMemberRole)

			resp := performTeamRequest(t, app, http.MethodPut, tt.path, tt.body)
			assert.Equal(t, tt.wantStatus, resp.StatusCode)
		})
	}
}

func TestTeamHandler_GetUserTeams(t *testing.T) {
	userID := uuid.New()

	tests := []struct {
		name       string
		service    *mockTeamService
		wantStatus int
		assertBody func(t *testing.T, body []byte)
	}{
		{
			name: "empty list",
			service: &mockTeamService{getUserTeamsFunc: func(_ context.Context, gotUserID uuid.UUID) ([]models.Team, error) {
				assert.Equal(t, userID, gotUserID)
				return nil, nil
			}},
			wantStatus: http.StatusOK,
			assertBody: func(t *testing.T, body []byte) {
				t.Helper()
				assert.JSONEq(t, "[]", string(body))
			},
		},
		{
			name: "returns user teams",
			service: &mockTeamService{getUserTeamsFunc: func(_ context.Context, gotUserID uuid.UUID) ([]models.Team, error) {
				assert.Equal(t, userID, gotUserID)
				return []models.Team{
					{ID: uuid.New(), Name: "Platform", CreatedBy: userID, MemberCount: 3},
					{ID: uuid.New(), Name: "Engineering", CreatedBy: uuid.New(), MemberCount: 8},
				}, nil
			}},
			wantStatus: http.StatusOK,
			assertBody: func(t *testing.T, body []byte) {
				t.Helper()
				var teams []models.Team
				require.NoError(t, json.Unmarshal(body, &teams))
				assert.Len(t, teams, 2)
				assert.Equal(t, "Platform", teams[0].Name)
				assert.Equal(t, 3, teams[0].MemberCount)
			},
		},
		{
			name: "service error",
			service: &mockTeamService{getUserTeamsFunc: func(context.Context, uuid.UUID) ([]models.Team, error) {
				return nil, errors.New("database error")
			}},
			wantStatus: http.StatusInternalServerError,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			app, handler := setupTeamHandlerTest(userID, tt.service)
			app.Get("/teams/mine", handler.GetUserTeams)

			resp := performTeamRequest(t, app, http.MethodGet, "/teams/mine", "")
			assert.Equal(t, tt.wantStatus, resp.StatusCode)

			if tt.assertBody != nil {
				body := readTeamResponseBody(t, resp)
				tt.assertBody(t, body)
			}
		})
	}
}

func TestTeamHandler_UpdateTeam(t *testing.T) {
	teamID := uuid.New()
	updatedName := "Platform Engineering"
	updatedDesc := "Core platform team"

	tests := []struct {
		name       string
		body       string
		service    *mockTeamService
		wantStatus int
		assertBody func(t *testing.T, body []byte)
	}{
		{
			name: "update name",
			body: `{"name":"` + updatedName + `"}`,
			service: &mockTeamService{updateFunc: func(_ context.Context, gotTeamID uuid.UUID, _ uuid.UUID, req models.UpdateTeamRequest) (*models.Team, error) {
				assert.Equal(t, teamID, gotTeamID)
				require.NotNil(t, req.Name)
				assert.Equal(t, updatedName, *req.Name)
				return &models.Team{ID: gotTeamID, Name: *req.Name}, nil
			}},
			wantStatus: http.StatusOK,
			assertBody: func(t *testing.T, body []byte) {
				t.Helper()
				var team models.Team
				require.NoError(t, json.Unmarshal(body, &team))
				assert.Equal(t, updatedName, team.Name)
			},
		},
		{
			name: "update description",
			body: `{"description":"` + updatedDesc + `"}`,
			service: &mockTeamService{updateFunc: func(_ context.Context, gotTeamID uuid.UUID, _ uuid.UUID, req models.UpdateTeamRequest) (*models.Team, error) {
				assert.Equal(t, teamID, gotTeamID)
				require.NotNil(t, req.Description)
				assert.Equal(t, updatedDesc, *req.Description)
				return &models.Team{ID: gotTeamID, Description: *req.Description}, nil
			}},
			wantStatus: http.StatusOK,
		},
		{
			name:       "invalid team ID",
			body:       `{"name":"NewName"}`,
			service:    &mockTeamService{},
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "invalid body",
			body:       `{"name":`,
			service:    &mockTeamService{},
			wantStatus: http.StatusBadRequest,
		},
		{
			name: "team not found",
			body: `{"name":"NewName"}`,
			service: &mockTeamService{updateFunc: func(context.Context, uuid.UUID, uuid.UUID, models.UpdateTeamRequest) (*models.Team, error) {
				return nil, team.ErrNotFound
			}},
			wantStatus: http.StatusNotFound,
		},
		{
			name: "permission denied",
			body: `{"name":"NewName"}`,
			service: &mockTeamService{updateFunc: func(context.Context, uuid.UUID, uuid.UUID, models.UpdateTeamRequest) (*models.Team, error) {
				return nil, team.ErrNoPermission
			}},
			wantStatus: http.StatusForbidden,
		},
		{
			name: "service error",
			body: `{"name":"NewName"}`,
			service: &mockTeamService{updateFunc: func(context.Context, uuid.UUID, uuid.UUID, models.UpdateTeamRequest) (*models.Team, error) {
				return nil, errors.New("database error")
			}},
			wantStatus: http.StatusInternalServerError,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			app, handler := setupTeamHandlerTest(uuid.New(), tt.service)
			app.Put("/teams/:id", handler.UpdateTeam)

			path := "/teams/" + teamID.String()
			if tt.name == "invalid team ID" {
				path = "/teams/not-a-uuid"
			}

			resp := performTeamRequest(t, app, http.MethodPut, path, tt.body)
			assert.Equal(t, tt.wantStatus, resp.StatusCode)

			if tt.assertBody != nil {
				body := readTeamResponseBody(t, resp)
				tt.assertBody(t, body)
			}
		})
	}
}
