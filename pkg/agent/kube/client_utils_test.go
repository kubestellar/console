package kube

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"k8s.io/client-go/tools/clientcmd/api"
)

// ────────────────────────────────────────────────────────────────────────────
// detectAuthMethod — was 45.5%
// ────────────────────────────────────────────────────────────────────────────

func TestDetectAuthMethod_Nil(t *testing.T) {
	assert.Equal(t, "unknown", detectAuthMethod(nil))
}

func TestDetectAuthMethod_Exec(t *testing.T) {
	ai := &api.AuthInfo{
		Exec: &api.ExecConfig{Command: "aws-iam-authenticator"},
	}
	assert.Equal(t, "exec", detectAuthMethod(ai))
}

func TestDetectAuthMethod_Token(t *testing.T) {
	ai := &api.AuthInfo{Token: "my-token"}
	assert.Equal(t, "token", detectAuthMethod(ai))
}

func TestDetectAuthMethod_TokenFile(t *testing.T) {
	ai := &api.AuthInfo{TokenFile: "/var/run/secrets/token"}
	assert.Equal(t, "token", detectAuthMethod(ai))
}

func TestDetectAuthMethod_CertificateData(t *testing.T) {
	ai := &api.AuthInfo{ClientCertificateData: []byte("cert-data")}
	assert.Equal(t, "certificate", detectAuthMethod(ai))
}

func TestDetectAuthMethod_CertificateFile(t *testing.T) {
	ai := &api.AuthInfo{ClientCertificate: "/path/to/cert.pem"}
	assert.Equal(t, "certificate", detectAuthMethod(ai))
}

func TestDetectAuthMethod_AuthProvider(t *testing.T) {
	ai := &api.AuthInfo{AuthProvider: &api.AuthProviderConfig{Name: "gcp"}}
	assert.Equal(t, "auth-provider", detectAuthMethod(ai))
}

func TestDetectAuthMethod_Empty(t *testing.T) {
	ai := &api.AuthInfo{}
	assert.Equal(t, "unknown", detectAuthMethod(ai))
}

// ────────────────────────────────────────────────────────────────────────────
// uniqueName — was 42.9%
// ────────────────────────────────────────────────────────────────────────────

func TestUniqueName_NoConflict(t *testing.T) {
	m := map[string]bool{"existing": true}
	assert.Equal(t, "new-cluster-imported", uniqueName("new-cluster", m))
}

func TestUniqueName_FirstConflict(t *testing.T) {
	m := map[string]bool{"my-cluster-imported": true}
	assert.Equal(t, "my-cluster-imported-2", uniqueName("my-cluster", m))
}

func TestUniqueName_MultipleConflicts(t *testing.T) {
	m := map[string]bool{
		"prod-imported":   true,
		"prod-imported-2": true,
		"prod-imported-3": true,
	}
	assert.Equal(t, "prod-imported-4", uniqueName("prod", m))
}

func TestUniqueName_EmptyMap(t *testing.T) {
	m := map[string]bool{}
	assert.Equal(t, "test-imported", uniqueName("test", m))
}

// ────────────────────────────────────────────────────────────────────────────
// ValidateKubectlArgs — was 72.2%
// ────────────────────────────────────────────────────────────────────────────

func TestValidateKubectlArgs_EmptyArgs(t *testing.T) {
	assert.False(t, ValidateKubectlArgs(nil))
	assert.False(t, ValidateKubectlArgs([]string{}))
}

func TestValidateKubectlArgs_BasicAllowed(t *testing.T) {
	assert.True(t, ValidateKubectlArgs([]string{"get", "pods"}))
	assert.True(t, ValidateKubectlArgs([]string{"describe", "node", "worker-1"}))
	assert.True(t, ValidateKubectlArgs([]string{"logs", "my-pod"}))
	assert.True(t, ValidateKubectlArgs([]string{"top", "nodes"}))
}

func TestValidateKubectlArgs_DisallowedCommand(t *testing.T) {
	assert.False(t, ValidateKubectlArgs([]string{"exec", "-it", "pod", "--", "sh"}))
	assert.False(t, ValidateKubectlArgs([]string{"cp", "file", "pod:/tmp"}))
	assert.False(t, ValidateKubectlArgs([]string{"run", "test-pod", "--image=busybox"}))
}

func TestValidateKubectlArgs_RolloutAllowed(t *testing.T) {
	assert.True(t, ValidateKubectlArgs([]string{"rollout", "status", "deploy/app"}))
	assert.True(t, ValidateKubectlArgs([]string{"rollout", "history", "deploy/app"}))
}

func TestValidateKubectlArgs_RolloutBlocked(t *testing.T) {
	// Rollout needs a subcommand
	assert.False(t, ValidateKubectlArgs([]string{"rollout"}))
	// Mutating rollout subcommands should be blocked
	assert.False(t, ValidateKubectlArgs([]string{"rollout", "undo", "deploy/app"}))
}

func TestValidateKubectlArgs_AuthAllowed(t *testing.T) {
	assert.True(t, ValidateKubectlArgs([]string{"auth", "can-i", "get", "pods"}))
	assert.True(t, ValidateKubectlArgs([]string{"auth", "whoami"}))
}

func TestValidateKubectlArgs_AuthBlocked(t *testing.T) {
	assert.False(t, ValidateKubectlArgs([]string{"auth"}))
	assert.False(t, ValidateKubectlArgs([]string{"auth", "reconcile"}))
}

func TestValidateKubectlArgs_ConfigBlocked(t *testing.T) {
	assert.False(t, ValidateKubectlArgs([]string{"config", "set-credentials", "admin"}))
	assert.False(t, ValidateKubectlArgs([]string{"config", "set-cluster", "prod"}))
	assert.False(t, ValidateKubectlArgs([]string{"config", "delete-context", "test"}))
}

func TestValidateKubectlArgs_ConfigWithLeadingFlags(t *testing.T) {
	// Flags before subcommand should be skipped, blocked sub still caught
	assert.False(t, ValidateKubectlArgs([]string{"config", "--kubeconfig=/tmp/k", "set-credentials", "x"}))
}

func TestValidateKubectlArgs_ConfigAllowed(t *testing.T) {
	assert.True(t, ValidateKubectlArgs([]string{"config", "view"}))
	assert.True(t, ValidateKubectlArgs([]string{"config", "get-contexts"}))
	assert.True(t, ValidateKubectlArgs([]string{"config", "current-context"}))
}

func TestValidateKubectlArgs_DeleteAllowedResources(t *testing.T) {
	assert.True(t, ValidateKubectlArgs([]string{"delete", "pod", "my-pod"}))
}

func TestValidateKubectlArgs_DeleteBlockedResources(t *testing.T) {
	assert.False(t, ValidateKubectlArgs([]string{"delete", "namespace", "production"}))
	assert.False(t, ValidateKubectlArgs([]string{"delete", "node", "worker-1"}))
	assert.False(t, ValidateKubectlArgs([]string{"delete"}))
}

func TestValidateKubectlArgs_ScaleAllowed(t *testing.T) {
	assert.True(t, ValidateKubectlArgs([]string{"scale", "deployment/app", "--replicas=3"}))
	assert.True(t, ValidateKubectlArgs([]string{"scale", "deployment", "app", "--replicas=3"}))
}

func TestValidateKubectlArgs_ScaleWithFlags(t *testing.T) {
	// Flags before resource should be skipped
	assert.True(t, ValidateKubectlArgs([]string{"scale", "--replicas=3", "deployment/app"}))
}

func TestValidateKubectlArgs_ScaleBlocked(t *testing.T) {
	assert.False(t, ValidateKubectlArgs([]string{"scale", "node/worker", "--replicas=0"}))
	assert.False(t, ValidateKubectlArgs([]string{"scale"}))
}

func TestValidateKubectlArgs_ShellMetachars(t *testing.T) {
	assert.False(t, ValidateKubectlArgs([]string{"get", "pods", ";", "rm", "-rf"}))
	assert.False(t, ValidateKubectlArgs([]string{"get", "pods", "|", "sh"}))
	assert.False(t, ValidateKubectlArgs([]string{"get", "pods", "&", "curl"}))
	assert.False(t, ValidateKubectlArgs([]string{"get", "pods", "$(whoami)"}))
	assert.False(t, ValidateKubectlArgs([]string{"get", "pods", "`id`"}))
}

func TestValidateKubectlArgs_ExecFlag(t *testing.T) {
	assert.False(t, ValidateKubectlArgs([]string{"get", "pods", "--exec=/bin/sh"}))
}

func TestValidateKubectlArgs_CaseInsensitive(t *testing.T) {
	assert.True(t, ValidateKubectlArgs([]string{"GET", "pods"}))
	assert.True(t, ValidateKubectlArgs([]string{"Describe", "node"}))
}
