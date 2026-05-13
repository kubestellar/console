package agent

import (
	"context"
	"errors"
	"fmt"
	"strings"

	k8serrors "k8s.io/apimachinery/pkg/api/errors"

	"github.com/kubestellar/console/pkg/k8s"
)

const (
	agentUnavailableMessage = "cluster temporarily unavailable"
	agentPermissionMessage  = "insufficient permissions"
	agentNotFoundMessage    = "resource not found"
	agentConflictMessage    = "resource conflict"
	agentInvalidMessage     = "invalid request"
	agentFallbackMessage    = "operation failed"
)

func sanitizeAgentError(operation string, err error) string {
	if err == nil {
		return sanitizedAgentFallback(operation)
	}

	switch {
	case k8serrors.IsForbidden(err), k8serrors.IsUnauthorized(err):
		return agentPermissionMessage
	case k8serrors.IsNotFound(err):
		return agentNotFoundMessage
	case k8serrors.IsAlreadyExists(err), k8serrors.IsConflict(err):
		return agentConflictMessage
	case k8serrors.IsInvalid(err), k8serrors.IsBadRequest(err):
		return agentInvalidMessage
	case k8serrors.IsTimeout(err), k8serrors.IsServerTimeout(err), k8serrors.IsServiceUnavailable(err), errors.Is(err, context.DeadlineExceeded):
		return agentUnavailableMessage
	}

	switch k8s.ClassifyError(err.Error()) {
	case "timeout", "network", "certificate":
		return agentUnavailableMessage
	case "auth":
		return agentPermissionMessage
	case "not_found":
		return agentNotFoundMessage
	}

	lowerErr := strings.ToLower(err.Error())
	switch {
	case strings.Contains(lowerErr, "connection refused"),
		strings.Contains(lowerErr, "i/o timeout"),
		strings.Contains(lowerErr, "deadline exceeded"),
		strings.Contains(lowerErr, "context deadline exceeded"),
		strings.Contains(lowerErr, "tls handshake timeout"),
		strings.Contains(lowerErr, "no route to host"),
		strings.Contains(lowerErr, "network is unreachable"),
		strings.Contains(lowerErr, "dial tcp"),
		strings.Contains(lowerErr, "no such host"),
		strings.Contains(lowerErr, "lookup "):
		return agentUnavailableMessage
	case strings.Contains(lowerErr, "forbidden"),
		strings.Contains(lowerErr, "unauthorized"),
		strings.Contains(lowerErr, "permission denied"),
		strings.Contains(lowerErr, "rbac"):
		return agentPermissionMessage
	case strings.Contains(lowerErr, "already exists"),
		strings.Contains(lowerErr, "conflict"),
		strings.Contains(lowerErr, "has been modified"):
		return agentConflictMessage
	case strings.Contains(lowerErr, "invalid"),
		strings.Contains(lowerErr, "validation"),
		strings.Contains(lowerErr, "bad request"),
		strings.Contains(lowerErr, "malformed"),
		strings.Contains(lowerErr, "decode"),
		strings.Contains(lowerErr, "unmarshal"):
		return agentInvalidMessage
	case strings.Contains(lowerErr, "not found"),
		strings.Contains(lowerErr, "does not exist"),
		strings.Contains(lowerErr, "no matches for kind"),
		strings.Contains(lowerErr, "no configuration"):
		return agentNotFoundMessage
	default:
		return sanitizedAgentFallback(operation)
	}
}

func sanitizedAgentFallback(operation string) string {
	if operation == "" {
		return agentFallbackMessage
	}
	return fmt.Sprintf("failed to %s", operation)
}
