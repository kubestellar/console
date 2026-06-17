package providers

import (
	"context"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"

	"k8s.io/client-go/rest"

	"github.com/kubestellar/console/pkg/agent/federation"
)

func TestLiqoReadClusters(t *testing.T) {
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
					"/apis/discovery.liqo.io/v1alpha1/foreignclusters": map[string]interface{}{
						"kind":       "ForeignClusterList",
						"apiVersion": "discovery.liqo.io/v1alpha1",
						"items": []interface{}{
							map[string]interface{}{
								"metadata": map[string]interface{}{
									"name": "peer-1",
									"labels": map[string]interface{}{
										"liqo.io/region": "eu-west",
									},
								},
								"spec": map[string]interface{}{
									"controlPlaneEndpoint": "https://peer-1:6443",
								},
								"status": map[string]interface{}{
									"peeringConditions": []interface{}{
										map[string]interface{}{"type": "OutgoingPeering", "status": "Active"},
									},
								},
							},
							map[string]interface{}{
								"metadata": map[string]interface{}{"name": "peer-2"},
								"spec": map[string]interface{}{
									"foreignAuthURL": "https://peer-2:9443/auth",
								},
								"status": map[string]interface{}{
									"peeringConditions": []interface{}{
										map[string]interface{}{"type": "OutgoingPeering", "status": "Pending"},
									},
								},
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
				require.Equal(t, "peer-1", clusters[0].Name)
				require.Equal(t, federation.ClusterStateJoined, clusters[0].State)
				require.Equal(t, "True", clusters[0].Available)
				require.Equal(t, "eu-west", clusters[0].Labels["liqo.io/region"])
				require.Equal(t, "https://peer-1:6443", clusters[0].APIServerURL)
				require.Equal(t, "peer-2", clusters[1].Name)
				require.Equal(t, federation.ClusterStatePending, clusters[1].State)
				require.Equal(t, "Unknown", clusters[1].Available)
				require.Equal(t, "https://peer-2:9443/auth", clusters[1].APIServerURL)
			},
		},
		{
			name: "returns empty list",
			setup: func(t *testing.T) (*rest.Config, func()) {
				t.Helper()
				ts, cfg := fakeAPIServer(t, map[string]interface{}{
					"/apis/discovery.liqo.io/v1alpha1/foreignclusters": map[string]interface{}{
						"kind":       "ForeignClusterList",
						"apiVersion": "discovery.liqo.io/v1alpha1",
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

			clusters, err := (&liqoProvider{}).ReadClusters(context.Background(), cfg)
			tt.assert(t, clusters, err)
		})
	}
}

func TestLiqoReadGroups(t *testing.T) {
	tests := []struct {
		name   string
		setup  func(t *testing.T) (*rest.Config, func())
		assert func(t *testing.T, groups []federation.FederatedGroup, err error)
	}{
		{
			name: "returns peers group",
			setup: func(t *testing.T) (*rest.Config, func()) {
				t.Helper()
				ts, cfg := fakeAPIServer(t, map[string]interface{}{
					"/apis/discovery.liqo.io/v1alpha1/foreignclusters": map[string]interface{}{
						"kind": "ForeignClusterList",
						"items": []interface{}{
							map[string]interface{}{"metadata": map[string]interface{}{"name": "peer-1"}, "status": map[string]interface{}{"peeringConditions": []interface{}{map[string]interface{}{"type": "OutgoingPeering", "status": "Active"}}}},
							map[string]interface{}{"metadata": map[string]interface{}{"name": "peer-2"}, "status": map[string]interface{}{"peeringConditions": []interface{}{map[string]interface{}{"type": "IncomingPeering", "status": "Active"}}}},
							map[string]interface{}{"metadata": map[string]interface{}{"name": "peer-3"}, "status": map[string]interface{}{"peeringConditions": []interface{}{map[string]interface{}{"type": "OutgoingPeering", "status": "Pending"}}}},
						},
					},
				})
				return cfg, ts.Close
			},
			assert: func(t *testing.T, groups []federation.FederatedGroup, err error) {
				t.Helper()
				require.NoError(t, err)
				require.Len(t, groups, 1)
				require.Equal(t, federation.ProviderLiqo, groups[0].Provider)
				require.Equal(t, federation.FederatedGroupPeer, groups[0].Kind)
				require.Equal(t, liqoPeersGroupName, groups[0].Name)
				require.ElementsMatch(t, []string{"peer-1", "peer-2"}, groups[0].Members)
			},
		},
		{
			name: "returns nil when no peers are active",
			setup: func(t *testing.T) (*rest.Config, func()) {
				t.Helper()
				ts, cfg := fakeAPIServer(t, map[string]interface{}{
					"/apis/discovery.liqo.io/v1alpha1/foreignclusters": map[string]interface{}{
						"kind":       "ForeignClusterList",
						"apiVersion": "discovery.liqo.io/v1alpha1",
						"items": []interface{}{
							map[string]interface{}{"metadata": map[string]interface{}{"name": "peer-1"}, "status": map[string]interface{}{"peeringConditions": []interface{}{map[string]interface{}{"type": "OutgoingPeering", "status": "Pending"}}}},
						},
					},
				})
				return cfg, ts.Close
			},
			assert: func(t *testing.T, groups []federation.FederatedGroup, err error) {
				t.Helper()
				require.NoError(t, err)
				require.Nil(t, groups)
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

			groups, err := (&liqoProvider{}).ReadGroups(context.Background(), cfg)
			tt.assert(t, groups, err)
		})
	}
}

func TestLiqoReadPendingJoins(t *testing.T) {
	tests := []struct {
		name   string
		setup  func(t *testing.T) (*rest.Config, func())
		assert func(t *testing.T, joins []federation.PendingJoin, err error)
	}{
		{
			name: "returns inactive peers",
			setup: func(t *testing.T) (*rest.Config, func()) {
				t.Helper()
				ts, cfg := fakeAPIServer(t, map[string]interface{}{
					"/apis/discovery.liqo.io/v1alpha1/foreignclusters": map[string]interface{}{
						"kind": "ForeignClusterList",
						"items": []interface{}{
							map[string]interface{}{"metadata": map[string]interface{}{"name": "peer-1", "creationTimestamp": "2026-01-01T00:00:00Z"}, "status": map[string]interface{}{"peeringConditions": []interface{}{map[string]interface{}{"type": "OutgoingPeering", "status": "Pending"}}}},
							map[string]interface{}{"metadata": map[string]interface{}{"name": "peer-2", "creationTimestamp": "2026-01-01T00:00:00Z"}, "status": map[string]interface{}{"peeringConditions": []interface{}{map[string]interface{}{"type": "OutgoingPeering", "status": "Active"}}}},
						},
					},
				})
				return cfg, ts.Close
			},
			assert: func(t *testing.T, joins []federation.PendingJoin, err error) {
				t.Helper()
				require.NoError(t, err)
				require.Len(t, joins, 1)
				require.Equal(t, federation.ProviderLiqo, joins[0].Provider)
				require.Equal(t, "peer-1", joins[0].ClusterName)
				require.Contains(t, joins[0].Detail, "peering not active")
			},
		},
		{
			name: "returns empty list when all peers are active",
			setup: func(t *testing.T) (*rest.Config, func()) {
				t.Helper()
				ts, cfg := fakeAPIServer(t, map[string]interface{}{
					"/apis/discovery.liqo.io/v1alpha1/foreignclusters": map[string]interface{}{
						"kind":       "ForeignClusterList",
						"apiVersion": "discovery.liqo.io/v1alpha1",
						"items": []interface{}{
							map[string]interface{}{"metadata": map[string]interface{}{"name": "peer-1", "creationTimestamp": "2026-01-01T00:00:00Z"}, "status": map[string]interface{}{"peeringConditions": []interface{}{map[string]interface{}{"type": "IncomingPeering", "status": "Active"}}}},
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

			joins, err := (&liqoProvider{}).ReadPendingJoins(context.Background(), cfg)
			tt.assert(t, joins, err)
		})
	}
}
