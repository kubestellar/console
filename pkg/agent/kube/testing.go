package kube

import (
	"strings"

	"github.com/kubestellar/console/pkg/agent/kube/k8s"
	"k8s.io/client-go/tools/clientcmd/api"
)

// NewTestKubectlProxy creates a KubectlProxy for testing with a custom config.
// This allows tests outside the kube package to create test instances without
// accessing the unexported config field.
func NewTestKubectlProxy(config *api.Config) *KubectlProxy {
	return &KubectlProxy{
		kubeconfig: "", // empty for test instances
		config:     config,
	}
}

// AppendFormattedWarningEvents formats warning events and appends them to the builder.
// This is exported for use in tests outside the kube package.
func AppendFormattedWarningEvents(sb *strings.Builder, events []k8s.Event) {
	appendFormattedWarningEvents(sb, events)
}
