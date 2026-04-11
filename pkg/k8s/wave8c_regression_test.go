package k8s

import (
	"context"
	"errors"
	"os"
	"testing"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

// TestCheckDeploymentHealth_RollingUpdate covers #6511 — a Deployment in the
// middle of a rolling update where all 10 replicas are "ready" but only 8
// are running the new version must NOT report Healthy.
func TestCheckDeploymentHealth_RollingUpdate(t *testing.T) {
	obj := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"spec": map[string]interface{}{
				"replicas": int64(10),
			},
			"status": map[string]interface{}{
				"replicas":          int64(10),
				"readyReplicas":     int64(10),
				"availableReplicas": int64(10),
				"updatedReplicas":   int64(8),
			},
		},
	}
	status, msg := checkDeploymentHealth(obj)
	if status == HealthStatusHealthy {
		t.Errorf("mid-rollout Deployment should not be Healthy; got %q (%q)", status, msg)
	}
	if status != HealthStatusDegraded {
		t.Errorf("expected Degraded during rolling update, got %q (%q)", status, msg)
	}
}

// TestCheckDeploymentHealth_FullyRolled covers the healthy path after the
// rollout completes — all counters equal spec.replicas.
func TestCheckDeploymentHealth_FullyRolled(t *testing.T) {
	obj := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"spec": map[string]interface{}{"replicas": int64(3)},
			"status": map[string]interface{}{
				"replicas":          int64(3),
				"readyReplicas":     int64(3),
				"availableReplicas": int64(3),
				"updatedReplicas":   int64(3),
			},
		},
	}
	status, _ := checkDeploymentHealth(obj)
	if status != HealthStatusHealthy {
		t.Errorf("fully rolled Deployment should be Healthy, got %q", status)
	}
}

// TestBuildProbeNamespaces covers #6512 — user namespace priority, env var
// extension, and deduplication against the default list.
func TestBuildProbeNamespaces(t *testing.T) {
	t.Run("default only", func(t *testing.T) {
		t.Setenv(probeNamespacesEnvVar, "")
		got := buildProbeNamespaces("")
		if len(got) < 3 {
			t.Fatalf("expected at least 3 default namespaces, got %v", got)
		}
		if got[0] != "default" {
			t.Errorf("expected 'default' first, got %q", got[0])
		}
	})
	t.Run("env var extends list", func(t *testing.T) {
		t.Setenv(probeNamespacesEnvVar, "tenant-a, tenant-b , tenant-a")
		got := buildProbeNamespaces("")
		// tenant-a, tenant-b should appear, duplicate ignored
		var seenA, seenB int
		for _, ns := range got {
			if ns == "tenant-a" {
				seenA++
			}
			if ns == "tenant-b" {
				seenB++
			}
		}
		if seenA != 1 || seenB != 1 {
			t.Errorf("expected each tenant ns once; got a=%d b=%d in %v", seenA, seenB, got)
		}
	})
	t.Run("user namespace prioritized", func(t *testing.T) {
		t.Setenv(probeNamespacesEnvVar, "tenant-a")
		got := buildProbeNamespaces("my-team")
		if got[0] != "my-team" {
			t.Errorf("expected user namespace first, got %v", got)
		}
	})
	t.Run("user namespace dedup with default", func(t *testing.T) {
		os.Unsetenv(probeNamespacesEnvVar)
		got := buildProbeNamespaces("default")
		// "default" should appear only once and be first
		count := 0
		for _, ns := range got {
			if ns == "default" {
				count++
			}
		}
		if count != 1 {
			t.Errorf("expected 'default' to appear once, got %d in %v", count, got)
		}
	})
}

// TestWithUserNamespace covers round-tripping through the context helper.
func TestWithUserNamespace(t *testing.T) {
	ctx := context.Background()
	if got := userNamespaceFromContext(ctx); got != "" {
		t.Errorf("expected empty namespace from plain ctx, got %q", got)
	}
	ctx = WithUserNamespace(ctx, "foo")
	if got := userNamespaceFromContext(ctx); got != "foo" {
		t.Errorf("expected 'foo', got %q", got)
	}
	// Empty passes through unchanged
	ctx2 := WithUserNamespace(context.Background(), "")
	if got := userNamespaceFromContext(ctx2); got != "" {
		t.Errorf("expected empty, got %q", got)
	}
}

// TestIsCRDNotInstalled covers #6510 — auth/network errors must NOT be
// classified as "CRD not installed" (otherwise mcs.go silently returns an
// empty list and the caller can't surface per-cluster errors).
func TestIsCRDNotInstalled(t *testing.T) {
	gvr := schema.GroupVersionResource{Group: "multicluster.x-k8s.io", Version: "v1alpha1", Resource: "serviceexports"}
	tests := []struct {
		name string
		err  error
		want bool
	}{
		{"nil", nil, false},
		{"NotFound on object (not type)", apierrors.NewNotFound(gvr.GroupResource(), "my-export"), false},
		{"generic auth error", errors.New("401 Unauthorized"), false},
		{"generic network error", errors.New("dial tcp: connection refused"), false},
		{"server-side CRD missing", errors.New("the server could not find the requested resource"), true},
	}
	for _, tt := range tests {
		if got := isCRDNotInstalled(tt.err); got != tt.want {
			t.Errorf("%s: isCRDNotInstalled(%v) = %v, want %v", tt.name, tt.err, got, tt.want)
		}
	}
}
