package handlers

import (
	"context"
	"errors"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/apis/v1alpha1"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// ---------- requireAdmin ----------

func TestRequireAdminHelpers(t *testing.T) {
	cases := []struct {
		name       string
		userStore  func(uid uuid.UUID) *test.MockStore
		nilStore   bool
		wantStatus int
		wantBody   string
	}{
		{
			name:       "nil userStore bypasses check (dev/demo mode)",
			nilStore:   true,
			wantStatus: 200,
			wantBody:   "ok",
		},
		{
			name: "admin user is allowed",
			userStore: func(uid uuid.UUID) *test.MockStore {
				ms := new(test.MockStore)
				ms.On("GetUser", uid).Return(&models.User{
					ID:   uid,
					Role: "admin",
				}, nil)
				return ms
			},
			wantStatus: 200,
			wantBody:   "ok",
		},
		{
			name: "non admin user is forbidden",
			userStore: func(uid uuid.UUID) *test.MockStore {
				ms := new(test.MockStore)
				ms.On("GetUser", uid).Return(&models.User{
					ID:   uid,
					Role: "viewer",
				}, nil)
				return ms
			},
			wantStatus: 403,
		},
		{
			name: "nil user is forbidden",
			userStore: func(uid uuid.UUID) *test.MockStore {
				ms := new(test.MockStore)
				ms.On("GetUser", uid).Return(nil, nil)
				return ms
			},
			wantStatus: 403,
		},
		{
			name: "store error returns 500",
			userStore: func(uid uuid.UUID) *test.MockStore {
				ms := new(test.MockStore)
				ms.On("GetUser", uid).Return(nil, errors.New("db down"))
				return ms
			},
			wantStatus: 500,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			userID := uuid.New()

			h := &ConsolePersistenceHandlers{}
			if !tc.nilStore {
				h.userStore = tc.userStore(userID)
			}

			app := fiber.New(fiber.Config{
				ErrorHandler: func(c *fiber.Ctx, err error) error {
					code := fiber.StatusInternalServerError
					var fiberErr *fiber.Error
					if errors.As(err, &fiberErr) {
						code = fiberErr.Code
					}
					return c.Status(code).JSON(fiber.Map{"error": err.Error()})
				},
			})
			app.Use(func(c *fiber.Ctx) error {
				c.Locals("userID", userID)
				return c.Next()
			})
			app.Get("/test", func(c *fiber.Ctx) error {
				if err := h.RequireAdmin(c); err != nil {
					return err
				}
				return c.SendString("ok")
			})

			req := httptest.NewRequest("GET", "/test", nil)
			req.Host = "localhost"
			resp, err := app.Test(req)
			require.NoError(t, err)
			assert.Equal(t, tc.wantStatus, resp.StatusCode)
		})
	}
}

// ---------- setTerminalStatus ----------

func TestSetTerminalStatus(t *testing.T) {
	cases := []struct {
		name            string
		initialHistory  []v1alpha1.DeploymentHistoryEntry
		phase           string
		message         string
		wantRevision    int
		wantHistoryLen  int
		wantUpdateCalls int
	}{
		{
			name:            "empty history gets revision 1",
			initialHistory:  nil,
			phase:           "Complete",
			message:         "all done",
			wantRevision:    1,
			wantHistoryLen:  1,
			wantUpdateCalls: 1,
		},
		{
			name: "increments max existing revision",
			initialHistory: []v1alpha1.DeploymentHistoryEntry{
				{Revision: 1, Phase: "Failed"},
				{Revision: 3, Phase: "Failed"},
			},
			phase:           "Complete",
			message:         "success",
			wantRevision:    4,
			wantHistoryLen:  3,
			wantUpdateCalls: 1,
		},
		{
			name:            "caps history at maxDeploymentHistory",
			initialHistory:  makeHistoryEntries(maxDeploymentHistory),
			phase:           "Failed",
			message:         "cap test",
			wantRevision:    maxDeploymentHistory + 1,
			wantHistoryLen:  maxDeploymentHistory,
			wantUpdateCalls: 1,
		},
		{
			name:            "oversized history trimmed to max",
			initialHistory:  makeHistoryEntries(maxDeploymentHistory + 10),
			phase:           "Failed",
			message:         "overflow",
			wantRevision:    maxDeploymentHistory + 11,
			wantHistoryLen:  maxDeploymentHistory,
			wantUpdateCalls: 1,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			h := &ConsolePersistenceHandlers{}
			wd := &v1alpha1.WorkloadDeployment{
				ObjectMeta: metav1.ObjectMeta{Name: "test-wd"},
				Status: v1alpha1.WorkloadDeploymentStatus{
					History: tc.initialHistory,
				},
			}

			updateCalls := 0
			h.setTerminalStatus(wd, tc.phase, tc.message, func(w *v1alpha1.WorkloadDeployment) {
				updateCalls++
			})

			assert.Equal(t, tc.phase, wd.Status.Phase)
			assert.NotNil(t, wd.Status.CompletedAt)
			require.Len(t, wd.Status.History, tc.wantHistoryLen)
			assert.Equal(t, tc.wantUpdateCalls, updateCalls)

			// Check the last entry has the expected revision
			lastEntry := wd.Status.History[len(wd.Status.History)-1]
			assert.Equal(t, tc.wantRevision, lastEntry.Revision)
			assert.Equal(t, tc.phase, lastEntry.Phase)
			assert.Equal(t, tc.message, lastEntry.Message)
		})
	}
}

// makeHistoryEntries creates n history entries with sequential revisions.
func makeHistoryEntries(n int) []v1alpha1.DeploymentHistoryEntry {
	entries := make([]v1alpha1.DeploymentHistoryEntry, n)
	for i := range entries {
		entries[i] = v1alpha1.DeploymentHistoryEntry{
			Revision: i + 1,
			Phase:    "Failed",
			Message:  "historic failure",
		}
	}
	return entries
}

// ---------- checkClusterHealth ----------

func TestCheckClusterHealth_NilClient(t *testing.T) {
	h := &ConsolePersistenceHandlers{k8sClient: nil}
	result := h.checkClusterHealth(context.Background(), "any-cluster")
	assert.Equal(t, "unknown", string(result))
}
