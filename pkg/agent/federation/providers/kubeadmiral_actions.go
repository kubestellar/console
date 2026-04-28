package providers

import (
	"context"
	"fmt"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/rest"

	"github.com/kubestellar/console/pkg/agent/federation"
)

// Action ID constants for the KubeAdmiral provider.
const (
	// kubeAdmiralActionUnfederateCluster deletes the FederatedCluster CR,
	// removing the cluster from the KubeAdmiral federation. Destructive.
	kubeAdmiralActionUnfederateCluster = "kubeadmiral.unfederateCluster"
)

var kubeAdmiralActionDescriptors = []federation.ActionDescriptor{
	{
		ID:          kubeAdmiralActionUnfederateCluster,
		Label:       "Unfederate Cluster",
		Verb:        "delete",
		Provider:    "kubeadmiral",
		Destructive: true,
	},
}

// Actions returns the action descriptors exposed by the KubeAdmiral provider.
func (p *kubeAdmiralProvider) Actions() []federation.ActionDescriptor {
	return kubeAdmiralActionDescriptors
}

// Execute runs the KubeAdmiral action identified by req.ActionID.
func (p *kubeAdmiralProvider) Execute(ctx context.Context, cfg *rest.Config, req federation.ActionRequest) (federation.ActionResult, error) {
	switch req.ActionID {
	case kubeAdmiralActionUnfederateCluster:
		return kubeAdmiralUnfederateCluster(ctx, cfg, req.ClusterName)
	default:
		return federation.ActionResult{}, fmt.Errorf("unknown KubeAdmiral action: %s", req.ActionID)
	}
}

// kubeAdmiralUnfederateCluster deletes the named FederatedCluster CR. If the
// CR is already absent the operation returns Skipped=true (idempotent).
func kubeAdmiralUnfederateCluster(ctx context.Context, cfg *rest.Config, clusterName string) (federation.ActionResult, error) {
	dc, err := dynamic.NewForConfig(cfg)
	if err != nil {
		return federation.ActionResult{}, err
	}

	err = dc.Resource(kubeAdmiralFederatedClusterGVR).Delete(ctx, clusterName, metav1.DeleteOptions{})
	if err != nil {
		if isNotFoundError(err) {
			return federation.ActionResult{OK: true, Already: true, Message: "FederatedCluster " + clusterName + " already removed"}, nil
		}
		return federation.ActionResult{}, fmt.Errorf("unfederate FederatedCluster %s: %w", clusterName, err)
	}
	return federation.ActionResult{OK: true, Message: "FederatedCluster " + clusterName + " deleted from KubeAdmiral control plane"}, nil
}

// Ensure compile-time interface conformance.
var _ federation.ActionProvider = (*kubeAdmiralProvider)(nil)
