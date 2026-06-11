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
	// ExecTimeout bounds how long any kubectl subprocess can run
	// before it is killed. Prevents goroutine/FD leaks from hung apiservers. (#7258, #7206)
	ExecTimeout = 30 * time.Second

	// RenameTimeout bounds the kubectl config rename-context command. (#7279)
	RenameTimeout = 30 * time.Second

	// ReloadMinInterval is the minimum time between kubeconfig file
	// re-reads driven by ReloadIfStale. handleClustersHTTP is polled by the
	// frontend and previously called Reload() on every request, which does a
	// full disk read + YAML parse. Two seconds is short enough to feel
	// responsive after the user adds a context, long enough to absorb bursty
	// polling. (#8075)
	ReloadMinInterval = 2 * time.Second
)

// ExecCommandFunc is the function signature for creating exec.Cmd.
type ExecCommandFunc func(name string, arg ...string) *exec.Cmd

// ExecCommandContextFunc is the function signature for creating context-aware exec.Cmd.
type ExecCommandContextFunc func(ctx context.Context, name string, arg ...string) *exec.Cmd

// ExecCommand allows mocking exec.Command for testing
var ExecCommand ExecCommandFunc = exec.Command

// ExecCommandContext allows mocking exec.CommandContext for testing (#7258)
var ExecCommandContext ExecCommandContextFunc = exec.CommandContext

// Proxy wraps kubeconfig management and kubectl command execution.
type Proxy struct {
	mu         sync.RWMutex // guards config against concurrent read/write (#7259)
	kubeconfig string
	config     *api.Config
	lastReload time.Time // wall time of last successful Reload, for ReloadIfStale (#8075)
}

// NewProxy creates a new kubectl proxy from the given kubeconfig path.
// If kubeconfig is empty, it falls back to KUBECONFIG env var, then ~/.kube/config.
func NewProxy(kubeconfig string) (*Proxy, error) {
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
		return &Proxy{kubeconfig: kubeconfig, config: &api.Config{}}, nil
	}

	return &Proxy{kubeconfig: kubeconfig, config: config}, nil
}

// ListContexts returns all kubeconfig contexts and the current context name.
func (k *Proxy) ListContexts() ([]protocol.ClusterInfo, string) {
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
		authMethod := DetectAuthMethod(authInfo)
		clusters = append(clusters, protocol.ClusterInfo{
			Name: name, Context: name, Server: server,
			User: ctx.AuthInfo, Namespace: ctx.Namespace,
			AuthMethod: authMethod, IsCurrent: name == current,
		})
	}
	return clusters, current
}

// Execute runs a kubectl command using a background context.
func (k *Proxy) Execute(ctxName, namespace string, args []string) protocol.KubectlResponse {
	return k.ExecuteWithContext(context.Background(), ctxName, namespace, args)
}

// ExecuteWithContext runs a kubectl command, deriving the execution deadline
// from the supplied parent context. When the parent is cancelled (e.g. the
// WebSocket connection closes), the kubectl process is killed immediately
// instead of running until its own timeout expires (#9997).
func (k *Proxy) ExecuteWithContext(parent context.Context, ctxName, namespace string, args []string) protocol.KubectlResponse {
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

	if !k.ValidateArgs(args) {
		return protocol.KubectlResponse{ExitCode: 1, Error: "Disallowed kubectl command"}
	}

	// Bound kubectl execution with a context timeout to prevent goroutine/FD leaks (#7258).
	// Derive from the parent context so client disconnect also cancels the command (#9997).
	ctx, cancel := context.WithTimeout(parent, ExecTimeout)
	defer cancel()

	cmd := ExecCommandContext(ctx, "kubectl", cmdArgs...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	exitCode := 0
	if err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			return protocol.KubectlResponse{ExitCode: 1, Error: fmt.Sprintf("kubectl timed out after %s", ExecTimeout)}
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

// ValidateArgs checks whether the given kubectl arguments are allowed.
func (k *Proxy) ValidateArgs(args []string) bool {
	return ValidateKubectlArgs(args)
}

// GetCurrentContext returns the current kubeconfig context name.
func (k *Proxy) GetCurrentContext() string {
	if k == nil || k.config == nil {
		return ""
	}
	k.mu.RLock()
	defer k.mu.RUnlock()
	return k.config.CurrentContext
}

// GetKubeconfigPath returns the path to the kubeconfig file.
func (k *Proxy) GetKubeconfigPath() string {
	if k == nil {
		return ""
	}
	return k.kubeconfig
}

// Reload reloads the kubeconfig from disk. Uses write lock to prevent
// data races with concurrent readers (#7259).
func (k *Proxy) Reload() {
	config, err := clientcmd.LoadFromFile(k.kubeconfig)
	if err == nil {
		k.mu.Lock()
		k.config = config
		k.lastReload = time.Now()
		k.mu.Unlock()
	}
}

// ReloadIfStale reloads the kubeconfig from disk only if the previous reload
// was more than minInterval ago. Returns true if a fresh load was performed. (#8075)
func (k *Proxy) ReloadIfStale(minInterval time.Duration) bool {
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

// reloadLocked reloads the kubeconfig from disk without acquiring the mutex.
// Caller must already hold k.mu.
func (k *Proxy) reloadLocked() {
	config, err := clientcmd.LoadFromFile(k.kubeconfig)
	if err == nil {
		k.config = config
	}
}

// RenameContext renames a kubeconfig context.
// Uses context timeout to prevent hanging on unreachable clusters (#7279).
func (k *Proxy) RenameContext(oldName, newName string) error {
	cmdArgs := []string{"config", "rename-context", oldName, newName}
	if k.kubeconfig != "" {
		cmdArgs = append([]string{"--kubeconfig", k.kubeconfig}, cmdArgs...)
	}

	ctx, cancel := context.WithTimeout(context.Background(), RenameTimeout)
	defer cancel()

	cmd := ExecCommandContext(ctx, "kubectl", cmdArgs...)
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
