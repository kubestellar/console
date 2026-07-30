package k8s

import (
	"context"
	"testing"

	"github.com/kubestellar/console/pkg/models"
	authv1 "k8s.io/api/authorization/v1"
	corev1 "k8s.io/api/core/v1"
	rbacv1 "k8s.io/api/rbac/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	dynfake "k8s.io/client-go/dynamic/fake"
	"k8s.io/client-go/kubernetes/fake"
	k8stesting "k8s.io/client-go/testing"
	"k8s.io/client-go/tools/clientcmd/api"
)

func TestRBAC_ListRoleBindings(t *testing.T) {
	m, _ := NewMultiClusterClient("")
	m.rawConfig = &api.Config{Contexts: map[string]*api.Context{"c1": {Cluster: "cl1"}}}

	m.clients["c1"] = fake.NewSimpleClientset(&rbacv1.RoleBinding{
		ObjectMeta: metav1.ObjectMeta{Name: "rb1", Namespace: "default"},
	})

	rbs, err := m.ListRoleBindings(context.Background(), "c1", "default")
	if err != nil {
		t.Fatalf("ListRoleBindings failed: %v", err)
	}
	if len(rbs) != 1 {
		t.Errorf("Expected 1 binding, got %d", len(rbs))
	}
}

func TestRBAC_ListClusterRoleBindings(t *testing.T) {
	m, _ := NewMultiClusterClient("")
	m.rawConfig = &api.Config{Contexts: map[string]*api.Context{"c1": {Cluster: "cl1"}}}

	m.clients["c1"] = fake.NewSimpleClientset(&rbacv1.ClusterRoleBinding{
		ObjectMeta: metav1.ObjectMeta{Name: "crb1"},
	})

	crbs, err := m.ListClusterRoleBindings(context.Background(), "c1", false)
	if err != nil {
		t.Fatalf("ListClusterRoleBindings failed: %v", err)
	}
	if len(crbs) != 1 {
		t.Errorf("Expected 1 binding, got %d", len(crbs))
	}
}

func TestRBAC_CreateServiceAccount(t *testing.T) {
	m, _ := NewMultiClusterClient("")
	fakeCS := fake.NewSimpleClientset()
	m.clients["c1"] = fakeCS

	sa, err := m.CreateServiceAccount(context.Background(), "c1", "default", "sa1")
	if err != nil {
		t.Fatalf("CreateServiceAccount failed: %v", err)
	}
	if sa.Name != "sa1" {
		t.Errorf("Expected sa1, got %s", sa.Name)
	}
}

func TestRBAC_CreateRoleBinding(t *testing.T) {
	m, _ := NewMultiClusterClient("")
	fakeCS := fake.NewSimpleClientset()
	m.clients["c1"] = fakeCS

	req := models.CreateRoleBindingRequest{
		Cluster:     "c1",
		Namespace:   "default",
		Name:        "rb1",
		RoleName:    "admin",
		RoleKind:    "ClusterRole",
		SubjectName: "user1",
		SubjectKind: "User",
	}

	err := m.CreateRoleBinding(context.Background(), req)
	if err != nil {
		t.Fatalf("CreateRoleBinding failed: %v", err)
	}

	// Verify creation
	_, err = fakeCS.RbacV1().RoleBindings("default").Get(context.Background(), "rb1", metav1.GetOptions{})
	if err != nil {
		t.Errorf("RoleBinding not created: %v", err)
	}
}

func TestRBAC_DeleteServiceAccount(t *testing.T) {
	m, _ := NewMultiClusterClient("")
	fakeCS := fake.NewSimpleClientset(&corev1.ServiceAccount{
		ObjectMeta: metav1.ObjectMeta{Name: "sa1", Namespace: "default"},
	})
	m.clients["c1"] = fakeCS

	err := m.DeleteServiceAccount(context.Background(), "c1", "default", "sa1")
	if err != nil {
		t.Fatalf("DeleteServiceAccount failed: %v", err)
	}

	_, err = fakeCS.CoreV1().ServiceAccounts("default").Get(context.Background(), "sa1", metav1.GetOptions{})
	if err == nil {
		t.Error("ServiceAccount should be deleted")
	}
}

func TestRBAC_DeleteRoleBinding(t *testing.T) {
	m, _ := NewMultiClusterClient("")
	fakeCS := fake.NewSimpleClientset(&rbacv1.RoleBinding{
		ObjectMeta: metav1.ObjectMeta{Name: "rb1", Namespace: "default"},
	})
	m.clients["c1"] = fakeCS

	err := m.DeleteRoleBinding(context.Background(), "c1", "default", "rb1", false)
	if err != nil {
		t.Fatalf("DeleteRoleBinding failed: %v", err)
	}

	_, err = fakeCS.RbacV1().RoleBindings("default").Get(context.Background(), "rb1", metav1.GetOptions{})
	if err == nil {
		t.Error("RoleBinding should be deleted")
	}
}

func TestRBAC_GetClusterPermissions(t *testing.T) {
	m, _ := NewMultiClusterClient("")
	fakeCS := fake.NewSimpleClientset()
	m.clients["c1"] = fakeCS

	// Mock allow all
	fakeCS.PrependReactor("create", "selfsubjectaccessreviews", func(action k8stesting.Action) (handled bool, ret runtime.Object, err error) {
		return true, &authv1.SelfSubjectAccessReview{
			Status: authv1.SubjectAccessReviewStatus{Allowed: true},
		}, nil
	})

	perms, err := m.GetClusterPermissions(context.Background(), "c1")
	if err != nil {
		t.Fatalf("GetClusterPermissions failed: %v", err)
	}
	if !perms.IsClusterAdmin {
		t.Error("Expected IsClusterAdmin true")
	}
	if !perms.CanCreateSA {
		t.Error("Expected CanCreateSA true")
	}
}

func TestRBAC_CreateNamespace(t *testing.T) {
	m, _ := NewMultiClusterClient("")
	fakeCS := fake.NewSimpleClientset()
	m.clients["c1"] = fakeCS

	ns, err := m.CreateNamespace(context.Background(), "c1", "ns1", nil)
	if err != nil {
		t.Fatalf("CreateNamespace failed: %v", err)
	}
	if ns.Name != "ns1" {
		t.Errorf("Expected ns1, got %s", ns.Name)
	}
}

func TestRBAC_DeleteNamespace(t *testing.T) {
	m, _ := NewMultiClusterClient("")
	fakeCS := fake.NewSimpleClientset(&corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "ns1"}})
	m.clients["c1"] = fakeCS

	err := m.DeleteNamespace(context.Background(), "c1", "ns1")
	if err != nil {
		t.Fatalf("DeleteNamespace failed: %v", err)
	}

	_, err = fakeCS.CoreV1().Namespaces().Get(context.Background(), "ns1", metav1.GetOptions{})
	if err == nil {
		t.Error("Namespace should be deleted")
	}
}

func TestGetAllClusterPermissions(t *testing.T) {
	m, _ := NewMultiClusterClient("")
	m.rawConfig = &api.Config{Contexts: map[string]*api.Context{
		"c1": {Cluster: "cl1"},
		"c2": {Cluster: "cl2"},
	}}

	// c1 is admin, c2 is restricted
	fakeCS1 := fake.NewSimpleClientset()
	fakeCS1.PrependReactor("create", "selfsubjectaccessreviews", func(action k8stesting.Action) (handled bool, ret runtime.Object, err error) {
		return true, &authv1.SelfSubjectAccessReview{Status: authv1.SubjectAccessReviewStatus{Allowed: true}}, nil
	})
	m.clients["c1"] = fakeCS1

	fakeCS2 := fake.NewSimpleClientset()
	fakeCS2.PrependReactor("create", "selfsubjectaccessreviews", func(action k8stesting.Action) (handled bool, ret runtime.Object, err error) {
		return true, &authv1.SelfSubjectAccessReview{Status: authv1.SubjectAccessReviewStatus{Allowed: false}}, nil
	})
	m.clients["c2"] = fakeCS2

	perms, err := m.GetAllClusterPermissions(context.Background())
	if err != nil {
		t.Fatalf("GetAllClusterPermissions failed: %v", err)
	}

	if len(perms) != 2 {
		t.Errorf("Expected 2 permissions, got %d", len(perms))
	}

	// Find c1 and c2 perms
	var c1Perms *models.ClusterPermissions
	for i := range perms {
		if perms[i].Cluster == "c1" {
			c1Perms = &perms[i]
			break
		}
	}

	if c1Perms == nil {
		t.Error("Missing c1 permissions")
	} else if !c1Perms.IsClusterAdmin {
		t.Error("Expected c1 to be admin")
	}
}

func TestCountServiceAccountsAllClusters(t *testing.T) {
	m, _ := NewMultiClusterClient("")
	m.rawConfig = &api.Config{Contexts: map[string]*api.Context{
		"c1": {Cluster: "cl1"},
	}}

	fakeCS := fake.NewSimpleClientset(
		&corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "ns1"}},
		&corev1.ServiceAccount{ObjectMeta: metav1.ObjectMeta{Name: "sa1", Namespace: "ns1"}},
		&corev1.ServiceAccount{ObjectMeta: metav1.ObjectMeta{Name: "sa2", Namespace: "ns1"}},
	)
	m.clients["c1"] = fakeCS

	count, _, err := m.CountServiceAccountsAllClusters(context.Background())
	if err != nil {
		t.Fatalf("CountServiceAccountsAllClusters failed: %v", err)
	}
	if count != 2 {
		t.Errorf("Expected 2 SAs, got %d", count)
	}
}

func TestGetAllK8sUsers(t *testing.T) {
	m, _ := NewMultiClusterClient("")
	m.rawConfig = &api.Config{Contexts: map[string]*api.Context{
		"c1": {Cluster: "cl1"},
	}}

	fakeCS := fake.NewSimpleClientset(
		&rbacv1.RoleBinding{
			ObjectMeta: metav1.ObjectMeta{Name: "rb1", Namespace: "default"},
			Subjects:   []rbacv1.Subject{{Kind: "User", Name: "alice"}},
		},
		&rbacv1.ClusterRoleBinding{
			ObjectMeta: metav1.ObjectMeta{Name: "crb1"},
			Subjects:   []rbacv1.Subject{{Kind: "User", Name: "bob"}, {Kind: "Group", Name: "devs"}},
		},
	)
	m.clients["c1"] = fakeCS

	users, err := m.GetAllK8sUsers(context.Background(), "c1")
	if err != nil {
		t.Fatalf("GetAllK8sUsers failed: %v", err)
	}

	foundAlice := false
	foundBob := false
	for _, u := range users {
		if u.Name == "alice" && u.Kind == "User" {
			foundAlice = true
		}
		if u.Name == "bob" && u.Kind == "User" {
			foundBob = true
		}
	}
	if !foundAlice {
		t.Error("Expected user alice")
	}
	if !foundBob {
		t.Error("Expected user bob")
	}
}

func TestListNamespacesWithDetails(t *testing.T) {
	m, _ := NewMultiClusterClient("")
	m.rawConfig = &api.Config{Contexts: map[string]*api.Context{"c1": {Cluster: "cl1"}}}

	fakeCS := fake.NewSimpleClientset(&corev1.Namespace{
		ObjectMeta: metav1.ObjectMeta{Name: "ns1", CreationTimestamp: metav1.Now()},
		Status:     corev1.NamespaceStatus{Phase: corev1.NamespaceActive},
	})
	m.clients["c1"] = fakeCS

	ns, err := m.ListNamespacesWithDetails(context.Background(), "c1")
	if err != nil {
		t.Fatalf("ListNamespacesWithDetails failed: %v", err)
	}
	if len(ns) != 1 {
		t.Fatalf("Expected 1 namespace, got %d", len(ns))
	}
	if ns[0].Name != "ns1" {
		t.Errorf("Expected ns1, got %s", ns[0].Name)
	}
	if ns[0].Status != "Active" {
		t.Errorf("Expected Active status, got %s", ns[0].Status)
	}
}

func TestGetPermissionsSummary(t *testing.T) {
	m, _ := NewMultiClusterClient("")
	m.rawConfig = &api.Config{Contexts: map[string]*api.Context{"c1": {Cluster: "cl1"}}}

	fakeCS := fake.NewSimpleClientset(&corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "ns1"}})
	// Allow everything
	fakeCS.PrependReactor("create", "selfsubjectaccessreviews", func(action k8stesting.Action) (handled bool, ret runtime.Object, err error) {
		return true, &authv1.SelfSubjectAccessReview{Status: authv1.SubjectAccessReviewStatus{Allowed: true}}, nil
	})
	m.clients["c1"] = fakeCS

	summary, err := m.GetPermissionsSummary(context.Background(), "c1")
	if err != nil {
		t.Fatalf("GetPermissionsSummary failed: %v", err)
	}
	if !summary.IsClusterAdmin {
		t.Error("Expected admin")
	}
	if !summary.CanListNamespaces {
		t.Error("Expected CanListNamespaces")
	}
}

func TestGrantNamespaceAccess(t *testing.T) {
	m, _ := NewMultiClusterClient("")
	m.rawConfig = &api.Config{Contexts: map[string]*api.Context{"c1": {Cluster: "cl1"}}}
	fakeCS := fake.NewSimpleClientset()
	m.clients["c1"] = fakeCS

	// Case 1: Admin role, User subject
	req := models.GrantNamespaceAccessRequest{
		SubjectName: "user1",
		SubjectKind: "User",
		Role:        "admin",
	}
	bindingName, err := m.GrantNamespaceAccess(context.Background(), "c1", "default", req)
	if err != nil {
		t.Fatalf("GrantNamespaceAccess failed: %v", err)
	}
	if bindingName == "" {
		t.Error("Expected binding name")
	}

	// Verify creation
	rb, err := fakeCS.RbacV1().RoleBindings("default").Get(context.Background(), bindingName, metav1.GetOptions{})
	if err != nil {
		t.Fatalf("RoleBinding not created: %v", err)
	}
	if rb.RoleRef.Name != "admin" {
		t.Errorf("Expected role admin, got %s", rb.RoleRef.Name)
	}

	// Case 2: Custom role, ServiceAccount subject
	req2 := models.GrantNamespaceAccessRequest{
		SubjectName: "sa1",
		SubjectKind: "ServiceAccount",
		SubjectNS:   "default",
		Role:        "custom-role",
	}
	bindingName2, err := m.GrantNamespaceAccess(context.Background(), "c1", "default", req2)
	if err != nil {
		t.Fatalf("GrantNamespaceAccess 2 failed: %v", err)
	}

	rb2, err := fakeCS.RbacV1().RoleBindings("default").Get(context.Background(), bindingName2, metav1.GetOptions{})
	if err != nil {
		t.Fatalf("RoleBinding2 not created: %v", err)
	}
	if rb2.Subjects[0].Kind != "ServiceAccount" {
		t.Errorf("Expected ServiceAccount, got %s", rb2.Subjects[0].Kind)
	}
}

func TestSanitizeK8sName(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"MyName", "myname"},
		{"user@example.com", "user-example.com"},
		{"-start-dash", "x-start-dash"},
		{"end-dash-", "end-dash"},
		{"ALLCAPS", "allcaps"},
	}

	for _, tt := range tests {
		got := sanitizeK8sName(tt.input)
		if got != tt.want {
			t.Errorf("sanitizeK8sName(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

func TestCheckCanI(t *testing.T) {
	m, _ := NewMultiClusterClient("")
	m.rawConfig = &api.Config{Contexts: map[string]*api.Context{"c1": {Cluster: "cl1"}}}
	fakeCS := fake.NewSimpleClientset()

	// Mock allowed response
	fakeCS.PrependReactor("create", "selfsubjectaccessreviews", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, &authv1.SelfSubjectAccessReview{
			Status: authv1.SubjectAccessReviewStatus{Allowed: true, Reason: "RBAC allowed"},
		}, nil
	})
	m.clients["c1"] = fakeCS

	req := models.CanIRequest{Verb: "get", Resource: "pods", Namespace: "default"}
	res, err := m.CheckCanI(context.Background(), "c1", req)
	if err != nil {
		t.Fatalf("CheckCanI failed: %v", err)
	}
	if !res.Allowed {
		t.Error("Expected allowed")
	}
	if res.Reason != "RBAC allowed" {
		t.Errorf("Expected reason 'RBAC allowed', got %s", res.Reason)
	}
}

func TestGetAllPermissionsSummaries(t *testing.T) {
	m, _ := NewMultiClusterClient("")
	m.rawConfig = &api.Config{Contexts: map[string]*api.Context{
		"c1": {Cluster: "cl1"},
		"c2": {Cluster: "cl2"},
	}}

	// c1 is accessible, c2 fails
	fakeCS1 := fake.NewSimpleClientset()
	fakeCS1.PrependReactor("create", "selfsubjectaccessreviews", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, &authv1.SelfSubjectAccessReview{Status: authv1.SubjectAccessReviewStatus{Allowed: true}}, nil
	})
	m.clients["c1"] = fakeCS1

	// c2 returns error - we simulate by NOT setting client, so GetClient fails
	// Wait, GetClient uses configs/rawconfig. If we don't set a client in map, it tries to load from config.
	// Since we don't have real config, it might fail or we can mock GetClient failure more directly?
	// Actually GetClient checks m.clients first. If not found, it tries to load.
	// NewMultiClusterClient("") makes empty client.
	// We added c2 to rawConfig, so GetClient("c2") will try to load config and fail because kubeconfig is empty/invalid path?
	// Wait, NewMultiClusterClient("") tries to load default.
	// We can inject a client for c1, but leave c2. GetClient("c2") will try to load from config.
	// Since rawConfig is manually set, it will try to create client from it.
	// The rawConfig is minimal, so it might fail to create client (missing server etc).

	summaries, err := m.GetAllPermissionsSummaries(context.Background())
	if err != nil {
		t.Fatalf("GetAllPermissionsSummaries failed: %v", err)
	}

	// We might get 1 or 2 depending on if c2 is returned as failed summary
	// Implementation says: "If we can't even get a client, assume not cluster admin... summaries = append(summaries, summary)"
	// So we expect 2 summaries.

	if len(summaries) != 2 {
		t.Errorf("Expected 2 summaries, got %d", len(summaries))
	}

	var c1Sum *PermissionsSummary
	for i := range summaries {
		if summaries[i].Cluster == "c1" {
			c1Sum = &summaries[i]
			break
		}
	}

	if c1Sum == nil {
		t.Error("Missing c1 summary")
	} else if !c1Sum.IsClusterAdmin {
		t.Error("Expected c1 admin")
	}
}

func TestListOpenShiftUsers(t *testing.T) {
	userObj := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "user.openshift.io/v1",
			"kind":       "User",
			"metadata": map[string]interface{}{
				"name":              "user1",
				"creationTimestamp": "2024-01-01T00:00:00Z",
			},
			"fullName":   "Alice User",
			"groups":     []interface{}{"devs", "admins"},
			"identities": []interface{}{"github:alice"},
		},
	}

	scheme := runtime.NewScheme()
	gvrMap := map[schema.GroupVersionResource]string{
		{Group: "user.openshift.io", Version: "v1", Resource: "users"}: "UserList",
	}

	fakeDyn := dynfake.NewSimpleDynamicClientWithCustomListKinds(scheme, gvrMap, userObj)

	m, _ := NewMultiClusterClient("")
	m.dynamicClients["c1"] = fakeDyn
	m.rawConfig = &api.Config{Contexts: map[string]*api.Context{"c1": {Cluster: "cluster1"}}}

	users, err := m.ListOpenShiftUsers(context.Background(), "c1")
	if err != nil {
		t.Fatalf("ListOpenShiftUsers failed: %v", err)
	}
	if len(users) != 1 {
		t.Fatalf("Expected 1 user, got %d", len(users))
	}
	if users[0].Name != "user1" {
		t.Errorf("Expected user1, got %s", users[0].Name)
	}
	if users[0].FullName != "Alice User" {
		t.Errorf("Expected Alice User, got %s", users[0].FullName)
	}
}
