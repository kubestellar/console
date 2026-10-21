package providers

import (
	"context"
	"fmt"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"

	"github.com/kubestellar/console/pkg/agent/federation"
)

// deleteResourceIdempotent deletes the named resource identified by gvr
// (namespaced if namespace is non-empty, cluster-scoped otherwise) and
// returns Already=true instead of erroring if it is already absent.
// errVerb and errKind are composed with displayName into the wrapped
// delete-error message as "<errVerb> <errKind> <displayName>: %w";
// alreadyMessage and successMessage are returned verbatim so each caller
// keeps its own existing wording. Shared by the provider action
// implementations (CAPI, Karmada, OCM, Clusternet, KubeAdmiral, Liqo) whose
// single destructive action reduces to "delete this CR, idempotently."
func deleteResourceIdempotent(ctx context.Context, dc dynamic.Interface, gvr schema.GroupVersionResource, namespace, resourceName, displayName, errVerb, errKind, alreadyMessage, successMessage string) (federation.ActionResult, error) {
	var err error
	if namespace != "" {
		err = dc.Resource(gvr).Namespace(namespace).Delete(ctx, resourceName, metav1.DeleteOptions{})
	} else {
		err = dc.Resource(gvr).Delete(ctx, resourceName, metav1.DeleteOptions{})
	}
	if err != nil {
		if isNotFoundError(err) {
			return federation.ActionResult{OK: true, Already: true, Message: alreadyMessage}, nil
		}
		return federation.ActionResult{}, fmt.Errorf("%s %s %s: %w", errVerb, errKind, displayName, err)
	}
	return federation.ActionResult{OK: true, Message: successMessage}, nil
}
