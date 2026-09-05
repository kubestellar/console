package agent

// Coverage for the parameter-validation and client-resolution error arms
// of Server.resolveConsoleCRTarget (pkg/agent/server_console_cr.go:46).
//
// The existing TestServer_HandleConsoleCRManagedWorkloads exercises only
// the happy path (both query params present, dynamic client resolved),
// leaving three defensive arms uncovered:
//
//   1. missing `cluster`/`namespace` query params -> 400 with structured
//      JSON error
//   2. server has no k8sClient configured -> 503 with "k8s client not
//      initialized"
//   3. k8sClient.GetDynamicClient returns an error -> 503 with a
//      sanitized "resolve console CR target" prefix
//
// Each arm is exercised through the exported handleConsoleCRManagedWorkloads
// entry point, which is the same wrapper the existing tests use, so no
// production API surface is added or altered.

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/kubestellar/console/pkg/k8s"
)

func TestResolveConsoleCRTarget_MissingClusterParam(t *testing.T) {
	s := &Server{allowedOrigins: []string{"*"}}
	req := httptest.NewRequest(http.MethodPost, "/console-cr/managedworkloads?namespace=test-ns", strings.NewReader("{}"))
	req.Host = "localhost"
	w := httptest.NewRecorder()

	s.handleConsoleCRManagedWorkloads(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for missing cluster, got %d body=%s", w.Code, w.Body.String())
	}
	var resp map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("response is not JSON: %v (%s)", err, w.Body.String())
	}
	if ok, _ := resp["success"].(bool); ok {
		t.Errorf("expected success=false, got %v", resp["success"])
	}
	if msg, _ := resp["error"].(string); !strings.Contains(msg, "cluster and namespace") {
		t.Errorf("expected error mentioning cluster and namespace, got %q", msg)
	}
}

func TestResolveConsoleCRTarget_MissingNamespaceParam(t *testing.T) {
	s := &Server{allowedOrigins: []string{"*"}}
	req := httptest.NewRequest(http.MethodPost, "/console-cr/managedworkloads?cluster=persistence-cluster", strings.NewReader("{}"))
	req.Host = "localhost"
	w := httptest.NewRecorder()

	s.handleConsoleCRManagedWorkloads(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for missing namespace, got %d body=%s", w.Code, w.Body.String())
	}
}

func TestResolveConsoleCRTarget_NilK8sClient(t *testing.T) {
	// k8sClient is left nil; the second guard in resolveConsoleCRTarget
	// must trip before any dynamic-client lookup is attempted and return
	// 503 via writeJSONError.
	s := &Server{allowedOrigins: []string{"*"}}
	req := httptest.NewRequest(http.MethodPost, "/console-cr/managedworkloads?cluster=persistence-cluster&namespace=test-ns", strings.NewReader("{}"))
	req.Host = "localhost"
	w := httptest.NewRecorder()

	s.handleConsoleCRManagedWorkloads(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503 for nil k8sClient, got %d body=%s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), "k8s client not initialized") {
		t.Errorf("expected error message about k8s client not initialized, got %s", w.Body.String())
	}
}

func TestResolveConsoleCRTarget_GetDynamicClientError(t *testing.T) {
	// MultiClusterClient constructed with empty kubeconfig path and no
	// registered fake dyn client for "missing-cluster" — GetDynamicClient
	// will return an error (unknown context / no kubeconfig loaded),
	// exercising the third defensive arm.
	k8sClient, err := k8s.NewMultiClusterClient("")
	if err != nil {
		t.Fatalf("NewMultiClusterClient: %v", err)
	}
	s := &Server{k8sClient: k8sClient, allowedOrigins: []string{"*"}}
	req := httptest.NewRequest(http.MethodPost, "/console-cr/managedworkloads?cluster=missing-cluster&namespace=test-ns", strings.NewReader("{}"))
	req.Host = "localhost"
	w := httptest.NewRecorder()

	s.handleConsoleCRManagedWorkloads(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503 for GetDynamicClient error, got %d body=%s", w.Code, w.Body.String())
	}
}
