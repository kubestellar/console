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

func TestListMissions(t *testing.T) {
	tests := []struct {
		name       string
		query      string
		setupMock  func(*testpkg.MockStore, string)
		wantStatus int
		wantError  string
		checkBody  func(*testing.T, map[string]interface{})
	}{
		{
			name:  "success with missions",
			query: "",
			setupMock: func(m *testpkg.MockStore, userID string) {
				missions := []store.StellarMission{
					{
						ID:      uuid.NewString(),
						UserID:  userID,
						Name:    "Test Mission",
						Goal:    "Test goal",
						Enabled: true,
					},
				}
				m.On("ListStellarMissions", mock.Anything, userID, 50, 0).Return(missions, nil)
			},
			wantStatus: fiber.StatusOK,
			checkBody: func(t *testing.T, body map[string]interface{}) {
				items, ok := body["items"].([]interface{})
				require.True(t, ok, "items should be array")
				assert.Len(t, items, 1)
			},
		},
		{
			name:  "empty list",
			query: "",
			setupMock: func(m *testpkg.MockStore, userID string) {
				m.On("ListStellarMissions", mock.Anything, userID, 50, 0).Return([]store.StellarMission{}, nil)
			},
			wantStatus: fiber.StatusOK,
			checkBody: func(t *testing.T, body map[string]interface{}) {
				items, ok := body["items"].([]interface{})
				require.True(t, ok)
				assert.Len(t, items, 0)
			},
		},
		{
			name:  "store error",
			query: "",
			setupMock: func(m *testpkg.MockStore, userID string) {
				m.On("ListStellarMissions", mock.Anything, userID, 50, 0).Return(nil, assert.AnError)
			},
			wantStatus: fiber.StatusInternalServerError,
			wantError:  "failed to load missions",
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
			app.Get("/missions", handler.ListMissions)

			tt.setupMock(mockStore, userID)

			req := httptest.NewRequest("GET", "/missions"+tt.query, nil)
			resp, err := app.Test(req)
			require.NoError(t, err)
			defer resp.Body.Close()

			assert.Equal(t, tt.wantStatus, resp.StatusCode)

			var body map[string]interface{}
			err = json.NewDecoder(resp.Body).Decode(&body)
			require.NoError(t, err)

			if tt.wantError != "" {
				assert.Contains(t, body["error"], tt.wantError)
			}

			if tt.checkBody != nil {
				tt.checkBody(t, body)
			}

			mockStore.AssertExpectations(t)
		})
	}
}

func TestGetMission(t *testing.T) {
	tests := []struct {
		name       string
		missionID  string
		setupMock  func(*testpkg.MockStore, string, string)
		wantStatus int
		wantError  string
	}{
		{
			name:      "success",
			missionID: "mission-123",
			setupMock: func(m *testpkg.MockStore, userID, missionID string) {
				mission := &store.StellarMission{
					ID:     missionID,
					UserID: userID,
					Name:   "Test Mission",
					Goal:   "Test goal",
				}
				m.On("GetStellarMission", mock.Anything, userID, missionID).Return(mission, nil)
			},
			wantStatus: fiber.StatusOK,
		},
		{
			name:      "not found",
			missionID: "nonexistent",
			setupMock: func(m *testpkg.MockStore, userID, missionID string) {
				m.On("GetStellarMission", mock.Anything, userID, missionID).Return(nil, nil)
			},
			wantStatus: fiber.StatusNotFound,
			wantError:  "mission not found",
		},
		{
			name:      "store error",
			missionID: "mission-123",
			setupMock: func(m *testpkg.MockStore, userID, missionID string) {
				m.On("GetStellarMission", mock.Anything, userID, missionID).Return(nil, assert.AnError)
			},
			wantStatus: fiber.StatusInternalServerError,
			wantError:  "failed to load mission",
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
			app.Get("/missions/:id", handler.GetMission)

			tt.setupMock(mockStore, userID, tt.missionID)

			req := httptest.NewRequest("GET", "/missions/"+tt.missionID, nil)
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

func TestDeleteMission(t *testing.T) {
	tests := []struct {
		name       string
		missionID  string
		setupMock  func(*testpkg.MockStore, string, string)
		wantStatus int
		wantError  string
	}{
		{
			name:      "success",
			missionID: "mission-123",
			setupMock: func(m *testpkg.MockStore, userID, missionID string) {
				m.On("DeleteStellarMission", mock.Anything, userID, missionID).Return(nil)
			},
			wantStatus: fiber.StatusNoContent,
		},
		{
			name:      "store error",
			missionID: "mission-123",
			setupMock: func(m *testpkg.MockStore, userID, missionID string) {
				m.On("DeleteStellarMission", mock.Anything, userID, missionID).Return(assert.AnError)
			},
			wantStatus: fiber.StatusInternalServerError,
			wantError:  "failed to delete mission",
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
			app.Delete("/missions/:id", handler.DeleteMission)

			tt.setupMock(mockStore, userID, tt.missionID)

			req := httptest.NewRequest("DELETE", "/missions/"+tt.missionID, nil)
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
