package kube

import (
	"bytes"
	"context"
	"time"

	"github.com/kubestellar/console/pkg/agent/protocol"
	"k8s.io/client-go/tools/clientcmd"
)

func (k *KubectlProxy) ListContexts() ([]protocol.ClusterInfo, string) {
	k.mu.RLock()
	defer k.mu.RUnlock()

	clusters := make([]protocol.ClusterInfo, 0)
	current := k.config.CurrentContext

	for name, ctx := range k.config.Contexts {
		cluster := k.config.Clusters[ctx.Cluster]
		server := ""
		if cluster != nil {
			server = cluster.Server
		}
		// Guard against nil AuthInfo — the referenced user entry may not exist
		// in the kubeconfig AuthInfos map. detectAuthMethod handles nil safely.
		authInfo := k.config.AuthInfos[ctx.AuthInfo]
		authMethod := detectAuthMethod(authInfo)
		clusters = append(clusters, protocol.ClusterInfo{
			Name: name, Context: name, Server: server,
			User: ctx.AuthInfo, Namespace: ctx.Namespace,
			AuthMethod: authMethod, IsCurrent: name == current,
		})
	}
	return clusters, current
}

func (k *KubectlProxy) GetCurrentContext() string {
	if k == nil || k.config == nil {
		return ""
	}
	k.mu.RLock()
	defer k.mu.RUnlock()
	return k.config.CurrentContext
}

// GetKubeconfigPath returns the path to the kubeconfig file
func (k *KubectlProxy) GetKubeconfigPath() string {
	if k == nil {
		return ""
	}
	return k.kubeconfig
}

// Reload reloads the kubeconfig from disk. Uses write lock to prevent
// data races with concurrent readers (#7259).
func (k *KubectlProxy) Reload() {
	config, err := clientcmd.LoadFromFile(k.kubeconfig)
	if err == nil {
		k.mu.Lock()
		k.config = config
		k.lastReload = time.Now()
		k.mu.Unlock()
	}
}

// ReloadIfStale reloads the kubeconfig from disk only if the previous reload
// was more than minInterval ago. This absorbs bursty polling from frontend
// callers (e.g. handleClustersHTTP) without skipping updates after the user
// adds a context. Returns true if a fresh load was performed. (#8075)
func (k *KubectlProxy) ReloadIfStale(minInterval time.Duration) bool {
	k.mu.RLock()
	fresh := !k.lastReload.IsZero() && time.Since(k.lastReload) < minInterval
	k.mu.RUnlock()
	if fresh {
		return false
	}
	config, err := clientcmd.LoadFromFile(k.kubeconfig)
	if err != nil {
		// Record the attempt even on failure so a broken kubeconfig doesn't
		// cause a hot loop of LoadFromFile calls on every request.
		k.mu.Lock()
		k.lastReload = time.Now()
		k.mu.Unlock()
		return false
	}
	k.mu.Lock()
	k.config = config
	k.lastReload = time.Now()
	k.mu.Unlock()
	return true
}

// reloadLocked reloads the kubeconfig from disk without acquiring the mutex.
// Caller must already hold k.mu.
func (k *KubectlProxy) reloadLocked() {
	config, err := clientcmd.LoadFromFile(k.kubeconfig)
	if err == nil {
		k.config = config
	}
}

// RenameContext renames a kubeconfig context.
// Uses context timeout to prevent hanging on unreachable clusters (#7279).
func (k *KubectlProxy) RenameContext(oldName, newName string) error {
	cmdArgs := []string{"config", "rename-context", oldName, newName}
	if k.kubeconfig != "" {
		cmdArgs = append([]string{"--kubeconfig", k.kubeconfig}, cmdArgs...)
	}

	ctx, cancel := context.WithTimeout(context.Background(), kubectlRenameTimeout)
	defer cancel()

	cmd := execCommandContext(ctx, "kubectl", cmdArgs...)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return err
	}

	// Reload the config to reflect changes
	config, err := clientcmd.LoadFromFile(k.kubeconfig)
	if err == nil {
		k.mu.Lock()
		k.config = config
		k.mu.Unlock()
	}

	return nil
}
