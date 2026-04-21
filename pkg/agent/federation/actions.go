package federation

import (
	"context"
	"fmt"

	"k8s.io/client-go/rest"
)

// ActionDescriptor describes a single provider action that the console UI can
// invoke. Destructive actions MUST set Destructive=true — the server uses this
// flag to require an explicit confirmation payload from the caller and to emit
// an audit log entry before executing.
type ActionDescriptor struct {
	// ID is the stable, dot-namespaced action identifier used in API requests.
	// Convention: "<provider>.<verbObject>", e.g. "ocm.approveCSR".
	ID string `json:"id"`
	// Label is the human-readable name shown in the UI action menu.
	Label string `json:"label"`
	// Description is a one-sentence explanation of what the action does.
	Description string `json:"description"`
	// Destructive, when true, indicates the action cannot be undone (delete,
	// unregister, unpeer, unfederate). The server rejects requests for
	// destructive actions that lack a confirmed=true field in the request body.
	Destructive bool `json:"destructive"`
	// ClusterNameRequired, when true, indicates the action targets a specific
	// cluster and the caller must supply ClusterName in the ActionRequest.
	ClusterNameRequired bool `json:"clusterNameRequired"`
}

// ActionRequest is the payload sent by the UI when invoking an action.
type ActionRequest struct {
	// ActionID is the descriptor ID of the action to execute.
	ActionID string `json:"actionId"`
	// ClusterName is the target cluster, required when the descriptor has
	// ClusterNameRequired=true.
	ClusterName string `json:"clusterName,omitempty"`
	// Confirmed must be true for destructive actions; the server enforces this
	// before forwarding to Execute.
	Confirmed bool `json:"confirmed,omitempty"`
	// Params carries action-specific extra parameters (e.g. annotation values
	// to patch). Providers are free to define their own sub-keys.
	Params map[string]string `json:"params,omitempty"`
}

// ActionResult is returned by Execute on success. The Message field is shown
// verbatim to the user; providers should keep it brief (one sentence) and
// avoid exposing internal API object names the user did not supply.
type ActionResult struct {
	// Message is the human-readable success summary.
	Message string `json:"message"`
	// Skipped, when true, means the action was a no-op because the target
	// was already in the desired state (idempotency).
	Skipped bool `json:"skipped,omitempty"`
}

// ActionProvider extends Provider with the Phase 2 action surface. A provider
// that does not yet implement actions can embed a NoOpActionProvider to satisfy
// this interface without breakage.
//
// Implementations MUST be concurrency-safe (same contract as Provider).
// Execute MUST be idempotent where the action is labelled non-destructive, and
// SHOULD be idempotent for destructive actions (e.g. delete is a no-op if the
// resource is already gone).
type ActionProvider interface {
	Provider

	// Actions returns the list of actions this provider exposes. The slice is
	// static per process lifetime — callers may cache it.
	Actions() []ActionDescriptor

	// Execute runs the action described by req against the cluster reachable
	// via cfg. The caller has already validated that req.ActionID belongs to
	// this provider and that req.Confirmed=true for destructive actions.
	Execute(ctx context.Context, cfg *rest.Config, req ActionRequest) (ActionResult, error)
}

// ErrUnknownAction is returned by Execute when the ActionID in the request
// does not match any descriptor the provider exports.
var ErrUnknownAction = fmt.Errorf("unknown action")

// UnknownActionError wraps ErrUnknownAction with the offending action ID so
// the server can include it in the 400 response body.
type UnknownActionError struct {
	ActionID string
}

func (e *UnknownActionError) Error() string {
	return fmt.Sprintf("unknown action %q", e.ActionID)
}

func (e *UnknownActionError) Is(target error) bool {
	return target == ErrUnknownAction
}
