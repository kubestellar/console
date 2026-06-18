package kube

import (
	"bytes"
	"context"
	"time"

	"github.com/kubestellar/console/pkg/agent/protocol"
	"k8s.io/client-go/tools/clientcmd"
)

const (
	kubectlRenameTimeout     = 30 * time.Second
	KubectlReloadMinInterval = 2 * time.Second
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

func (k *KubectlProxy) GetKubeconfigPath() string {
	if k == nil {
		return ""
	}
	return k.kubeconfig
}

func (k *KubectlProxy) Reload() {
	config, err := clientcmd.LoadFromFile(k.kubeconfig)
	if err == nil {
		k.mu.Lock()
		k.config = config
		k.lastReload = time.Now()
		k.mu.Unlock()
	}
}

func (k *KubectlProxy) ReloadIfStale(minInterval time.Duration) bool {
	k.mu.RLock()
	fresh := !k.lastReload.IsZero() && time.Since(k.lastReload) < minInterval
	k.mu.RUnlock()
	if fresh {
		return false
	}
	config, err := clientcmd.LoadFromFile(k.kubeconfig)
	if err != nil {
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

func (k *KubectlProxy) reloadLocked() {
	config, err := clientcmd.LoadFromFile(k.kubeconfig)
	if err == nil {
		k.config = config
	}
}

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

	config, err := clientcmd.LoadFromFile(k.kubeconfig)
	if err == nil {
		k.mu.Lock()
		k.config = config
		k.mu.Unlock()
	}

	return nil
}
