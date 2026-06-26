// Package federation defines the provider-plugin interface that kc-agent uses
// to report multi-cluster-management awareness (federation hubs, registered
// clusters, lifecycle state, etc.) back to the console UI.
//
// See /Users/andan02/.claude/plans/glistening-stargazing-toast.md and Issue
// 9368 for the broader rollout plan. PR A introduces the types, interface,
// registry, and multi-hub fan-out server with NO provider implementations.
// Each subsequent PR (B-E for readers, F-I for actions) adds one provider at
// a time — all UI work ships in PR B onwards.
//
// IMPORTANT: this package intentionally contains no network or kubeconfig
// lookup logic itself. Providers read through the dynamic client they receive
// from the server layer, which is built from the user's kubeconfig —
// NEVER from InClusterConfig. That constraint keeps federation reads aligned
// with the console-wide identity rule (pod SA is reserved for bootstrap,
// GPU reservation, and self-upgrade only).
package federation

import "time"

// FederationProviderName identifies one multi-cluster-management backend. It
// exists as a distinct string alias (not a bare string) so callers that
// accidentally pass a UI-facing label cannot silently be routed to the wrong
// provider by the registry.
type FederationProviderName string

const (
	// ProviderOCM is Red Hat / CNCF Sandbox Open Cluster Management
	// (cluster.open-cluster-management.io).
	ProviderOCM FederationProviderName = "ocm"
	// ProviderKarmada is CNCF Incubating Karmada (cluster.karmada.io).
	ProviderKarmada FederationProviderName = "karmada"
	// ProviderClusternet is CNCF Sandbox Clusternet (clusters.clusternet.io).
	ProviderClusternet FederationProviderName = "clusternet"
	// ProviderLiqo is CNCF Sandbox Liqo (discovery.liqo.io).
	ProviderLiqo FederationProviderName = "liqo"
	// ProviderKubeAdmiral is CNCF Sandbox KubeAdmiral (core.kubeadmiral.io).
	ProviderKubeAdmiral FederationProviderName = "kubeadmiral"
	// ProviderCAPI is CNCF Incubating Cluster API (cluster.x-k8s.io). CAPI
	// is lifecycle-oriented rather than federation-oriented, but lives in the
	// same plugin because "My Clusters" surfaces both pools together.
	ProviderCAPI FederationProviderName = "capi"
)

// ClusterState is the unified state enum shared across federation-style and
// lifecycle-style providers. Federation providers (OCM, Karmada, Clusternet,
// Liqo, KubeAdmiral) emit the first group; CAPI emits the lifecycle group.
// The cross-provider union lets a single UI row render either flavor without
// a parallel schema. See Issue 9368.
type ClusterState string

const (
	// ClusterStateJoined — federation controller has accepted the cluster.
	ClusterStateJoined ClusterState = "joined"
	// ClusterStatePending — registration in progress (CSR awaiting approval,
	// ForeignCluster peering, Machine bootstrapping, ...).
	ClusterStatePending ClusterState = "pending"
	// ClusterStateUnknown — controller reports the cluster but not its state.
	ClusterStateUnknown ClusterState = "unknown"
	// ClusterStateNotMember — cluster is visible to the hub but explicitly
	// not part of any ClusterSet / selector.
	ClusterStateNotMember ClusterState = "not-member"
	// ClusterStateProvisioning — CAPI is creating infrastructure.
	ClusterStateProvisioning ClusterState = "provisioning"
	// ClusterStateProvisioned — CAPI reports the cluster is up; user may or
	// may not have imported the kubeconfig yet.
	ClusterStateProvisioned ClusterState = "provisioned"
	// ClusterStateFailed — CAPI provisioning failed; user retry required.
	ClusterStateFailed ClusterState = "failed"
	// ClusterStateDeleting — CAPI is tearing the cluster down.
	ClusterStateDeleting ClusterState = "deleting"
)

// ClusterErrorType classifies per-provider, per-hub failures so the UI can
// render distinct affordances (retry, reauth, install-guide) without parsing
// error message strings. Mirrors pkg/k8s classifyError() output vocabulary
// so the same UI can consume both shapes — see NodeClusterError from PR 9359.
type ClusterErrorType string

const (
	// ClusterErrorAuth — 401/403, expired token, missing credentials.
	ClusterErrorAuth ClusterErrorType = "auth"
	// ClusterErrorTimeout — deadline exceeded, controller unresponsive.
	ClusterErrorTimeout ClusterErrorType = "timeout"
	// ClusterErrorNetwork — dial failure, DNS miss, connection refused.
	ClusterErrorNetwork ClusterErrorType = "network"
	// ClusterErrorCertificate — TLS / x509 issue on the hub endpoint.
	ClusterErrorCertificate ClusterErrorType = "certificate"
	// ClusterErrorNotInstalled — provider's CRDs are absent on this context;
	// not a failure, just negative detection.
	ClusterErrorNotInstalled ClusterErrorType = "not-installed"
	// ClusterErrorUnknown — classification fell through all branches.
	ClusterErrorUnknown ClusterErrorType = "unknown"
)

// Lifecycle carries CAPI-specific readiness counters. The field is optional
// on FederatedCluster so federation-only providers leave it nil.
type Lifecycle struct {
	// Phase is Cluster.status.phase ("Pending"/"Provisioning"/"Provisioned"/
	// "Failed"/"Deleting"). Kept as raw string to preserve CAPI-specific
	// phases the console may not know about yet.
	Phase string `json:"phase"`
	// ControlPlaneReady mirrors Cluster.status.controlPlaneReady.
	ControlPlaneReady bool `json:"controlPlaneReady"`
	// InfrastructureReady mirrors Cluster.status.infrastructureReady.
	InfrastructureReady bool `json:"infrastructureReady"`
	// DesiredMachines is the sum of MachineDeployment.spec.replicas across
	// all MDs that target this cluster.
	DesiredMachines int32 `json:"desiredMachines"`
	// ReadyMachines is the sum of ready Machine counts for this cluster.
	ReadyMachines int32 `json:"readyMachines"`
}

// FederatedCluster is one row in the "My Clusters" federation overlay. The
// same cluster can appear multiple times across the slice (e.g. joined to
// OCM hub A and Karmada control plane B) — deduplication is a UI concern,
// not a provider concern.
type FederatedCluster struct {
	// Provider is the provider plugin that reported this row. Required.
	Provider FederationProviderName `json:"provider"`
	// HubContext is the kubeconfig context hosting the federation controller
	// that reported this cluster. Required for multi-hub disambiguation — a
	// cluster may appear on multiple hubs simultaneously.
	HubContext string `json:"hubContext"`
	// Name is the cluster's identifier on that hub (ManagedCluster.name,
	// Cluster.name, etc.). May differ from the user's local kubeconfig
	// context name.
	Name string `json:"name"`
	// State is the federation or lifecycle state.
	State ClusterState `json:"state"`
	// Available mirrors a conditions[type=Available] True/False/Unknown
	// tri-state across providers. Providers that don't expose availability
	// set "Unknown".
	Available string `json:"available"`
	// ClusterSet, when non-empty, names the group the cluster belongs to
	// (ManagedClusterSet, selector group, peer, infra namespace, etc.).
	ClusterSet string `json:"clusterSet,omitempty"`
	// Labels are the cluster's labels as reported by the controller.
	Labels map[string]string `json:"labels,omitempty"`
	// APIServerURL is the cluster's public API server endpoint, if exposed
	// by the controller. Used by the UI to correlate this row with a
	// kubeconfig entry the user already has.
	APIServerURL string `json:"apiServerURL,omitempty"`
	// Taints are the federation-managed taints on the cluster (OCM / Karmada).
	Taints []Taint `json:"taints,omitempty"`
	// Lifecycle is CAPI-specific; nil on other providers.
	Lifecycle *Lifecycle `json:"lifecycle,omitempty"`
	// Raw is the original controller CR (typed or unstructured) for use by
	// drill-down views that need provider-specific fields. JSON-serialized
	// as opaque — the UI is expected to treat it as untyped.
	Raw interface{} `json:"raw,omitempty"`
}

// Taint mirrors the common taint shape used by OCM ManagedCluster.spec.taints
// and Karmada Cluster.spec.taints. Effect is the enum string as reported.
type Taint struct {
	Key    string `json:"key"`
	Value  string `json:"value,omitempty"`
	Effect string `json:"effect"`
}

// FederatedGroupKind distinguishes grouping models so the UI can pick the
// right label (hub-style ClusterSet vs. peer relationship vs. infra bucket).
type FederatedGroupKind string

const (
	// FederatedGroupSet — explicit grouping resource (OCM ManagedClusterSet).
	FederatedGroupSet FederatedGroupKind = "set"
	// FederatedGroupSelector — rule-based grouping (PropagationPolicy
	// labelSelector, FederatedCluster labels).
	FederatedGroupSelector FederatedGroupKind = "selector"
	// FederatedGroupPeer — peer-to-peer relationship (Liqo ForeignCluster).
	FederatedGroupPeer FederatedGroupKind = "peer"
	// FederatedGroupInfra — infrastructure bucket (CAPI AWSCluster /
	// AzureCluster / DockerCluster namespace).
	FederatedGroupInfra FederatedGroupKind = "infra"
)

// FederatedGroup is a cluster grouping scoped to one (provider, hub) pair.
// The UI namespaces groups as "provider:hubContext:name" to avoid collisions
// when two hubs report a group with the same name.
type FederatedGroup struct {
	Provider   FederationProviderName `json:"provider"`
	HubContext string                 `json:"hubContext"`
	Name       string                 `json:"name"`
	Members    []string               `json:"members"`
	Kind       FederatedGroupKind     `json:"kind"`
}

// PendingJoin is a cluster whose registration is in flight. For OCM this is
// a pending CSR; for Karmada it's a joining Cluster CR; for Liqo it's an
// incoming ForeignCluster; for CAPI it's a Machine that has yet to bootstrap.
type PendingJoin struct {
	Provider    FederationProviderName `json:"provider"`
	HubContext  string                 `json:"hubContext"`
	ClusterName string                 `json:"clusterName"`
	RequestedAt time.Time              `json:"requestedAt"`
	// Detail is a free-form human-readable hint (CSR name, ForeignCluster
	// remote URL, Machine bootstrap status message).
	Detail string `json:"detail,omitempty"`
}

// FederationError reports a per-(provider, hub) failure. Mirrors the
// NodeClusterError shape landed by Issue 9359 so existing error-classifier
// UI code can consume this directly. One FederationError NEVER poisons
// another provider's or hub's results — aggregation is per-pair.
type FederationError struct {
	Provider   FederationProviderName `json:"provider"`
	HubContext string                 `json:"hubContext"`
	Type       ClusterErrorType       `json:"type"`
	Message    string                 `json:"message"`
}

// Error implements the error interface so callers can return a
// FederationError directly where `error` is expected. The stringified form
// is purely for logs; callers consuming the struct fields should use the
// typed access instead of parsing the message.
func (e *FederationError) Error() string {
	if e == nil {
		return ""
	}
	return string(e.Type) + ": " + e.Message
}

// ProviderHubStatus is the result of calling Detect() for one (provider,
// hub) pair. The UI renders one hub tile per entry.
type ProviderHubStatus struct {
	Provider   FederationProviderName `json:"provider"`
	HubContext string                 `json:"hubContext"`
	Detected   bool                   `json:"detected"`
	Version    string                 `json:"version,omitempty"`
	// Error is non-nil only when detection itself errored (not when the
	// controller is simply absent — that case returns Detected=false with a
	// nil Error; see ClusterErrorNotInstalled handling in providers).
	Error *FederationError `json:"error,omitempty"`
}

// DetectResult is what Provider.Detect returns. Kept distinct from
// ProviderHubStatus because the provider layer doesn't know the hub context
// it was invoked against — the server layer stamps that on afterwards.
type DetectResult struct {
	Detected bool   `json:"detected"`
	Version  string `json:"version,omitempty"`
}
