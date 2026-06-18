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

var AllowedKubectlCommands = map[string]bool{
	"get":           true,
	"describe":      true,
	"logs":          true,
	"top":           true,
	"explain":       true,
	"api-resources": true,
	"api-versions":  true,
	"version":       true,
	"cluster-info":  true,
	"config":        true,
	"auth":          true,
	"rollout":       true,
	"delete":        true,
	"scale":         true,
}

var allowedDeleteResources = map[string]bool{
	"pod":  true,
	"pods": true,
	"po":   true,
}

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

var AllowedRolloutSubcommands = map[string]bool{
	"status":  true,
	"history": true,
}

var allowedAuthSubcommands = map[string]bool{
	"can-i":  true,
	"whoami": true,
}

var blockedConfigSubcommands = map[string]bool{
	"set":             true,
	"set-cluster":     true,
	"set-context":     true,
	"set-credentials": true,
	"unset":           true,
	"delete-cluster":  true,
	"delete-context":  true,
	"delete-user":     true,
	"use-context":     true,
	"rename-context":  true,
}

func ValidateKubectlArgs(args []string) bool {
	if len(args) == 0 {
		return false
	}

	command := strings.ToLower(args[0])
	allowed, exists := AllowedKubectlCommands[command]
	if !exists || !allowed {
		return false
	}

	if command == "rollout" {
		if len(args) < 2 {
			return false
		}
		subcommand := strings.ToLower(args[1])
		if !AllowedRolloutSubcommands[subcommand] {
			return false
		}
	}

	if command == "auth" {
		if len(args) < 2 {
			return false
		}
		subcommand := strings.ToLower(args[1])
		if !allowedAuthSubcommands[subcommand] {
			return false
		}
	}

	if command == "config" && len(args) > 1 {
		for _, a := range args[1:] {
			token := strings.ToLower(a)
			if strings.HasPrefix(token, "-") {
				continue
			}
			if blockedConfigSubcommands[token] {
				return false
			}
			break
		}
	}

	if command == "delete" {
		if len(args) < 2 {
			return false
		}
		resourceType := strings.ToLower(args[1])
		if !allowedDeleteResources[resourceType] {
			return false
		}
	}

	if command == "scale" {
		var firstPositional string
		for _, a := range args[1:] {
			if strings.HasPrefix(a, "-") {
				continue
			}
			firstPositional = strings.ToLower(a)
			break
		}
		if firstPositional == "" {
			return false
		}
		if strings.Contains(firstPositional, "/") {
			parts := strings.SplitN(firstPositional, "/", 2)
			if !allowedScaleResources[parts[0]] {
				return false
			}
		} else if !allowedScaleResources[firstPositional] {
			return false
		}
	}

	for _, arg := range args {
		argLower := strings.ToLower(arg)
		if strings.Contains(argLower, "--exec") {
			return false
		}
		if strings.ContainsAny(arg, ";|&$`") {
			return false
		}
	}

	return true
}

func (k *KubectlProxy) validateArgs(args []string) bool {
	return ValidateKubectlArgs(args)
}
