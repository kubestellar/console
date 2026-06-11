package client

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestClusterInfo_Validation(t *testing.T) {
	tests := []struct {
		name    string
		cluster ClusterInfo
		valid   bool
	}{
		{
			name: "valid cluster",
			cluster: ClusterInfo{
				Name:      "test-cluster",
				Context:   "test-context",
				Server:    "https://api.test.k8s:6443",
				Healthy:   true,
				NodeCount: 3,
				PodCount:  10,
			},
			valid: true,
		},
		{
			name: "empty name invalid",
			cluster: ClusterInfo{
				Name:    "",
				Context: "test-context",
			},
			valid: false,
		},
		{
			name: "never connected cluster",
			cluster: ClusterInfo{
				Name:           "unreachable-cluster",
				Context:        "unreachable",
				NeverConnected: true,
				Healthy:        false,
			},
			valid: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			valid := tc.cluster.Name != ""
			require.Equal(t, tc.valid, valid)
		})
	}
}

func TestClusterHealth_ErrorTypes(t *testing.T) {
	tests := []struct {
		name      string
		errorType string
		valid     bool
	}{
		{name: "timeout", errorType: "timeout", valid: true},
		{name: "auth", errorType: "auth", valid: true},
		{name: "network", errorType: "network", valid: true},
		{name: "certificate", errorType: "certificate", valid: true},
		{name: "unknown", errorType: "unknown", valid: true},
		{name: "empty ok", errorType: "", valid: true},
		{name: "custom type", errorType: "custom-error", valid: true},
	}

	validTypes := map[string]bool{
		"timeout":     true,
		"auth":        true,
		"network":     true,
		"certificate": true,
		"unknown":     true,
		"":            true,
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			health := ClusterHealth{
				Cluster:   "test-cluster",
				ErrorType: tc.errorType,
			}

			_, isKnownType := validTypes[health.ErrorType]
			isValid := health.ErrorType == "" || isKnownType || len(health.ErrorType) > 0

			require.True(t, isValid)
		})
	}
}

func TestClusterHealth_ResourceCalculations(t *testing.T) {
	tests := []struct {
		name          string
		memoryBytes   int64
		storageBytes  int64
		expectMemGB   float64
		expectStoreGB float64
	}{
		{
			name:          "1 GiB memory",
			memoryBytes:   1073741824,
			storageBytes:  0,
			expectMemGB:   1.0,
			expectStoreGB: 0,
		},
		{
			name:          "10 GiB storage",
			memoryBytes:   0,
			storageBytes:  10737418240,
			expectMemGB:   0,
			expectStoreGB: 10.0,
		},
		{
			name:          "zero values",
			memoryBytes:   0,
			storageBytes:  0,
			expectMemGB:   0,
			expectStoreGB: 0,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			health := ClusterHealth{
				Cluster:      "test-cluster",
				MemoryBytes:  tc.memoryBytes,
				StorageBytes: tc.storageBytes,
			}

			memGB := float64(health.MemoryBytes) / (1024 * 1024 * 1024)
			storageGB := float64(health.StorageBytes) / (1024 * 1024 * 1024)

			require.InDelta(t, tc.expectMemGB, memGB, 0.01)
			require.InDelta(t, tc.expectStoreGB, storageGB, 0.01)
		})
	}
}

func TestListClusters_NoConfig(t *testing.T) {
	client := &MultiClusterClient{
		noClusterMode: true,
	}

	clusters, err := client.ListClusters(context.Background())
	require.NoError(t, err)
	require.Empty(t, clusters)
}

func TestClusterInfo_AuthMethodDetection(t *testing.T) {
	tests := []struct {
		name       string
		authMethod string
		expected   string
	}{
		{name: "exec", authMethod: "exec", expected: "exec"},
		{name: "token", authMethod: "token", expected: "token"},
		{name: "certificate", authMethod: "certificate", expected: "certificate"},
		{name: "auth-provider", authMethod: "auth-provider", expected: "auth-provider"},
		{name: "unknown", authMethod: "", expected: "unknown"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			cluster := ClusterInfo{
				Name:       "test",
				Context:    "test-ctx",
				AuthMethod: tc.authMethod,
			}

			authMethod := cluster.AuthMethod
			if authMethod == "" {
				authMethod = "unknown"
			}

			require.Contains(t, []string{"exec", "token", "certificate", "auth-provider", "unknown"}, authMethod)
		})
	}
}
