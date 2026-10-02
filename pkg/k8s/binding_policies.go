package k8s

import (
	"context"

	"github.com/kubestellar/console/pkg/apis/v1alpha1"
)

// ListBindingPolicies lists binding policies (placeholder).
//
// Placeholder - would list actual KubeStellar BindingPolicies.
func (m *MultiClusterClient) ListBindingPolicies(_ context.Context) (*v1alpha1.BindingPolicyList, error) {
	return &v1alpha1.BindingPolicyList{
		Items:      []v1alpha1.BindingPolicy{},
		TotalCount: 0,
	}, nil
}
