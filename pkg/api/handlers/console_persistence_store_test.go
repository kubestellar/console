package handlers

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/rest"
)

const testUserID = "00000000-0000-0000-0000-000000000001"

// MockPersistenceStore is a mock implementation of store.PersistenceStore
type MockPersistenceStore struct {
	mock.Mock
}

func (m *MockPersistenceStore) IsEnabled() bool {
	args := m.Called()
	return args.Bool(0)
}

func (m *MockPersistenceStore) GetActiveCluster(ctx context.Context) (string, error) {
	args := m.Called(ctx)
	return args.String(0), args.Error(1)
}

func (m *MockPersistenceStore) GetNamespace() string {
	args := m.Called()
	return args.String(0)
}

func (m *MockPersistenceStore) GetActiveClient(ctx context.Context) (dynamic.Interface, *rest.Config, error) {
	args := m.Called(ctx)
	if args.Get(0) == nil {
		return nil, nil, args.Error(2)
	}
	if args.Get(1) == nil {
		return args.Get(0).(dynamic.Interface), nil, args.Error(2)
	}
	return args.Get(0).(dynamic.Interface), args.Get(1).(*rest.Config), args.Error(2)
}

func TestRequireAdmin(t *testing.T) {
	tests := []struct {
		name          string
		setupUserID   bool
		userStoreNil  bool
		mockUser      *models.User
		mockError     error
		expectedCode  int
		expectedError string
	}{
		{
			name:         "NoUserStore_SkipCheck",
			userStoreNil: true,
			setupUserID:  true,
			expectedCode: http.StatusOK,
		},
		{
			name:         "AdminUser_Allowed",
			setupUserID:  true,
			mockUser:     &models.User{ID: uuid.MustParse(testUserID), Role: models.UserRoleAdmin},
			mockError:    nil,
			expectedCode: http.StatusOK,
		},
		{
			name:          "ViewerUser_Forbidden",
			setupUserID:   true,
			mockUser:      &models.User{ID: uuid.MustParse(testUserID), Role: models.UserRoleViewer},
			mockError:     nil,
			expectedCode:  http.StatusForbidden,
			expectedError: "Console admin access required",
		},
		{
			name:          "NilUser_Forbidden",
			setupUserID:   true,
			mockUser:      nil,
			mockError:     nil,
			expectedCode:  http.StatusForbidden,
			expectedError: "Console admin access required",
		},
		{
			name:          "DBError_InternalServerError",
			setupUserID:   true,
			mockError:     errors.New("database connection failed"),
			expectedCode:  http.StatusInternalServerError,
			expectedError: "Failed to verify admin role",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			app := fiber.New()
			var mockStore *test.MockStore
			var h *ConsolePersistenceHandlers

			if tt.userStoreNil {
				h = &ConsolePersistenceHandlers{}
			} else {
				mockStore = new(test.MockStore)
				userID := uuid.MustParse(testUserID)
				mockStore.On("GetUser", userID).Return(tt.mockUser, tt.mockError).Once()
				h = &ConsolePersistenceHandlers{userStore: mockStore}
			}

			app.Get("/test", func(c *fiber.Ctx) error {
				if tt.setupUserID {
					c.Locals("userID", uuid.MustParse(testUserID))
				}
				err := h.RequireAdmin(c)
				if err != nil {
					return err
				}
				return c.SendStatus(http.StatusOK)
			})

			req := httptest.NewRequest(http.MethodGet, "/test", nil)
			req.Host = "localhost"
			resp, err := app.Test(req)
			require.NoError(t, err)
			assert.Equal(t, tt.expectedCode, resp.StatusCode)

			if !tt.userStoreNil && mockStore != nil {
				mockStore.AssertExpectations(t)
			}
		})
	}
}

func TestStopWatcher(t *testing.T) {
	t.Run("stop watcher when watcher is nil", func(t *testing.T) {
		h := &ConsolePersistenceHandlers{}
		assert.NotPanics(t, func() {
			h.StopWatcher()
		})
	})

	t.Run("stop watcher sets watcher to nil", func(t *testing.T) {
		h := &ConsolePersistenceHandlers{}
		h.watcher = nil
		h.StopWatcher()
		assert.Nil(t, h.watcher)
	})
}
