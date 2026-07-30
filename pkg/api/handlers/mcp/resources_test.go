package mcp

import (
	"context"
	"testing"
	"time"

	"github.com/kubestellar/console/pkg/k8s"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestListClusterResources(t *testing.T) {
	t.Run("single cluster with items", func(t *testing.T) {
		ctx := context.Background()
		client := &k8s.MultiClusterClient{}
		cluster := "test-cluster"

		fetchFn := func(ctx context.Context, clusterName string) ([]string, error) {
			assert.Equal(t, cluster, clusterName)
			return []string{"item1", "item2"}, nil
		}

		items, errTracker, err := listClusterResources(ctx, client, cluster, fetchFn)
		require.NoError(t, err)
		assert.Len(t, items, 2)
		assert.Equal(t, []string{"item1", "item2"}, items)
		assert.Nil(t, errTracker)
	})

	t.Run("single cluster with nil result returns empty slice", func(t *testing.T) {
		ctx := context.Background()
		client := &k8s.MultiClusterClient{}
		cluster := "test-cluster"

		fetchFn := func(ctx context.Context, clusterName string) ([]string, error) {
			return nil, nil
		}

		items, errTracker, err := listClusterResources(ctx, client, cluster, fetchFn)
		require.NoError(t, err)
		assert.NotNil(t, items)
		assert.Len(t, items, 0)
		assert.Nil(t, errTracker)
	})

	t.Run("single cluster with error", func(t *testing.T) {
		ctx := context.Background()
		client := &k8s.MultiClusterClient{}
		cluster := "test-cluster"

		expectedErr := assert.AnError
		fetchFn := func(ctx context.Context, clusterName string) ([]string, error) {
			return nil, expectedErr
		}

		items, errTracker, err := listClusterResources(ctx, client, cluster, fetchFn)
		assert.Error(t, err)
		assert.Equal(t, expectedErr, err)
		assert.Nil(t, items)
		assert.Nil(t, errTracker)
	})

	t.Run("respects context timeout", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(context.Background(), 1*time.Millisecond)
		defer cancel()

		client := &k8s.MultiClusterClient{}
		cluster := "test-cluster"

		fetchFn := func(ctx context.Context, clusterName string) ([]string, error) {
			// Wait for context cancellation
			<-ctx.Done()
			return nil, ctx.Err()
		}

		// Give time for the context to expire
		time.Sleep(10 * time.Millisecond)

		items, _, err := listClusterResources(ctx, client, cluster, fetchFn)
		assert.Error(t, err)
		assert.Nil(t, items)
	})
}
