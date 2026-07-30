package kube

import (
	"os"
	"strings"

	"github.com/kubestellar/console/pkg/k8s"
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

// SetLookPathForTest replaces the lookPath function and returns a cleanup func.
// Use in tests outside the kube package to control tool detection.
func SetLookPathForTest(fn func(string) (string, error)) func() {
	old := lookPath
	lookPath = fn
	return func() { lookPath = old }
}

// SetStatFileForTest replaces the statFile function and returns a cleanup func.
func SetStatFileForTest(fn func(string) (os.FileInfo, error)) func() {
	old := statFile
	statFile = fn
	return func() { statFile = old }
}

// SetStandardToolCandidatesForTest replaces standardToolCandidates and returns a cleanup func.
func SetStandardToolCandidatesForTest(fn func(string) []string) func() {
	old := standardToolCandidates
	standardToolCandidates = fn
	return func() { standardToolCandidates = old }
}

