package agent

import (
	"context"
	"errors"
	"fmt"
	"testing"

	k8serrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

var testGR = schema.GroupResource{Group: "v1", Resource: "pods"}

// TestSanitizedAgentFallback covers the simple helper.
func TestSanitizedAgentFallback(t *testing.T) {
	tests := []struct {
		name      string
		operation string
		want      string
	}{
		{"empty operation", "", agentFallbackMessage},
		{"with operation", "list nodes", "failed to list nodes"},
		{"single word", "fetch", "failed to fetch"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := sanitizedAgentFallback(tt.operation); got != tt.want {
				t.Errorf("sanitizedAgentFallback(%q) = %q, want %q", tt.operation, got, tt.want)
			}
		})
	}
}

// TestSanitizeAgentError_NilErr verifies that a nil error returns the fallback message.
func TestSanitizeAgentError_NilErr(t *testing.T) {
	got := sanitizeAgentError("scale deployment", nil)
	if got != "failed to scale deployment" {
		t.Errorf("nil err: got %q, want fallback with operation", got)
	}

	got = sanitizeAgentError("", nil)
	if got != agentFallbackMessage {
		t.Errorf("nil err + empty op: got %q, want %q", got, agentFallbackMessage)
	}
}

// TestSanitizeAgentError_K8sErrorTypes covers the k8s typed error switch.
func TestSanitizeAgentError_K8sErrorTypes(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want string
	}{
		{
			name: "Forbidden → permission",
			err:  k8serrors.NewForbidden(testGR, "obj", nil),
			want: agentPermissionMessage,
		},
		{
			name: "Unauthorized → permission",
			err:  k8serrors.NewUnauthorized("no token"),
			want: agentPermissionMessage,
		},
		{
			name: "NotFound → not found",
			err:  k8serrors.NewNotFound(testGR, "obj"),
			want: agentNotFoundMessage,
		},
		{
			name: "AlreadyExists → conflict",
			err:  k8serrors.NewAlreadyExists(testGR, "obj"),
			want: agentConflictMessage,
		},
		{
			name: "Conflict → conflict",
			err:  k8serrors.NewConflict(testGR, "obj", nil),
			want: agentConflictMessage,
		},
		{
			name: "Invalid → invalid",
			err:  k8serrors.NewInvalid(schema.GroupKind{}, "obj", nil),
			want: agentInvalidMessage,
		},
		{
			name: "BadRequest → invalid",
			err: &k8serrors.StatusError{ErrStatus: metav1.Status{
				Reason: metav1.StatusReasonBadRequest,
				Code:   400,
			}},
			want: agentInvalidMessage,
		},
		{
			name: "Timeout → unavailable",
			err:  k8serrors.NewTimeoutError("timed out", 30),
			want: agentUnavailableMessage,
		},
		{
			name: "ServiceUnavailable → unavailable",
			err:  k8serrors.NewServiceUnavailable("down"),
			want: agentUnavailableMessage,
		},
		{
			name: "context.DeadlineExceeded → unavailable",
			err:  context.DeadlineExceeded,
			want: agentUnavailableMessage,
		},
		{
			name: "wrapped DeadlineExceeded → unavailable",
			err:  fmt.Errorf("outer: %w", context.DeadlineExceeded),
			want: agentUnavailableMessage,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := sanitizeAgentError("", tt.err)
			if got != tt.want {
				t.Errorf("sanitizeAgentError(%v) = %q, want %q", tt.err, got, tt.want)
			}
		})
	}
}

// TestSanitizeAgentError_StringPatterns covers the string-matching fallback paths.
func TestSanitizeAgentError_StringPatterns(t *testing.T) {
	tests := []struct {
		name string
		msg  string
		want string
	}{
		// network / availability patterns
		{"connection refused", "dial tcp: connection refused", agentUnavailableMessage},
		{"i/o timeout", "read: i/o timeout", agentUnavailableMessage},
		{"deadline exceeded", "context deadline exceeded", agentUnavailableMessage},
		{"tls timeout", "tls handshake timeout", agentUnavailableMessage},
		{"no route to host", "no route to host", agentUnavailableMessage},
		{"network unreachable", "network is unreachable", agentUnavailableMessage},
		{"dial tcp prefix", "dial tcp 10.0.0.1:443", agentUnavailableMessage},
		{"no such host", "no such host: api.example.com", agentUnavailableMessage},
		{"lookup prefix", "lookup api.example.com: no such host", agentUnavailableMessage},
		// auth patterns
		{"forbidden lower", "forbidden: access denied", agentPermissionMessage},
		{"unauthorized lower", "unauthorized token", agentPermissionMessage},
		{"permission denied", "permission denied", agentPermissionMessage},
		{"rbac", "rbac: user cannot list pods", agentPermissionMessage},
		// conflict patterns
		{"already exists lower", "resource already exists", agentConflictMessage},
		{"conflict lower", "write conflict detected", agentConflictMessage},
		{"has been modified", "the resource has been modified", agentConflictMessage},
		// invalid patterns
		{"invalid lower", "invalid yaml format", agentInvalidMessage},
		{"validation lower", "validation failed: required field", agentInvalidMessage},
		{"bad request lower", "bad request: missing field", agentInvalidMessage},
		{"malformed lower", "malformed json", agentInvalidMessage},
		{"decode lower", "failed to decode response", agentInvalidMessage},
		{"unmarshal lower", "unmarshal error at offset 5", agentInvalidMessage},
		// not found patterns
		{"not found lower", "resource not found in namespace", agentNotFoundMessage},
		{"does not exist", "the object does not exist", agentNotFoundMessage},
		{"no matches for kind", "no matches for kind Ingress", agentNotFoundMessage},
		{"no configuration", "no configuration has been provided", agentNotFoundMessage},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := sanitizeAgentError("op", errors.New(tt.msg))
			if got != tt.want {
				t.Errorf("msg=%q: got %q, want %q", tt.msg, got, tt.want)
			}
		})
	}
}

// TestSanitizeAgentError_UnknownFallback verifies that an unrecognised error
// returns the operation-specific fallback rather than leaking raw error text.
func TestSanitizeAgentError_UnknownFallback(t *testing.T) {
	err := errors.New("something completely unknown happened at 0xdeadbeef")
	got := sanitizeAgentError("list pods", err)
	if got != "failed to list pods" {
		t.Errorf("unknown error: got %q, want %q", got, "failed to list pods")
	}

	got = sanitizeAgentError("", err)
	if got != agentFallbackMessage {
		t.Errorf("unknown error + empty op: got %q", got)
	}
}

// TestSanitizeAgentError_CaseInsensitive confirms mixed-case messages still match.
func TestSanitizeAgentError_CaseInsensitive(t *testing.T) {
	got := sanitizeAgentError("", errors.New("FORBIDDEN access to resource"))
	if got != agentPermissionMessage {
		t.Errorf("uppercase FORBIDDEN: got %q, want %q", got, agentPermissionMessage)
	}
}
