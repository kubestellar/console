package agent

// Coverage for the PUT / DELETE / method-not-allowed arms of
// Server.handleConsoleCRClusterGroups (pkg/agent/server_console_cr.go:159).
//
// The existing TestServer_HandleConsoleCRClusterGroups covers only POST
// (create) success, leaving the other switch arms uncovered:
//
//   1. PUT missing `name` query param -> 400
//   2. PUT invalid JSON body -> 400
//   3. PUT happy path -> 200 with updated CR echoed back
//   4. DELETE missing `name` query param -> 400
//   5. DELETE happy path -> 200 with {"success":true,"name":...}
//   6. POST invalid JSON body -> 400
//   7. Unsupported method (PATCH) -> 405
//   8. OPTIONS preflight -> 200

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/dynamic/fake"

	"github.com/kubestellar/console/pkg/apis/v1alpha1"
	"github.com/kubestellar/console/pkg/k8s"
)

// newClusterGroupsServer returns a Server with a fake dynamic client
// registered under "persistence-cluster" — the same shape used by the
// existing TestServer_HandleConsoleCRClusterGroups.
func newClusterGroupsServer(t *testing.T) *Server {
	t.Helper()
	fakeDyn := fake.NewSimpleDynamicClient(runtime.NewScheme())
	k8sClient, err := k8s.NewMultiClusterClient("")
	if err != nil {
		t.Fatalf("NewMultiClusterClient: %v", err)
	}
	k8sClient.SetDynamicClient("persistence-cluster", fakeDyn)
	return &Server{k8sClient: k8sClient, allowedOrigins: []string{"*"}}
}

// seedClusterGroup first-POSTs a fresh ClusterGroup so PUT/DELETE have a
// live object to operate on. Reuses the same handler under test, which is
// itself covered by the pre-existing POST-only test.
func seedClusterGroup(t *testing.T, s *Server, name string) {
	t.Helper()
	cg := v1alpha1.ClusterGroup{
		TypeMeta: metav1.TypeMeta{
			APIVersion: v1alpha1.GroupVersion.String(),
			Kind:       "ClusterGroup",
		},
		ObjectMeta: metav1.ObjectMeta{Name: name},
	}
	body, _ := json.Marshal(cg)
	req := httptest.NewRequest(http.MethodPost, "/console-cr/clustergroups?cluster=persistence-cluster&namespace=test-ns", bytes.NewReader(body))
	req.Host = "localhost"
	w := httptest.NewRecorder()
	s.handleConsoleCRClusterGroups(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("seed POST failed: got %d body=%s", w.Code, w.Body.String())
	}
}

func TestHandleConsoleCRClusterGroups_OptionsPreflight(t *testing.T) {
	s := newClusterGroupsServer(t)
	req := httptest.NewRequest(http.MethodOptions, "/console-cr/clustergroups?cluster=persistence-cluster&namespace=test-ns", nil)
	req.Host = "localhost"
	req.Header.Set("Origin", "http://localhost:8080")
	w := httptest.NewRecorder()

	s.handleConsoleCRClusterGroups(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 for OPTIONS, got %d", w.Code)
	}
	if allow := w.Header().Get("Access-Control-Allow-Methods"); allow == "" {
		t.Fatal("expected Access-Control-Allow-Methods header on OPTIONS preflight")
	}
}

func TestHandleConsoleCRClusterGroups_InvalidPostBody(t *testing.T) {
	s := newClusterGroupsServer(t)
	req := httptest.NewRequest(http.MethodPost, "/console-cr/clustergroups?cluster=persistence-cluster&namespace=test-ns", strings.NewReader("not-json{"))
	req.Host = "localhost"
	w := httptest.NewRecorder()

	s.handleConsoleCRClusterGroups(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for invalid POST body, got %d body=%s", w.Code, w.Body.String())
	}
}

func TestHandleConsoleCRClusterGroups_PutMissingName(t *testing.T) {
	s := newClusterGroupsServer(t)
	body, _ := json.Marshal(v1alpha1.ClusterGroup{})
	req := httptest.NewRequest(http.MethodPut, "/console-cr/clustergroups?cluster=persistence-cluster&namespace=test-ns", bytes.NewReader(body))
	req.Host = "localhost"
	w := httptest.NewRecorder()

	s.handleConsoleCRClusterGroups(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for PUT missing name, got %d body=%s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), "name query parameter is required") {
		t.Errorf("body should mention name param requirement, got %s", w.Body.String())
	}
}

func TestHandleConsoleCRClusterGroups_PutInvalidBody(t *testing.T) {
	s := newClusterGroupsServer(t)
	req := httptest.NewRequest(http.MethodPut, "/console-cr/clustergroups?cluster=persistence-cluster&namespace=test-ns&name=some-cg", strings.NewReader("{not-json"))
	req.Host = "localhost"
	w := httptest.NewRecorder()

	s.handleConsoleCRClusterGroups(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for PUT invalid body, got %d body=%s", w.Code, w.Body.String())
	}
}

func TestHandleConsoleCRClusterGroups_PutHappyPath(t *testing.T) {
	s := newClusterGroupsServer(t)
	seedClusterGroup(t, s, "cg-live")

	cg := v1alpha1.ClusterGroup{
		TypeMeta: metav1.TypeMeta{
			APIVersion: v1alpha1.GroupVersion.String(),
			Kind:       "ClusterGroup",
		},
	}
	body, _ := json.Marshal(cg)
	req := httptest.NewRequest(http.MethodPut, "/console-cr/clustergroups?cluster=persistence-cluster&namespace=test-ns&name=cg-live", bytes.NewReader(body))
	req.Host = "localhost"
	w := httptest.NewRecorder()

	s.handleConsoleCRClusterGroups(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 for PUT happy path, got %d body=%s", w.Code, w.Body.String())
	}
}

func TestHandleConsoleCRClusterGroups_DeleteMissingName(t *testing.T) {
	s := newClusterGroupsServer(t)
	req := httptest.NewRequest(http.MethodDelete, "/console-cr/clustergroups?cluster=persistence-cluster&namespace=test-ns", nil)
	req.Host = "localhost"
	w := httptest.NewRecorder()

	s.handleConsoleCRClusterGroups(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for DELETE missing name, got %d body=%s", w.Code, w.Body.String())
	}
}

func TestHandleConsoleCRClusterGroups_DeleteHappyPath(t *testing.T) {
	s := newClusterGroupsServer(t)
	seedClusterGroup(t, s, "cg-to-delete")

	req := httptest.NewRequest(http.MethodDelete, "/console-cr/clustergroups?cluster=persistence-cluster&namespace=test-ns&name=cg-to-delete", nil)
	req.Host = "localhost"
	w := httptest.NewRecorder()

	s.handleConsoleCRClusterGroups(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 for DELETE, got %d body=%s", w.Code, w.Body.String())
	}
	var resp map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("body not JSON: %v (%s)", err, w.Body.String())
	}
	if ok, _ := resp["success"].(bool); !ok {
		t.Errorf("expected success=true, got %v", resp["success"])
	}
	if resp["name"] != "cg-to-delete" {
		t.Errorf("expected name=cg-to-delete, got %v", resp["name"])
	}
}

func TestHandleConsoleCRClusterGroups_MethodNotAllowed(t *testing.T) {
	s := newClusterGroupsServer(t)
	// PATCH is not one of the switch arms — falls through to default.
	req := httptest.NewRequest(http.MethodPatch, "/console-cr/clustergroups?cluster=persistence-cluster&namespace=test-ns", strings.NewReader("{}"))
	req.Host = "localhost"
	w := httptest.NewRecorder()

	s.handleConsoleCRClusterGroups(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405 for PATCH, got %d body=%s", w.Code, w.Body.String())
	}
}
