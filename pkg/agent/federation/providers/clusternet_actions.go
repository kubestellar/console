package providers

import (
	"context"
	"fmt"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/rest"

	"github.com/kubestellar/console/pkg/agent/federation"
)

// Action ID constants for the Clusternet provider.
const (
	// clusternetActionApproveCluster patches the ManagedCluster CR to set the
	// approved field. Non-destructive and idempotent.
	clusternetActionApproveCluster = "clusternet.approveCluster"
	// clusternetActionUnregisterCluster deletes the ManagedCluster CR, removing
	// the cluster from the Clusternet hub. Destructive.
	clusternetActionUnregisterCluster = "clusternet.unregisterCluster"
)

var clusternetActionDescriptors = []federation.ActionDescriptor{
	{
		ID:          clusternetActionApproveCluster,
		Label:       "Approve Cluster",
		Verb:        "patch",
		Provider:    "clusternet",
		Destructive: false,
	},
	{
		ID:          clusternetActionUnregisterCluster,
		Label:       "Unregister Cluster",
		Verb:        "delete",
		Provider:    "clusternet",
		Destructive: true,
	},
}

// Actions returns the action descriptors exposed by the Clusternet provider.
func (p *clusternetProvider) Actions() []federation.ActionDescriptor {
	return clusternetActionDescriptors
}

// Execute runs the Clusternet action identified by req.ActionID.
func (p *clusternetProvider) Execute(ctx context.Context, cfg *rest.Config, req federation.ActionRequest) (federation.ActionResult, error) {
	switch req.ActionID {
	case clusternetActionApproveCluster:
		return clusternetApproveCluster(ctx, cfg, req.ClusterName)
	case clusternetActionUnregisterCluster:
		return clusternetUnregisterCluster(ctx, cfg, req.ClusterName)
	default:
		return federation.ActionResult{}, fmt.Errorf("unknown Clusternet action: %s", req.ActionID)
	}
}

// clusternetApproveCluster patches spec.approved=true on the named
// ManagedCluster. If the cluster is already approved the operation returns
// Skipped=true (idempotent).
func clusternetApproveCluster(ctx context.Context, cfg *rest.Config, clusterName string) (federation.ActionResult, error) {
	dc, err := dynamic.NewForConfig(cfg)
	if err != nil {
		return federation.ActionResult{}, err
	}

	// Read first to check the current approval state.
	obj, err := dc.Resource(clusternetManagedClusterGVR).Get(ctx, clusterName, metav1.GetOptions{})
	if err != nil {
		if isNotFoundError(err) {
			return federation.ActionResult{OK: true, Already: true, Message: "cluster " + clusterName + " not found"}, nil
		}
		return federation.ActionResult{}, fmt.Errorf("get ManagedCluster %s: %w", clusterName, err)
	}

	// Check whether already approved to keep the operation idempotent.
	approved, _, _ := unstructuredNestedBool(obj.Object, "spec", "approved")
	if approved {
		return federation.ActionResult{OK: true, Already: true, Message: "cluster " + clusterName + " already approved"}, nil
	}

	patch := []byte(`{"spec":{"approved":true}}`)
	_, err = dc.Resource(clusternetManagedClusterGVR).Patch(ctx, clusterName, types.MergePatchType, patch, metav1.PatchOptions{})
	if err != nil {
		if isConflictError(err) {
			return federation.ActionResult{OK: true, Already: true, Message: "cluster " + clusterName + " approval updated concurrently"}, nil
		}
		return federation.ActionResult{}, fmt.Errorf("approve ManagedCluster %s: %w", clusterName, err)
	}
	return federation.ActionResult{OK: true, Message: "ManagedCluster " + clusterName + " approved"}, nil
}

// clusternetUnregisterCluster deletes the named ManagedCluster CR. If the CR
// is already absent the operation returns Skipped=true (idempotent).
func clusternetUnregisterCluster(ctx context.Context, cfg *rest.Config, clusterName string) (federation.ActionResult, error) {
	dc, err := dynamic.NewForConfig(cfg)
	if err != nil {
		return federation.ActionResult{}, err
	}

	err = dc.Resource(clusternetManagedClusterGVR).Delete(ctx, clusterName, metav1.DeleteOptions{})
	if err != nil {
		if isNotFoundError(err) {
			return federation.ActionResult{OK: true, Already: true, Message: "cluster " + clusterName + " already removed"}, nil
		}
		return federation.ActionResult{}, fmt.Errorf("unregister ManagedCluster %s: %w", clusterName, err)
	}
	return federation.ActionResult{OK: true, Message: "ManagedCluster " + clusterName + " deleted from Clusternet hub"}, nil
}

// unstructuredNestedBool extracts a bool field from an unstructured object's
// nested field path. It is a thin wrapper around the standard unstructured
// helper, kept here so clusternet_actions.go has no import on the unstructured
// package directly.
func unstructuredNestedBool(obj map[string]interface{}, fields ...string) (bool, bool, error) {
	val := obj
	for i, f := range fields {
		if i == len(fields)-1 {
			v, ok := val[f]
			if !ok {
				return false, false, nil
			}
			b, ok := v.(bool)
			return b, ok, nil
		}
		next, ok := val[f].(map[string]interface{})
		if !ok {
			return false, false, nil
		}
		val = next
	}
	return false, false, nil
}

// Ensure compile-time interface conformance.
var _ federation.ActionProvider = (*clusternetProvider)(nil)
