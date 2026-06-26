package providers

import (
	"context"
	"fmt"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/rest"

	"github.com/kubestellar/console/pkg/agent/federation"
)

// CAPI action IDs — stable identifiers referenced by the UI and tests.
const (
	capiActionScaleMachineDeployment = "capi.scaleMachineDeployment"
	capiActionDeleteCluster          = "capi.deleteCluster"
	capiActionRetryProvisioning      = "capi.retryProvisioning"
)

// capiForceReconcileAnnotation is patched onto a Cluster to trigger the CAPI
// controller to re-evaluate its provisioning state immediately. The annotation
// value is set to the current RFC3339 timestamp so each retry is unique and
// idempotent within the same second.
const capiForceReconcileAnnotation = "cluster.x-k8s.io/paused"

// capiRetryAnnotation is the annotation key used to signal the CAPI controller
// to force-reconcile the Cluster. The annotation key is set; any non-empty
// value causes the controller to re-run reconciliation.
const capiRetryAnnotation = "kubestellar.io/force-reconcile"

// Actions returns the set of imperative actions the CAPI provider supports.
// See ActionProvider interface in pkg/agent/federation/actions.go.
func (p *capiProvider) Actions() []federation.ActionDescriptor {
	return []federation.ActionDescriptor{
		{
			ID:          capiActionScaleMachineDeployment,
			Label:       "Scale Machine Deployment",
			Verb:        "patch",
			Provider:    federation.ProviderCAPI,
			Destructive: false,
		},
		{
			ID:          capiActionDeleteCluster,
			Label:       "Delete Cluster",
			Verb:        "delete",
			Provider:    federation.ProviderCAPI,
			Destructive: true,
		},
		{
			ID:          capiActionRetryProvisioning,
			Label:       "Retry Provisioning",
			Verb:        "patch",
			Provider:    federation.ProviderCAPI,
			Destructive: false,
		},
	}
}

// Execute dispatches the action request to the appropriate CAPI handler.
func (p *capiProvider) Execute(ctx context.Context, cfg *rest.Config, req federation.ActionRequest) (federation.ActionResult, error) {
	switch req.ActionID {
	case capiActionScaleMachineDeployment:
		return executeCAPIScaleMachineDeployment(ctx, cfg, req)
	case capiActionDeleteCluster:
		return executeCAPIDeleteCluster(ctx, cfg, req)
	case capiActionRetryProvisioning:
		return executeCAPIRetryProvisioning(ctx, cfg, req)
	default:
		return federation.ActionResult{}, fmt.Errorf("unknown CAPI action: %s", req.ActionID)
	}
}

// executeCAPIScaleMachineDeployment patches a MachineDeployment's spec.replicas.
// Required payload fields: "name" (MD name), "namespace", "replicas" (float64
// from JSON). If the replicas are already at the requested value, returns
// Already=true. This action is non-destructive and idempotent.
func executeCAPIScaleMachineDeployment(ctx context.Context, cfg *rest.Config, req federation.ActionRequest) (federation.ActionResult, error) {
	mdName, _ := req.Payload["name"].(string)
	ns, _ := req.Payload["namespace"].(string)
	// JSON numbers unmarshal to float64 — convert to int64 for the patch.
	replicasFloat, ok := req.Payload["replicas"].(float64)
	if mdName == "" || ns == "" || !ok {
		return federation.ActionResult{}, fmt.Errorf("payload.name, payload.namespace, and payload.replicas are required for %s", capiActionScaleMachineDeployment)
	}
	replicas := int64(replicasFloat)

	dc, err := dynamic.NewForConfig(cfg)
	if err != nil {
		return federation.ActionResult{}, fmt.Errorf("building dynamic client: %w", err)
	}

	// Read current replicas to check idempotency.
	current, err := dc.Resource(capiMachineDeploymentGVR).Namespace(ns).Get(ctx, mdName, metav1.GetOptions{})
	if err != nil {
		if isNotFoundError(err) {
			return federation.ActionResult{}, fmt.Errorf("MachineDeployment %s/%s not found", ns, mdName)
		}
		return federation.ActionResult{}, fmt.Errorf("getting MachineDeployment %s/%s: %w", ns, mdName, err)
	}

	// Unstructured JSON numbers come back as float64 even for integer fields.
	var currentReplicasF float64
	if spec, ok := current.Object["spec"].(map[string]interface{}); ok {
		currentReplicasF, _ = spec["replicas"].(float64)
	}
	if int64(currentReplicasF) == replicas {
		return federation.ActionResult{
			OK:      true,
			Already: true,
			Message: fmt.Sprintf("MachineDeployment %s/%s already has %d replicas", ns, mdName, replicas),
		}, nil
	}

	patch := []byte(fmt.Sprintf(`{"spec":{"replicas":%d}}`, replicas))
	_, err = dc.Resource(capiMachineDeploymentGVR).Namespace(ns).Patch(ctx, mdName, types.MergePatchType, patch, metav1.PatchOptions{})
	if err != nil {
		if isConflictError(err) {
			return federation.ActionResult{OK: true, Already: true, Message: "patch conflict — replicas may already be updated"}, nil
		}
		return federation.ActionResult{}, fmt.Errorf("patching MachineDeployment %s/%s: %w", ns, mdName, err)
	}

	return federation.ActionResult{
		OK:      true,
		Message: fmt.Sprintf("MachineDeployment %s/%s scaled to %d replicas", ns, mdName, replicas),
	}, nil
}

// executeCAPIDeleteCluster deletes a Cluster resource. This is destructive —
// the UI must confirm before calling. Required payload fields: "namespace".
// The cluster name is taken from req.ClusterName. If the Cluster is already
// gone, returns Already=true.
func executeCAPIDeleteCluster(ctx context.Context, cfg *rest.Config, req federation.ActionRequest) (federation.ActionResult, error) {
	if req.ClusterName == "" {
		return federation.ActionResult{}, fmt.Errorf("clusterName is required for %s", capiActionDeleteCluster)
	}
	ns, _ := req.Payload["namespace"].(string)
	if ns == "" {
		return federation.ActionResult{}, fmt.Errorf("payload.namespace is required for %s", capiActionDeleteCluster)
	}

	dc, err := dynamic.NewForConfig(cfg)
	if err != nil {
		return federation.ActionResult{}, fmt.Errorf("building dynamic client: %w", err)
	}

	err = dc.Resource(capiClusterGVR).Namespace(ns).Delete(ctx, req.ClusterName, metav1.DeleteOptions{})
	if err != nil {
		if isNotFoundError(err) {
			return federation.ActionResult{
				OK:      true,
				Already: true,
				Message: fmt.Sprintf("Cluster %s/%s already deleted", ns, req.ClusterName),
			}, nil
		}
		return federation.ActionResult{}, fmt.Errorf("deleting Cluster %s/%s: %w", ns, req.ClusterName, err)
	}

	return federation.ActionResult{
		OK:      true,
		Message: fmt.Sprintf("Cluster %s/%s deleted", ns, req.ClusterName),
	}, nil
}

// executeCAPIRetryProvisioning adds a force-reconcile annotation to the Cluster
// so the CAPI controller retries provisioning. The annotation value is stamped
// with the current time so each call is unique. Idempotent within the same
// second: if an identical annotation value already exists, returns Already=true.
// Required payload field: "namespace". Cluster name comes from req.ClusterName.
func executeCAPIRetryProvisioning(ctx context.Context, cfg *rest.Config, req federation.ActionRequest) (federation.ActionResult, error) {
	if req.ClusterName == "" {
		return federation.ActionResult{}, fmt.Errorf("clusterName is required for %s", capiActionRetryProvisioning)
	}
	ns, _ := req.Payload["namespace"].(string)
	if ns == "" {
		return federation.ActionResult{}, fmt.Errorf("payload.namespace is required for %s", capiActionRetryProvisioning)
	}

	dc, err := dynamic.NewForConfig(cfg)
	if err != nil {
		return federation.ActionResult{}, fmt.Errorf("building dynamic client: %w", err)
	}

	// Read current annotations to check idempotency — if the annotation was
	// set within the current second, treat it as Already=true to avoid hammering
	// the controller with repeated retries in rapid succession.
	current, err := dc.Resource(capiClusterGVR).Namespace(ns).Get(ctx, req.ClusterName, metav1.GetOptions{})
	if err != nil {
		if isNotFoundError(err) {
			return federation.ActionResult{}, fmt.Errorf("Cluster %s/%s not found", ns, req.ClusterName)
		}
		return federation.ActionResult{}, fmt.Errorf("getting Cluster %s/%s: %w", ns, req.ClusterName, err)
	}

	// Use second-granularity timestamp so back-to-back calls within the same
	// second are treated as a no-op. Named constant for clarity.
	const retryTimestampFormat = time.RFC3339
	nowStamp := time.Now().UTC().Format(retryTimestampFormat)

	annotations := current.GetAnnotations()
	if annotations != nil {
		if existing, ok := annotations[capiRetryAnnotation]; ok && existing == nowStamp {
			return federation.ActionResult{
				OK:      true,
				Already: true,
				Message: fmt.Sprintf("Cluster %s/%s already has force-reconcile annotation for %s", ns, req.ClusterName, nowStamp),
			}, nil
		}
	}

	patch := []byte(fmt.Sprintf(`{"metadata":{"annotations":{%q:%q}}}`, capiRetryAnnotation, nowStamp))
	_, err = dc.Resource(capiClusterGVR).Namespace(ns).Patch(ctx, req.ClusterName, types.MergePatchType, patch, metav1.PatchOptions{})
	if err != nil {
		if isConflictError(err) {
			return federation.ActionResult{OK: true, Already: true, Message: "patch conflict — reconcile annotation may already be set"}, nil
		}
		return federation.ActionResult{}, fmt.Errorf("patching Cluster %s/%s with retry annotation: %w", ns, req.ClusterName, err)
	}

	return federation.ActionResult{
		OK:      true,
		Message: fmt.Sprintf("Cluster %s/%s force-reconcile annotation set to %s", ns, req.ClusterName, nowStamp),
	}, nil
}

// Ensure compile-time ActionProvider conformance.
var _ federation.ActionProvider = (*capiProvider)(nil)
