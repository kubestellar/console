package handlers

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/kubestellar/console/pkg/apis/v1alpha1"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/store"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/tools/clientcmd/api"
)

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
