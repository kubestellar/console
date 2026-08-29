package store

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/require"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/dynamic"
	dynfake "k8s.io/client-go/dynamic/fake"
	"k8s.io/client-go/rest"
)

// TestPersistenceStore_SetClientFactoryAndGetActiveClient covers the
// previously-uncovered SetClientFactory setter and the happy / factory-error
// branches of GetActiveClient.
func TestPersistenceStore_SetClientFactoryAndGetActiveClient(t *testing.T) {
	ctx := context.Background()
	scheme := runtime.NewScheme()

	newStore := func() *PersistenceStore {
		ps := NewPersistenceStore("")
		ps.config.Enabled = true
		ps.config.PrimaryCluster = "primary"
		ps.SetClusterHealthChecker(func(_ context.Context, _ string) ClusterHealth {
			return ClusterHealthHealthy
		})
		return ps
	}

	t.Run("factory success returns client and cluster name", func(t *testing.T) {
		ps := newStore()
		fakeDyn := dynfake.NewSimpleDynamicClient(scheme)

		var gotCluster string
		ps.SetClientFactory(func(clusterName string) (dynamic.Interface, *rest.Config, error) {
			gotCluster = clusterName
			return fakeDyn, &rest.Config{}, nil
		})

		client, cluster, err := ps.GetActiveClient(ctx)
		require.NoError(t, err)
		require.Equal(t, "primary", cluster)
		require.Equal(t, "primary", gotCluster)
		require.NotNil(t, client)
	})

	t.Run("factory error is wrapped with cluster name", func(t *testing.T) {
		ps := newStore()
		ps.SetClientFactory(func(_ string) (dynamic.Interface, *rest.Config, error) {
			return nil, nil, errors.New("boom")
		})

		_, _, err := ps.GetActiveClient(ctx)
		require.Error(t, err)
		require.Contains(t, err.Error(), "failed to get client for cluster primary")
		require.Contains(t, err.Error(), "boom")
	})

	t.Run("SetClientFactory replaces a previously-set factory", func(t *testing.T) {
		ps := newStore()
		ps.SetClientFactory(func(_ string) (dynamic.Interface, *rest.Config, error) {
			return nil, nil, errors.New("first")
		})
		ps.SetClientFactory(func(_ string) (dynamic.Interface, *rest.Config, error) {
			return dynfake.NewSimpleDynamicClient(scheme), &rest.Config{}, nil
		})

		_, _, err := ps.GetActiveClient(ctx)
		require.NoError(t, err)
	})
}
