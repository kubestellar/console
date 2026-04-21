package providers

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	certificatesv1 "k8s.io/api/certificates/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"

	"github.com/kubestellar/console/pkg/agent/federation"
)

// OCM action IDs — stable identifiers referenced by the UI and tests.
const (
	ocmActionApproveCSR    = "ocm.approveCSR"
	ocmActionAcceptCluster = "ocm.acceptCluster"
	ocmActionDetachCluster = "ocm.detachCluster"
	ocmActionTaintCluster  = "ocm.taintCluster"
)

// Actions returns the set of imperative actions the OCM provider supports.
// See ActionProvider interface in pkg/agent/federation/actions.go.
func (p *ocmProvider) Actions() []federation.ActionDescriptor {
	return []federation.ActionDescriptor{
		{
			ID:          ocmActionApproveCSR,
			Label:       "Approve CSR",
			Verb:        "update",
			Provider:    federation.ProviderOCM,
			Destructive: false,
		},
		{
			ID:          ocmActionAcceptCluster,
			Label:       "Accept Cluster",
			Verb:        "patch",
			Provider:    federation.ProviderOCM,
			Destructive: false,
		},
		{
			ID:          ocmActionDetachCluster,
			Label:       "Detach Cluster",
			Verb:        "delete",
			Provider:    federation.ProviderOCM,
			Destructive: true,
		},
		{
			ID:          ocmActionTaintCluster,
			Label:       "Taint Cluster",
			Verb:        "patch",
			Provider:    federation.ProviderOCM,
			Destructive: false,
		},
	}
}

// Execute dispatches the action request to the appropriate OCM handler.
func (p *ocmProvider) Execute(ctx context.Context, cfg *rest.Config, req federation.ActionRequest) (federation.ActionResult, error) {
	switch req.ActionID {
	case ocmActionApproveCSR:
		return executeOCMApproveCSR(ctx, cfg, req)
	case ocmActionAcceptCluster:
		return executeOCMAcceptCluster(ctx, cfg, req)
	case ocmActionDetachCluster:
		return executeOCMDetachCluster(ctx, cfg, req)
	case ocmActionTaintCluster:
		return executeOCMTaintCluster(ctx, cfg, req)
	default:
		return federation.ActionResult{}, fmt.Errorf("unknown OCM action: %s", req.ActionID)
	}
}

// executeOCMApproveCSR approves a pending CSR for an OCM spoke cluster. The
// CSR name is expected in Payload["csrName"]. If the CSR is already approved,
// returns Already=true.
func executeOCMApproveCSR(ctx context.Context, cfg *rest.Config, req federation.ActionRequest) (federation.ActionResult, error) {
	csrName, _ := req.Payload["csrName"].(string)
	if csrName == "" {
		return federation.ActionResult{}, fmt.Errorf("payload.csrName is required for %s", ocmActionApproveCSR)
	}

	clientset, err := kubernetes.NewForConfig(cfg)
	if err != nil {
		return federation.ActionResult{}, fmt.Errorf("building kubernetes client: %w", err)
	}

	csr, err := clientset.CertificatesV1().CertificateSigningRequests().Get(ctx, csrName, metav1.GetOptions{})
	if err != nil {
		return federation.ActionResult{}, fmt.Errorf("getting CSR %s: %w", csrName, err)
	}

	// Check if already approved.
	for _, c := range csr.Status.Conditions {
		if c.Type == certificatesv1.CertificateApproved {
			return federation.ActionResult{
				OK:      true,
				Already: true,
				Message: fmt.Sprintf("CSR %s is already approved", csrName),
			}, nil
		}
	}

	// Append the Approved condition.
	csr.Status.Conditions = append(csr.Status.Conditions, certificatesv1.CertificateSigningRequestCondition{
		Type:               certificatesv1.CertificateApproved,
		Status:             corev1.ConditionTrue,
		Reason:             "KubeStellarConsoleApproval",
		Message:            "Approved via KubeStellar Console federation action",
		LastUpdateTime:     metav1.Now(),
	})

	_, err = clientset.CertificatesV1().CertificateSigningRequests().UpdateApproval(ctx, csrName, csr, metav1.UpdateOptions{})
	if err != nil {
		if isConflictError(err) {
			return federation.ActionResult{OK: true, Already: true, Message: "CSR approval conflict — likely already approved"}, nil
		}
		return federation.ActionResult{}, fmt.Errorf("approving CSR %s: %w", csrName, err)
	}

	return federation.ActionResult{OK: true, Message: fmt.Sprintf("CSR %s approved", csrName)}, nil
}

// executeOCMAcceptCluster patches the ManagedCluster to set
// spec.hubAcceptsClient=true. Idempotent — if already accepted, returns
// Already=true.
func executeOCMAcceptCluster(ctx context.Context, cfg *rest.Config, req federation.ActionRequest) (federation.ActionResult, error) {
	if req.ClusterName == "" {
		return federation.ActionResult{}, fmt.Errorf("clusterName is required for %s", ocmActionAcceptCluster)
	}

	dc, err := dynamic.NewForConfig(cfg)
	if err != nil {
		return federation.ActionResult{}, fmt.Errorf("building dynamic client: %w", err)
	}

	// Read current state to check idempotency.
	current, err := dc.Resource(ocmManagedClusterGVR).Get(ctx, req.ClusterName, metav1.GetOptions{})
	if err != nil {
		return federation.ActionResult{}, fmt.Errorf("getting ManagedCluster %s: %w", req.ClusterName, err)
	}
	accepted, _, _ := unstructured.NestedBool(current.Object, "spec", "hubAcceptsClient")
	if accepted {
		return federation.ActionResult{
			OK:      true,
			Already: true,
			Message: fmt.Sprintf("ManagedCluster %s already accepted", req.ClusterName),
		}, nil
	}

	patch := []byte(`{"spec":{"hubAcceptsClient":true}}`)
	_, err = dc.Resource(ocmManagedClusterGVR).Patch(ctx, req.ClusterName, types.MergePatchType, patch, metav1.PatchOptions{})
	if err != nil {
		if isConflictError(err) {
			return federation.ActionResult{OK: true, Already: true, Message: "patch conflict — likely already accepted"}, nil
		}
		return federation.ActionResult{}, fmt.Errorf("patching ManagedCluster %s: %w", req.ClusterName, err)
	}

	return federation.ActionResult{OK: true, Message: fmt.Sprintf("ManagedCluster %s accepted", req.ClusterName)}, nil
}

// executeOCMDetachCluster deletes the ManagedCluster resource. This is
// destructive — the UI should confirm before calling.
func executeOCMDetachCluster(ctx context.Context, cfg *rest.Config, req federation.ActionRequest) (federation.ActionResult, error) {
	if req.ClusterName == "" {
		return federation.ActionResult{}, fmt.Errorf("clusterName is required for %s", ocmActionDetachCluster)
	}

	dc, err := dynamic.NewForConfig(cfg)
	if err != nil {
		return federation.ActionResult{}, fmt.Errorf("building dynamic client: %w", err)
	}

	err = dc.Resource(ocmManagedClusterGVR).Delete(ctx, req.ClusterName, metav1.DeleteOptions{})
	if err != nil {
		if isNotFoundError(err) {
			return federation.ActionResult{OK: true, Already: true, Message: fmt.Sprintf("ManagedCluster %s already deleted", req.ClusterName)}, nil
		}
		return federation.ActionResult{}, fmt.Errorf("deleting ManagedCluster %s: %w", req.ClusterName, err)
	}

	return federation.ActionResult{OK: true, Message: fmt.Sprintf("ManagedCluster %s deleted", req.ClusterName)}, nil
}

// executeOCMTaintCluster adds a taint to the ManagedCluster's spec.taints.
// The taint is specified in Payload as "key", "value", "effect". If the
// exact taint already exists, returns Already=true.
func executeOCMTaintCluster(ctx context.Context, cfg *rest.Config, req federation.ActionRequest) (federation.ActionResult, error) {
	if req.ClusterName == "" {
		return federation.ActionResult{}, fmt.Errorf("clusterName is required for %s", ocmActionTaintCluster)
	}

	taintKey, _ := req.Payload["key"].(string)
	taintValue, _ := req.Payload["value"].(string)
	taintEffect, _ := req.Payload["effect"].(string)
	if taintKey == "" || taintEffect == "" {
		return federation.ActionResult{}, fmt.Errorf("payload.key and payload.effect are required for %s", ocmActionTaintCluster)
	}

	dc, err := dynamic.NewForConfig(cfg)
	if err != nil {
		return federation.ActionResult{}, fmt.Errorf("building dynamic client: %w", err)
	}

	current, err := dc.Resource(ocmManagedClusterGVR).Get(ctx, req.ClusterName, metav1.GetOptions{})
	if err != nil {
		return federation.ActionResult{}, fmt.Errorf("getting ManagedCluster %s: %w", req.ClusterName, err)
	}

	existingTaints, _, _ := unstructured.NestedSlice(current.Object, "spec", "taints")

	// Check if the exact taint already exists.
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
				Message: fmt.Sprintf("taint %s=%s:%s already exists on %s", taintKey, taintValue, taintEffect, req.ClusterName),
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

	_, err = dc.Resource(ocmManagedClusterGVR).Patch(ctx, req.ClusterName, types.MergePatchType, patchBytes, metav1.PatchOptions{})
	if err != nil {
		if isConflictError(err) {
			return federation.ActionResult{OK: true, Already: true, Message: "patch conflict — taint may already exist"}, nil
		}
		return federation.ActionResult{}, fmt.Errorf("patching taints on ManagedCluster %s: %w", req.ClusterName, err)
	}

	return federation.ActionResult{
		OK:      true,
		Message: fmt.Sprintf("taint %s=%s:%s added to %s", taintKey, taintValue, taintEffect, req.ClusterName),
	}, nil
}

// isConflictError returns true if the error indicates a 409 Conflict.
func isConflictError(err error) bool {
	if err == nil {
		return false
	}
	return strings.Contains(err.Error(), "409") || strings.Contains(err.Error(), "Conflict") || strings.Contains(err.Error(), "the object has been modified")
}

// isNotFoundError returns true if the error indicates a 404 Not Found.
func isNotFoundError(err error) bool {
	if err == nil {
		return false
	}
	return strings.Contains(err.Error(), "not found") || strings.Contains(err.Error(), "404")
}

// Ensure compile-time ActionProvider conformance.
var _ federation.ActionProvider = (*ocmProvider)(nil)
