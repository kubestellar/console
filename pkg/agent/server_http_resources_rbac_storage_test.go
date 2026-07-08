package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	rbacv1 "k8s.io/api/rbac/v1"
	k8serrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	fakek8s "k8s.io/client-go/kubernetes/fake"
	k8stesting "k8s.io/client-go/testing"

	"github.com/kubestellar/console/pkg/k8s"
)

// newRBACTestServer creates a minimal Server wired with a fake k8s client and
// the testBearerToken for RBAC mutation handler tests.
func newRBACTestServer(t *testing.T) (*Server, *k8s.MultiClusterClient) {
	t.Helper()
	k8sMock, err := k8s.NewMultiClusterClient("")
	if err != nil {
		t.Fatalf("NewMultiClusterClient: %v", err)
	}
	srv := &Server{
		k8sClient:     k8sMock,
		agentToken:    testBearerToken,
		tokenExplicit: true,
	}
	return srv, k8sMock
}

// doRoleBindingsRequest sends a request to handleRoleBindingsHTTP and returns
// the recorded response. It sets the Authorization header automatically.
func doRoleBindingsRequest(t *testing.T, srv *Server, method, rawQuery string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var reqBody *bytes.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("json.Marshal body: %v", err)
		}
		reqBody = bytes.NewReader(data)
	} else {
		reqBody = bytes.NewReader(nil)
	}

	url := "/rolebindings"
	if rawQuery != "" {
		url += "?" + rawQuery
	}
	req := httptest.NewRequest(method, url, reqBody)
	req.Host = "localhost"
	req.Header.Set("Authorization", "Bearer "+testBearerToken)
	req.Header.Set("Content-Type", "application/json")

	rr := httptest.NewRecorder()
	srv.handleRoleBindingsHTTP(rr, req)
	return rr
}

// --- Unauthorized / nil client tests ---

func TestHandleRoleBindingsHTTP_Unauthorized(t *testing.T) {
	srv, _ := newRBACTestServer(t)

	req := httptest.NewRequest(http.MethodPost, "/rolebindings", strings.NewReader(`{}`))
	req.Host = "localhost"
	// No Authorization header
	rr := httptest.NewRecorder()
	srv.handleRoleBindingsHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("want 401, got %d", rr.Code)
	}
}

func TestHandleRoleBindingsHTTP_NilK8sClient(t *testing.T) {
	srv := &Server{agentToken: testBearerToken, tokenExplicit: true}

	req := httptest.NewRequest(http.MethodPost, "/rolebindings", strings.NewReader(`{}`))
	req.Host = "localhost"
	req.Header.Set("Authorization", "Bearer "+testBearerToken)
	rr := httptest.NewRecorder()
	srv.handleRoleBindingsHTTP(rr, req)

	// nil k8s client returns JSON with error field, not 5xx — handled gracefully
	if rr.Code != http.StatusOK {
		t.Fatalf("want 200 with error JSON, got %d", rr.Code)
	}
	var resp map[string]interface{}
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if _, ok := resp["error"]; !ok {
		t.Fatalf("expected error field in response, got %v", resp)
	}
}

func TestHandleRoleBindingsHTTP_CORSPreflight(t *testing.T) {
	srv, _ := newRBACTestServer(t)

	req := httptest.NewRequest(http.MethodOptions, "/rolebindings", nil)
	req.Host = "localhost"
	rr := httptest.NewRecorder()
	srv.handleRoleBindingsHTTP(rr, req)

	if rr.Code != http.StatusNoContent {
		t.Fatalf("want 204 for CORS preflight, got %d", rr.Code)
	}
}

// --- createRoleBindingHTTP tests ---

func TestCreateRoleBindingHTTP_InvalidJSON(t *testing.T) {
	srv, _ := newRBACTestServer(t)

	req := httptest.NewRequest(http.MethodPost, "/rolebindings", strings.NewReader(`not-json`))
	req.Host = "localhost"
	req.Header.Set("Authorization", "Bearer "+testBearerToken)
	rr := httptest.NewRecorder()
	srv.handleRoleBindingsHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("want 400 for invalid JSON, got %d", rr.Code)
	}
}

func TestCreateRoleBindingHTTP_EmptyCluster(t *testing.T) {
	srv, _ := newRBACTestServer(t)

	rr := doRoleBindingsRequest(t, srv, http.MethodPost, "", map[string]string{
		"cluster":     "",
		"subjectKind": "User",
		"subjectName": "alice",
		"roleName":    "view",
	})

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("want 400 for empty cluster, got %d", rr.Code)
	}
}

func TestCreateRoleBindingHTTP_InvalidClusterChars(t *testing.T) {
	srv, _ := newRBACTestServer(t)

	rr := doRoleBindingsRequest(t, srv, http.MethodPost, "", map[string]string{
		"cluster":     "bad cluster!",
		"subjectKind": "User",
		"subjectName": "alice",
		"roleName":    "view",
	})

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("want 400 for invalid cluster chars, got %d", rr.Code)
	}
	var resp map[string]interface{}
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if success, _ := resp["success"].(bool); success {
		t.Fatalf("expected success=false")
	}
}

func TestCreateRoleBindingHTTP_MissingSubjectKind(t *testing.T) {
	srv, _ := newRBACTestServer(t)

	rr := doRoleBindingsRequest(t, srv, http.MethodPost, "", map[string]string{
		"cluster":     "cluster-a",
		"subjectName": "alice",
		"roleName":    "view",
	})

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("want 400 for missing subjectKind, got %d", rr.Code)
	}
}

func TestCreateRoleBindingHTTP_MissingSubjectName(t *testing.T) {
	srv, _ := newRBACTestServer(t)

	rr := doRoleBindingsRequest(t, srv, http.MethodPost, "", map[string]string{
		"cluster":     "cluster-a",
		"subjectKind": "User",
		"roleName":    "view",
	})

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("want 400 for missing subjectName, got %d", rr.Code)
	}
}

func TestCreateRoleBindingHTTP_MissingRoleName(t *testing.T) {
	srv, _ := newRBACTestServer(t)

	// Both roleName and role are empty
	rr := doRoleBindingsRequest(t, srv, http.MethodPost, "", map[string]interface{}{
		"cluster":     "cluster-a",
		"subjectKind": "User",
		"subjectName": "alice",
	})

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("want 400 for missing roleName/role, got %d", rr.Code)
	}
}

func TestCreateRoleBindingHTTP_GrantAccessShape_Success(t *testing.T) {
	srv, k8sMock := newRBACTestServer(t)
	fakeCS := fakek8s.NewSimpleClientset()
	k8sMock.SetClient("cluster-a", fakeCS)

	// grant-access shape: set `role`, no `roleName`
	rr := doRoleBindingsRequest(t, srv, http.MethodPost, "", map[string]interface{}{
		"cluster":     "cluster-a",
		"namespace":   "default",
		"subjectKind": "ServiceAccount",
		"subjectName": "my-sa",
		"role":        "edit",
	})

	if rr.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rr.Code, rr.Body.String())
	}
	var resp map[string]interface{}
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if success, _ := resp["success"].(bool); !success {
		t.Fatalf("expected success=true, got %v", resp)
	}
	// Binding name should be synthesized as <subject>-<role>-<namespace>
	if bindingName, _ := resp["roleBinding"].(string); bindingName == "" {
		t.Fatalf("expected roleBinding name in response, got %v", resp)
	}
}

func TestCreateRoleBindingHTTP_RBACBindingsShape_Success(t *testing.T) {
	srv, k8sMock := newRBACTestServer(t)
	fakeCS := fakek8s.NewSimpleClientset()
	k8sMock.SetClient("cluster-a", fakeCS)

	// rbac/bindings shape: set name, roleName, roleKind explicitly
	rr := doRoleBindingsRequest(t, srv, http.MethodPost, "", map[string]interface{}{
		"cluster":     "cluster-a",
		"name":        "alice-view-default",
		"namespace":   "default",
		"subjectKind": "User",
		"subjectName": "alice",
		"roleName":    "view",
		"roleKind":    "ClusterRole",
	})

	if rr.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rr.Code, rr.Body.String())
	}
	var resp map[string]interface{}
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if bindingName, _ := resp["roleBinding"].(string); bindingName != "alice-view-default" {
		t.Fatalf("expected roleBinding=alice-view-default, got %v", resp)
	}
}

func TestCreateRoleBindingHTTP_ClusterBinding_Success(t *testing.T) {
	srv, k8sMock := newRBACTestServer(t)
	fakeCS := fakek8s.NewSimpleClientset()
	k8sMock.SetClient("cluster-a", fakeCS)

	rr := doRoleBindingsRequest(t, srv, http.MethodPost, "", map[string]interface{}{
		"cluster":     "cluster-a",
		"isCluster":   true,
		"subjectKind": "User",
		"subjectName": "bob",
		"roleName":    "cluster-admin",
		"roleKind":    "ClusterRole",
	})

	if rr.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rr.Code, rr.Body.String())
	}
}

func TestCreateRoleBindingHTTP_K8sAlreadyExists(t *testing.T) {
	srv, k8sMock := newRBACTestServer(t)
	fakeCS := fakek8s.NewSimpleClientset()
	fakeCS.PrependReactor("create", "rolebindings", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, k8serrors.NewAlreadyExists(schema.GroupResource{Resource: "rolebindings"}, "alice-view-default")
	})
	k8sMock.SetClient("cluster-a", fakeCS)

	rr := doRoleBindingsRequest(t, srv, http.MethodPost, "", map[string]interface{}{
		"cluster":     "cluster-a",
		"namespace":   "default",
		"subjectKind": "User",
		"subjectName": "alice",
		"roleName":    "view",
		"roleKind":    "Role",
	})

	if rr.Code != http.StatusConflict {
		t.Fatalf("want 409 for AlreadyExists, got %d", rr.Code)
	}
}

func TestCreateRoleBindingHTTP_K8sForbidden(t *testing.T) {
	srv, k8sMock := newRBACTestServer(t)
	fakeCS := fakek8s.NewSimpleClientset()
	fakeCS.PrependReactor("create", "rolebindings", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, k8serrors.NewForbidden(schema.GroupResource{Resource: "rolebindings"}, "alice-view-default", nil)
	})
	k8sMock.SetClient("cluster-a", fakeCS)

	rr := doRoleBindingsRequest(t, srv, http.MethodPost, "", map[string]interface{}{
		"cluster":     "cluster-a",
		"namespace":   "default",
		"subjectKind": "User",
		"subjectName": "alice",
		"roleName":    "view",
		"roleKind":    "Role",
	})

	if rr.Code != http.StatusForbidden {
		t.Fatalf("want 403 for Forbidden, got %d", rr.Code)
	}
}

// --- deleteRoleBindingHTTP tests ---

func TestDeleteRoleBindingHTTP_MissingCluster(t *testing.T) {
	srv, _ := newRBACTestServer(t)

	rr := doRoleBindingsRequest(t, srv, http.MethodDelete, "name=my-binding&namespace=default", nil)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("want 400 for missing cluster, got %d", rr.Code)
	}
}

func TestDeleteRoleBindingHTTP_MissingName(t *testing.T) {
	srv, _ := newRBACTestServer(t)

	rr := doRoleBindingsRequest(t, srv, http.MethodDelete, "cluster=cluster-a&namespace=default", nil)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("want 400 for missing name, got %d", rr.Code)
	}
}

func TestDeleteRoleBindingHTTP_MissingNamespaceForNamespaced(t *testing.T) {
	srv, _ := newRBACTestServer(t)

	// isCluster not set → namespace required
	rr := doRoleBindingsRequest(t, srv, http.MethodDelete, "cluster=cluster-a&name=my-binding", nil)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("want 400 for missing namespace on namespace-scoped binding, got %d", rr.Code)
	}
}

func TestDeleteRoleBindingHTTP_NamespacedBinding_Success(t *testing.T) {
	srv, k8sMock := newRBACTestServer(t)
	fakeCS := fakek8s.NewSimpleClientset()
	if _, err := fakeCS.RbacV1().RoleBindings("default").Create(
		context.Background(),
		&rbacv1.RoleBinding{ObjectMeta: metav1.ObjectMeta{Name: "alice-view-default", Namespace: "default"}},
		metav1.CreateOptions{},
	); err != nil {
		t.Fatalf("pre-create role binding: %v", err)
	}
	k8sMock.SetClient("cluster-a", fakeCS)

	rr := doRoleBindingsRequest(t, srv, http.MethodDelete, "cluster=cluster-a&name=alice-view-default&namespace=default", nil)

	if rr.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rr.Code, rr.Body.String())
	}
	var resp map[string]interface{}
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if success, _ := resp["success"].(bool); !success {
		t.Fatalf("expected success=true, got %v", resp)
	}
}

func TestDeleteRoleBindingHTTP_ClusterBinding_Success(t *testing.T) {
	srv, k8sMock := newRBACTestServer(t)
	fakeCS := fakek8s.NewSimpleClientset()
	if _, err := fakeCS.RbacV1().ClusterRoleBindings().Create(
		context.Background(),
		&rbacv1.ClusterRoleBinding{ObjectMeta: metav1.ObjectMeta{Name: "bob-admin"}},
		metav1.CreateOptions{},
	); err != nil {
		t.Fatalf("pre-create cluster role binding: %v", err)
	}
	k8sMock.SetClient("cluster-a", fakeCS)

	// isCluster=true: namespace not required
	rr := doRoleBindingsRequest(t, srv, http.MethodDelete, "cluster=cluster-a&name=bob-admin&isCluster=true", nil)

	if rr.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rr.Code, rr.Body.String())
	}
}

func TestDeleteRoleBindingHTTP_K8sNotFound(t *testing.T) {
	srv, k8sMock := newRBACTestServer(t)
	fakeCS := fakek8s.NewSimpleClientset()
	fakeCS.PrependReactor("delete", "rolebindings", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, k8serrors.NewNotFound(schema.GroupResource{Resource: "rolebindings"}, "missing-binding")
	})
	k8sMock.SetClient("cluster-a", fakeCS)

	rr := doRoleBindingsRequest(t, srv, http.MethodDelete, "cluster=cluster-a&name=missing-binding&namespace=default", nil)

	if rr.Code != http.StatusNotFound {
		t.Fatalf("want 404 for NotFound, got %d", rr.Code)
	}
}

func TestDeleteRoleBindingHTTP_K8sForbidden(t *testing.T) {
	srv, k8sMock := newRBACTestServer(t)
	fakeCS := fakek8s.NewSimpleClientset()
	fakeCS.PrependReactor("delete", "clusterrolebindings", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, k8serrors.NewForbidden(schema.GroupResource{Resource: "clusterrolebindings"}, "bob-admin", nil)
	})
	k8sMock.SetClient("cluster-a", fakeCS)

	rr := doRoleBindingsRequest(t, srv, http.MethodDelete, "cluster=cluster-a&name=bob-admin&isCluster=true", nil)

	if rr.Code != http.StatusForbidden {
		t.Fatalf("want 403 for Forbidden, got %d", rr.Code)
	}
}

// TestCreateRoleBindingHTTP_SynthesizedName verifies the binding name is
// synthesized as <subjectName>-<roleName>-<namespace> when not provided.
func TestCreateRoleBindingHTTP_SynthesizedName(t *testing.T) {
	srv, k8sMock := newRBACTestServer(t)
	fakeCS := fakek8s.NewSimpleClientset()
	k8sMock.SetClient("cluster-a", fakeCS)

	rr := doRoleBindingsRequest(t, srv, http.MethodPost, "", map[string]interface{}{
		"cluster":     "cluster-a",
		"namespace":   "prod",
		"subjectKind": "User",
		"subjectName": "carol",
		"role":        "admin",
	})

	if rr.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rr.Code, rr.Body.String())
	}
	var resp map[string]interface{}
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	// synthesized name: carol-admin-prod
	if name, _ := resp["roleBinding"].(string); name != "carol-admin-prod" {
		t.Fatalf("want roleBinding=carol-admin-prod, got %q", name)
	}
}

// TestCreateRoleBindingHTTP_DefaultRoleKind verifies that when roleKind is
// omitted the request succeeds (defaults to ClusterRole internally, matching
// historical grant-access behavior).
func TestCreateRoleBindingHTTP_DefaultRoleKind(t *testing.T) {
	srv, k8sMock := newRBACTestServer(t)
	fakeCS := fakek8s.NewSimpleClientset()
	k8sMock.SetClient("cluster-a", fakeCS)

	rr := doRoleBindingsRequest(t, srv, http.MethodPost, "", map[string]interface{}{
		"cluster":     "cluster-a",
		"namespace":   "default",
		"subjectKind": "User",
		"subjectName": "dave",
		"role":        "view", // no roleKind → defaults to ClusterRole
	})

	if rr.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rr.Code, rr.Body.String())
	}
	var resp map[string]interface{}
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if success, _ := resp["success"].(bool); !success {
		t.Fatalf("expected success=true, got %v", resp)
	}
}
