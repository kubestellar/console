package stellar

import (
	"encoding/json"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/api/middleware"
	testpkg "github.com/kubestellar/console/pkg/test"
	"github.com/kubestellar/console/pkg/store"
)

func TestListExecutions(t *testing.T) {
	tests := []struct {
		name       string
		query      string
		setupMock  func(*testpkg.MockStore, string)
		wantStatus int
		wantError  string
	}{
		{
			name:  "success with executions",
			query: "",
			setupMock: func(m *testpkg.MockStore, userID string) {
				executions := []store.StellarExecution{
					{
						ID:        uuid.NewString(),
						UserID:    userID,
						MissionID: "mission-123",
						Status:    "running",
					},
				}
				m.On("ListStellarExecutions", mock.Anything, userID, "", "", 50, 0).Return(executions, nil)
			},
			wantStatus: fiber.StatusOK,
		},
		{
			name:  "success with mission_id filter",
			query: "?mission_id=mission-123",
			setupMock: func(m *testpkg.MockStore, userID string) {
				m.On("ListStellarExecutions", mock.Anything, userID, "mission-123", "", 50, 0).Return([]store.StellarExecution{}, nil)
			},
			wantStatus: fiber.StatusOK,
		},
		{
			name:  "store error",
			query: "",
			setupMock: func(m *testpkg.MockStore, userID string) {
				m.On("ListStellarExecutions", mock.Anything, userID, "", "", 50, 0).Return(nil, assert.AnError)
			},
			wantStatus: fiber.StatusInternalServerError,
			wantError:  "failed to load executions",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockStore := new(testpkg.MockStore)
			userID := uuid.NewString()

			app := fiber.New()
			app.Use(func(c *fiber.Ctx) error {
				c.Locals(middleware.UserIDKey, userID)
				return c.Next()
			})

			handler := &Handler{store: mockStore}
			app.Get("/executions", handler.ListExecutions)

			tt.setupMock(mockStore, userID)

			req := httptest.NewRequest("GET", "/executions"+tt.query, nil)
			resp, err := app.Test(req)
			require.NoError(t, err)
			defer resp.Body.Close()

			assert.Equal(t, tt.wantStatus, resp.StatusCode)

			if tt.wantError != "" {
				var body map[string]interface{}
				err = json.NewDecoder(resp.Body).Decode(&body)
				require.NoError(t, err)
				assert.Contains(t, body["error"], tt.wantError)
			}

			mockStore.AssertExpectations(t)
		})
	}
}

func TestGetExecution(t *testing.T) {
	tests := []struct {
		name        string
		executionID string
		setupMock   func(*testpkg.MockStore, string, string)
		wantStatus  int
		wantError   string
	}{
		{
			name:        "success",
			executionID: "exec-123",
			setupMock: func(m *testpkg.MockStore, userID, executionID string) {
				execution := &store.StellarExecution{
					ID:        executionID,
					UserID:    userID,
					MissionID: "mission-123",
					Status:    "running",
				}
				m.On("GetStellarExecution", mock.Anything, userID, executionID).Return(execution, nil)
			},
			wantStatus: fiber.StatusOK,
		},
		{
			name:        "not found",
			executionID: "nonexistent",
			setupMock: func(m *testpkg.MockStore, userID, executionID string) {
				m.On("GetStellarExecution", mock.Anything, userID, executionID).Return(nil, nil)
			},
			wantStatus: fiber.StatusNotFound,
			wantError:  "execution not found",
		},
		{
			name:        "store error",
			executionID: "exec-123",
			setupMock: func(m *testpkg.MockStore, userID, executionID string) {
				m.On("GetStellarExecution", mock.Anything, userID, executionID).Return(nil, assert.AnError)
			},
			wantStatus: fiber.StatusInternalServerError,
			wantError:  "failed to load execution",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockStore := new(testpkg.MockStore)
			userID := uuid.NewString()

			app := fiber.New()
			app.Use(func(c *fiber.Ctx) error {
				c.Locals(middleware.UserIDKey, userID)
				return c.Next()
			})

			handler := &Handler{store: mockStore}
			app.Get("/executions/:id", handler.GetExecution)

			tt.setupMock(mockStore, userID, tt.executionID)

			req := httptest.NewRequest("GET", "/executions/"+tt.executionID, nil)
			resp, err := app.Test(req)
			require.NoError(t, err)
			defer resp.Body.Close()

			assert.Equal(t, tt.wantStatus, resp.StatusCode)

			if tt.wantError != "" {
				var body map[string]interface{}
				err = json.NewDecoder(resp.Body).Decode(&body)
				require.NoError(t, err)
				assert.Contains(t, body["error"], tt.wantError)
			}

			mockStore.AssertExpectations(t)
		})
	}
}
