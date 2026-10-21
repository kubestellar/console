package providers

import (
	"context"
	"fmt"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/rest"

	"github.com/kubestellar/console/pkg/agent/federation"
)

// Karmada action IDs — stable identifiers referenced by the UI and tests.
const (
	karmadaActionJoinCluster   = "karmada.joinCluster"
	karmadaActionUnjoinCluster = "karmada.unjoinCluster"
	karmadaActionTaintCluster  = "karmada.taintCluster"
)

// Actions returns the set of imperative actions the Karmada provider supports.
// See ActionProvider interface in pkg/agent/federation/actions.go.
func (p *karmadaProvider) Actions() []federation.ActionDescriptor {
	return []federation.ActionDescriptor{
		{
			ID:          karmadaActionJoinCluster,
			Label:       "Join Cluster",
			Verb:        "create",
			Provider:    federation.ProviderKarmada,
			Destructive: false,
		},
		{
			ID:          karmadaActionUnjoinCluster,
			Label:       "Unjoin Cluster",
			Verb:        "delete",
			Provider:    federation.ProviderKarmada,
			Destructive: true,
		},
		{
			ID:          karmadaActionTaintCluster,
			Label:       "Taint Cluster",
			Verb:        "patch",
			Provider:    federation.ProviderKarmada,
			Destructive: false,
		},
	}
}

// Execute dispatches the action request to the appropriate Karmada handler.
func (p *karmadaProvider) Execute(ctx context.Context, cfg *rest.Config, req federation.ActionRequest) (federation.ActionResult, error) {
	switch req.ActionID {
	case karmadaActionJoinCluster:
		return executeKarmadaJoinCluster(ctx, cfg, req)
	case karmadaActionUnjoinCluster:
		return executeKarmadaUnjoinCluster(ctx, cfg, req)
	case karmadaActionTaintCluster:
		return executeKarmadaTaintCluster(ctx, cfg, req)
	default:
		return federation.ActionResult{}, fmt.Errorf("unknown Karmada action: %s", req.ActionID)
	}
}

// executeKarmadaJoinCluster creates a clusters.cluster.karmada.io resource to
// register a cluster with the Karmada control plane. The cluster name comes
// from req.ClusterName; the API server endpoint is expected in
// Payload["apiEndpoint"]. Idempotent — if the Cluster CR already exists,
// returns Already=true.
func executeKarmadaJoinCluster(ctx context.Context, cfg *rest.Config, req federation.ActionRequest) (federation.ActionResult, error) {
	if req.ClusterName == "" {
		return federation.ActionResult{}, fmt.Errorf("clusterName is required for %s", karmadaActionJoinCluster)
	}
	apiEndpoint, _ := req.Payload["apiEndpoint"].(string)
	if apiEndpoint == "" {
		return federation.ActionResult{}, fmt.Errorf("payload.apiEndpoint is required for %s", karmadaActionJoinCluster)
	}

	dc, err := dynamic.NewForConfig(cfg)
	if err != nil {
		return federation.ActionResult{}, fmt.Errorf("building dynamic client: %w", err)
	}

	// Check if the Cluster CR already exists — idempotency guard.
	_, err = dc.Resource(karmadaClusterGVR).Get(ctx, req.ClusterName, metav1.GetOptions{})
	if err == nil {
		return federation.ActionResult{
			OK:      true,
			Already: true,
			Message: fmt.Sprintf("Karmada Cluster %s already exists", req.ClusterName),
		}, nil
	}
	if !isNotFoundError(err) {
		return federation.ActionResult{}, fmt.Errorf("checking Cluster %s: %w", req.ClusterName, err)
	}

	// Build the minimal Cluster CR.
	clusterObj := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "cluster.karmada.io/v1alpha1",
			"kind":       "Cluster",
			"metadata": map[string]interface{}{
				"name": req.ClusterName,
			},
			"spec": map[string]interface{}{
				"apiEndpoint": apiEndpoint,
				"syncMode":    "Pull",
			},
		},
	}

	_, err = dc.Resource(karmadaClusterGVR).Create(ctx, clusterObj, metav1.CreateOptions{})
	if err != nil {
		if isConflictError(err) {
			// Race: another actor created it between our Get and Create.
			return federation.ActionResult{
				OK:      true,
				Already: true,
				Message: fmt.Sprintf("Karmada Cluster %s already exists (conflict)", req.ClusterName),
			}, nil
		}
		return federation.ActionResult{}, fmt.Errorf("creating Karmada Cluster %s: %w", req.ClusterName, err)
	}

	return federation.ActionResult{
		OK:      true,
		Message: fmt.Sprintf("Karmada Cluster %s created", req.ClusterName),
	}, nil
}

// executeKarmadaUnjoinCluster deletes the clusters.cluster.karmada.io resource
// to remove a cluster from the Karmada control plane. This is destructive —
// the UI MUST confirm before calling. If the Cluster CR does not exist,
// returns Already=true (idempotent).
func executeKarmadaUnjoinCluster(ctx context.Context, cfg *rest.Config, req federation.ActionRequest) (federation.ActionResult, error) {
	if req.ClusterName == "" {
		return federation.ActionResult{}, fmt.Errorf("clusterName is required for %s", karmadaActionUnjoinCluster)
	}

	dc, err := dynamic.NewForConfig(cfg)
	if err != nil {
		return federation.ActionResult{}, fmt.Errorf("building dynamic client: %w", err)
	}

	return deleteResourceIdempotent(ctx, dc, karmadaClusterGVR, "", req.ClusterName, req.ClusterName,
		"deleting", "Karmada Cluster",
		fmt.Sprintf("Karmada Cluster %s already deleted", req.ClusterName),
		fmt.Sprintf("Karmada Cluster %s deleted", req.ClusterName))
}

// executeKarmadaTaintCluster adds a taint to the Karmada Cluster's spec.taints.
// The taint is specified in Payload as "key", "value", "effect". If the exact
// taint already exists on the cluster, returns Already=true (idempotent).
func executeKarmadaTaintCluster(ctx context.Context, cfg *rest.Config, req federation.ActionRequest) (federation.ActionResult, error) {
	return taintClusterResource(ctx, cfg, karmadaClusterGVR, "Karmada Cluster", karmadaActionTaintCluster,
		func(clusterName string) string { return "Karmada Cluster " + clusterName }, req)
}

// Ensure compile-time ActionProvider conformance.
var _ federation.ActionProvider = (*karmadaProvider)(nil)
