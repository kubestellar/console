package agent

import (
	agenterrors "github.com/kubestellar/console/pkg/agent/errors"
)

// SanitizeAgentError sanitizes Kubernetes API errors for display to end-users.
// It converts potentially sensitive Kubernetes error messages into generic
// user-friendly messages. Exported for use by agent subpackages.
//
// Deprecated: Use agenterrors.SanitizeAgentError directly. This wrapper exists
// for backward compatibility and will be removed in a future version.
func SanitizeAgentError(operation string, err error) string {
	return agenterrors.SanitizeAgentError(operation, err)
}
