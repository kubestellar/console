// Package kube provides a safe kubectl proxy that wraps kubeconfig management
// and command execution with security controls (argument validation, exec
// timeouts, and blocked mutation commands).
//
// This package was extracted from the monolithic pkg/agent package as part of
// the decomposition effort described in issue #17124.
package kube
