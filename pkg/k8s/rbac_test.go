package k8s

import (
	"context"
	"testing"

	"time"

	authv1 "k8s.io/api/authorization/v1"
	corev1 "k8s.io/api/core/v1"
	rbacv1 "k8s.io/api/rbac/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/kubernetes/fake"
	k8stesting "k8s.io/client-go/testing"
	"k8s.io/client-go/tools/clientcmd/api"
)

func TestRBAC_ListServiceAccounts(t *testing.T) {
	m, _ := NewMultiClusterClient("")
	m.rawConfig = &api.Config{
		Contexts: map[string]*api.Context{"c1": {Cluster: "cl1"}},
	}

	sa := &corev1.ServiceAccount{
		ObjectMeta: metav1.ObjectMeta{Name: "sa1", Namespace: "default"},
	}
	fakeCS := fake.NewSimpleClientset(sa)
	m.clients["c1"] = fakeCS

	sas, err := m.ListServiceAccounts(context.Background(), "c1", "default")
	if err != nil {
		t.Fatalf("ListServiceAccounts failed: %v", err)
	}
	if len(sas) != 1 {
		t.Errorf("Expected 1 SA, got %d", len(sas))
	}
}

func TestRBAC_ListRoles(t *testing.T) {
	m, _ := NewMultiClusterClient("")
	m.rawConfig = &api.Config{
		Contexts: map[string]*api.Context{"c1": {Cluster: "cl1"}},
	}

	role := &rbacv1.Role{
		ObjectMeta: metav1.ObjectMeta{Name: "r1", Namespace: "default"},
	}
	fakeCS := fake.NewSimpleClientset(role)
	m.clients["c1"] = fakeCS

	roles, err := m.ListRoles(context.Background(), "c1", "default")
	if err != nil {
		t.Fatalf("ListRoles failed: %v", err)
	}
	if len(roles) != 1 {
		t.Errorf("Expected 1 role, got %d", len(roles))
	}
}

func TestRBAC_ListClusterRoles(t *testing.T) {
	m, _ := NewMultiClusterClient("")
	m.rawConfig = &api.Config{
		Contexts: map[string]*api.Context{"c1": {Cluster: "cl1"}},
	}

	cr := &rbacv1.ClusterRole{
		ObjectMeta: metav1.ObjectMeta{Name: "cr1"},
	}
	fakeCS := fake.NewSimpleClientset(cr)
	m.clients["c1"] = fakeCS

	roles, err := m.ListClusterRoles(context.Background(), "c1", false)
	if err != nil {
		t.Fatalf("ListClusterRoles failed: %v", err)
	}
	if len(roles) != 1 {
		t.Errorf("Expected 1 cluster role, got %d", len(roles))
	}
}

func TestRBAC_CheckPermission(t *testing.T) {
	m, _ := NewMultiClusterClient("")
	m.rawConfig = &api.Config{
		Contexts: map[string]*api.Context{"c1": {Cluster: "cl1"}},
	}

	fakeCS := fake.NewSimpleClientset()
	// Mock SelfSubjectAccessReview
	fakeCS.PrependReactor("create", "selfsubjectaccessreviews", func(action k8stesting.Action) (handled bool, ret runtime.Object, err error) {
		return true, &authv1.SelfSubjectAccessReview{
			Status: authv1.SubjectAccessReviewStatus{
				Allowed: true,
			},
		}, nil
	})
	m.clients["c1"] = fakeCS

	allowed, err := m.CheckPermission(context.Background(), "c1", "get", "pods", "default")
	if err != nil {
		t.Fatalf("CheckPermission failed: %v", err)
	}
	if !allowed {
		t.Error("Expected permission to be allowed")
	}
}

func TestRBAC_CheckClusterAdminAccess(t *testing.T) {
	m, _ := NewMultiClusterClient("")
	m.rawConfig = &api.Config{
		Contexts: map[string]*api.Context{"c1": {Cluster: "cl1"}},
	}

	fakeCS := fake.NewSimpleClientset()
	fakeCS.PrependReactor("create", "selfsubjectaccessreviews", func(action k8stesting.Action) (handled bool, ret runtime.Object, err error) {
		createAction := action.(k8stesting.CreateAction)
		review := createAction.GetObject().(*authv1.SelfSubjectAccessReview)

		allowed := false
		if review.Spec.ResourceAttributes.Resource == "*" && review.Spec.ResourceAttributes.Verb == "*" {
			allowed = true
		}

		return true, &authv1.SelfSubjectAccessReview{
			Status: authv1.SubjectAccessReviewStatus{
				Allowed: allowed,
			},
		}, nil
	})
	m.clients["c1"] = fakeCS

	isAdmin, err := m.CheckClusterAdminAccess(context.Background(), "c1")
	if err != nil {
		t.Fatalf("CheckClusterAdminAccess failed: %v", err)
	}
	if !isAdmin {
		t.Error("Expected cluster admin access")
	}
}

// TestParseOpenShiftUser_CreatedAt verifies that parseOpenShiftUser leaves
// CreatedAt nil when the creationTimestamp field is missing or unparseable,
// and sets it to the parsed value on a valid RFC3339 string. See issue #6764.
func TestParseOpenShiftUser_CreatedAt(t *testing.T) {
	t.Run("missing creationTimestamp leaves CreatedAt nil", func(t *testing.T) {
		item := unstructured.Unstructured{
			Object: map[string]interface{}{
				"metadata": map[string]interface{}{
					"name": "alice",
				},
			},
		}
		user := parseOpenShiftUser(item, "c1")
		if user.CreatedAt != nil {
			t.Errorf("expected CreatedAt nil, got %v", user.CreatedAt)
		}
		if user.Name != "alice" {
			t.Errorf("expected name alice, got %q", user.Name)
		}
	})

	t.Run("unparseable creationTimestamp leaves CreatedAt nil", func(t *testing.T) {
		item := unstructured.Unstructured{
			Object: map[string]interface{}{
				"metadata": map[string]interface{}{
					"name":              "bob",
					"creationTimestamp": "not-a-date",
				},
			},
		}
		user := parseOpenShiftUser(item, "c1")
		if user.CreatedAt != nil {
			t.Errorf("expected CreatedAt nil on parse failure, got %v", user.CreatedAt)
		}
	})

	t.Run("valid RFC3339 creationTimestamp is parsed", func(t *testing.T) {
		const ts = "2024-01-02T03:04:05Z"
		item := unstructured.Unstructured{
			Object: map[string]interface{}{
				"metadata": map[string]interface{}{
					"name":              "carol",
					"creationTimestamp": ts,
				},
			},
		}
		user := parseOpenShiftUser(item, "c1")
		if user.CreatedAt == nil {
			t.Fatal("expected CreatedAt non-nil for valid RFC3339 input")
		}
		want, err := time.Parse(time.RFC3339, ts)
		if err != nil {
			t.Fatalf("setup: time.Parse: %v", err)
		}
		if !user.CreatedAt.Equal(want) {
			t.Errorf("CreatedAt = %v, want %v", user.CreatedAt, want)
		}
	})
}
