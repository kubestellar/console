package handlers

import (
	"context"
	"net/http"
	"os"
	"path/filepath"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/store"
)

const (
	stellarActionExecuteFiberTimeoutMs = 5000
	stellarActionExecuteTestDBDir      = "testdata"
)

func newStellarActionExecuteTestApp(t *testing.T, role models.UserRole) *fiber.App {
	t.Helper()

	require.NoError(t, os.MkdirAll(stellarActionExecuteTestDBDir, 0o755))

	dbPath := filepath.Join(stellarActionExecuteTestDBDir, "stellar-actions-rbac-"+uuid.NewString()+".db")
	sqlStore, err := store.NewSQLiteStore(dbPath)
	require.NoError(t, err)
	t.Cleanup(func() {
		_ = sqlStore.Close()
		_ = os.Remove(dbPath)
		_ = os.Remove(dbPath + "-wal")
		_ = os.Remove(dbPath + "-shm")
	})

	testUserID := uuid.New()
	require.NoError(t, sqlStore.CreateUser(context.Background(), &models.User{
		ID:          testUserID,
		GitHubLogin: "stellar-actions-rbac-test",
		Role:        role,
	}))

	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", testUserID)
		return c.Next()
	})

	handler := NewStellarHandler(sqlStore, nil)
	app.Post("/api/stellar/actions/execute", handler.ExecuteAction)

	return app
}

func TestStellarActionExecute_RBAC(t *testing.T) {
	tests := []struct {
		name       string
		role       models.UserRole
		wantStatus int
	}{
		{name: "ViewerForbidden", role: models.UserRoleViewer, wantStatus: http.StatusForbidden},
		{name: "EditorAllowed", role: models.UserRoleEditor, wantStatus: http.StatusBadRequest},
		{name: "AdminAllowed", role: models.UserRoleAdmin, wantStatus: http.StatusBadRequest},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			app := newStellarActionExecuteTestApp(t, tt.role)

			req, err := http.NewRequest(http.MethodPost, "/api/stellar/actions/execute", http.NoBody)
			require.NoError(t, err)
			req.Header.Set("Content-Type", "application/json")

			resp, err := app.Test(req, stellarActionExecuteFiberTimeoutMs)
			require.NoError(t, err)
			defer resp.Body.Close()

			assert.Equal(t, tt.wantStatus, resp.StatusCode)
		})
	}
}
