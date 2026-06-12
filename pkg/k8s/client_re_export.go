package k8s

// Re-export client types for backwards compatibility.
// This file allows existing code importing "pkg/k8s" to continue working
// while new code should import "pkg/k8s/client" directly.

import "github.com/kubestellar/console/pkg/k8s/client"

// MultiClusterClient is re-exported from the client sub-package.
type MultiClusterClient = client.MultiClusterClient

// PrivilegedClient is re-exported from the client sub-package.
type PrivilegedClient = client.PrivilegedClient

// NewMultiClusterClient creates a new multi-cluster client.
func NewMultiClusterClient(kubeconfig string) (*MultiClusterClient, error) {
	return client.NewMultiClusterClient(kubeconfig)
}

// ErrNoClusterConfigured is re-exported from the client sub-package.
var ErrNoClusterConfigured = client.ErrNoClusterConfigured
