package handlers

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAdminHandler_GetRateLimitStatus(t *testing.T) {
	ft := middleware.NewFailureTracker()
	defer ft.Stop()
	ft.RecordFailure("test-key")

	tests := []struct {
		name       string
		role       models.UserRole
		wantStatus int
		assertBody func(t *testing.T, body []byte)
	}{
		{
			name:       "ViewerForbidden",
			role:       models.UserRoleViewer,
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "AdminAllowed",
			role:       models.UserRoleAdmin,
			wantStatus: http.StatusOK,
			assertBody: func(t *testing.T, body []byte) {
				t.Helper()
				var status middleware.StatusResponse
				require.NoError(t, json.Unmarshal(body, &status))
				assert.Equal(t, 1, status.Total)
				assert.Len(t, status.Keys, 1)
				assert.Equal(t, "test-key", status.Keys[0].Key)
				assert.Equal(t, 1, status.Keys[0].Failures)
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			app := fiber.New()
			mockStore := new(test.MockStore)
			userID := uuid.New()
			mockStore.On("GetUser", userID).Return(&models.User{ID: userID, Role: tt.role}, nil).Once()

			h := NewAdminHandler(ft, mockStore)
			app.Get("/admin/ratelimit", func(c *fiber.Ctx) error {
				c.Locals("userID", userID)
				return h.GetRateLimitStatus(c)
			})

			req := httptest.NewRequest(http.MethodGet, "/admin/ratelimit", nil)
			req.Host = "localhost"
			resp, err := app.Test(req)
			require.NoError(t, err)
			assert.Equal(t, tt.wantStatus, resp.StatusCode)

			if tt.assertBody != nil {
				body, readErr := io.ReadAll(resp.Body)
				require.NoError(t, readErr)
				tt.assertBody(t, body)
			}

			mockStore.AssertExpectations(t)
		})
	}
}
