package k8s

import (
	"context"
	"os"
	"testing"
)

func TestBuildProbeNamespaces_NoUserNamespace(t *testing.T) {
	t.Setenv(probeNamespacesEnvVar, "")
	got := buildProbeNamespaces("")
	// Should return exactly the defaults
	if len(got) != len(defaultProbeNamespaces) {
		t.Fatalf("expected %d namespaces, got %d: %v", len(defaultProbeNamespaces), len(got), got)
	}
	for i, ns := range defaultProbeNamespaces {
		if got[i] != ns {
			t.Errorf("index %d: expected %q, got %q", i, ns, got[i])
		}
	}
}

func TestBuildProbeNamespaces_UserNamespaceFirst(t *testing.T) {
	t.Setenv(probeNamespacesEnvVar, "")
	got := buildProbeNamespaces("my-team")
	if got[0] != "my-team" {
		t.Fatalf("expected user namespace first, got %q", got[0])
	}
	if len(got) != len(defaultProbeNamespaces)+1 {
		t.Fatalf("expected %d namespaces, got %d: %v", len(defaultProbeNamespaces)+1, len(got), got)
	}
}

func TestBuildProbeNamespaces_UserNamespaceDeduplicated(t *testing.T) {
	t.Setenv(probeNamespacesEnvVar, "")
	// User namespace matches a default — should not appear twice
	got := buildProbeNamespaces("kube-system")
	if got[0] != "kube-system" {
		t.Fatalf("expected user namespace first, got %q", got[0])
	}
	count := 0
	for _, ns := range got {
		if ns == "kube-system" {
			count++
		}
	}
	if count != 1 {
		t.Fatalf("expected kube-system once, found %d times in %v", count, got)
	}
}

func TestBuildProbeNamespaces_EnvVarExtends(t *testing.T) {
	t.Setenv(probeNamespacesEnvVar, "staging,production")
	got := buildProbeNamespaces("")
	// staging and production should appear after defaults are built
	found := map[string]bool{}
	for _, ns := range got {
		found[ns] = true
	}
	if !found["staging"] {
		t.Error("expected 'staging' in probe namespaces")
	}
	if !found["production"] {
		t.Error("expected 'production' in probe namespaces")
	}
}

func TestBuildProbeNamespaces_EnvVarDeduplicatesDefaults(t *testing.T) {
	t.Setenv(probeNamespacesEnvVar, "default,custom-ns")
	got := buildProbeNamespaces("")
	count := 0
	for _, ns := range got {
		if ns == "default" {
			count++
		}
	}
	if count != 1 {
		t.Fatalf("expected 'default' once, found %d times in %v", count, got)
	}
}

func TestBuildProbeNamespaces_EnvVarTrimsWhitespace(t *testing.T) {
	t.Setenv(probeNamespacesEnvVar, " staging , production ")
	got := buildProbeNamespaces("")
	found := map[string]bool{}
	for _, ns := range got {
		found[ns] = true
	}
	if !found["staging"] {
		t.Error("expected trimmed 'staging' in probe namespaces")
	}
	if !found["production"] {
		t.Error("expected trimmed 'production' in probe namespaces")
	}
}

func TestBuildProbeNamespaces_OrderPriority(t *testing.T) {
	t.Setenv(probeNamespacesEnvVar, "env-ns")
	got := buildProbeNamespaces("user-ns")
	// Order: user-ns, env-ns, then defaults
	if got[0] != "user-ns" {
		t.Errorf("expected first='user-ns', got %q", got[0])
	}
	if got[1] != "env-ns" {
		t.Errorf("expected second='env-ns', got %q", got[1])
	}
	// defaults follow
	if got[2] != "default" {
		t.Errorf("expected third='default', got %q", got[2])
	}
}

func TestUserNamespaceFromContext_NilCtx(t *testing.T) {
	got := userNamespaceFromContext(nil)
	if got != "" {
		t.Errorf("expected empty string for nil ctx, got %q", got)
	}
}

func TestUserNamespaceFromContext_NoValue(t *testing.T) {
	got := userNamespaceFromContext(context.Background())
	if got != "" {
		t.Errorf("expected empty string for ctx without value, got %q", got)
	}
}

func TestUserNamespaceFromContext_WithValue(t *testing.T) {
	ctx := WithUserNamespace(context.Background(), "my-ns")
	got := userNamespaceFromContext(ctx)
	if got != "my-ns" {
		t.Errorf("expected 'my-ns', got %q", got)
	}
}

func TestWithUserNamespace_NilCtx(t *testing.T) {
	// Should not panic — falls back to Background()
	ctx := WithUserNamespace(nil, "test-ns")
	if ctx == nil {
		t.Fatal("expected non-nil context")
	}
	got := userNamespaceFromContext(ctx)
	if got != "test-ns" {
		t.Errorf("expected 'test-ns', got %q", got)
	}
}

func TestWithUserNamespace_EmptyNS(t *testing.T) {
	base := context.Background()
	ctx := WithUserNamespace(base, "")
	// Empty ns should return the original context unchanged
	if ctx != base {
		t.Error("expected same context when ns is empty")
	}
}

// Verify env var constant matches expected value (guard against accidental rename)
func TestProbeNamespacesEnvVarConstant(t *testing.T) {
	if probeNamespacesEnvVar != "KC_PROBE_NAMESPACES" {
		t.Errorf("unexpected env var name: %q", probeNamespacesEnvVar)
	}
	// Ensure the env var is not set from prior tests leaking state
	os.Unsetenv(probeNamespacesEnvVar)
}
