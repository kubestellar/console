package providers

import (
	"context"
	"fmt"

	kerrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/rest"

	"github.com/kubestellar/console/pkg/agent/federation"
)

// Action ID constants for the OCM provider. Dot-namespaced: "<provider>.<verbObject>".
const (
	// ocmActionApproveCSR approves a pending CertificateSigningRequest for an
	// OCM ManagedCluster registration. Non-destructive and idempotent.
	ocmActionApproveCSR = "ocm.approveCSR"
	// ocmActionUnregisterCluster deletes the ManagedCluster CR, severing the
	// cluster from the OCM hub. Destructive and irreversible without re-import.
	ocmActionUnregisterCluster = "ocm.unregisterCluster"
)

var ocmActions = []federation.ActionDescriptor{
	{
		ID:                  ocmActionApproveCSR,
		Label:               "Approve CSR",
		Description:         "Approve the pending CertificateSigningRequest to complete OCM cluster registration.",
		Destructive:         false,
		ClusterNameRequired: true,
	},
	{
		ID:                  ocmActionUnregisterCluster,
		Label:               "Unregister Cluster",
		Description:         "Delete the ManagedCluster CR from the OCM hub, permanently unregistering this cluster.",
		Destructive:         true,
		ClusterNameRequired: true,
	},
}

// Actions returns the action descriptors exposed by the OCM provider.
func (p *ocmProvider) Actions() []federation.ActionDescriptor {
	return ocmActions
}

// Execute runs the OCM action identified by req.ActionID.
func (p *ocmProvider) Execute(ctx context.Context, cfg *rest.Config, req federation.ActionRequest) (federation.ActionResult, error) {
	switch req.ActionID {
	case ocmActionApproveCSR:
		return ocmApproveCSR(ctx, cfg, req.ClusterName)
	case ocmActionUnregisterCluster:
		return ocmUnregisterCluster(ctx, cfg, req.ClusterName)
	default:
		return federation.ActionResult{}, &federation.UnknownActionError{ActionID: req.ActionID}
	}
}

// ocmApproveCSR patches the first pending OCM CSR for clusterName with an
// Approved condition. The operation is idempotent: if no pending CSR exists
// the function returns Skipped=true.
func ocmApproveCSR(ctx context.Context, cfg *rest.Config, clusterName string) (federation.ActionResult, error) {
	dc, err := dynamic.NewForConfig(cfg)
	if err != nil {
		return federation.ActionResult{}, err
	}

	list, err := dc.Resource(ocmCSRGVR).List(ctx, metav1.ListOptions{})
	if err != nil {
		if isNotFoundOrGroupNotFound(err) {
			return federation.ActionResult{Skipped: true, Message: "no CSR resources found"}, nil
		}
		return federation.ActionResult{}, err
	}

	// Find the first unapproved CSR belonging to clusterName.
	csrName := ""
	for i := range list.Items {
		csr := &list.Items[i]
		if !isOCMPendingCSR(csr) {
			continue
		}
		if clusterName != "" && extractOCMClusterFromCSR(csr) != clusterName {
			continue
		}
		csrName = csr.GetName()
		break
	}
	if csrName == "" {
		return federation.ActionResult{Skipped: true, Message: "no pending CSR found for cluster " + clusterName}, nil
	}

	// Patch the CSR approval sub-resource.
	patch := []byte(`{"status":{"conditions":[{"type":"Approved","status":"True","reason":"ConsoleApproved","message":"Approved via KubeStellar Console"}]}}`)
	_, err = dc.Resource(ocmCSRGVR).Patch(ctx, csrName, types.MergePatchType, patch, metav1.PatchOptions{}, "approval")
	if err != nil {
		if isConflictError(err) {
			// Already approved by a concurrent actor — idempotent success.
			return federation.ActionResult{Skipped: true, Message: "CSR already approved"}, nil
		}
		return federation.ActionResult{}, fmt.Errorf("approve CSR %s: %w", csrName, err)
	}
	return federation.ActionResult{Message: "CSR " + csrName + " approved"}, nil
}

// ocmUnregisterCluster deletes the named ManagedCluster CR. If the CR is
// already absent the operation returns Skipped=true (idempotent).
func ocmUnregisterCluster(ctx context.Context, cfg *rest.Config, clusterName string) (federation.ActionResult, error) {
	dc, err := dynamic.NewForConfig(cfg)
	if err != nil {
		return federation.ActionResult{}, err
	}

	err = dc.Resource(ocmManagedClusterGVR).Delete(ctx, clusterName, metav1.DeleteOptions{})
	if err != nil {
		if kerrors.IsNotFound(err) {
			return federation.ActionResult{Skipped: true, Message: "cluster " + clusterName + " already removed"}, nil
		}
		return federation.ActionResult{}, fmt.Errorf("unregister cluster %s: %w", clusterName, err)
	}
	return federation.ActionResult{Message: "ManagedCluster " + clusterName + " deleted from OCM hub"}, nil
}

// isConflictError reports whether err is a Kubernetes 409 Conflict.
func isConflictError(err error) bool {
	return kerrors.IsConflict(err)
}

// isNotFoundError reports whether err is a Kubernetes 404 Not Found.
func isNotFoundError(err error) bool {
	return kerrors.IsNotFound(err)
}

// Ensure compile-time interface conformance.
var _ federation.ActionProvider = (*ocmProvider)(nil)
