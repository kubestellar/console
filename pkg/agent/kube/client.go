package kube

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/kubestellar/console/pkg/agent/protocol"
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
		// Handle "delete pod/mypod" slash format — extract the resource type prefix.
		if strings.Contains(resourceType, "/") {
			parts := strings.SplitN(resourceType, "/", 2)
			resourceType = parts[0]
		}
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
