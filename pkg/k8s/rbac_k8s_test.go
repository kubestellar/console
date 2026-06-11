package k8s

import (
	"context"
	"testing"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

// ---------- parseOpenShiftUser ----------

func TestParseOpenShiftUser_BasicFields(t *testing.T) {
	obj := unstructured.Unstructured{
		Object: map[string]interface{}{
			"metadata": map[string]interface{}{
				"name":              "alice",
				"creationTimestamp": "2024-01-15T10:00:00Z",
			},
			"fullName":   "Alice Smith",
			"identities": []interface{}{"ldap:alice", "github:alice"},
			"groups":     []interface{}{"devs", "admins"},
		},
	}

	got := parseOpenShiftUser(obj, "prod-cluster")

	if got.Name != "alice" {
		t.Errorf("Name: want 'alice', got %q", got.Name)
	}
	if got.Cluster != "prod-cluster" {
		t.Errorf("Cluster: want 'prod-cluster', got %q", got.Cluster)
	}
	if got.FullName != "Alice Smith" {
		t.Errorf("FullName: want 'Alice Smith', got %q", got.FullName)
	}
	if len(got.Identities) != 2 || got.Identities[0] != "ldap:alice" {
		t.Errorf("Identities: want [ldap:alice github:alice], got %v", got.Identities)
	}
	if len(got.Groups) != 2 || got.Groups[0] != "devs" {
		t.Errorf("Groups: want [devs admins], got %v", got.Groups)
	}
	if got.CreatedAt == nil {
		t.Error("CreatedAt: expected non-nil for valid RFC3339 timestamp")
	}
}

func TestParseOpenShiftUser_MissingOptionalFields(t *testing.T) {
	obj := unstructured.Unstructured{
		Object: map[string]interface{}{
			"metadata": map[string]interface{}{
				"name": "bob",
			},
		},
	}

	got := parseOpenShiftUser(obj, "dev-cluster")

	if got.Name != "bob" {
		t.Errorf("Name: want 'bob', got %q", got.Name)
	}
	if got.FullName != "" {
		t.Errorf("FullName: expected empty, got %q", got.FullName)
	}
	if got.Identities != nil {
		t.Errorf("Identities: expected nil for missing field, got %v", got.Identities)
	}
	if got.Groups != nil {
		t.Errorf("Groups: expected nil for missing field, got %v", got.Groups)
	}
	if got.CreatedAt != nil {
		t.Errorf("CreatedAt: expected nil for missing timestamp, got %v", got.CreatedAt)
	}
}

func TestParseOpenShiftUser_InvalidTimestamp(t *testing.T) {
	obj := unstructured.Unstructured{
		Object: map[string]interface{}{
			"metadata": map[string]interface{}{
				"name":              "charlie",
				"creationTimestamp": "not-a-timestamp",
			},
		},
	}

	got := parseOpenShiftUser(obj, "test")

	if got.CreatedAt != nil {
		t.Errorf("CreatedAt: expected nil for invalid timestamp, got %v", got.CreatedAt)
	}
}

// ---------- buildProbeNamespaces ----------

func TestBuildProbeNamespaces_DefaultsOnly(t *testing.T) {
	t.Setenv(probeNamespacesEnvVar, "")
	got := buildProbeNamespaces("")
	if len(got) != len(defaultProbeNamespaces) {
		t.Errorf("expected %d default namespaces, got %d: %v", len(defaultProbeNamespaces), len(got), got)
	}
	if got[0] != "default" {
		t.Errorf("expected first namespace 'default', got %q", got[0])
	}
}


func TestBuildProbeNamespaces_EnvVarAdded(t *testing.T) {
	t.Setenv(probeNamespacesEnvVar, "team-a,team-b")
	got := buildProbeNamespaces("")
	found := map[string]bool{}
	for _, ns := range got {
		found[ns] = true
	}
	if !found["team-a"] || !found["team-b"] {
		t.Errorf("expected env namespaces 'team-a','team-b' in result: %v", got)
	}
}

func TestBuildProbeNamespaces_EnvVarDeduplicated(t *testing.T) {
	t.Setenv(probeNamespacesEnvVar, "default,extra")
	got := buildProbeNamespaces("")
	count := 0
	for _, ns := range got {
		if ns == "default" {
			count++
		}
	}
	if count != 1 {
		t.Errorf("expected 'default' once, got %d: %v", count, got)
	}
}

func TestBuildProbeNamespaces_WhitespaceTrimmedFromEnv(t *testing.T) {
	t.Setenv(probeNamespacesEnvVar, " ns-x , ns-y ")
	got := buildProbeNamespaces("")
	found := map[string]bool{}
	for _, ns := range got {
		found[ns] = true
	}
	if !found["ns-x"] {
		t.Errorf("expected trimmed 'ns-x' in result: %v", got)
	}
	if found[" ns-x "] {
		t.Errorf("expected whitespace-trimmed value, got untrimmed ' ns-x '")
	}
}

// ---------- userNamespaceFromContext / WithUserNamespace ----------

func TestUserNamespaceFromContext_Empty(t *testing.T) {
	ctx := context.Background()
	if got := userNamespaceFromContext(ctx); got != "" {
		t.Errorf("expected empty for context without namespace, got %q", got)
	}
}

func TestUserNamespaceFromContext_NilContext(t *testing.T) {
	if got := userNamespaceFromContext(nil); got != "" {
		t.Errorf("expected empty for nil context, got %q", got)
	}
}

func TestWithUserNamespace_RoundTrip(t *testing.T) {
	ctx := WithUserNamespace(context.Background(), "my-ns")
	got := userNamespaceFromContext(ctx)
	if got != "my-ns" {
		t.Errorf("expected 'my-ns', got %q", got)
	}
}

func TestWithUserNamespace_EmptyNamespaceNoOp(t *testing.T) {
	base := context.Background()
	ctx := WithUserNamespace(base, "")
	// An empty namespace should not set a value (context is unchanged).
	if got := userNamespaceFromContext(ctx); got != "" {
		t.Errorf("expected empty for context with empty ns, got %q", got)
	}
}

func TestWithUserNamespace_NilContext(t *testing.T) {
	// Should not panic; should return a context with the namespace set.
	ctx := WithUserNamespace(nil, "fallback-ns")
	got := userNamespaceFromContext(ctx)
	if got != "fallback-ns" {
		t.Errorf("expected 'fallback-ns' after WithUserNamespace(nil, ...), got %q", got)
	}
}
