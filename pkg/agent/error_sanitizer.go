package agent

import (
	agenterrors "github.com/kubestellar/console/pkg/agent/errors"
)

// SanitizeAgentError sanitizes Kubernetes API errors for display to end-users.
// Deprecated: Use pkg/agent/errors.SanitizeAgentError directly.
// Kept for backward compatibility with callers outside pkg/agent/kube.
func SanitizeAgentError(operation string, err error) string {
	return agenterrors.SanitizeAgentError(operation, err)
}

