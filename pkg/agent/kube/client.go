package kube

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/kubestellar/console/pkg/agent/protocol"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/tools/clientcmd/api"
)

const (
	// kubectlExecTimeout bounds how long any kubectl subprocess can run
	// before it is killed. Prevents goroutine/FD leaks from hung apiservers. (#7258, #7206)
	kubectlExecTimeout = 30 * time.Second

	// kubectlRenameTimeout bounds the kubectl config rename-context command. (#7279)
	kubectlRenameTimeout = 30 * time.Second

	// kubectlReloadMinInterval is the minimum time between kubeconfig file
	// re-reads driven by ReloadIfStale. handleClustersHTTP is polled by the
	// frontend and previously called Reload() on every request, which does a
	// full disk read + YAML parse. Two seconds is short enough to feel
	// responsive after the user adds a context, long enough to absorb bursty
	// polling. (#8075)
	KubectlReloadMinInterval = 2 * time.Second
)

// execCommand allows mocking exec.Command for testing
var execCommand = exec.Command

// execCommandContext allows mocking exec.CommandContext for testing (#7258)
var execCommandContext = exec.CommandContext

type KubectlProxy struct {
	mu         sync.RWMutex // guards config against concurrent read/write (#7259)
	kubeconfig string
	config     *api.Config
	lastReload time.Time // wall time of last successful Reload, for ReloadIfStale (#8075)
}

func NewKubectlProxy(kubeconfig string) (*KubectlProxy, error) {
	if kubeconfig == "" {
		kubeconfig = os.Getenv("KUBECONFIG")
	}
	if kubeconfig == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return nil, fmt.Errorf("failed to determine home directory for kubeconfig: %w", err)
		}
		kubeconfig = filepath.Join(home, ".kube", "config")
	}

	config, err := clientcmd.LoadFromFile(kubeconfig)
	if err != nil {
		return &KubectlProxy{kubeconfig: kubeconfig, config: &api.Config{}}, nil
	}

	return &KubectlProxy{kubeconfig: kubeconfig, config: config}, nil
}

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

func (k *KubectlProxy) Execute(ctxName, namespace string, args []string) protocol.KubectlResponse {
	return k.ExecuteWithContext(context.Background(), ctxName, namespace, args)
}

// ExecuteWithContext runs a kubectl command, deriving the execution deadline
// from the supplied parent context. When the parent is cancelled (e.g. the
// WebSocket connection closes), the kubectl process is killed immediately
// instead of running until its own timeout expires (#9997).
func (k *KubectlProxy) ExecuteWithContext(parent context.Context, ctxName, namespace string, args []string) protocol.KubectlResponse {
	cmdArgs := []string{}
	if k.kubeconfig != "" {
		cmdArgs = append(cmdArgs, "--kubeconfig", k.kubeconfig)
	}
	if ctxName != "" {
		cmdArgs = append(cmdArgs, "--context", ctxName)
	}
	if namespace != "" {
		cmdArgs = append(cmdArgs, "-n", namespace)
	}
	cmdArgs = append(cmdArgs, args...)

	if !k.validateArgs(args) {
		return protocol.KubectlResponse{ExitCode: 1, Error: "Disallowed kubectl command"}
	}

	// Bound kubectl execution with a context timeout to prevent goroutine/FD leaks (#7258).
	// Derive from the parent context so client disconnect also cancels the command (#9997).
	ctx, cancel := context.WithTimeout(parent, kubectlExecTimeout)
	defer cancel()

	cmd := execCommandContext(ctx, "kubectl", cmdArgs...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	exitCode := 0
	if err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			return protocol.KubectlResponse{ExitCode: 1, Error: fmt.Sprintf("kubectl timed out after %s", kubectlExecTimeout)}
		}
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

// allowedRolloutSubcommands restricts rollout to read-only operations (#7205).
var AllowedRolloutSubcommands = map[string]bool{
	"status":  true,
	"history": true,
}

// allowedAuthSubcommands restricts auth to read-only operations (#7204).
var allowedAuthSubcommands = map[string]bool{
	"can-i":  true,
	"whoami": true,
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
	"use-context":     true, // #16126: mutates current-context in kubeconfig
	"rename-context":  true, // handled via dedicated endpoint with validation
}

func ValidateKubectlArgs(args []string) bool {
	if len(args) == 0 {
		return false
	}

	command := strings.ToLower(args[0])

	// Check if command is in allowlist
	allowed, exists := AllowedKubectlCommands[command]
	if !exists || !allowed {
		return false
	}

	// Special case: rollout command - only allow read-only subcommands (#7205)
	if command == "rollout" {
		if len(args) < 2 {
			return false // Need at least "rollout <subcommand>"
		}
		subcommand := strings.ToLower(args[1])
		if !AllowedRolloutSubcommands[subcommand] {
			return false
		}
	}

	// Special case: auth command - only allow read-only subcommands (#7204)
	if command == "auth" {
		if len(args) < 2 {
			return false // Need at least "auth <subcommand>"
		}
		subcommand := strings.ToLower(args[1])
		if !allowedAuthSubcommands[subcommand] {
			return false
		}
	}

	// Special case: config command — block mutation subcommands.
	// Skip leading flags (--flag / -x) to find the real subcommand,
	// since kubectl accepts global flags before subcommands (#7261).
	if command == "config" && len(args) > 1 {
		for _, a := range args[1:] {
			token := strings.ToLower(a)
			if strings.HasPrefix(token, "-") {
				continue // skip flags
			}
			if blockedConfigSubcommands[token] {
				return false
			}
			break // first non-flag token is the subcommand
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
		// Extract positional (non-flag) arguments after "scale"
		// Flags start with "-" and are skipped; we need the first positional arg
		// to be a valid scalable resource type.
		var firstPositional string
		for _, a := range args[1:] {
			if strings.HasPrefix(a, "-") {
				continue
			}
			firstPositional = strings.ToLower(a)
			break
		}
		if firstPositional == "" {
			return false // No resource type found
		}
		// Handle "scale deployment/myapp" format
		if strings.Contains(firstPositional, "/") {
			parts := strings.SplitN(firstPositional, "/", 2)
			if !allowedScaleResources[parts[0]] {
				return false
			}
		} else {
			// Handle "scale deployment myapp" format
			if !allowedScaleResources[firstPositional] {
				return false
			}
		}
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

func (k *KubectlProxy) validateArgs(args []string) bool {
	return ValidateKubectlArgs(args)
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
	case "":
		return nil, fmt.Errorf("authType is required")
	default:
		return nil, fmt.Errorf("unsupported authType: %s (must be token or certificate)", req.AuthType)
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
		return &TestConnectionResult{Reachable: false, Error: fmt.Sprintf("failed to create client: %v", err)}, nil
	}

	version, err := client.Discovery().ServerVersion()
	if err != nil {
		return &TestConnectionResult{Reachable: false, Error: fmt.Sprintf("failed to test connection: %v", err)}, nil
	}

	return &TestConnectionResult{
		Reachable:     true,
		ServerVersion: version.GitVersion,
	}, nil
}

// detectAuthMethod examines a kubeconfig AuthInfo entry and returns the auth
// method in use: "exec" (IAM/cloud CLI), "token", "certificate",
// "auth-provider", or "unknown".
func detectAuthMethod(ai *api.AuthInfo) string {
	if ai == nil {
		return "unknown"
	}
	if ai.Exec != nil {
		return "exec"
	}
	if ai.Token != "" || ai.TokenFile != "" {
		return "token"
	}
	if len(ai.ClientCertificateData) > 0 || ai.ClientCertificate != "" {
		return "certificate"
	}
	if ai.AuthProvider != nil {
		return "auth-provider"
	}
	return "unknown"
}
