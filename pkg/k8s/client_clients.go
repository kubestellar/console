package k8s

import (
	"fmt"

	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
)

func (m *MultiClusterClient) GetClient(contextName string) (kubernetes.Interface, error) {
	m.mu.RLock()
	if client, ok := m.clients[contextName]; ok {
		m.mu.RUnlock()
		return client, nil
	}
	inClusterConfig := m.inClusterConfig
	kubeconfigPath := m.kubeconfig
	inClusterName := m.inClusterName
	noClusterMode := m.noClusterMode
	m.mu.RUnlock()

	if noClusterMode && inClusterConfig == nil {
		return nil, ErrNoClusterConfigured
	}

	// Build the client OUTSIDE the lock so concurrent callers for distinct
	// contexts don't serialize on a single write lock (#9334). It is
	// intentionally acceptable for two goroutines racing on the same context
	// to both build a client here — the final map insertion under the write
	// lock is idempotent (first writer wins, second discards its extra client).
	var config *rest.Config
	var err error

	// Handle in-cluster context specially — accept both "in-cluster" and the detected name
	isInCluster := inClusterConfig != nil && (contextName == "in-cluster" || contextName == inClusterName)
	if isInCluster {
		config = rest.CopyConfig(inClusterConfig)
	} else {
		config, err = clientcmd.NewNonInteractiveDeferredLoadingClientConfig(
			&clientcmd.ClientConfigLoadingRules{ExplicitPath: kubeconfigPath},
			&clientcmd.ConfigOverrides{CurrentContext: contextName},
		).ClientConfig()
		if err != nil {
			return nil, fmt.Errorf("failed to get config for context %s: %w", contextName, err)
		}
	}

	// Set reasonable timeouts — large OpenShift clusters (18+ nodes) can return
	// 800KB+ node payloads that take >10s over higher-latency links
	config.Timeout = k8sClientTimeout

	client, err := kubernetes.NewForConfig(config)
	if err != nil {
		return nil, fmt.Errorf("failed to create client for context %s: %w", contextName, err)
	}

	// Install the constructed client under a short write lock. If a concurrent
	// caller beat us to it, reuse the existing entry (#9334).
	m.mu.Lock()
	defer m.mu.Unlock()
	if existing, ok := m.clients[contextName]; ok {
		return existing, nil
	}
	m.clients[contextName] = client
	m.configs[contextName] = config
	return client, nil
}

// GetRestConfig returns the REST config for the specified cluster context.
// Ensures the client (and config) is initialized first by calling GetClient.
func (m *MultiClusterClient) GetRestConfig(contextName string) (*rest.Config, error) {
	if _, err := m.GetClient(contextName); err != nil {
		return nil, err
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	config, ok := m.configs[contextName]
	if !ok {
		return nil, fmt.Errorf("no config for context %s", contextName)
	}
	return rest.CopyConfig(config), nil
}

// GetDynamicClient returns a dynamic kubernetes client for the specified context.
//
// #10255 — Same lock-reduction pattern as GetClient (#9334). Client construction
// (especially kubeconfigs with exec credential plugins) can take hundreds of ms.
// Holding the global write lock during construction serializes all cluster probes.
// We build the client OUTSIDE the lock and only take the write lock for the short
// final insertion.
func (m *MultiClusterClient) GetDynamicClient(contextName string) (dynamic.Interface, error) {
	m.mu.RLock()
	if client, ok := m.dynamicClients[contextName]; ok {
		m.mu.RUnlock()
		return client, nil
	}
	// Snapshot fields needed for construction so we can release the lock.
	cachedConfig, hasConfig := m.configs[contextName]
	inClusterConfig := m.inClusterConfig
	kubeconfigPath := m.kubeconfig
	inClusterName := m.inClusterName
	noClusterMode := m.noClusterMode
	m.mu.RUnlock()

	if noClusterMode && inClusterConfig == nil {
		return nil, ErrNoClusterConfigured
	}

	// Build the client OUTSIDE the lock so concurrent callers for distinct
	// contexts don't serialize on a single write lock (#10255). It is
	// intentionally acceptable for two goroutines racing on the same context
	// to both build a client here — the final map insertion under the write
	// lock is idempotent (first writer wins, second discards its extra client).
	var config *rest.Config
	if hasConfig {
		config = cachedConfig
	} else {
		var err error
		isInCluster := inClusterConfig != nil && (contextName == "in-cluster" || contextName == inClusterName)
		if isInCluster {
			config = rest.CopyConfig(inClusterConfig)
		} else {
			config, err = clientcmd.NewNonInteractiveDeferredLoadingClientConfig(
				&clientcmd.ClientConfigLoadingRules{ExplicitPath: kubeconfigPath},
				&clientcmd.ConfigOverrides{CurrentContext: contextName},
			).ClientConfig()
			if err != nil {
				return nil, fmt.Errorf("failed to get config for context %s: %w", contextName, err)
			}
		}
		config.Timeout = k8sClientTimeout
	}

	client, err := dynamic.NewForConfig(config)
	if err != nil {
		return nil, fmt.Errorf("failed to create dynamic client for context %s: %w", contextName, err)
	}

	// Install the constructed client under a short write lock. If a concurrent
	// caller beat us to it, reuse the existing entry (#10255).
	m.mu.Lock()
	defer m.mu.Unlock()
	if existing, ok := m.dynamicClients[contextName]; ok {
		return existing, nil
	}
	m.dynamicClients[contextName] = client
	if !hasConfig {
		m.configs[contextName] = config
	}
	return client, nil
}

// ClassifyError determines the error type from an error message.
// Returns one of: "timeout", "auth", "network", "certificate", or "unknown".
