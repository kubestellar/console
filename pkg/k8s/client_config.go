package k8s

import (
	"fmt"
	"log/slog"
	"os"
	"time"

	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
)

// LoadConfig loads the kubeconfig
func (m *MultiClusterClient) LoadConfig() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	// If we have in-cluster config and no kubeconfig file, use that.
	if m.inClusterConfig != nil {
		if m.kubeconfig == "" {
			m.rawConfig = nil
			m.clearNoClusterModeLocked()
			m.clients = make(map[string]kubernetes.Interface)
			m.dynamicClients = make(map[string]dynamic.Interface)
			m.configs = make(map[string]*rest.Config)
			m.healthCache = make(map[string]*ClusterHealth)
			m.cacheTime = make(map[string]time.Time)
			return nil
		}
		if _, err := os.Stat(m.kubeconfig); os.IsNotExist(err) {
			slog.Info("No kubeconfig file, using in-cluster config only")
			m.rawConfig = nil
			m.clearNoClusterModeLocked()
			m.clients = make(map[string]kubernetes.Interface)
			m.dynamicClients = make(map[string]dynamic.Interface)
			m.configs = make(map[string]*rest.Config)
			m.healthCache = make(map[string]*ClusterHealth)
			m.cacheTime = make(map[string]time.Time)
			return nil
		}
	}

	if m.kubeconfig == "" {
		m.enterNoClusterModeLocked()
		return ErrNoClusterConfigured
	}

	config, err := clientcmd.LoadFromFile(m.kubeconfig)
	if err != nil {
		if os.IsNotExist(err) {
			m.enterNoClusterModeLocked()
			return ErrNoClusterConfigured
		}
		return fmt.Errorf("failed to load kubeconfig: %w", err)
	}

	m.rawConfig = config
	m.clearNoClusterModeLocked()
	// Clear cached clients when config reloads
	m.clients = make(map[string]kubernetes.Interface)
	m.dynamicClients = make(map[string]dynamic.Interface)
	m.configs = make(map[string]*rest.Config)
	m.healthCache = make(map[string]*ClusterHealth)
	m.cacheTime = make(map[string]time.Time)
	return nil
}

// RemoveContext deletes a context (and its associated cluster/user entries if
// they are not shared by other contexts) from the kubeconfig file (#5658).
func (m *MultiClusterClient) RemoveContext(contextName string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	config, err := clientcmd.LoadFromFile(m.kubeconfig)
	if err != nil {
		return fmt.Errorf("failed to load kubeconfig: %w", err)
	}

	ctx, ok := config.Contexts[contextName]
	if !ok {
		return fmt.Errorf("context %q not found", contextName)
	}

	// Don't allow removing the current context
	if config.CurrentContext == contextName {
		return fmt.Errorf("cannot remove the current context %q", contextName)
	}

	clusterName := ctx.Cluster
	userName := ctx.AuthInfo

	// Remove the context
	delete(config.Contexts, contextName)

	// Check if the cluster/user are still referenced by other contexts
	clusterUsed := false
	userUsed := false
	for _, c := range config.Contexts {
		if c.Cluster == clusterName {
			clusterUsed = true
		}
		if c.AuthInfo == userName {
			userUsed = true
		}
	}
	if !clusterUsed {
		delete(config.Clusters, clusterName)
	}
	if !userUsed {
		delete(config.AuthInfos, userName)
	}

	// Write back
	if err := clientcmd.WriteToFile(*config, m.kubeconfig); err != nil {
		return fmt.Errorf("failed to write kubeconfig: %w", err)
	}

	// Clear cached clients for the removed context
	delete(m.clients, contextName)
	delete(m.dynamicClients, contextName)
	delete(m.configs, contextName)
	delete(m.healthCache, contextName)
	delete(m.cacheTime, contextName)

	m.rawConfig = config
	slog.Info("Removed kubeconfig context", "context", contextName)
	return nil
}
