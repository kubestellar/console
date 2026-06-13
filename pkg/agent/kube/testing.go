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

// SetLookPathForTest sets the lookPath function for testing.
// Returns a cleanup function that restores the original value.
func SetLookPathForTest(fn func(string) (string, error)) func() {
	old := lookPath
	lookPath = fn
	return func() { lookPath = old }
}

// SetStandardToolCandidatesForTest sets the standardToolCandidates function for testing.
// Returns a cleanup function that restores the original value.
func SetStandardToolCandidatesForTest(fn func(string) []string) func() {
	old := standardToolCandidates
	standardToolCandidates = fn
	return func() { standardToolCandidates = old }
}

// SetStatFileForTest sets the statFile function for testing.
// Returns a cleanup function that restores the original value.
func SetStatFileForTest(fn func(string) (os.FileInfo, error)) func() {
	old := statFile
	statFile = fn
	return func() { statFile = old }
}

// AppendFormattedWarningEvents formats warning events and appends them to the builder.
// This is exported for use in tests outside the kube package.
func AppendFormattedWarningEvents(sb *strings.Builder, events []k8s.Event) {
	appendFormattedWarningEvents(sb, events)
}
