package store

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestNewPersistenceStore(t *testing.T) {
	ps := NewPersistenceStore("/tmp/test-config.json")
	require.NotNil(t, ps)
	require.Equal(t, DefaultNamespace, ps.config.Namespace)
	require.False(t, ps.config.Enabled)
}

func TestPersistenceStore_LoadAndSave(t *testing.T) {
	t.Run("Load returns defaults when file does not exist", func(t *testing.T) {
		configPath := filepath.Join(t.TempDir(), "nonexistent.json")
		ps := NewPersistenceStore(configPath)
		require.NoError(t, ps.Load())

		cfg := ps.GetConfig()
		require.False(t, cfg.Enabled)
		require.Equal(t, DefaultNamespace, cfg.Namespace)
		require.Equal(t, "primary-only", cfg.SyncMode)
	})

	// #6285/#6291: a config file containing literal JSON `null` is
	// valid JSON that used to crash Load() with a nil-pointer panic
	// (p.config became nil after Unmarshal, then the Namespace
	// dereference panicked). Load() must now detect this and reset
	// to the same defaults as the "file does not exist" branch.
	t.Run("Load resets to defaults on literal null JSON (#6285)", func(t *testing.T) {
		configPath := filepath.Join(t.TempDir(), "null.json")
		require.NoError(t, os.WriteFile(configPath, []byte("null"), 0o600))

		ps := NewPersistenceStore(configPath)
		require.NotPanics(t, func() {
			require.NoError(t, ps.Load())
		}, "Load() must not panic on literal null JSON")

		cfg := ps.GetConfig()
		require.False(t, cfg.Enabled)
		require.Equal(t, DefaultNamespace, cfg.Namespace)
		require.Equal(t, "primary-only", cfg.SyncMode)
	})

	t.Run("Save and Load round-trip", func(t *testing.T) {
		configPath := filepath.Join(t.TempDir(), "config.json")
		ps := NewPersistenceStore(configPath)

		require.NoError(t, ps.UpdateConfig(PersistenceConfig{
			Enabled:        true,
			PrimaryCluster: "cluster-a",
			Namespace:      "custom-ns",
			SyncMode:       "primary-only",
		}))
		require.NoError(t, ps.Save())

		// Load into a new instance
		ps2 := NewPersistenceStore(configPath)
		require.NoError(t, ps2.Load())

		cfg := ps2.GetConfig()
		require.True(t, cfg.Enabled)
		require.Equal(t, "cluster-a", cfg.PrimaryCluster)
		require.Equal(t, "custom-ns", cfg.Namespace)
		require.False(t, cfg.LastModified.IsZero(), "LastModified should be set by Save")
	})

	t.Run("Load handles corrupt JSON gracefully", func(t *testing.T) {
		configPath := filepath.Join(t.TempDir(), "corrupt.json")
		require.NoError(t, os.WriteFile(configPath, []byte("{invalid json"), 0644))

		ps := NewPersistenceStore(configPath)
		err := ps.Load()
		require.Error(t, err)
		require.Contains(t, err.Error(), "failed to parse persistence config")
	})

	t.Run("Load sets default namespace when empty in file", func(t *testing.T) {
		configPath := filepath.Join(t.TempDir(), "empty-ns.json")
		data, _ := json.Marshal(PersistenceConfig{Enabled: true, PrimaryCluster: "c1"})
		require.NoError(t, os.WriteFile(configPath, data, 0644))

		ps := NewPersistenceStore(configPath)
		require.NoError(t, ps.Load())
		require.Equal(t, DefaultNamespace, ps.GetConfig().Namespace)
	})
}

func TestPersistenceStore_UpdateConfig(t *testing.T) {
	t.Run("enabled without primary cluster returns error", func(t *testing.T) {
		ps := NewPersistenceStore("")
		err := ps.UpdateConfig(PersistenceConfig{
			Enabled: true,
		})
		require.Error(t, err)
		require.Contains(t, err.Error(), "primary cluster is required")
	})

	t.Run("active-passive without secondary returns error", func(t *testing.T) {
		ps := NewPersistenceStore("")
		err := ps.UpdateConfig(PersistenceConfig{
			Enabled:        true,
			PrimaryCluster: "cluster-a",
			SyncMode:       "active-passive",
		})
		require.Error(t, err)
		require.Contains(t, err.Error(), "secondary cluster is required")
	})

	t.Run("valid active-passive config succeeds", func(t *testing.T) {
		ps := NewPersistenceStore("")
		err := ps.UpdateConfig(PersistenceConfig{
			Enabled:          true,
			PrimaryCluster:   "cluster-a",
			SecondaryCluster: "cluster-b",
			SyncMode:         "active-passive",
		})
		require.NoError(t, err)
	})

	t.Run("disabled config does not validate clusters", func(t *testing.T) {
		ps := NewPersistenceStore("")
		err := ps.UpdateConfig(PersistenceConfig{
			Enabled: false,
		})
		require.NoError(t, err)
	})

	t.Run("empty namespace gets default", func(t *testing.T) {
		ps := NewPersistenceStore("")
		require.NoError(t, ps.UpdateConfig(PersistenceConfig{
			Enabled:        true,
			PrimaryCluster: "c1",
			SyncMode:       "primary-only",
		}))
		require.Equal(t, DefaultNamespace, ps.GetConfig().Namespace)
	})
}

func TestPersistenceStore_IsEnabled(t *testing.T) {
	ps := NewPersistenceStore("")
	require.False(t, ps.IsEnabled())

	require.NoError(t, ps.UpdateConfig(PersistenceConfig{
		Enabled:        true,
		PrimaryCluster: "c1",
		SyncMode:       "primary-only",
	}))
	require.True(t, ps.IsEnabled())
}

func TestPersistenceStore_GetNamespace(t *testing.T) {
	t.Run("returns default when not configured", func(t *testing.T) {
		ps := NewPersistenceStore("")
		require.Equal(t, DefaultNamespace, ps.GetNamespace())
	})

	t.Run("returns custom namespace when set", func(t *testing.T) {
		ps := NewPersistenceStore("")
		require.NoError(t, ps.UpdateConfig(PersistenceConfig{
			Enabled:        true,
			PrimaryCluster: "c1",
			Namespace:      "my-namespace",
			SyncMode:       "primary-only",
		}))
		require.Equal(t, "my-namespace", ps.GetNamespace())
	})
}

func TestPersistenceStore_GetStatus(t *testing.T) {
	ctx := context.Background()

	t.Run("disabled returns inactive status", func(t *testing.T) {
		ps := NewPersistenceStore("")
		status := ps.GetStatus(ctx)
		require.False(t, status.Active)
		require.Equal(t, "Persistence is disabled", status.Message)
	})

	t.Run("enabled without primary cluster", func(t *testing.T) {
		ps := NewPersistenceStore("")
		ps.config.Enabled = true
		ps.config.PrimaryCluster = ""

		status := ps.GetStatus(ctx)
		require.False(t, status.Active)
		require.Equal(t, "No primary cluster configured", status.Message)
	})

	t.Run("healthy primary cluster is active", func(t *testing.T) {
		ps := NewPersistenceStore("")
		ps.config.Enabled = true
		ps.config.PrimaryCluster = "c1"
		ps.config.SyncMode = "primary-only"
		ps.SetClusterHealthChecker(func(_ context.Context, _ string) ClusterHealth {
			return ClusterHealthHealthy
		})

		status := ps.GetStatus(ctx)
		require.True(t, status.Active)
		require.Equal(t, "c1", status.ActiveCluster)
		require.False(t, status.FailoverActive)
	})

	t.Run("degraded primary cluster is still active", func(t *testing.T) {
		ps := NewPersistenceStore("")
		ps.config.Enabled = true
		ps.config.PrimaryCluster = "c1"
		ps.SetClusterHealthChecker(func(_ context.Context, _ string) ClusterHealth {
			return ClusterHealthDegraded
		})

		status := ps.GetStatus(ctx)
		require.True(t, status.Active)
		require.Equal(t, "c1", status.ActiveCluster)
	})

	t.Run("unreachable primary with healthy secondary triggers failover", func(t *testing.T) {
		ps := NewPersistenceStore("")
		ps.config.Enabled = true
		ps.config.PrimaryCluster = "c1"
		ps.config.SecondaryCluster = "c2"
		ps.config.SyncMode = "active-passive"
		ps.SetClusterHealthChecker(func(_ context.Context, name string) ClusterHealth {
			if name == "c1" {
				return ClusterHealthUnreachable
			}
			return ClusterHealthHealthy
		})

		status := ps.GetStatus(ctx)
		require.True(t, status.Active)
		require.Equal(t, "c2", status.ActiveCluster)
		require.True(t, status.FailoverActive)
		require.Contains(t, status.Message, "Failover")
	})

	t.Run("both clusters unreachable", func(t *testing.T) {
		ps := NewPersistenceStore("")
		ps.config.Enabled = true
		ps.config.PrimaryCluster = "c1"
		ps.config.SecondaryCluster = "c2"
		ps.config.SyncMode = "active-passive"
		ps.SetClusterHealthChecker(func(_ context.Context, _ string) ClusterHealth {
			return ClusterHealthUnreachable
		})

		status := ps.GetStatus(ctx)
		require.False(t, status.Active)
		require.Contains(t, status.Message, "Both primary and secondary")
	})

	t.Run("unreachable primary without secondary (primary-only mode)", func(t *testing.T) {
		ps := NewPersistenceStore("")
		ps.config.Enabled = true
		ps.config.PrimaryCluster = "c1"
		ps.config.SyncMode = "primary-only"
		ps.SetClusterHealthChecker(func(_ context.Context, _ string) ClusterHealth {
			return ClusterHealthUnreachable
		})

		status := ps.GetStatus(ctx)
		require.False(t, status.Active)
		require.Contains(t, status.Message, "Primary cluster is unreachable")
	})
}

func TestPersistenceStore_GetActiveCluster(t *testing.T) {
	ctx := context.Background()

	t.Run("returns error when inactive", func(t *testing.T) {
		ps := NewPersistenceStore("")
		_, err := ps.GetActiveCluster(ctx)
		require.Error(t, err)
		require.Contains(t, err.Error(), "persistence not active")
	})

	t.Run("returns active cluster name", func(t *testing.T) {
		ps := NewPersistenceStore("")
		ps.config.Enabled = true
		ps.config.PrimaryCluster = "c1"
		ps.SetClusterHealthChecker(func(_ context.Context, _ string) ClusterHealth {
			return ClusterHealthHealthy
		})

		cluster, err := ps.GetActiveCluster(ctx)
		require.NoError(t, err)
		require.Equal(t, "c1", cluster)
	})
}

func TestPersistenceStore_GetActiveClient(t *testing.T) {
	ctx := context.Background()

	t.Run("returns error when client factory not set", func(t *testing.T) {
		ps := NewPersistenceStore("")
		ps.config.Enabled = true
		ps.config.PrimaryCluster = "c1"
		ps.SetClusterHealthChecker(func(_ context.Context, _ string) ClusterHealth {
			return ClusterHealthHealthy
		})

		_, _, err := ps.GetActiveClient(ctx)
		require.Error(t, err)
		require.Contains(t, err.Error(), "client factory not configured")
	})
}
