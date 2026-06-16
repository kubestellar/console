package handlers

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/apis/v1alpha1"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/store"
	pkgtest "github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/tools/clientcmd/api"
)

const requireAdminRoute = "/require-admin"

func newRequireAdminTestApp(t *testing.T, handler *ConsolePersistenceHandlers, userID uuid.UUID) *fiber.App {
	t.Helper()

	app := fiber.New()
	app.Get(requireAdminRoute, func(c *fiber.Ctx) error {
		c.Locals("userID", userID)
		if err := handler.RequireAdmin(c); err != nil {
			return err
		}
		return c.SendStatus(fiber.StatusNoContent)
	})

	return app
}

func performRequireAdminRequest(t *testing.T, app *fiber.App) (int, string) {
	t.Helper()

	req := httptest.NewRequest(http.MethodGet, requireAdminRoute, nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)

	return resp.StatusCode, string(body)
}

func TestRequireAdmin(t *testing.T) {
	adminUserID := uuid.New()
	viewerUserID := uuid.New()
	missingUserID := uuid.New()
	errorUserID := uuid.New()

	mockStore := new(pkgtest.MockStore)
	mockStore.On("GetUser", adminUserID).Return(&models.User{ID: adminUserID, Role: models.UserRoleAdmin}, nil).Once()
	mockStore.On("GetUser", viewerUserID).Return(&models.User{ID: viewerUserID, Role: models.UserRoleViewer}, nil).Once()
	mockStore.On("GetUser", missingUserID).Return((*models.User)(nil), nil).Once()
	mockStore.On("GetUser", errorUserID).Return((*models.User)(nil), assert.AnError).Once()

	tests := []struct {
		name          string
		handler       *ConsolePersistenceHandlers
		userID        uuid.UUID
		wantStatus    int
		wantBodyParts []string
	}{
		{
			name:       "allows requests when user store is not configured",
			handler:    &ConsolePersistenceHandlers{},
			userID:     uuid.New(),
			wantStatus: http.StatusNoContent,
		},
		{
			name:       "allows admin user",
			handler:    &ConsolePersistenceHandlers{userStore: mockStore},
			userID:     adminUserID,
			wantStatus: http.StatusNoContent,
		},
		{
			name:          "rejects non admin user",
			handler:       &ConsolePersistenceHandlers{userStore: mockStore},
			userID:        viewerUserID,
			wantStatus:    http.StatusForbidden,
			wantBodyParts: []string{"Console admin access required"},
		},
		{
			name:          "rejects missing user",
			handler:       &ConsolePersistenceHandlers{userStore: mockStore},
			userID:        missingUserID,
			wantStatus:    http.StatusForbidden,
			wantBodyParts: []string{"Console admin access required"},
		},
		{
			name:          "surfaces store errors as internal server errors",
			handler:       &ConsolePersistenceHandlers{userStore: mockStore},
			userID:        errorUserID,
			wantStatus:    http.StatusInternalServerError,
			wantBodyParts: []string{"Failed to verify admin role"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			app := newRequireAdminTestApp(t, tt.handler, tt.userID)
			statusCode, body := performRequireAdminRequest(t, app)

			assert.Equal(t, tt.wantStatus, statusCode)
			for _, wantBodyPart := range tt.wantBodyParts {
				assert.Contains(t, body, wantBodyPart)
			}
		})
	}

	mockStore.AssertExpectations(t)
}

func TestCheckClusterHealth(t *testing.T) {
	freshK8sClient := newStoreBackedK8sClient(t)

	tests := []struct {
		name        string
		handler     *ConsolePersistenceHandlers
		clusterName string
		want        store.ClusterHealth
	}{
		{
			name:        "returns unknown when k8s client is missing",
			handler:     &ConsolePersistenceHandlers{},
			clusterName: "test-cluster",
			want:        store.ClusterHealthUnknown,
		},
		{
			name:        "returns unreachable when cluster exists but is not marked healthy",
			handler:     &ConsolePersistenceHandlers{k8sClient: freshK8sClient},
			clusterName: "test-cluster",
			want:        store.ClusterHealthUnreachable,
		},
		{
			name:        "returns unknown for clusters missing from kubeconfig",
			handler:     &ConsolePersistenceHandlers{k8sClient: freshK8sClient},
			clusterName: "does-not-exist",
			want:        store.ClusterHealthUnknown,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := tt.handler.checkClusterHealth(context.Background(), tt.clusterName)
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestGetClusterClient(t *testing.T) {
	freshK8sClient := newStoreBackedK8sClient(t)

	tests := []struct {
		name          string
		handler       *ConsolePersistenceHandlers
		clusterName   string
		wantErr       string
		wantConfigURL string
	}{
		{
			name:        "returns service unavailable when cluster access is missing",
			handler:     &ConsolePersistenceHandlers{},
			clusterName: "test-cluster",
			wantErr:     noClusterAccessMsg,
		},
		{
			name:          "returns client and config for known cluster",
			handler:       &ConsolePersistenceHandlers{k8sClient: freshK8sClient},
			clusterName:   "test-cluster",
			wantConfigURL: "https://test-cluster:6443",
		},
		{
			name:        "returns error for unknown cluster context",
			handler:     &ConsolePersistenceHandlers{k8sClient: freshK8sClient},
			clusterName: "missing-cluster",
			wantErr:     "missing-cluster",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			client, config, err := tt.handler.getClusterClient(tt.clusterName)
			if tt.wantErr != "" {
				require.Error(t, err)
				assert.Contains(t, err.Error(), tt.wantErr)
				assert.Nil(t, client)
				assert.Nil(t, config)
				return
			}

			require.NoError(t, err)
			assert.NotNil(t, client)
			assert.NotNil(t, config)
			assert.Equal(t, tt.wantConfigURL, config.Host)
		})
	}
}

func TestStartWatcher(t *testing.T) {
	t.Run("skips watcher start when persistence is disabled", func(t *testing.T) {
		persistenceStore := store.NewPersistenceStore("")
		handler := &ConsolePersistenceHandlers{persistenceStore: persistenceStore}

		err := handler.StartWatcher(context.Background())
		require.NoError(t, err)
		assert.Nil(t, handler.watcher)
	})

	t.Run("fails when persistence is enabled but no cluster client is configured", func(t *testing.T) {
		persistenceStore := store.NewPersistenceStore("")
		err := persistenceStore.UpdateConfig(store.PersistenceConfig{
			Enabled:        true,
			PrimaryCluster: "test-cluster",
			Namespace:      store.DefaultNamespace,
			SyncMode:       "primary-only",
		})
		require.NoError(t, err)

		handler := &ConsolePersistenceHandlers{persistenceStore: persistenceStore}
		err = handler.StartWatcher(context.Background())
		require.Error(t, err)
		assert.Contains(t, err.Error(), noClusterAccessMsg)
	})
}

func TestStopWatcherWithNilWatcher(t *testing.T) {
	handler := &ConsolePersistenceHandlers{}
	assert.NotPanics(t, func() {
		handler.StopWatcher()
	})
}

func TestSetTerminalStatusUsesHighestExistingRevision(t *testing.T) {
	handler := &ConsolePersistenceHandlers{}
	startedAt := nowMetaTime()
	completedAt := nowMetaTime()
	workloadDeployment := newWorkloadDeploymentWithHistory(startedAt, completedAt)

	updateCalls := 0
	handler.setTerminalStatus(workloadDeployment, "Complete", "deployment finished", func(*v1alpha1.WorkloadDeployment) {
		updateCalls++
	})

	require.Equal(t, 1, updateCalls)
	require.Len(t, workloadDeployment.Status.History, 3)
	assert.Equal(t, 8, workloadDeployment.Status.History[2].Revision)
	assert.Equal(t, startedAt, workloadDeployment.Status.History[2].StartedAt)
	assert.Equal(t, "deployment finished", workloadDeployment.Status.History[2].Message)
	assert.NotNil(t, workloadDeployment.Status.CompletedAt)
	assert.Equal(t, "Complete", workloadDeployment.Status.Phase)
}

func newStoreBackedK8sClient(t *testing.T) *k8s.MultiClusterClient {
	t.Helper()

	tempDir := t.TempDir()
	rawConfig := api.Config{
		Clusters: map[string]*api.Cluster{
			"test-cluster": {Server: "https://test-cluster:6443"},
		},
		Contexts: map[string]*api.Context{
			"test-cluster": {Cluster: "test-cluster", AuthInfo: "test-user"},
		},
		AuthInfos: map[string]*api.AuthInfo{
			"test-user": {},
		},
		CurrentContext: "test-cluster",
	}
	kubeconfigPath := filepath.Join(tempDir, "kubeconfig")
	require.NoError(t, clientcmd.WriteToFile(rawConfig, kubeconfigPath))

	client, err := k8s.NewMultiClusterClient(kubeconfigPath)
	require.NoError(t, err)

	return client
}

func nowMetaTime() *metav1.Time {
	now := metav1.Now()
	return &now
}

func newWorkloadDeploymentWithHistory(startedAt, completedAt *metav1.Time) *v1alpha1.WorkloadDeployment {
	return &v1alpha1.WorkloadDeployment{
		Status: v1alpha1.WorkloadDeploymentStatus{
			Phase:     "InProgress",
			StartedAt: startedAt,
			History: []v1alpha1.DeploymentHistoryEntry{
				{Revision: 2, StartedAt: startedAt, CompletedAt: completedAt, Phase: "Failed", Message: "first"},
				{Revision: 7, StartedAt: startedAt, CompletedAt: completedAt, Phase: "Failed", Message: "second"},
			},
		},
	}
}
