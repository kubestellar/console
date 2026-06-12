package handlers

import (
	"context"
	"errors"

	"github.com/kubestellar/console/pkg/apis/v1alpha1"
	"github.com/kubestellar/console/pkg/k8s"
)

// mockGatewayClient is a test mock implementing gatewayClient interface.
type mockGatewayClient struct {
	healthyClustersFunc             func(ctx context.Context) ([]k8s.ClusterInfo, []k8s.ClusterInfo, error)
	isGatewayAPIAvailableFunc       func(ctx context.Context, contextName string) bool
	listGatewaysFunc                func(ctx context.Context) (*v1alpha1.GatewayList, error)
	listGatewaysForClusterFunc      func(ctx context.Context, contextName, namespace string) ([]v1alpha1.Gateway, error)
	listHTTPRoutesFunc              func(ctx context.Context) (*v1alpha1.HTTPRouteList, error)
	listHTTPRoutesForClusterFunc    func(ctx context.Context, contextName, namespace string) ([]v1alpha1.HTTPRoute, error)
}

func (m *mockGatewayClient) HealthyClusters(ctx context.Context) ([]k8s.ClusterInfo, []k8s.ClusterInfo, error) {
	if m.healthyClustersFunc != nil {
		return m.healthyClustersFunc(ctx)
	}
	return []k8s.ClusterInfo{{Name: "mock-cluster"}}, []k8s.ClusterInfo{}, nil
}

func (m *mockGatewayClient) IsGatewayAPIAvailable(ctx context.Context, contextName string) bool {
	if m.isGatewayAPIAvailableFunc != nil {
		return m.isGatewayAPIAvailableFunc(ctx, contextName)
	}
	return true
}

func (m *mockGatewayClient) ListGateways(ctx context.Context) (*v1alpha1.GatewayList, error) {
	if m.listGatewaysFunc != nil {
		return m.listGatewaysFunc(ctx)
	}
	return &v1alpha1.GatewayList{Items: []v1alpha1.Gateway{}}, nil
}

func (m *mockGatewayClient) ListGatewaysForCluster(ctx context.Context, contextName, namespace string) ([]v1alpha1.Gateway, error) {
	if m.listGatewaysForClusterFunc != nil {
		return m.listGatewaysForClusterFunc(ctx, contextName, namespace)
	}
	return []v1alpha1.Gateway{}, nil
}

func (m *mockGatewayClient) ListHTTPRoutes(ctx context.Context) (*v1alpha1.HTTPRouteList, error) {
	if m.listHTTPRoutesFunc != nil {
		return m.listHTTPRoutesFunc(ctx)
	}
	return &v1alpha1.HTTPRouteList{Items: []v1alpha1.HTTPRoute{}}, nil
}

func (m *mockGatewayClient) ListHTTPRoutesForCluster(ctx context.Context, contextName, namespace string) ([]v1alpha1.HTTPRoute, error) {
	if m.listHTTPRoutesForClusterFunc != nil {
		return m.listHTTPRoutesForClusterFunc(ctx, contextName, namespace)
	}
	return []v1alpha1.HTTPRoute{}, nil
}
