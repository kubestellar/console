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
			Namespace: ctx.Namespace, IsCurrent: name == current,
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
	if stderr.String() != "" && output == "" {
		output = stderr.String()
	}
	return protocol.KubectlResponse{Output: output, ExitCode: exitCode, Error: stderr.String()}
}

func (k *KubectlProxy) validateArgs(args []string) bool {
	if len(args) == 0 {
		return false
	}
	dangerous := []string{"delete", "exec", "cp", "attach", "run", "apply", "create", "patch", "replace", "edit"}
	firstArg := strings.ToLower(args[0])
	for _, d := range dangerous {
		if firstArg == d {
			return false
		}
	}
	return true
}

func (k *KubectlProxy) GetCurrentContext() string { return k.config.CurrentContext }

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

	cmd := exec.Command("kubectl", cmdArgs...)
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

// HelmDeploy executes a helm upgrade --install command
func (k *KubectlProxy) HelmDeploy(req protocol.DeployRequest) protocol.DeployResponse {
	cmdArgs := []string{"upgrade", "--install", req.ReleaseName, req.ChartPath}

	// Add kubeconfig if specified
	if k.kubeconfig != "" {
		cmdArgs = append(cmdArgs, "--kubeconfig", k.kubeconfig)
	}

	// Add context if specified
	if req.Context != "" {
		cmdArgs = append(cmdArgs, "--kube-context", req.Context)
	}

	// Add namespace
	cmdArgs = append(cmdArgs, "--namespace", req.Namespace)

	// Create namespace if it doesn't exist
	cmdArgs = append(cmdArgs, "--create-namespace")

	// Add image settings if specified
	if req.ImageRepo != "" {
		cmdArgs = append(cmdArgs, "--set", "image.repository="+req.ImageRepo)
	}
	if req.ImageTag != "" {
		cmdArgs = append(cmdArgs, "--set", "image.tag="+req.ImageTag)
	}

	// Add additional values
	for key, value := range req.Values {
		cmdArgs = append(cmdArgs, "--set", key+"="+value)
	}

	// Add wait flag
	if req.Wait {
		cmdArgs = append(cmdArgs, "--wait")
	}

	// Add timeout
	if req.Timeout != "" {
		cmdArgs = append(cmdArgs, "--timeout", req.Timeout)
	}

	cmd := exec.Command("helm", cmdArgs...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	output := stdout.String()
	if stderr.String() != "" && output == "" {
		output = stderr.String()
	}

	if err != nil {
		return protocol.DeployResponse{
			Success:     false,
			ReleaseName: req.ReleaseName,
			Namespace:   req.Namespace,
			Output:      output,
			Error:       stderr.String(),
		}
	}

	return protocol.DeployResponse{
		Success:     true,
		ReleaseName: req.ReleaseName,
		Namespace:   req.Namespace,
		Output:      output,
	}
}
