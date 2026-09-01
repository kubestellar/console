package handlers

import (
	"context"
	"testing"

	"github.com/kubestellar/console/pkg/store"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestStartWatcherErrorBranches covers the two error branches of
// StartWatcher that were previously untested, bringing the function
// from 27.8% coverage toward full branch coverage.
//
// The existing TestStartWatcher covered only:
//   - persistence disabled -> returns nil
//   - persistence enabled but k8sClient nil -> returns noClusterAccessMsg
//
// These new sub-tests cover:
//   - persistence enabled, k8sClient set, but GetActiveCluster fails
//     (no health checker registered so all clusters report Unknown and
//     GetStatus.Active is false).
//   - persistence enabled, k8sClient set, health checker returns Healthy
//     for a cluster not present in the kubeconfig; GetDynamicClient
//     returns the "no configuration has been provided" error from
//     client-go's clientcmd.
func TestStartWatcherErrorBranches(t *testing.T) {
	t.Run("fails when GetActiveCluster errors (no health checker)", func(t *testing.T) {
		k8sClient := newStoreBackedK8sClient(t)
		persistenceStore := store.NewPersistenceStore("")
		require.NoError(t, persistenceStore.UpdateConfig(store.PersistenceConfig{
			Enabled:        true,
			PrimaryCluster: "test-cluster",
			Namespace:      store.DefaultNamespace,
			SyncMode:       "primary-only",
		}))
		// No SetClusterHealthChecker call — every cluster reports
		// ClusterHealthUnknown, so GetStatus.Active is false and
		// GetActiveCluster returns "persistence not active: ...".

		handler := &ConsolePersistenceHandlers{
			persistenceStore: persistenceStore,
			k8sClient:        k8sClient,
		}

		err := handler.StartWatcher(context.Background())
		require.Error(t, err)
		assert.Contains(t, err.Error(), "persistence not active")
		assert.Nil(t, handler.watcher, "watcher should not be created when GetActiveCluster errors")
	})

	t.Run("fails when GetDynamicClient errors for a cluster missing from kubeconfig", func(t *testing.T) {
		k8sClient := newStoreBackedK8sClient(t)
		persistenceStore := store.NewPersistenceStore("")
		// Register a permissive health checker so GetStatus reports the
		// primary as healthy and GetActiveCluster returns "missing-cluster".
		persistenceStore.SetClusterHealthChecker(func(_ context.Context, _ string) store.ClusterHealth {
			return store.ClusterHealthHealthy
		})
		require.NoError(t, persistenceStore.UpdateConfig(store.PersistenceConfig{
			Enabled:        true,
			PrimaryCluster: "missing-cluster",
			Namespace:      store.DefaultNamespace,
			SyncMode:       "primary-only",
		}))

		handler := &ConsolePersistenceHandlers{
			persistenceStore: persistenceStore,
			k8sClient:        k8sClient,
		}

		err := handler.StartWatcher(context.Background())
		require.Error(t, err)
		// The error surfaces from client-go's clientcmd loader wrapped by
		// GetDynamicClient. Assert on the cluster name (which the wrapper
		// prepends) so this is robust to upstream string tweaks.
		assert.Contains(t, err.Error(), "missing-cluster")
		assert.Nil(t, handler.watcher, "watcher should not be created when GetDynamicClient errors")
	})
}
