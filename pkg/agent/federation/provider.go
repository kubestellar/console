package federation

import (
	"context"

	"k8s.io/client-go/rest"
)

// Provider is the plugin contract every multi-cluster-management backend
// implements. Phase 1 (read-only) exposes Detect + three readers; Phase 2
// extends this interface with Actions()/Execute() — see the master plan at
// /Users/andan02/.claude/plans/glistening-stargazing-toast.md.
//
// Implementations MUST be safe to call concurrently — the server fans out
// every registered provider against every kubeconfig context in parallel.
//
// Implementations MUST NOT cache the *rest.Config between calls. The server
// may pass a fresh config per request (e.g. after kubeconfig reload). The
// provider is expected to build its dynamic client on every call from the
// supplied config. If that is too expensive, the server layer can be
// extended with a config-keyed cache without changing this contract.
//
// Every error returned SHOULD be classifiable by the caller via
// ClusterErrorType; providers that cannot distinguish a missing CRD from a
// real failure should return an empty slice and a nil error to represent
// "not installed" — the server's Detect() stage is the canonical source of
// installation truth.
type Provider interface {
	// Name returns the stable provider identifier used by the server, the
	// UI, and the JSON payload. Must match one of the ProviderXxx constants.
	Name() FederationProviderName

	// Detect probes whether the provider's control plane is present on the
	// cluster reachable via cfg. It is the cheapest possible check (API
	// group discovery or a single list on a marker CRD) because the server
	// calls it on every (provider, context) pair before the reader methods.
	// A detected=false result SHOULD NOT return an error — that shape is
	// reserved for probe failures that the UI can surface distinctly from
	// "provider simply not installed."
	Detect(ctx context.Context, cfg *rest.Config) (DetectResult, error)

	// ReadClusters returns every cluster the controller on cfg reports.
	// Phase 1 has no concept of a "current" cluster — the caller iterates
	// every context and stamps HubContext on each returned row.
	ReadClusters(ctx context.Context, cfg *rest.Config) ([]FederatedCluster, error)

	// ReadGroups returns every cluster group (ClusterSet, selector group,
	// peer relationship, infra bucket) the controller on cfg reports.
	ReadGroups(ctx context.Context, cfg *rest.Config) ([]FederatedGroup, error)

	// ReadPendingJoins returns every in-flight registration on cfg.
	// Providers with no concept of pending joins (fully-static federations)
	// return an empty slice and a nil error.
	ReadPendingJoins(ctx context.Context, cfg *rest.Config) ([]PendingJoin, error)
}
