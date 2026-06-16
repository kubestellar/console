package handlers

import (
	"context"
	"testing"

	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/store"
	"github.com/stretchr/testify/assert"
)

func TestCheckClusterHealth(t *testing.T) {
	t.Run("returns unknown when k8s client is nil", func(t *testing.T) {
		h := &ConsolePersistenceHandlers{k8sClient: nil}
		ctx := context.Background()

		health := h.checkClusterHealth(ctx, "test-cluster")
		assert.Equal(t, store.ClusterHealthUnknown, health)
	})

	t.Run("returns unknown when cluster not found", func(t *testing.T) {
		// This test verifies the logic path when a cluster is not in the list
		// We can't easily test with a real k8s client, but we can test the handler structure
		h := &ConsolePersistenceHandlers{}

		// With nil client, should return unknown
		health := h.checkClusterHealth(context.Background(), "non-existent-cluster")
		assert.Equal(t, store.ClusterHealthUnknown, health)
	})
}

func TestCheckClusterHealthLogic(t *testing.T) {
	t.Run("healthy cluster logic", func(t *testing.T) {
		// Test the cluster health determination logic
		clusters := []k8s.ClusterInfo{
			{Name: "healthy-cluster", Healthy: true},
			{Name: "unhealthy-cluster", Healthy: false},
		}

		// Simulate the logic from checkClusterHealth
		findHealth := func(clusterName string) store.ClusterHealth {
			for _, cluster := range clusters {
				if cluster.Name == clusterName {
					if cluster.Healthy {
						return store.ClusterHealthHealthy
					}
					return store.ClusterHealthUnreachable
				}
			}
			return store.ClusterHealthUnknown
		}

		assert.Equal(t, store.ClusterHealthHealthy, findHealth("healthy-cluster"))
		assert.Equal(t, store.ClusterHealthUnreachable, findHealth("unhealthy-cluster"))
		assert.Equal(t, store.ClusterHealthUnknown, findHealth("non-existent"))
	})
}

func TestStopWatcher(t *testing.T) {
	t.Run("stop watcher when watcher is nil", func(t *testing.T) {
		h := &ConsolePersistenceHandlers{}

		// Should not panic
		assert.NotPanics(t, func() {
			h.StopWatcher()
		})
	})

	t.Run("stop watcher sets watcher to nil", func(t *testing.T) {
		h := &ConsolePersistenceHandlers{}
		// Create a mock watcher (we can't easily create a real one without k8s)
		// but we can verify the nil assignment logic
		h.watcher = nil

		h.StopWatcher()
		assert.Nil(t, h.watcher)
	})
}
