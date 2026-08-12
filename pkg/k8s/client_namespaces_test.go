package k8s

import (
	"context"
	"errors"
	"testing"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	k8sfake "k8s.io/client-go/kubernetes/fake"
	ktesting "k8s.io/client-go/testing"
)

// These tests complement the happy-path coverage in
// client_config_namespaces_test.go by exercising the error branches of
// EnsureNamespaceExists that were previously untested (see quality bead
// "pkg/k8s/client_namespaces.go: EnsureNamespaceExists lacks unit tests").

// TestEnsureNamespaceExists_GetError verifies that non-NotFound Get errors
// are wrapped and returned to the caller.
func TestEnsureNamespaceExists_GetError(t *testing.T) {
	fake := k8sfake.NewSimpleClientset()
	fake.PrependReactor("get", "namespaces", func(action ktesting.Action) (bool, runtime.Object, error) {
		return true, nil, apierrors.NewInternalError(errors.New("boom"))
	})

	m, _ := NewMultiClusterClient("")
	m.InjectClient("ctx1", fake)

	err := m.EnsureNamespaceExists(context.Background(), "ctx1", "any-ns")
	if err == nil {
		t.Fatal("expected error, got nil")
	}
}

// TestEnsureNamespaceExists_CreateRace verifies that if the namespace is
// created between the Get NotFound and Create (i.e., Create returns
// AlreadyExists), EnsureNamespaceExists returns nil.
func TestEnsureNamespaceExists_CreateRace(t *testing.T) {
	fake := k8sfake.NewSimpleClientset()
	fake.PrependReactor("get", "namespaces", func(action ktesting.Action) (bool, runtime.Object, error) {
		return true, nil, apierrors.NewNotFound(schema.GroupResource{Resource: "namespaces"}, "raced-ns")
	})
	fake.PrependReactor("create", "namespaces", func(action ktesting.Action) (bool, runtime.Object, error) {
		return true, nil, apierrors.NewAlreadyExists(schema.GroupResource{Resource: "namespaces"}, "raced-ns")
	})

	m, _ := NewMultiClusterClient("")
	m.InjectClient("ctx1", fake)

	if err := m.EnsureNamespaceExists(context.Background(), "ctx1", "raced-ns"); err != nil {
		t.Errorf("expected nil on AlreadyExists race, got %v", err)
	}
}

// TestEnsureNamespaceExists_CreateOtherError verifies that non-AlreadyExists
// Create errors are propagated.
func TestEnsureNamespaceExists_CreateOtherError(t *testing.T) {
	fake := k8sfake.NewSimpleClientset()
	fake.PrependReactor("get", "namespaces", func(action ktesting.Action) (bool, runtime.Object, error) {
		return true, nil, apierrors.NewNotFound(schema.GroupResource{Resource: "namespaces"}, "some-ns")
	})
	fake.PrependReactor("create", "namespaces", func(action ktesting.Action) (bool, runtime.Object, error) {
		return true, nil, apierrors.NewForbidden(schema.GroupResource{Resource: "namespaces"}, "some-ns", errors.New("nope"))
	})

	m, _ := NewMultiClusterClient("")
	m.InjectClient("ctx1", fake)

	if err := m.EnsureNamespaceExists(context.Background(), "ctx1", "some-ns"); err == nil {
		t.Error("expected error from forbidden Create, got nil")
	}
}

// TestEnsureNamespaceExists_GetClientError verifies that a failure to resolve
// the target cluster client is propagated to the caller.
func TestEnsureNamespaceExists_GetClientError(t *testing.T) {
	m, _ := NewMultiClusterClient("")
	m.noClusterMode = true
	// inClusterConfig left nil so GetClient returns ErrNoClusterConfigured.

	if err := m.EnsureNamespaceExists(context.Background(), "missing-ctx", "some-ns"); err == nil {
		t.Error("expected error when GetClient fails, got nil")
	}
}
