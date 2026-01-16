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
