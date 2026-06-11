package k8s

import (
	"context"
	"os"
	"strings"
)

// probeNamespacesEnvVar is the environment variable that operators can set to
// extend the list of namespaces probed when a user lacks cluster-wide list
// namespaces permission. Comma-separated. Probed namespaces are de-duplicated
// against the default list (#6512).
const probeNamespacesEnvVar = "KC_PROBE_NAMESPACES"

// defaultProbeNamespaces is the built-in fallback list. These names cover the
// classic Kubernetes ones plus two conventions commonly seen in multi-tenant
// installs (#6512).
var defaultProbeNamespaces = []string{"default", "kube-system", "kube-public", "application", "workloads"}

// buildProbeNamespaces returns the ordered list of namespaces to probe when a
// user cannot list cluster namespaces. Priority order:
//  1. The user's own namespace (from JWT claims via request ctx), if present
//  2. Namespaces from the KC_PROBE_NAMESPACES env var, comma-separated
//  3. defaultProbeNamespaces
//
// Duplicates are removed while preserving first-seen order.
func buildProbeNamespaces(userNamespace string) []string {
	seen := make(map[string]struct{})
	out := make([]string, 0, len(defaultProbeNamespaces)+2)
	add := func(ns string) {
		ns = strings.TrimSpace(ns)
		if ns == "" {
			return
		}
		if _, dup := seen[ns]; dup {
			return
		}
		seen[ns] = struct{}{}
		out = append(out, ns)
	}
	add(userNamespace)
	if env := os.Getenv(probeNamespacesEnvVar); env != "" {
		for _, ns := range strings.Split(env, ",") {
			add(ns)
		}
	}
	for _, ns := range defaultProbeNamespaces {
		add(ns)
	}
	return out
}

// userNamespaceFromContext returns the namespace claimed by the authenticated
// user, if any, via the request context. Returns empty string when unset.
// Uses a typed context key to avoid collisions.
func userNamespaceFromContext(ctx context.Context) string {
	if ctx == nil {
		return ""
	}
	if v, ok := ctx.Value(userNamespaceCtxKey{}).(string); ok {
		return v
	}
	return ""
}

// userNamespaceCtxKey is an unexported type used as a context key for the
// authenticated user's namespace. Handlers that know the user's namespace
// can WithValue it to make getAccessibleNamespaces probe that namespace
// first. Kept unexported so callers inside this package attach it via
// WithUserNamespace below.
type userNamespaceCtxKey struct{}

// WithUserNamespace returns a derived context carrying the authenticated
// user's namespace. Callers that authenticate requests and know the user's
// namespace from JWT claims should wrap the request ctx with this before
// calling into k8s client helpers so namespace probing prefers the user's
// own namespace (#6512).
func WithUserNamespace(ctx context.Context, ns string) context.Context {
	// Guard against a nil parent ctx — context.WithValue panics on nil.
	// userNamespaceFromContext already tolerates a nil ctx, so stay
	// symmetric and fall back to a background context if a caller hands
	// us nil (#6547).
	if ctx == nil {
		ctx = context.Background()
	}
	if ns == "" {
		return ctx
	}
	return context.WithValue(ctx, userNamespaceCtxKey{}, ns)
}
