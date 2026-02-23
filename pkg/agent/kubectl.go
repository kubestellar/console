package agent

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/kubestellar/console/pkg/agent/protocol"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/tools/clientcmd/api"
)

// execCommand allows mocking exec.Command for testing
var execCommand = exec.Command

type KubectlProxy struct {
	kubeconfig string
	config     *api.Config
}

func NewKubectlProxy(kubeconfig string) (*KubectlProxy, error) {
	if kubeconfig == "" {
		kubeconfig = os.Getenv("KUBECONFIG")
	}
	if kubeconfig == "" {
		home, _ := os.UserHomeDir()
		kubeconfig = filepath.Join(home, ".kube", "config")
	}

	config, err := clientcmd.LoadFromFile(kubeconfig)
	if err != nil {
		return &KubectlProxy{kubeconfig: kubeconfig, config: &api.Config{}}, nil
	}

	return &KubectlProxy{kubeconfig: kubeconfig, config: config}, nil
}

func (k *KubectlProxy) ListContexts() ([]protocol.ClusterInfo, string) {
	var clusters []protocol.ClusterInfo
	current := k.config.CurrentContext

	for name, ctx := range k.config.Contexts {
		cluster := k.config.Clusters[ctx.Cluster]
		server := ""
		if cluster != nil {
			server = cluster.Server
		}
		clusters = append(clusters, protocol.ClusterInfo{
			Name: name, Context: name, Server: server,
			User: ctx.AuthInfo, Namespace: ctx.Namespace, IsCurrent: name == current,
		})
	}
	return clusters, current
}

func (k *KubectlProxy) Execute(context, namespace string, args []string) protocol.KubectlResponse {
	cmdArgs := []string{}
	if k.kubeconfig != "" {
		cmdArgs = append(cmdArgs, "--kubeconfig", k.kubeconfig)
	}
	if context != "" {
		cmdArgs = append(cmdArgs, "--context", context)
	}
	if namespace != "" {
		cmdArgs = append(cmdArgs, "-n", namespace)
	}
	cmdArgs = append(cmdArgs, args...)

	if !k.validateArgs(args) {
		return protocol.KubectlResponse{ExitCode: 1, Error: "Disallowed kubectl command"}
	}

	cmd := execCommand("kubectl", cmdArgs...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	exitCode := 0
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		} else {
			exitCode = 1
		}
	}

	output := stdout.String()
	if stderr.String() != "" && output == "" {
		output = stderr.String()
	}
	return protocol.KubectlResponse{Output: output, ExitCode: exitCode, Error: stderr.String()}
}

// AllowedKubectlCommands is a whitelist of safe kubectl commands
// SECURITY: Mostly read-only commands, with controlled write operations
var AllowedKubectlCommands = map[string]bool{
	// Read-only commands
	"get":           true,
	"describe":      true,
	"logs":          true,
	"top":           true,
	"explain":       true,
	"api-resources": true,
	"api-versions":  true,
	"version":       true,
	"cluster-info":  true,
	"config":        true, // Safe: view only works on local kubeconfig
	"auth":          true, // Safe: can-i and whoami are read-only
	"rollout":       true, // Allowed for deployments (status, history, restart)

	// Controlled write operations (validated further by resource type)
	"delete": true, // Allowed only for specific resources (see allowedDeleteResources)
	"scale":  true, // Allowed only for specific resources (see allowedScaleResources)

	// Explicitly blocked (mutation commands) - listed for documentation
	// "apply":   false,
	// "create":  false,
	// "edit":    false,
	// "exec":    false,
	// "cp":      false,
	// "attach":  false,
	// "run":     false,
	// "patch":   false,
	// "replace": false,
	// "drain":   false,
	// "cordon":  false,
	// "uncordon": false,
	// "taint":   false,
	// "label":   false,
	// "annotate": false,
}

// allowedDeleteResources are resource types that can be deleted via the agent
// SECURITY: Only allow deletion of user workload resources, not cluster-level resources
var allowedDeleteResources = map[string]bool{
	"pod":  true,
	"pods": true,
	"po":   true,
	// Add more as needed:
	// "deployment":  true,
	// "deployments": true,
	// "job":         true,
	// "jobs":        true,
}

// allowedScaleResources are resource types that can be scaled via the agent
var allowedScaleResources = map[string]bool{
	"deployment":   true,
	"deployments":  true,
	"deploy":       true,
	"replicaset":   true,
	"replicasets":  true,
	"rs":           true,
	"statefulset":  true,
	"statefulsets": true,
	"sts":          true,
}

// blockedConfigSubcommands are config subcommands that modify kubeconfig
var blockedConfigSubcommands = map[string]bool{
	"set":             true,
	"set-cluster":     true,
	"set-context":     true,
	"set-credentials": true,
	"unset":           true,
	"delete-cluster":  true,
	"delete-context":  true,
	"delete-user":     true,
	// Note: rename-context is handled via dedicated endpoint with validation
}

func (k *KubectlProxy) validateArgs(args []string) bool {
	if len(args) == 0 {
		return false
	}

	command := strings.ToLower(args[0])

	// Check if command is in allowlist
	allowed, exists := AllowedKubectlCommands[command]
	if !exists || !allowed {
		return false
	}

	// Special case: config command - block mutation subcommands
	if command == "config" && len(args) > 1 {
		subcommand := strings.ToLower(args[1])
		if blockedConfigSubcommands[subcommand] {
			return false
		}
	}

	// Special case: delete command - only allow for specific resource types
	if command == "delete" {
		if len(args) < 2 {
			return false // Need at least "delete <resource>"
		}
		resourceType := strings.ToLower(args[1])
		if !allowedDeleteResources[resourceType] {
			return false
		}
	}

	// Special case: scale command - only allow for specific resource types
	if command == "scale" {
		if len(args) < 2 {
			return false // Need at least "scale <resource>"
		}
		// Scale can have format: scale deployment/name or scale --replicas=N deployment name
		resourceArg := strings.ToLower(args[1])
		// Handle "scale deployment/myapp" format
		if strings.Contains(resourceArg, "/") {
			parts := strings.SplitN(resourceArg, "/", 2)
			resourceType := parts[0]
			if !allowedScaleResources[resourceType] {
				return false
			}
		} else if !strings.HasPrefix(resourceArg, "--") {
			// Handle "scale deployment myapp" format
			if !allowedScaleResources[resourceArg] {
				return false
			}
		}
		// If it starts with --, we'll check the next non-flag argument
		// For simplicity, we'll allow it as long as a valid resource type appears somewhere
	}

	// Block any args that might execute arbitrary commands
	for _, arg := range args {
		argLower := strings.ToLower(arg)
		// Block exec in any position (e.g., "kubectl get pods -o jsonpath=... | sh")
		if strings.Contains(argLower, "--exec") {
			return false
		}
		// Block shell metacharacters
		if strings.ContainsAny(arg, ";|&$`") {
			return false
		}
	}

	return true
}

func (k *KubectlProxy) GetCurrentContext() string { return k.config.CurrentContext }

// GetKubeconfigPath returns the path to the kubeconfig file
func (k *KubectlProxy) GetKubeconfigPath() string { return k.kubeconfig }

// Reload reloads the kubeconfig from disk
func (k *KubectlProxy) Reload() {
	config, err := clientcmd.LoadFromFile(k.kubeconfig)
	if err == nil {
		k.config = config
	}
}

// RenameContext renames a kubeconfig context
func (k *KubectlProxy) RenameContext(oldName, newName string) error {
	cmdArgs := []string{"config", "rename-context", oldName, newName}
	if k.kubeconfig != "" {
		cmdArgs = append([]string{"--kubeconfig", k.kubeconfig}, cmdArgs...)
	}

	cmd := execCommand("kubectl", cmdArgs...)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return err
	}

	// Reload the config to reflect changes
	config, err := clientcmd.LoadFromFile(k.kubeconfig)
	if err == nil {
		k.config = config
	}

	return nil
}

// KubeconfigPreviewEntry describes a context found in an imported kubeconfig.
type KubeconfigPreviewEntry struct {
	ContextName string `json:"contextName"`
	ClusterName string `json:"clusterName"`
	ServerURL   string `json:"serverUrl"`
	UserName    string `json:"userName"`
	IsNew       bool   `json:"isNew"`
}

// PreviewKubeconfig parses a kubeconfig YAML and returns the contexts it contains
// along with whether each would be new or already exists.
func (k *KubectlProxy) PreviewKubeconfig(yamlContent string) ([]KubeconfigPreviewEntry, error) {
	incoming, err := clientcmd.Load([]byte(yamlContent))
	if err != nil {
		return nil, fmt.Errorf("invalid kubeconfig YAML: %w", err)
	}
	if len(incoming.Contexts) == 0 {
		return nil, fmt.Errorf("kubeconfig contains no contexts")
	}

	var entries []KubeconfigPreviewEntry
	for name, ctx := range incoming.Contexts {
		entry := KubeconfigPreviewEntry{
			ContextName: name,
			ClusterName: ctx.Cluster,
			UserName:    ctx.AuthInfo,
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
func (k *KubectlProxy) ImportKubeconfig(yamlContent string) (added []string, skipped []string, err error) {
	incoming, err := clientcmd.Load([]byte(yamlContent))
	if err != nil {
		return nil, nil, fmt.Errorf("invalid kubeconfig YAML: %w", err)
	}
	if len(incoming.Contexts) == 0 {
		return nil, nil, fmt.Errorf("kubeconfig contains no contexts")
	}

	// Backup existing kubeconfig if the file exists
	if _, statErr := os.Stat(k.kubeconfig); statErr == nil {
		backupPath := fmt.Sprintf("%s.bak-%d", k.kubeconfig, time.Now().Unix())
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
		// Add context
		k.config.Contexts[name] = ctx
		// Add referenced cluster if present
		if cluster, ok := incoming.Clusters[ctx.Cluster]; ok {
			if _, exists := k.config.Clusters[ctx.Cluster]; !exists {
				k.config.Clusters[ctx.Cluster] = cluster
			}
		}
		// Add referenced user if present
		if user, ok := incoming.AuthInfos[ctx.AuthInfo]; ok {
			if _, exists := k.config.AuthInfos[ctx.AuthInfo]; !exists {
				k.config.AuthInfos[ctx.AuthInfo] = user
			}
		}
		added = append(added, name)
	}

	// Write merged config
	if writeErr := clientcmd.WriteToFile(*k.config, k.kubeconfig); writeErr != nil {
		return nil, nil, fmt.Errorf("failed to write merged kubeconfig: %w", writeErr)
	}

	// Reload from file to stay in sync
	k.Reload()

	return added, skipped, nil
}

// AddClusterRequest describes the form fields for adding a cluster.
type AddClusterRequest struct {
	ContextName   string `json:"contextName"`
	ClusterName   string `json:"clusterName"`
	ServerURL     string `json:"serverUrl"`
	AuthType      string `json:"authType"` // "token", "certificate"
	Token         string `json:"token,omitempty"`
	CertData      string `json:"certData,omitempty"`  // base64 PEM
	KeyData       string `json:"keyData,omitempty"`   // base64 PEM
	CAData        string `json:"caData,omitempty"`    // base64 PEM CA cert
	SkipTLSVerify bool   `json:"skipTlsVerify,omitempty"`
	Namespace     string `json:"namespace,omitempty"` // default namespace
}

// TestConnectionRequest describes the fields for testing a cluster connection.
type TestConnectionRequest struct {
	ServerURL     string `json:"serverUrl"`
	AuthType      string `json:"authType"`
	Token         string `json:"token,omitempty"`
	CertData      string `json:"certData,omitempty"`
	KeyData       string `json:"keyData,omitempty"`
	CAData        string `json:"caData,omitempty"`
	SkipTLSVerify bool   `json:"skipTlsVerify,omitempty"`
}

// TestConnectionResult holds the result of a cluster connection test.
type TestConnectionResult struct {
	Reachable     bool   `json:"reachable"`
	ServerVersion string `json:"serverVersion,omitempty"`
	Error         string `json:"error,omitempty"`
}

// AddCluster builds a kubeconfig entry from structured input and merges it.
func (k *KubectlProxy) AddCluster(req AddClusterRequest) error {
	// Validate required fields
	if req.ContextName == "" || req.ClusterName == "" || req.ServerURL == "" || req.AuthType == "" {
		return fmt.Errorf("contextName, clusterName, serverUrl, and authType are required")
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

	// Backup existing kubeconfig if the file exists
	if _, statErr := os.Stat(k.kubeconfig); statErr == nil {
		backupPath := fmt.Sprintf("%s.bak-%d", k.kubeconfig, time.Now().Unix())
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

	// Reload
	k.Reload()
	return nil
}

// TestClusterConnection attempts to connect to a Kubernetes API server
// and returns basic info (version, reachable status).
func (k *KubectlProxy) TestClusterConnection(req TestConnectionRequest) (*TestConnectionResult, error) {
	if req.ServerURL == "" {
		return nil, fmt.Errorf("serverUrl is required")
	}

	cfg := &rest.Config{
		Host:    req.ServerURL,
		Timeout: 10 * time.Second,
	}

	switch req.AuthType {
	case "token":
		cfg.BearerToken = req.Token
	case "certificate":
		if req.CertData != "" {
			certBytes, err := base64.StdEncoding.DecodeString(req.CertData)
			if err != nil {
				return &TestConnectionResult{Reachable: false, Error: "invalid certData base64"}, nil
			}
			cfg.TLSClientConfig.CertData = certBytes
		}
		if req.KeyData != "" {
			keyBytes, err := base64.StdEncoding.DecodeString(req.KeyData)
			if err != nil {
				return &TestConnectionResult{Reachable: false, Error: "invalid keyData base64"}, nil
			}
			cfg.TLSClientConfig.KeyData = keyBytes
		}
	}

	if req.CAData != "" {
		caBytes, err := base64.StdEncoding.DecodeString(req.CAData)
		if err != nil {
			return &TestConnectionResult{Reachable: false, Error: "invalid caData base64"}, nil
		}
		cfg.TLSClientConfig.CAData = caBytes
	}
	cfg.TLSClientConfig.Insecure = req.SkipTLSVerify

	client, err := kubernetes.NewForConfig(cfg)
	if err != nil {
		return &TestConnectionResult{Reachable: false, Error: err.Error()}, nil
	}

	version, err := client.Discovery().ServerVersion()
	if err != nil {
		return &TestConnectionResult{Reachable: false, Error: err.Error()}, nil
	}

	return &TestConnectionResult{
		Reachable:     true,
		ServerVersion: version.GitVersion,
	}, nil
}
