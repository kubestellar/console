package kube

import (
	"encoding/base64"
	"fmt"
	"net/url"
	"os"
	"reflect"
	"time"

	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/tools/clientcmd/api"
)

type KubeconfigPreviewEntry struct {
	ContextName string `json:"contextName"`
	ClusterName string `json:"clusterName"`
	ServerURL   string `json:"serverUrl"`
	UserName    string `json:"userName"`
	AuthMethod  string `json:"authMethod,omitempty"`
	IsNew       bool   `json:"isNew"`
}

type AddClusterRequest struct {
	ContextName   string `json:"contextName"`
	ClusterName   string `json:"clusterName"`
	ServerURL     string `json:"serverUrl"`
	AuthType      string `json:"authType"`
	Token         string `json:"token,omitempty"`
	CertData      string `json:"certData,omitempty"`
	KeyData       string `json:"keyData,omitempty"`
	CAData        string `json:"caData,omitempty"`
	SkipTLSVerify bool   `json:"skipTlsVerify,omitempty"`
	Namespace     string `json:"namespace,omitempty"`
}

func (k *KubectlProxy) PreviewKubeconfig(yamlContent string) ([]KubeconfigPreviewEntry, error) {
	k.mu.RLock()
	defer k.mu.RUnlock()

	incoming, err := clientcmd.Load([]byte(yamlContent))
	if err != nil {
		return nil, fmt.Errorf("invalid kubeconfig YAML: %w", err)
	}
	if len(incoming.Contexts) == 0 {
		return nil, fmt.Errorf("kubeconfig contains no contexts")
	}

	entries := make([]KubeconfigPreviewEntry, 0)
	for name, ctx := range incoming.Contexts {
		entry := KubeconfigPreviewEntry{ContextName: name, ClusterName: ctx.Cluster, UserName: ctx.AuthInfo, AuthMethod: detectAuthMethod(incoming.AuthInfos[ctx.AuthInfo])}
		if cluster, ok := incoming.Clusters[ctx.Cluster]; ok {
			entry.ServerURL = cluster.Server
		}
		_, exists := k.config.Contexts[name]
		entry.IsNew = !exists
		entries = append(entries, entry)
	}
	return entries, nil
}

func (k *KubectlProxy) ImportKubeconfig(yamlContent string) (added []string, skipped []string, err error) {
	incoming, err := clientcmd.Load([]byte(yamlContent))
	if err != nil {
		return nil, nil, fmt.Errorf("invalid kubeconfig YAML: %w", err)
	}
	if len(incoming.Contexts) == 0 {
		return nil, nil, fmt.Errorf("kubeconfig contains no contexts")
	}

	for name, ai := range incoming.AuthInfos {
		if ai != nil && ai.Exec != nil {
			return nil, nil, fmt.Errorf("SECURITY: kubeconfig user %q uses exec-based auth (command: %s) — exec plugins are not allowed for imported configs", name, ai.Exec.Command)
		}
	}

	k.mu.Lock()
	defer k.mu.Unlock()

	if err := backupKubeconfig(k.kubeconfig); err != nil {
		return nil, nil, err
	}
	ensureConfigMaps(k.config)

	for name, ctx := range incoming.Contexts {
		if _, exists := k.config.Contexts[name]; exists {
			skipped = append(skipped, name)
			continue
		}

		clusterName := ctx.Cluster
		if incomingCluster, ok := incoming.Clusters[clusterName]; ok {
			if existing, exists := k.config.Clusters[clusterName]; exists && !clustersEquivalent(existing, incomingCluster) {
				clusterName = uniqueName(clusterName, k.config.Clusters)
			}
		}

		userName := ctx.AuthInfo
		if incomingUser, ok := incoming.AuthInfos[userName]; ok {
			if existing, exists := k.config.AuthInfos[userName]; exists && !authInfosEquivalent(existing, incomingUser) {
				userName = uniqueName(userName, k.config.AuthInfos)
			}
		}

		mergedCtx := ctx.DeepCopy()
		mergedCtx.Cluster = clusterName
		mergedCtx.AuthInfo = userName
		k.config.Contexts[name] = mergedCtx

		if cluster, ok := incoming.Clusters[ctx.Cluster]; ok {
			if _, exists := k.config.Clusters[clusterName]; !exists {
				k.config.Clusters[clusterName] = cluster
			}
		}
		if user, ok := incoming.AuthInfos[ctx.AuthInfo]; ok {
			if _, exists := k.config.AuthInfos[userName]; !exists {
				k.config.AuthInfos[userName] = user
			}
		}
		added = append(added, name)
	}

	if writeErr := clientcmd.WriteToFile(*k.config, k.kubeconfig); writeErr != nil {
		return nil, nil, fmt.Errorf("failed to write merged kubeconfig: %w", writeErr)
	}

	k.reloadLocked()
	return added, skipped, nil
}

func (k *KubectlProxy) AddCluster(req AddClusterRequest) error {
	k.mu.Lock()
	defer k.mu.Unlock()

	if req.ContextName == "" || req.ClusterName == "" || req.ServerURL == "" || req.AuthType == "" {
		return fmt.Errorf("contextName, clusterName, serverUrl, and authType are required")
	}

	parsedURL, err := url.Parse(req.ServerURL)
	if err != nil {
		return fmt.Errorf("invalid server URL: %w", err)
	}
	if parsedURL.Scheme == "" || parsedURL.Host == "" {
		return fmt.Errorf("server URL must include a scheme and host (e.g. https://api.example.com:6443)")
	}

	switch req.AuthType {
	case "token":
		if req.Token == "" {
			return fmt.Errorf("token is required for token auth type")
		}
	case "certificate":
		if req.CertData == "" || req.KeyData == "" {
			return fmt.Errorf("certData and keyData are required for certificate auth type")
		}
	default:
		return fmt.Errorf("unsupported authType: %s (must be token or certificate)", req.AuthType)
	}

	if k.config.Contexts != nil {
		if _, exists := k.config.Contexts[req.ContextName]; exists {
			return fmt.Errorf("context %q already exists", req.ContextName)
		}
	}

	cluster := &api.Cluster{Server: req.ServerURL, InsecureSkipTLSVerify: req.SkipTLSVerify}
	if req.CAData != "" {
		caBytes, err := base64.StdEncoding.DecodeString(req.CAData)
		if err != nil {
			return fmt.Errorf("invalid caData base64: %w", err)
		}
		cluster.CertificateAuthorityData = caBytes
	}

	userName := req.ContextName + "-user"
	authInfo := &api.AuthInfo{}
	switch req.AuthType {
	case "token":
		authInfo.Token = req.Token
	case "certificate":
		certBytes, err := base64.StdEncoding.DecodeString(req.CertData)
		if err != nil {
			return fmt.Errorf("invalid certData base64: %w", err)
		}
		keyBytes, err := base64.StdEncoding.DecodeString(req.KeyData)
		if err != nil {
			return fmt.Errorf("invalid keyData base64: %w", err)
		}
		authInfo.ClientCertificateData = certBytes
		authInfo.ClientKeyData = keyBytes
	}

	ctx := &api.Context{Cluster: req.ClusterName, AuthInfo: userName, Namespace: req.Namespace}

	if err := backupKubeconfig(k.kubeconfig); err != nil {
		return err
	}
	ensureConfigMaps(k.config)
	k.config.Clusters[req.ClusterName] = cluster
	k.config.AuthInfos[userName] = authInfo
	k.config.Contexts[req.ContextName] = ctx

	if writeErr := clientcmd.WriteToFile(*k.config, k.kubeconfig); writeErr != nil {
		return fmt.Errorf("failed to write kubeconfig: %w", writeErr)
	}

	k.reloadLocked()
	return nil
}

func backupKubeconfig(kubeconfigPath string) error {
	if _, statErr := os.Stat(kubeconfigPath); statErr == nil {
		backupPath := fmt.Sprintf("%s.bak-%d", kubeconfigPath, time.Now().UnixNano())
		data, readErr := os.ReadFile(kubeconfigPath)
		if readErr != nil {
			return fmt.Errorf("failed to read kubeconfig for backup: %w", readErr)
		}
		if writeErr := os.WriteFile(backupPath, data, 0o600); writeErr != nil {
			return fmt.Errorf("failed to write backup: %w", writeErr)
		}
	}
	return nil
}

func ensureConfigMaps(config *api.Config) {
	if config.Contexts == nil {
		config.Contexts = make(map[string]*api.Context)
	}
	if config.Clusters == nil {
		config.Clusters = make(map[string]*api.Cluster)
	}
	if config.AuthInfos == nil {
		config.AuthInfos = make(map[string]*api.AuthInfo)
	}
}

func clustersEquivalent(a, b *api.Cluster) bool {
	if a == nil || b == nil {
		return a == b
	}
	ac := a.DeepCopy()
	bc := b.DeepCopy()
	ac.LocationOfOrigin = ""
	bc.LocationOfOrigin = ""
	return reflect.DeepEqual(ac, bc)
}

func authInfosEquivalent(a, b *api.AuthInfo) bool {
	if a == nil || b == nil {
		return a == b
	}
	ac := a.DeepCopy()
	bc := b.DeepCopy()
	ac.LocationOfOrigin = ""
	bc.LocationOfOrigin = ""
	return reflect.DeepEqual(ac, bc)
}

func uniqueName[V any](base string, m map[string]V) string {
	candidate := base + "-imported"
	if _, exists := m[candidate]; !exists {
		return candidate
	}
	for i := 2; ; i++ {
		candidate = fmt.Sprintf("%s-imported-%d", base, i)
		if _, exists := m[candidate]; !exists {
			return candidate
		}
	}
}
