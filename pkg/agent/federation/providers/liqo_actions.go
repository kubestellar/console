package providers

import (
	"context"
	"fmt"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/rest"

	"github.com/kubestellar/console/pkg/agent/federation"
)

// Action ID constants for the Liqo provider.
const (
	// liqoActionUnpeerWith deletes the ForeignCluster CR representing a peering
	// relationship with a remote cluster. Destructive — tears down the peering.
	liqoActionUnpeerWith = "liqo.unpeerWith"
)

var liqoActionDescriptors = []federation.ActionDescriptor{
	{
		ID:          liqoActionUnpeerWith,
		Label:       "Unpeer",
		Verb:        "delete",
		Provider:    "liqo",
		Destructive: true,
	},
}

// Actions returns the action descriptors exposed by the Liqo provider.
func (p *liqoProvider) Actions() []federation.ActionDescriptor {
	return liqoActionDescriptors
}

// Execute runs the Liqo action identified by req.ActionID.
func (p *liqoProvider) Execute(ctx context.Context, cfg *rest.Config, req federation.ActionRequest) (federation.ActionResult, error) {
	switch req.ActionID {
	case liqoActionUnpeerWith:
		return liqoUnpeerWith(ctx, cfg, req.ClusterName)
	default:
		return federation.ActionResult{}, fmt.Errorf("unknown Liqo action: %s", req.ActionID)
	}
}

// liqoUnpeerWith deletes the named ForeignCluster CR, terminating the Liqo
// peering relationship. If the CR is already absent the operation returns
// Skipped=true (idempotent).
func liqoUnpeerWith(ctx context.Context, cfg *rest.Config, clusterName string) (federation.ActionResult, error) {
	dc, err := dynamic.NewForConfig(cfg)
	if err != nil {
		return federation.ActionResult{}, err
	}

	err = dc.Resource(liqoForeignClusterGVR).Delete(ctx, clusterName, metav1.DeleteOptions{})
	if err != nil {
		if isNotFoundError(err) {
			return federation.ActionResult{OK: true, Already: true, Message: "ForeignCluster " + clusterName + " already removed"}, nil
		}
		return federation.ActionResult{}, fmt.Errorf("unpeer ForeignCluster %s: %w", clusterName, err)
	}
	return federation.ActionResult{OK: true, Message: "ForeignCluster " + clusterName + " deleted; Liqo peering terminated"}, nil
}

// Ensure compile-time interface conformance.
var _ federation.ActionProvider = (*liqoProvider)(nil)
