package agent

import (
	"bytes"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/kubestellar/console/pkg/agent/protocol"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/tools/clientcmd/api"
)

// KubectlProxy handles kubectl command execution
type KubectlProxy struct {
	kubeconfig string
	config     *api.Config
}

// NewKubectlProxy creates a new kubectl proxy
func NewKubectlProxy(kubeconfig string) (*KubectlProxy, error) {
	// Find kubeconfig
	if kubeconfig == "" {
		kubeconfig = os.Getenv("KUBECONFIG")
	}
	if kubeconfig == "" {
		home, _ := os.UserHomeDir()
		kubeconfig = filepath.Join(home, ".kube", "config")
	}

	// Load kubeconfig
	config, err := clientcmd.LoadFromFile(kubeconfig)
	if err != nil {
		// Return empty proxy if kubeconfig not found
		return &KubectlProxy{
			kubeconfig: kubeconfig,
			config:     &api.Config{},
		}, nil
	}

	return &KubectlProxy{
		kubeconfig: kubeconfig,
		config:     config,
	}, nil
}

// ListContexts returns all available kubeconfig contexts
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
			Name:      name,
			Context:   name,
			Server:    server,
			Namespace: ctx.Namespace,
			IsCurrent: name == current,
		})
	}

	return clusters, current
}

// Execute runs a kubectl command
func (k *KubectlProxy) Execute(context, namespace string, args []string) protocol.KubectlResponse {
	// Build command arguments
	cmdArgs := []string{}

	// Add kubeconfig
	if k.kubeconfig != "" {
		cmdArgs = append(cmdArgs, "--kubeconfig", k.kubeconfig)
	}

	// Add context if specified
	if context != "" {
		cmdArgs = append(cmdArgs, "--context", context)
	}

	// Add namespace if specified
	if namespace != "" {
		cmdArgs = append(cmdArgs, "-n", namespace)
	}

	// Add user args
	cmdArgs = append(cmdArgs, args...)

	// Validate args (basic security check)
	if !k.validateArgs(args) {
		return protocol.KubectlResponse{
			ExitCode: 1,
			Error:    "Invalid or disallowed kubectl arguments",
		}
	}

	// Execute kubectl
	cmd := exec.Command("kubectl", cmdArgs...)
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
	errOutput := stderr.String()
	if errOutput != "" && output == "" {
		output = errOutput
	}

	return protocol.KubectlResponse{
		Output:   output,
		ExitCode: exitCode,
		Error:    errOutput,
	}
}

// validateArgs performs basic security validation on kubectl args
func (k *KubectlProxy) validateArgs(args []string) bool {
	if len(args) == 0 {
		return false
	}

	// Disallow dangerous commands
	dangerousCommands := []string{
		"delete",  // Could delete resources
		"exec",    // Could execute arbitrary commands
		"cp",      // Could copy files
		"attach",  // Could attach to pods
		"run",     // Could run pods
		"apply",   // Could apply manifests
		"create",  // Could create resources
		"patch",   // Could patch resources
		"replace", // Could replace resources
		"edit",    // Could edit resources
	}

	firstArg := strings.ToLower(args[0])
	for _, dangerous := range dangerousCommands {
		if firstArg == dangerous {
			return false
		}
	}

	return true
}

// GetCurrentContext returns the current context name
func (k *KubectlProxy) GetCurrentContext() string {
	return k.config.CurrentContext
}

// Reload reloads the kubeconfig file
func (k *KubectlProxy) Reload() error {
	config, err := clientcmd.LoadFromFile(k.kubeconfig)
	if err != nil {
		return err
	}
	k.config = config
	return nil
}
