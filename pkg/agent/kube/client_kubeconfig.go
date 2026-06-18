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

// KubeconfigPreviewEntry describes a context found in an imported kubeconfig.
type KubeconfigPreviewEntry struct {
	ContextName string `json:"contextName"`
	ClusterName string `json:"clusterName"`
	ServerURL   string `json:"serverUrl"`
	UserName    string `json:"userName"`
	AuthMethod  string `json:"authMethod,omitempty"` // exec, token, certificate, auth-provider, unknown
	IsNew       bool   `json:"isNew"`
}

// PreviewKubeconfig parses a kubeconfig YAML and returns the contexts it contains
// along with whether each would be new or already exists.
// SECURITY: AuthInfo entries with Exec plugins are flagged with auth method "exec (blocked)".
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
		entry := KubeconfigPreviewEntry{
			ContextName: name,
			ClusterName: ctx.Cluster,
			UserName:    ctx.AuthInfo,
			AuthMethod:  detectAuthMethod(incoming.AuthInfos[ctx.AuthInfo]),
		}
		if cluster, ok := incoming.Clusters[ctx.Cluster]; ok {
			entry.ServerURL = cluster.Server
		}
		_, exists := k.config.Contexts[name]
		entry.IsNew = !exists
		entries = append(entries, entry)
	}
	return entries, nil
}

// ImportKubeconfig merges a kubeconfig YAML string into the existing kubeconfig file.
// It backs up the existing file first, then merges new contexts/clusters/users.
// Returns lists of added and skipped context names.
//
// SECURITY: AuthInfo entries with Exec plugins are rejected to prevent RCE (#7260).
func (k *KubectlProxy) ImportKubeconfig(yamlContent string) (added []string, skipped []string, err error) {
	incoming, err := clientcmd.Load([]byte(yamlContent))
	if err != nil {
		return nil, nil, fmt.Errorf("invalid kubeconfig YAML: %w", err)
	}
	if len(incoming.Contexts) == 0 {
		return nil, nil, fmt.Errorf("kubeconfig contains no contexts")
	}

	// SECURITY: Reject any AuthInfo with an exec plugin — uploading a
	// kubeconfig with exec.command = "/bin/sh" achieves RCE (#7260).
	for name, ai := range incoming.AuthInfos {
		if ai != nil && ai.Exec != nil {
			return nil, nil, fmt.Errorf("SECURITY: kubeconfig user %q uses exec-based auth (command: %s) — exec plugins are not allowed for imported configs", name, ai.Exec.Command)
		}
	}

	k.mu.Lock()
	defer k.mu.Unlock()

	// Backup existing kubeconfig if the file exists.
	// Uses UnixNano to avoid collisions from concurrent imports (#7276).
	if _, statErr := os.Stat(k.kubeconfig); statErr == nil {
		backupPath := fmt.Sprintf("%s.bak-%d", k.kubeconfig, time.Now().UnixNano())
		data, readErr := os.ReadFile(k.kubeconfig)
		if readErr != nil {
			return nil, nil, fmt.Errorf("failed to read kubeconfig for backup: %w", readErr)
		}
		if writeErr := os.WriteFile(backupPath, data, 0600); writeErr != nil {
			return nil, nil, fmt.Errorf("failed to write backup: %w", writeErr)
		}
	}

	// Initialise maps if they are nil (empty starting config)
	if k.config.Contexts == nil {
		k.config.Contexts = make(map[string]*api.Context)
	}
	if k.config.Clusters == nil {
		k.config.Clusters = make(map[string]*api.Cluster)
	}
	if k.config.AuthInfos == nil {
		k.config.AuthInfos = make(map[string]*api.AuthInfo)
	}

	for name, ctx := range incoming.Contexts {
		if _, exists := k.config.Contexts[name]; exists {
			skipped = append(skipped, name)
			continue
		}

		// Resolve cluster name collisions: if the name already exists with
		// different data, pick a unique name so we don't silently drop the
		// incoming cluster definition.
		clusterName := ctx.Cluster
		if incomingCluster, ok := incoming.Clusters[clusterName]; ok {
			if existing, exists := k.config.Clusters[clusterName]; exists {
				if !clustersEquivalent(existing, incomingCluster) {
					clusterName = uniqueName(clusterName, k.config.Clusters)
				}
				// else: same data, reuse existing entry
			}
		}

		// Resolve user/auth-info name collisions the same way.
		userName := ctx.AuthInfo
		if incomingUser, ok := incoming.AuthInfos[userName]; ok {
			if existing, exists := k.config.AuthInfos[userName]; exists {
				if !authInfosEquivalent(existing, incomingUser) {
					userName = uniqueName(userName, k.config.AuthInfos)
				}
			}
		}

		// Build the context with possibly-renamed references.
		mergedCtx := ctx.DeepCopy()
		mergedCtx.Cluster = clusterName
		mergedCtx.AuthInfo = userName
		k.config.Contexts[name] = mergedCtx

		// Add referenced cluster if present
		if cluster, ok := incoming.Clusters[ctx.Cluster]; ok {
			if _, exists := k.config.Clusters[clusterName]; !exists {
				k.config.Clusters[clusterName] = cluster
			}
		}
		// Add referenced user if present
		if user, ok := incoming.AuthInfos[ctx.AuthInfo]; ok {
			if _, exists := k.config.AuthInfos[userName]; !exists {
				k.config.AuthInfos[userName] = user
			}
		}
		added = append(added, name)
	}

	// Write merged config
	if writeErr := clientcmd.WriteToFile(*k.config, k.kubeconfig); writeErr != nil {
		return nil, nil, fmt.Errorf("failed to write merged kubeconfig: %w", writeErr)
	}

	// Reload from file to stay in sync (already holding lock, use internal variant)
	k.reloadLocked()

	return added, skipped, nil
}

// clustersEquivalent returns true if two Cluster structs carry the same
// semantic configuration. The LocationOfOrigin field is ignored because it
// reflects which file a value was loaded from, not the cluster definition.
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

// authInfosEquivalent is the AuthInfo analogue of clustersEquivalent.
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

// uniqueName returns a name that does not collide with any key in m.
// It tries "<base>-imported", then "<base>-imported-2", "-imported-3", etc.
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

// AddClusterRequest describes the form fields for adding a cluster.
type AddClusterRequest struct {
	ContextName   string `json:"contextName"`
	ClusterName   string `json:"clusterName"`
	ServerURL     string `json:"serverUrl"`
	AuthType      string `json:"authType"` // "token", "certificate"
	Token         string `json:"token,omitempty"`
	CertData      string `json:"certData,omitempty"` // base64 PEM
	KeyData       string `json:"keyData,omitempty"`  // base64 PEM
	CAData        string `json:"caData,omitempty"`   // base64 PEM CA cert
	SkipTLSVerify bool   `json:"skipTlsVerify,omitempty"`
	Namespace     string `json:"namespace,omitempty"` // default namespace
}

// AddCluster builds a kubeconfig entry from structured input and merges it.
// Uses mutex for thread safety (#7259) and UnixNano for backup paths (#7276).
func (k *KubectlProxy) AddCluster(req AddClusterRequest) error {
	k.mu.Lock()
	defer k.mu.Unlock()

	// Validate required fields
	if req.ContextName == "" || req.ClusterName == "" || req.ServerURL == "" || req.AuthType == "" {
		return fmt.Errorf("contextName, clusterName, serverUrl, and authType are required")
	}

	// Validate server URL format
	parsedURL, err := url.Parse(req.ServerURL)
	if err != nil {
		return fmt.Errorf("invalid server URL: %w", err)
	}
	if parsedURL.Scheme == "" || parsedURL.Host == "" {
		return fmt.Errorf("server URL must include a scheme and host (e.g. https://api.example.com:6443)")
	}

	// Validate auth-type-specific fields
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

	// Check context doesn't already exist
	if k.config.Contexts != nil {
		if _, exists := k.config.Contexts[req.ContextName]; exists {
			return fmt.Errorf("context %q already exists", req.ContextName)
		}
	}

	// Build cluster entry
	cluster := &api.Cluster{
		Server:                req.ServerURL,
		InsecureSkipTLSVerify: req.SkipTLSVerify,
	}
	if req.CAData != "" {
		caBytes, err := base64.StdEncoding.DecodeString(req.CAData)
		if err != nil {
			return fmt.Errorf("invalid caData base64: %w", err)
		}
		cluster.CertificateAuthorityData = caBytes
	}

	// Build auth info entry
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

	// Build context entry
	ctx := &api.Context{
		Cluster:   req.ClusterName,
		AuthInfo:  userName,
		Namespace: req.Namespace,
	}

	// Backup existing kubeconfig if the file exists.
	// Uses UnixNano to avoid collisions from concurrent imports (#7276).
	if _, statErr := os.Stat(k.kubeconfig); statErr == nil {
		backupPath := fmt.Sprintf("%s.bak-%d", k.kubeconfig, time.Now().UnixNano())
		data, readErr := os.ReadFile(k.kubeconfig)
		if readErr != nil {
			return fmt.Errorf("failed to read kubeconfig for backup: %w", readErr)
		}
		if writeErr := os.WriteFile(backupPath, data, 0600); writeErr != nil {
			return fmt.Errorf("failed to write backup: %w", writeErr)
		}
	}

	// Initialise maps if nil
	if k.config.Contexts == nil {
		k.config.Contexts = make(map[string]*api.Context)
	}
	if k.config.Clusters == nil {
		k.config.Clusters = make(map[string]*api.Cluster)
	}
	if k.config.AuthInfos == nil {
		k.config.AuthInfos = make(map[string]*api.AuthInfo)
	}

	// Add entries
	k.config.Clusters[req.ClusterName] = cluster
	k.config.AuthInfos[userName] = authInfo
	k.config.Contexts[req.ContextName] = ctx

	// Write to file
	if writeErr := clientcmd.WriteToFile(*k.config, k.kubeconfig); writeErr != nil {
		return fmt.Errorf("failed to write kubeconfig: %w", writeErr)
	}

	// Reload (already holding lock, use internal variant)
	k.reloadLocked()
	return nil
}
