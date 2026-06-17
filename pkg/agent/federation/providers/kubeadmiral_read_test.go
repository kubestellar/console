package providers

import (
	"context"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"

	"k8s.io/client-go/rest"

	"github.com/kubestellar/console/pkg/agent/federation"
)

func TestKubeAdmiralReadClusters(t *testing.T) {
	tests := []struct {
		name   string
		setup  func(t *testing.T) (*rest.Config, func())
		assert func(t *testing.T, clusters []federation.FederatedCluster, err error)
	}{
		{
			name: "returns clusters",
			setup: func(t *testing.T) (*rest.Config, func()) {
				t.Helper()
				ts, cfg := fakeAPIServer(t, map[string]interface{}{
					"/apis/core.kubeadmiral.io/v1alpha1/federatedclusters": map[string]interface{}{
						"kind":       "FederatedClusterList",
						"apiVersion": "core.kubeadmiral.io/v1alpha1",
						"items": []interface{}{
							map[string]interface{}{
								"metadata": map[string]interface{}{"name": "member-1", "labels": map[string]interface{}{"region": "us-east"}},
								"spec":     map[string]interface{}{"apiEndpoint": "https://member-1:6443"},
								"status": map[string]interface{}{"conditions": []interface{}{
									map[string]interface{}{"type": "Ready", "status": "True"},
								}},
							},
							map[string]interface{}{
								"metadata": map[string]interface{}{"name": "member-2"},
								"status": map[string]interface{}{"conditions": []interface{}{
									map[string]interface{}{"type": "Ready", "status": "False"},
								}},
							},
						},
					},
				})
				return cfg, ts.Close
			},
			assert: func(t *testing.T, clusters []federation.FederatedCluster, err error) {
				t.Helper()
				require.NoError(t, err)
				require.Len(t, clusters, 2)
				require.Equal(t, "member-1", clusters[0].Name)
				require.Equal(t, federation.ClusterStateJoined, clusters[0].State)
				require.Equal(t, "True", clusters[0].Available)
				require.Equal(t, "https://member-1:6443", clusters[0].APIServerURL)
				require.Equal(t, "us-east", clusters[0].Labels["region"])
				require.Equal(t, "member-2", clusters[1].Name)
				require.Equal(t, federation.ClusterStatePending, clusters[1].State)
				require.Equal(t, "False", clusters[1].Available)
			},
		},
		{
			name: "returns empty list",
			setup: func(t *testing.T) (*rest.Config, func()) {
				t.Helper()
				ts, cfg := fakeAPIServer(t, map[string]interface{}{
					"/apis/core.kubeadmiral.io/v1alpha1/federatedclusters": map[string]interface{}{
						"kind":       "FederatedClusterList",
						"apiVersion": "core.kubeadmiral.io/v1alpha1",
						"items":      []interface{}{},
					},
				})
				return cfg, ts.Close
			},
			assert: func(t *testing.T, clusters []federation.FederatedCluster, err error) {
				t.Helper()
				require.NoError(t, err)
				require.NotNil(t, clusters)
				require.Empty(t, clusters)
			},
		},
		{
			name: "propagates api error",
			setup: func(t *testing.T) (*rest.Config, func()) {
				t.Helper()
				ts, cfg := fakeErrorAPIServer(t, http.StatusInternalServerError)
				return cfg, ts.Close
			},
			assert: func(t *testing.T, clusters []federation.FederatedCluster, err error) {
				t.Helper()
				require.Error(t, err)
				require.Nil(t, clusters)
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg, cleanup := tt.setup(t)
			defer cleanup()

			clusters, err := (&kubeAdmiralProvider{}).ReadClusters(context.Background(), cfg)
			tt.assert(t, clusters, err)
		})
	}
}

func TestKubeAdmiralReadGroups(t *testing.T) {
	tests := []struct {
		name   string
		setup  func(t *testing.T) (*rest.Config, func())
		assert func(t *testing.T, groups []federation.FederatedGroup, err error)
	}{
		{
			name: "returns synthetic label groups",
			setup: func(t *testing.T) (*rest.Config, func()) {
				t.Helper()
				ts, cfg := fakeAPIServer(t, map[string]interface{}{
					"/apis/core.kubeadmiral.io/v1alpha1/federatedclusters": map[string]interface{}{
						"kind": "FederatedClusterList",
						"items": []interface{}{
							map[string]interface{}{"metadata": map[string]interface{}{"name": "member-1", "labels": map[string]interface{}{"region": "us-east", "env": "prod"}}},
							map[string]interface{}{"metadata": map[string]interface{}{"name": "member-2", "labels": map[string]interface{}{"region": "us-east"}}},
						},
					},
				})
				return cfg, ts.Close
			},
			assert: func(t *testing.T, groups []federation.FederatedGroup, err error) {
				t.Helper()
				require.NoError(t, err)
				require.Len(t, groups, 2)

				actual := make(map[string][]string, len(groups))
				for _, group := range groups {
					require.Equal(t, federation.ProviderKubeAdmiral, group.Provider)
					require.Equal(t, federation.FederatedGroupSelector, group.Kind)
					actual[group.Name] = group.Members
				}

				require.ElementsMatch(t, []string{"member-1", "member-2"}, actual["region=us-east"])
				require.ElementsMatch(t, []string{"member-1"}, actual["env=prod"])
			},
		},
		{
			name: "returns empty list when there are no label groups",
			setup: func(t *testing.T) (*rest.Config, func()) {
				t.Helper()
				ts, cfg := fakeAPIServer(t, map[string]interface{}{
					"/apis/core.kubeadmiral.io/v1alpha1/federatedclusters": map[string]interface{}{
						"kind":       "FederatedClusterList",
						"apiVersion": "core.kubeadmiral.io/v1alpha1",
						"items":      []interface{}{},
					},
				})
				return cfg, ts.Close
			},
			assert: func(t *testing.T, groups []federation.FederatedGroup, err error) {
				t.Helper()
				require.NoError(t, err)
				require.NotNil(t, groups)
				require.Empty(t, groups)
			},
		},
		{
			name: "propagates api error",
			setup: func(t *testing.T) (*rest.Config, func()) {
				t.Helper()
				ts, cfg := fakeErrorAPIServer(t, http.StatusInternalServerError)
				return cfg, ts.Close
			},
			assert: func(t *testing.T, groups []federation.FederatedGroup, err error) {
				t.Helper()
				require.Error(t, err)
				require.Nil(t, groups)
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg, cleanup := tt.setup(t)
			defer cleanup()

			groups, err := (&kubeAdmiralProvider{}).ReadGroups(context.Background(), cfg)
			tt.assert(t, groups, err)
		})
	}
}

func TestKubeAdmiralReadPendingJoins(t *testing.T) {
	tests := []struct {
		name   string
		setup  func(t *testing.T) (*rest.Config, func())
		assert func(t *testing.T, joins []federation.PendingJoin, err error)
	}{
		{
			name: "returns pending joins",
			setup: func(t *testing.T) (*rest.Config, func()) {
				t.Helper()
				ts, cfg := fakeAPIServer(t, map[string]interface{}{
					"/apis/core.kubeadmiral.io/v1alpha1/federatedclusters": map[string]interface{}{
						"kind": "FederatedClusterList",
						"items": []interface{}{
							map[string]interface{}{
								"metadata": map[string]interface{}{"name": "pending-member", "creationTimestamp": "2026-01-01T00:00:00Z"},
								"status": map[string]interface{}{"conditions": []interface{}{
									map[string]interface{}{"type": "Ready", "status": "False"},
								}},
							},
							map[string]interface{}{
								"metadata": map[string]interface{}{"name": "joined-member", "creationTimestamp": "2026-01-01T00:00:00Z"},
								"status": map[string]interface{}{"conditions": []interface{}{
									map[string]interface{}{"type": "Ready", "status": "True"},
								}},
							},
						},
					},
				})
				return cfg, ts.Close
			},
			assert: func(t *testing.T, joins []federation.PendingJoin, err error) {
				t.Helper()
				require.NoError(t, err)
				require.Len(t, joins, 1)
				require.Equal(t, federation.ProviderKubeAdmiral, joins[0].Provider)
				require.Equal(t, "pending-member", joins[0].ClusterName)
				require.Contains(t, joins[0].Detail, "Ready=False or missing")
			},
		},
		{
			name: "returns empty list when all clusters are ready",
			setup: func(t *testing.T) (*rest.Config, func()) {
				t.Helper()
				ts, cfg := fakeAPIServer(t, map[string]interface{}{
					"/apis/core.kubeadmiral.io/v1alpha1/federatedclusters": map[string]interface{}{
						"kind":       "FederatedClusterList",
						"apiVersion": "core.kubeadmiral.io/v1alpha1",
						"items": []interface{}{
							map[string]interface{}{
								"metadata": map[string]interface{}{"name": "joined-member", "creationTimestamp": "2026-01-01T00:00:00Z"},
								"status": map[string]interface{}{"conditions": []interface{}{
									map[string]interface{}{"type": "Ready", "status": "True"},
								}},
							},
						},
					},
				})
				return cfg, ts.Close
			},
			assert: func(t *testing.T, joins []federation.PendingJoin, err error) {
				t.Helper()
				require.NoError(t, err)
				require.NotNil(t, joins)
				require.Empty(t, joins)
			},
		},
		{
			name: "propagates api error",
			setup: func(t *testing.T) (*rest.Config, func()) {
				t.Helper()
				ts, cfg := fakeErrorAPIServer(t, http.StatusInternalServerError)
				return cfg, ts.Close
			},
			assert: func(t *testing.T, joins []federation.PendingJoin, err error) {
				t.Helper()
				require.Error(t, err)
				require.Nil(t, joins)
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg, cleanup := tt.setup(t)
			defer cleanup()

			joins, err := (&kubeAdmiralProvider{}).ReadPendingJoins(context.Background(), cfg)
			tt.assert(t, joins, err)
		})
	}
}
