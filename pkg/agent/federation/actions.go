package federation

import (
	"context"

	"k8s.io/client-go/rest"
)

// ActionDescriptor describes a single imperative action a provider can execute.
// The backend exposes each provider's descriptors via Actions() so the UI can
// render per-cluster action menus without hardcoding provider-specific logic.
// Phase 2 of the federation roll-out — see Issue 9368.
type ActionDescriptor struct {
	// ID is the stable identifier for this action (e.g. "ocm.approveCSR").
	ID string `json:"id"`
	// Label is the human-readable button label for the UI.
	Label string `json:"label"`
	// Verb is the Kubernetes API verb the action performs (e.g. "update",
	// "patch", "delete"). Used by the UI to gate SSAR checks.
	Verb string `json:"verb"`
	// Provider identifies which provider owns this action.
	Provider FederationProviderName `json:"provider"`
	// Destructive flags actions that warrant a confirmation dialog in the UI
	// (e.g. detaching a cluster). The UI MUST show a ConfirmDialog before
	// executing any action with Destructive=true.
	Destructive bool `json:"destructive"`
}

// ActionRequest is the POST body the frontend sends to /federation/action.
type ActionRequest struct {
	// ActionID is the ActionDescriptor.ID to execute.
	ActionID string `json:"actionId"`
	// Provider selects the provider that owns the action.
	Provider FederationProviderName `json:"provider"`
	// HubContext is the kubeconfig context hosting the federation hub.
	HubContext string `json:"hubContext"`
	// ClusterName is the target cluster for cluster-scoped actions. Optional
	// for hub-scoped actions (e.g. approving a CSR by name in Payload).
	ClusterName string `json:"clusterName,omitempty"`
	// Payload carries action-specific parameters (e.g. taint key/value/effect
	// for karmada.taintCluster). Keys are action-defined.
	Payload map[string]interface{} `json:"payload,omitempty"`
}

// ActionResult is the JSON response from /federation/action.
type ActionResult struct {
	// OK is true when the action completed successfully.
	OK bool `json:"ok"`
	// Already is true when the action was a no-op because the desired state
	// already existed (e.g. cluster already joined, taint already present).
	// OK is also true when Already is true.
	Already bool `json:"already"`
	// Message carries a human-readable status string on both success and
	// failure. On failure (OK=false) it contains the error details.
	Message string `json:"message,omitempty"`
}

// ActionProvider extends Provider with imperative action capabilities. Phase 1
// providers that only implement read-only operations satisfy the base Provider
// interface; Phase 2 providers that also support management operations implement
// ActionProvider. The server asserts ActionProvider at runtime — providers that
// don't implement it simply have no actions exposed.
type ActionProvider interface {
	Provider
	// Actions returns the set of imperative actions this provider supports.
	// The returned slice is stable for the process lifetime — providers MUST
	// NOT change the set dynamically.
	Actions() []ActionDescriptor
	// Execute runs the action described by req against the hub reachable via
	// cfg. Implementations MUST be idempotent where possible: repeating an
	// already-completed action returns ActionResult{OK:true, Already:true}.
	Execute(ctx context.Context, cfg *rest.Config, req ActionRequest) (ActionResult, error)
}
