package providers

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/kubestellar/console/pkg/agent/federation"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/rest"
)

// extractTaintsFromUnstructured reads spec.taints off an unstructured cluster
// object (Karmada Cluster, OCM ManagedCluster) into federation.Taint values.
// Shared by the providers whose cluster CRDs expose a Kubernetes-style
// spec.taints list.
func extractTaintsFromUnstructured(obj *unstructured.Unstructured) []federation.Taint {
	raw, found, _ := unstructured.NestedSlice(obj.Object, "spec", "taints")
	if !found || len(raw) == 0 {
		return nil
	}
	taints := make([]federation.Taint, 0, len(raw))
	for _, t := range raw {
		tm, ok := t.(map[string]interface{})
		if !ok {
			continue
		}
		key, _ := tm["key"].(string)
		value, _ := tm["value"].(string)
		effect, _ := tm["effect"].(string)
		taints = append(taints, federation.Taint{Key: key, Value: value, Effect: effect})
	}
	return taints
}

// taintClusterResource adds a taint to the spec.taints of the named
// unstructured cluster resource (identified by gvr), idempotently — if the
// exact key/value/effect already exists, it returns Already=true instead of
// re-patching. errKind labels the resource in "getting"/"patching" error
// messages (e.g. "Karmada Cluster", "ManagedCluster"); successLabel renders
// the resource in the already-exists/added success messages (pass the
// cluster name verbatim to reproduce a provider that doesn't prefix a kind
// there). Shared by the action implementations of providers whose cluster
// CRDs expose a Kubernetes-style spec.taints list.
func taintClusterResource(ctx context.Context, cfg *rest.Config, gvr schema.GroupVersionResource, errKind, actionName string, successLabel func(clusterName string) string, req federation.ActionRequest) (federation.ActionResult, error) {
	if req.ClusterName == "" {
		return federation.ActionResult{}, fmt.Errorf("clusterName is required for %s", actionName)
	}

	taintKey, _ := req.Payload["key"].(string)
	taintValue, _ := req.Payload["value"].(string)
	taintEffect, _ := req.Payload["effect"].(string)
	if taintKey == "" || taintEffect == "" {
		return federation.ActionResult{}, fmt.Errorf("payload.key and payload.effect are required for %s", actionName)
	}

	dc, err := dynamic.NewForConfig(cfg)
	if err != nil {
		return federation.ActionResult{}, fmt.Errorf("building dynamic client: %w", err)
	}

	current, err := dc.Resource(gvr).Get(ctx, req.ClusterName, metav1.GetOptions{})
	if err != nil {
		return federation.ActionResult{}, fmt.Errorf("getting %s %s: %w", errKind, req.ClusterName, err)
	}

	existingTaints, _, _ := unstructured.NestedSlice(current.Object, "spec", "taints")

	// Check if the exact taint already exists — idempotency guard.
	for _, t := range existingTaints {
		tm, ok := t.(map[string]interface{})
		if !ok {
			continue
		}
		k, _ := tm["key"].(string)
		v, _ := tm["value"].(string)
		e, _ := tm["effect"].(string)
		if k == taintKey && v == taintValue && e == taintEffect {
			return federation.ActionResult{
				OK:      true,
				Already: true,
				Message: fmt.Sprintf("taint %s=%s:%s already exists on %s", taintKey, taintValue, taintEffect, successLabel(req.ClusterName)),
			}, nil
		}
	}

	// Append the new taint and patch.
	newTaint := map[string]interface{}{
		"key":    taintKey,
		"value":  taintValue,
		"effect": taintEffect,
	}
	updatedTaints := append(existingTaints, newTaint)

	patchBody := map[string]interface{}{
		"spec": map[string]interface{}{
			"taints": updatedTaints,
		},
	}
	patchBytes, err := json.Marshal(patchBody)
	if err != nil {
		return federation.ActionResult{}, fmt.Errorf("marshaling taint patch: %w", err)
	}

	_, err = dc.Resource(gvr).Patch(ctx, req.ClusterName, types.MergePatchType, patchBytes, metav1.PatchOptions{})
	if err != nil {
		if isConflictError(err) {
			return federation.ActionResult{
				OK:      true,
				Already: true,
				Message: "patch conflict — taint may already exist",
			}, nil
		}
		return federation.ActionResult{}, fmt.Errorf("patching taints on %s %s: %w", errKind, req.ClusterName, err)
	}

	return federation.ActionResult{
		OK:      true,
		Message: fmt.Sprintf("taint %s=%s:%s added to %s", taintKey, taintValue, taintEffect, successLabel(req.ClusterName)),
	}, nil
}
