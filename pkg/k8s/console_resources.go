package k8s

import (
	"context"
	"fmt"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"

	"github.com/kubestellar/console/pkg/api/v1alpha1"
)

// ConsolePersistence provides CRUD operations for console CRs
type ConsolePersistence interface {
	// ManagedWorkload operations
	ListManagedWorkloads(ctx context.Context, namespace string) ([]v1alpha1.ManagedWorkload, error)
	GetManagedWorkload(ctx context.Context, namespace, name string) (*v1alpha1.ManagedWorkload, error)
	CreateManagedWorkload(ctx context.Context, mw *v1alpha1.ManagedWorkload) (*v1alpha1.ManagedWorkload, error)
	UpdateManagedWorkload(ctx context.Context, mw *v1alpha1.ManagedWorkload) (*v1alpha1.ManagedWorkload, error)
	DeleteManagedWorkload(ctx context.Context, namespace, name string) error

	// ClusterGroup operations
	ListClusterGroups(ctx context.Context, namespace string) ([]v1alpha1.ClusterGroup, error)
	GetClusterGroup(ctx context.Context, namespace, name string) (*v1alpha1.ClusterGroup, error)
	CreateClusterGroup(ctx context.Context, cg *v1alpha1.ClusterGroup) (*v1alpha1.ClusterGroup, error)
	UpdateClusterGroup(ctx context.Context, cg *v1alpha1.ClusterGroup) (*v1alpha1.ClusterGroup, error)
	DeleteClusterGroup(ctx context.Context, namespace, name string) error

	// WorkloadDeployment operations
	ListWorkloadDeployments(ctx context.Context, namespace string) ([]v1alpha1.WorkloadDeployment, error)
	GetWorkloadDeployment(ctx context.Context, namespace, name string) (*v1alpha1.WorkloadDeployment, error)
	CreateWorkloadDeployment(ctx context.Context, wd *v1alpha1.WorkloadDeployment) (*v1alpha1.WorkloadDeployment, error)
	UpdateWorkloadDeployment(ctx context.Context, wd *v1alpha1.WorkloadDeployment) (*v1alpha1.WorkloadDeployment, error)
	UpdateWorkloadDeploymentStatus(ctx context.Context, wd *v1alpha1.WorkloadDeployment) (*v1alpha1.WorkloadDeployment, error)
	DeleteWorkloadDeployment(ctx context.Context, namespace, name string) error
}

// consolePersistenceImpl implements ConsolePersistence using dynamic client
type consolePersistenceImpl struct {
	client dynamic.Interface
}

// NewConsolePersistence creates a new ConsolePersistence instance
func NewConsolePersistence(client dynamic.Interface) ConsolePersistence {
	return &consolePersistenceImpl{client: client}
}

// =============================================================================
// ManagedWorkload CRUD
// =============================================================================

func (c *consolePersistenceImpl) ListManagedWorkloads(ctx context.Context, namespace string) ([]v1alpha1.ManagedWorkload, error) {
	list, err := c.client.Resource(v1alpha1.ManagedWorkloadGVR).Namespace(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to list ManagedWorkloads: %w", err)
	}

	workloads := make([]v1alpha1.ManagedWorkload, 0, len(list.Items))
	for _, item := range list.Items {
		mw, err := v1alpha1.ManagedWorkloadFromUnstructured(&item)
		if err != nil {
			return nil, fmt.Errorf("failed to convert ManagedWorkload: %w", err)
		}
		workloads = append(workloads, *mw)
	}
	return workloads, nil
}

func (c *consolePersistenceImpl) GetManagedWorkload(ctx context.Context, namespace, name string) (*v1alpha1.ManagedWorkload, error) {
	u, err := c.client.Resource(v1alpha1.ManagedWorkloadGVR).Namespace(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to get ManagedWorkload %s/%s: %w", namespace, name, err)
	}
	return v1alpha1.ManagedWorkloadFromUnstructured(u)
}

func (c *consolePersistenceImpl) CreateManagedWorkload(ctx context.Context, mw *v1alpha1.ManagedWorkload) (*v1alpha1.ManagedWorkload, error) {
	u, err := mw.ToUnstructured()
	if err != nil {
		return nil, fmt.Errorf("failed to convert ManagedWorkload to unstructured: %w", err)
	}

	created, err := c.client.Resource(v1alpha1.ManagedWorkloadGVR).Namespace(mw.Namespace).Create(ctx, u, metav1.CreateOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to create ManagedWorkload: %w", err)
	}
	return v1alpha1.ManagedWorkloadFromUnstructured(created)
}

func (c *consolePersistenceImpl) UpdateManagedWorkload(ctx context.Context, mw *v1alpha1.ManagedWorkload) (*v1alpha1.ManagedWorkload, error) {
	u, err := mw.ToUnstructured()
	if err != nil {
		return nil, fmt.Errorf("failed to convert ManagedWorkload to unstructured: %w", err)
	}

	updated, err := c.client.Resource(v1alpha1.ManagedWorkloadGVR).Namespace(mw.Namespace).Update(ctx, u, metav1.UpdateOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to update ManagedWorkload: %w", err)
	}
	return v1alpha1.ManagedWorkloadFromUnstructured(updated)
}

func (c *consolePersistenceImpl) DeleteManagedWorkload(ctx context.Context, namespace, name string) error {
	err := c.client.Resource(v1alpha1.ManagedWorkloadGVR).Namespace(namespace).Delete(ctx, name, metav1.DeleteOptions{})
	if err != nil {
		return fmt.Errorf("failed to delete ManagedWorkload %s/%s: %w", namespace, name, err)
	}
	return nil
}

// =============================================================================
// ClusterGroup CRUD
// =============================================================================

func (c *consolePersistenceImpl) ListClusterGroups(ctx context.Context, namespace string) ([]v1alpha1.ClusterGroup, error) {
	list, err := c.client.Resource(v1alpha1.ClusterGroupGVR).Namespace(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to list ClusterGroups: %w", err)
	}

	groups := make([]v1alpha1.ClusterGroup, 0, len(list.Items))
	for _, item := range list.Items {
		cg, err := v1alpha1.ClusterGroupFromUnstructured(&item)
		if err != nil {
			return nil, fmt.Errorf("failed to convert ClusterGroup: %w", err)
		}
		groups = append(groups, *cg)
	}
	return groups, nil
}

func (c *consolePersistenceImpl) GetClusterGroup(ctx context.Context, namespace, name string) (*v1alpha1.ClusterGroup, error) {
	u, err := c.client.Resource(v1alpha1.ClusterGroupGVR).Namespace(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to get ClusterGroup %s/%s: %w", namespace, name, err)
	}
	return v1alpha1.ClusterGroupFromUnstructured(u)
}

func (c *consolePersistenceImpl) CreateClusterGroup(ctx context.Context, cg *v1alpha1.ClusterGroup) (*v1alpha1.ClusterGroup, error) {
	u, err := cg.ToUnstructured()
	if err != nil {
		return nil, fmt.Errorf("failed to convert ClusterGroup to unstructured: %w", err)
	}

	created, err := c.client.Resource(v1alpha1.ClusterGroupGVR).Namespace(cg.Namespace).Create(ctx, u, metav1.CreateOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to create ClusterGroup: %w", err)
	}
	return v1alpha1.ClusterGroupFromUnstructured(created)
}

func (c *consolePersistenceImpl) UpdateClusterGroup(ctx context.Context, cg *v1alpha1.ClusterGroup) (*v1alpha1.ClusterGroup, error) {
	u, err := cg.ToUnstructured()
	if err != nil {
		return nil, fmt.Errorf("failed to convert ClusterGroup to unstructured: %w", err)
	}

	updated, err := c.client.Resource(v1alpha1.ClusterGroupGVR).Namespace(cg.Namespace).Update(ctx, u, metav1.UpdateOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to update ClusterGroup: %w", err)
	}
	return v1alpha1.ClusterGroupFromUnstructured(updated)
}

func (c *consolePersistenceImpl) DeleteClusterGroup(ctx context.Context, namespace, name string) error {
	err := c.client.Resource(v1alpha1.ClusterGroupGVR).Namespace(namespace).Delete(ctx, name, metav1.DeleteOptions{})
	if err != nil {
		return fmt.Errorf("failed to delete ClusterGroup %s/%s: %w", namespace, name, err)
	}
	return nil
}

// =============================================================================
// WorkloadDeployment CRUD
// =============================================================================

func (c *consolePersistenceImpl) ListWorkloadDeployments(ctx context.Context, namespace string) ([]v1alpha1.WorkloadDeployment, error) {
	list, err := c.client.Resource(v1alpha1.WorkloadDeploymentGVR).Namespace(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to list WorkloadDeployments: %w", err)
	}

	deployments := make([]v1alpha1.WorkloadDeployment, 0, len(list.Items))
	for _, item := range list.Items {
		wd, err := v1alpha1.WorkloadDeploymentFromUnstructured(&item)
		if err != nil {
			return nil, fmt.Errorf("failed to convert WorkloadDeployment: %w", err)
		}
		deployments = append(deployments, *wd)
	}
	return deployments, nil
}

func (c *consolePersistenceImpl) GetWorkloadDeployment(ctx context.Context, namespace, name string) (*v1alpha1.WorkloadDeployment, error) {
	u, err := c.client.Resource(v1alpha1.WorkloadDeploymentGVR).Namespace(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to get WorkloadDeployment %s/%s: %w", namespace, name, err)
	}
	return v1alpha1.WorkloadDeploymentFromUnstructured(u)
}

func (c *consolePersistenceImpl) CreateWorkloadDeployment(ctx context.Context, wd *v1alpha1.WorkloadDeployment) (*v1alpha1.WorkloadDeployment, error) {
	u, err := wd.ToUnstructured()
	if err != nil {
		return nil, fmt.Errorf("failed to convert WorkloadDeployment to unstructured: %w", err)
	}

	created, err := c.client.Resource(v1alpha1.WorkloadDeploymentGVR).Namespace(wd.Namespace).Create(ctx, u, metav1.CreateOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to create WorkloadDeployment: %w", err)
	}
	return v1alpha1.WorkloadDeploymentFromUnstructured(created)
}

func (c *consolePersistenceImpl) UpdateWorkloadDeployment(ctx context.Context, wd *v1alpha1.WorkloadDeployment) (*v1alpha1.WorkloadDeployment, error) {
	u, err := wd.ToUnstructured()
	if err != nil {
		return nil, fmt.Errorf("failed to convert WorkloadDeployment to unstructured: %w", err)
	}

	updated, err := c.client.Resource(v1alpha1.WorkloadDeploymentGVR).Namespace(wd.Namespace).Update(ctx, u, metav1.UpdateOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to update WorkloadDeployment: %w", err)
	}
	return v1alpha1.WorkloadDeploymentFromUnstructured(updated)
}

func (c *consolePersistenceImpl) UpdateWorkloadDeploymentStatus(ctx context.Context, wd *v1alpha1.WorkloadDeployment) (*v1alpha1.WorkloadDeployment, error) {
	u, err := wd.ToUnstructured()
	if err != nil {
		return nil, fmt.Errorf("failed to convert WorkloadDeployment to unstructured: %w", err)
	}

	// Use the status subresource for status updates
	updated, err := c.client.Resource(v1alpha1.WorkloadDeploymentGVR).Namespace(wd.Namespace).UpdateStatus(ctx, u, metav1.UpdateOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to update WorkloadDeployment status: %w", err)
	}
	return v1alpha1.WorkloadDeploymentFromUnstructured(updated)
}

func (c *consolePersistenceImpl) DeleteWorkloadDeployment(ctx context.Context, namespace, name string) error {
	err := c.client.Resource(v1alpha1.WorkloadDeploymentGVR).Namespace(namespace).Delete(ctx, name, metav1.DeleteOptions{})
	if err != nil {
		return fmt.Errorf("failed to delete WorkloadDeployment %s/%s: %w", namespace, name, err)
	}
	return nil
}

// =============================================================================
// Helper functions
// =============================================================================

// EnsureNamespace ensures the console namespace exists
func (c *consolePersistenceImpl) EnsureNamespace(ctx context.Context, namespace string) error {
	nsGVR := schema.GroupVersionResource{Group: "", Version: "v1", Resource: "namespaces"}
	_, err := c.client.Resource(nsGVR).Get(ctx, namespace, metav1.GetOptions{})
	if err == nil {
		return nil // Namespace exists
	}

	// Create the namespace
	ns := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "v1",
			"kind":       "Namespace",
			"metadata": map[string]interface{}{
				"name": namespace,
				"labels": map[string]interface{}{
					"app.kubernetes.io/part-of": "kubestellar-console",
				},
			},
		},
	}
	_, err = c.client.Resource(nsGVR).Create(ctx, ns, metav1.CreateOptions{})
	return err
}
