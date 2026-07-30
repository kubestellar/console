// Package workers contains background worker subsystems (prediction, insight,
// device tracking, metrics history) extracted from the pkg/agent monolith.
package workers

import "github.com/kubestellar/console/pkg/ai"

// ProviderRegistry is the subset of the agent Registry interface that
// background workers need to look up and invoke AI providers.
type ProviderRegistry interface {
	// Get returns the provider registered under the given name, or an error
	// if no provider is registered with that name.
	Get(name string) (ai.Provider, error)

	// GetDefaultName returns the name of the current default provider.
	GetDefaultName() string
}

// maxClusterFanOut caps the number of concurrent goroutines spawned when
// querying multiple clusters in parallel. Prevents goroutine exhaustion.
const maxClusterFanOut = 30
