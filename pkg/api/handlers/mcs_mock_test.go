package handlers

import (
	"context"

	"github.com/kubestellar/console/pkg/apis/v1alpha1"
	"github.com/kubestellar/console/pkg/k8s"
)

// mockMCSClient is a test mock implementing mcsClient interface.
type mockMCSClient struct {
	healthyClustersFunc                 func(ctx context.Context) ([]k8s.ClusterInfo, []k8s.ClusterInfo, error)
	isMCSAvailableFunc                  func(ctx context.Context, contextName string) bool
	listServiceExportsFunc              func(ctx context.Context) (*v1alpha1.ServiceExportList, error)
	listServiceExportsForClusterFunc    func(ctx context.Context, contextName, namespace string) ([]v1alpha1.ServiceExport, error)
	listServiceImportsFunc              func(ctx context.Context) (*v1alpha1.ServiceImportList, error)
	listServiceImportsForClusterFunc    func(ctx context.Context, contextName, namespace string) ([]v1alpha1.ServiceImport, error)
}

func (m *mockMCSClient) HealthyClusters(ctx context.Context) ([]k8s.ClusterInfo, []k8s.ClusterInfo, error) {
	if m.healthyClustersFunc != nil {
		return m.healthyClustersFunc(ctx)
	}
	return []k8s.ClusterInfo{{Name: "mock-cluster"}}, []k8s.ClusterInfo{}, nil
}

func (m *mockMCSClient) IsMCSAvailable(ctx context.Context, contextName string) bool {
	if m.isMCSAvailableFunc != nil {
		return m.isMCSAvailableFunc(ctx, contextName)
	}
	return true
}

func (m *mockMCSClient) ListServiceExports(ctx context.Context) (*v1alpha1.ServiceExportList, error) {
	if m.listServiceExportsFunc != nil {
		return m.listServiceExportsFunc(ctx)
	}
	return &v1alpha1.ServiceExportList{Items: []v1alpha1.ServiceExport{}}, nil
}

func (m *mockMCSClient) ListServiceExportsForCluster(ctx context.Context, contextName, namespace string) ([]v1alpha1.ServiceExport, error) {
	if m.listServiceExportsForClusterFunc != nil {
		return m.listServiceExportsForClusterFunc(ctx, contextName, namespace)
	}
	return []v1alpha1.ServiceExport{}, nil
}

func (m *mockMCSClient) ListServiceImports(ctx context.Context) (*v1alpha1.ServiceImportList, error) {
	if m.listServiceImportsFunc != nil {
		return m.listServiceImportsFunc(ctx)
	}
	return &v1alpha1.ServiceImportList{Items: []v1alpha1.ServiceImport{}}, nil
}

func (m *mockMCSClient) ListServiceImportsForCluster(ctx context.Context, contextName, namespace string) ([]v1alpha1.ServiceImport, error) {
	if m.listServiceImportsForClusterFunc != nil {
		return m.listServiceImportsForClusterFunc(ctx, contextName, namespace)
	}
	return []v1alpha1.ServiceImport{}, nil
}
