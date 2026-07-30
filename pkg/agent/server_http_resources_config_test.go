package agent

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/kubestellar/console/pkg/k8s"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
)

// --- handleConfigMapsHTTP ---

func TestHandleConfigMapsHTTP_OPTIONSPreflight(t *testing.T) {
	s := newTestServer(t)
	req := httptest.NewRequest(http.MethodOptions, "/configmaps?cluster=c1", nil)
	req.Host = "localhost"
	rec := serveAndRecord(s.handleConfigMapsHTTP, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("OPTIONS: got %d, want 204", rec.Code)
	}
}

func TestHandleConfigMapsHTTP_Unauthorized(t *testing.T) {
	s := newTestServer(t, withToken("secret"))
	req := httptest.NewRequest(http.MethodGet, "/configmaps?cluster=c1", nil)
	req.Host = "localhost"
	rec := serveAndRecord(s.handleConfigMapsHTTP, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got %d, want 401", rec.Code)
	}
}

func TestHandleConfigMapsHTTP_NilK8sClient(t *testing.T) {
	s := newTestServer(t)
	s.k8sClient = nil
	req := httptest.NewRequest(http.MethodGet, "/configmaps?cluster=c1", nil)
	req.Host = "localhost"
	rec := serveAndRecord(s.handleConfigMapsHTTP, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("got %d, want 200", rec.Code)
	}
	var resp map[string]interface{}
	json.NewDecoder(rec.Body).Decode(&resp)
	if resp["error"] == nil {
		t.Fatal("expected error field when k8sClient is nil")
	}
}

func TestHandleConfigMapsHTTP_MissingCluster(t *testing.T) {
	k8sClient, _ := k8s.NewMultiClusterClient("")
	s := newTestServer(t)
	s.k8sClient = k8sClient
	req := httptest.NewRequest(http.MethodGet, "/configmaps", nil)
	req.Host = "localhost"
	rec := serveAndRecord(s.handleConfigMapsHTTP, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("got %d, want 200", rec.Code)
	}
	var resp map[string]interface{}
	json.NewDecoder(rec.Body).Decode(&resp)
	if !strings.Contains(resp["error"].(string), "cluster parameter required") {
		t.Fatalf("unexpected error: %v", resp["error"])
	}
}

func TestHandleConfigMapsHTTP_Success(t *testing.T) {
	fakeClientset := fake.NewSimpleClientset(&corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{Name: "test-cm", Namespace: "default"},
	})
	k8sClient, _ := k8s.NewMultiClusterClient("")
	k8sClient.SetClient("cluster1", fakeClientset)

	s := newTestServer(t)
	s.k8sClient = k8sClient

	req := httptest.NewRequest(http.MethodGet, "/configmaps?cluster=cluster1&namespace=default", nil)
	req.Host = "localhost"
	rec := serveAndRecord(s.handleConfigMapsHTTP, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("got %d, want 200", rec.Code)
	}
	var resp map[string]interface{}
	json.NewDecoder(rec.Body).Decode(&resp)
	if resp["source"] != "agent" {
		t.Fatalf("expected source=agent, got %v", resp["source"])
	}
	if resp["configmaps"] == nil {
		t.Fatal("expected configmaps field")
	}
}

func TestHandleConfigMapsHTTP_FetchError(t *testing.T) {
	k8sClient, _ := k8s.NewMultiClusterClient("")
	s := newTestServer(t)
	s.k8sClient = k8sClient
	req := httptest.NewRequest(http.MethodGet, "/configmaps?cluster=bad-cluster&namespace=default", nil)
	req.Host = "localhost"
	rec := serveAndRecord(s.handleConfigMapsHTTP, req)
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("got %d, want 503", rec.Code)
	}
}

// --- handleSecretsHTTP ---

func TestHandleSecretsHTTP_OPTIONSPreflight(t *testing.T) {
	s := newTestServer(t)
	req := httptest.NewRequest(http.MethodOptions, "/secrets?cluster=c1", nil)
	req.Host = "localhost"
	rec := serveAndRecord(s.handleSecretsHTTP, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("OPTIONS: got %d, want 204", rec.Code)
	}
}

func TestHandleSecretsHTTP_Unauthorized(t *testing.T) {
	s := newTestServer(t, withToken("secret"))
	req := httptest.NewRequest(http.MethodGet, "/secrets?cluster=c1", nil)
	req.Host = "localhost"
	rec := serveAndRecord(s.handleSecretsHTTP, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got %d, want 401", rec.Code)
	}
}

func TestHandleSecretsHTTP_NilK8sClient(t *testing.T) {
	s := newTestServer(t)
	s.k8sClient = nil
	req := httptest.NewRequest(http.MethodGet, "/secrets?cluster=c1", nil)
	req.Host = "localhost"
	rec := serveAndRecord(s.handleSecretsHTTP, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("got %d, want 200", rec.Code)
	}
	var resp map[string]interface{}
	json.NewDecoder(rec.Body).Decode(&resp)
	if resp["error"] == nil {
		t.Fatal("expected error field when k8sClient is nil")
	}
}

func TestHandleSecretsHTTP_MissingCluster(t *testing.T) {
	k8sClient, _ := k8s.NewMultiClusterClient("")
	s := newTestServer(t)
	s.k8sClient = k8sClient
	req := httptest.NewRequest(http.MethodGet, "/secrets", nil)
	req.Host = "localhost"
	rec := serveAndRecord(s.handleSecretsHTTP, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("got %d, want 200", rec.Code)
	}
	var resp map[string]interface{}
	json.NewDecoder(rec.Body).Decode(&resp)
	if !strings.Contains(resp["error"].(string), "cluster parameter required") {
		t.Fatalf("unexpected error: %v", resp["error"])
	}
}

func TestHandleSecretsHTTP_Success(t *testing.T) {
	fakeClientset := fake.NewSimpleClientset(&corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{Name: "my-secret", Namespace: "default"},
	})
	k8sClient, _ := k8s.NewMultiClusterClient("")
	k8sClient.SetClient("cluster1", fakeClientset)

	s := newTestServer(t)
	s.k8sClient = k8sClient

	req := httptest.NewRequest(http.MethodGet, "/secrets?cluster=cluster1&namespace=default", nil)
	req.Host = "localhost"
	rec := serveAndRecord(s.handleSecretsHTTP, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("got %d, want 200", rec.Code)
	}
	var resp map[string]interface{}
	json.NewDecoder(rec.Body).Decode(&resp)
	if resp["source"] != "agent" {
		t.Fatalf("expected source=agent, got %v", resp["source"])
	}
}

func TestHandleSecretsHTTP_FetchError(t *testing.T) {
	k8sClient, _ := k8s.NewMultiClusterClient("")
	s := newTestServer(t)
	s.k8sClient = k8sClient
	req := httptest.NewRequest(http.MethodGet, "/secrets?cluster=bad-cluster&namespace=default", nil)
	req.Host = "localhost"
	rec := serveAndRecord(s.handleSecretsHTTP, req)
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("got %d, want 503", rec.Code)
	}
}

// --- handleServiceAccountsHTTP GET path ---

func TestHandleServiceAccountsHTTP_GETNilK8sClient(t *testing.T) {
	s := newTestServer(t)
	s.k8sClient = nil
	req := httptest.NewRequest(http.MethodGet, "/serviceaccounts?cluster=c1", nil)
	req.Host = "localhost"
	rec := serveAndRecord(s.handleServiceAccountsHTTP, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("got %d, want 200", rec.Code)
	}
}

func TestHandleServiceAccountsHTTP_GETMissingCluster(t *testing.T) {
	k8sClient, _ := k8s.NewMultiClusterClient("")
	s := newTestServer(t)
	s.k8sClient = k8sClient
	req := httptest.NewRequest(http.MethodGet, "/serviceaccounts", nil)
	req.Host = "localhost"
	rec := serveAndRecord(s.handleServiceAccountsHTTP, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("got %d, want 200", rec.Code)
	}
	var resp map[string]interface{}
	json.NewDecoder(rec.Body).Decode(&resp)
	if !strings.Contains(resp["error"].(string), "cluster parameter required") {
		t.Fatalf("unexpected error: %v", resp["error"])
	}
}

func TestHandleServiceAccountsHTTP_GETSuccess(t *testing.T) {
	fakeClientset := fake.NewSimpleClientset(&corev1.ServiceAccount{
		ObjectMeta: metav1.ObjectMeta{Name: "default", Namespace: "default"},
	})
	k8sClient, _ := k8s.NewMultiClusterClient("")
	k8sClient.SetClient("cluster1", fakeClientset)

	s := newTestServer(t)
	s.k8sClient = k8sClient

	req := httptest.NewRequest(http.MethodGet, "/serviceaccounts?cluster=cluster1&namespace=default", nil)
	req.Host = "localhost"
	rec := serveAndRecord(s.handleServiceAccountsHTTP, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("got %d, want 200", rec.Code)
	}
	var resp map[string]interface{}
	json.NewDecoder(rec.Body).Decode(&resp)
	if resp["source"] != "agent" {
		t.Fatalf("expected source=agent, got %v", resp["source"])
	}
}

func TestCreateServiceAccountHTTP_Success(t *testing.T) {
	fakeClientset := fake.NewSimpleClientset()
	k8sClient, _ := k8s.NewMultiClusterClient("")
	k8sClient.SetClient("cluster1", fakeClientset)

	s := newTestServer(t)
	s.k8sClient = k8sClient

	body := `{"name":"my-sa","namespace":"default","cluster":"cluster1"}`
	req := httptest.NewRequest(http.MethodPost, "/serviceaccounts", strings.NewReader(body))
	req.Host = "localhost"
	rec := serveAndRecord(s.handleServiceAccountsHTTP, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("got %d, want 200; body: %s", rec.Code, rec.Body.String())
	}
}

func TestDeleteServiceAccountHTTP_Success(t *testing.T) {
	fakeClientset := fake.NewSimpleClientset(&corev1.ServiceAccount{
		ObjectMeta: metav1.ObjectMeta{Name: "my-sa", Namespace: "default"},
	})
	k8sClient, _ := k8s.NewMultiClusterClient("")
	k8sClient.SetClient("cluster1", fakeClientset)

	s := newTestServer(t)
	s.k8sClient = k8sClient

	req := httptest.NewRequest(http.MethodDelete, "/serviceaccounts?cluster=cluster1&namespace=default&name=my-sa", nil)
	req.Host = "localhost"
	rec := serveAndRecord(s.handleServiceAccountsHTTP, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("got %d, want 200; body: %s", rec.Code, rec.Body.String())
	}
	var resp map[string]interface{}
	json.NewDecoder(rec.Body).Decode(&resp)
	if resp["success"] != true {
		t.Fatalf("expected success=true, got %v", resp["success"])
	}
}

// --- handleJobsHTTP ---

func TestHandleJobsHTTP_OPTIONSPreflight(t *testing.T) {
	s := newTestServer(t)
	req := httptest.NewRequest(http.MethodOptions, "/jobs?cluster=c1", nil)
	req.Host = "localhost"
	rec := serveAndRecord(s.handleJobsHTTP, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("OPTIONS: got %d, want 204", rec.Code)
	}
}

func TestHandleJobsHTTP_Unauthorized(t *testing.T) {
	s := newTestServer(t, withToken("secret"))
	req := httptest.NewRequest(http.MethodGet, "/jobs?cluster=c1", nil)
	req.Host = "localhost"
	rec := serveAndRecord(s.handleJobsHTTP, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got %d, want 401", rec.Code)
	}
}

func TestHandleJobsHTTP_NilK8sClient(t *testing.T) {
	s := newTestServer(t)
	s.k8sClient = nil
	req := httptest.NewRequest(http.MethodGet, "/jobs?cluster=c1", nil)
	req.Host = "localhost"
	rec := serveAndRecord(s.handleJobsHTTP, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("got %d, want 200", rec.Code)
	}
	var resp map[string]interface{}
	json.NewDecoder(rec.Body).Decode(&resp)
	if resp["error"] == nil {
		t.Fatal("expected error field")
	}
}

func TestHandleJobsHTTP_MissingCluster(t *testing.T) {
	k8sClient, _ := k8s.NewMultiClusterClient("")
	s := newTestServer(t)
	s.k8sClient = k8sClient
	req := httptest.NewRequest(http.MethodGet, "/jobs", nil)
	req.Host = "localhost"
	rec := serveAndRecord(s.handleJobsHTTP, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("got %d, want 200", rec.Code)
	}
	var resp map[string]interface{}
	json.NewDecoder(rec.Body).Decode(&resp)
	if !strings.Contains(resp["error"].(string), "cluster parameter required") {
		t.Fatalf("unexpected error: %v", resp["error"])
	}
}

func TestHandleJobsHTTP_FetchError(t *testing.T) {
	k8sClient, _ := k8s.NewMultiClusterClient("")
	s := newTestServer(t)
	s.k8sClient = k8sClient
	req := httptest.NewRequest(http.MethodGet, "/jobs?cluster=bad-cluster&namespace=default", nil)
	req.Host = "localhost"
	rec := serveAndRecord(s.handleJobsHTTP, req)
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("got %d, want 503", rec.Code)
	}
}

// --- handleHPAsHTTP ---

func TestHandleHPAsHTTP_OPTIONSPreflight(t *testing.T) {
	s := newTestServer(t)
	req := httptest.NewRequest(http.MethodOptions, "/hpas?cluster=c1", nil)
	req.Host = "localhost"
	rec := serveAndRecord(s.handleHPAsHTTP, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("OPTIONS: got %d, want 204", rec.Code)
	}
}

func TestHandleHPAsHTTP_Unauthorized(t *testing.T) {
	s := newTestServer(t, withToken("secret"))
	req := httptest.NewRequest(http.MethodGet, "/hpas?cluster=c1", nil)
	req.Host = "localhost"
	rec := serveAndRecord(s.handleHPAsHTTP, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got %d, want 401", rec.Code)
	}
}

func TestHandleHPAsHTTP_NilK8sClient(t *testing.T) {
	s := newTestServer(t)
	s.k8sClient = nil
	req := httptest.NewRequest(http.MethodGet, "/hpas?cluster=c1", nil)
	req.Host = "localhost"
	rec := serveAndRecord(s.handleHPAsHTTP, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("got %d, want 200", rec.Code)
	}
	var resp map[string]interface{}
	json.NewDecoder(rec.Body).Decode(&resp)
	if resp["error"] == nil {
		t.Fatal("expected error field")
	}
}

func TestHandleHPAsHTTP_MissingCluster(t *testing.T) {
	k8sClient, _ := k8s.NewMultiClusterClient("")
	s := newTestServer(t)
	s.k8sClient = k8sClient
	req := httptest.NewRequest(http.MethodGet, "/hpas", nil)
	req.Host = "localhost"
	rec := serveAndRecord(s.handleHPAsHTTP, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("got %d, want 200", rec.Code)
	}
	var resp map[string]interface{}
	json.NewDecoder(rec.Body).Decode(&resp)
	if !strings.Contains(resp["error"].(string), "cluster parameter required") {
		t.Fatalf("unexpected error: %v", resp["error"])
	}
}

func TestHandleHPAsHTTP_FetchError(t *testing.T) {
	k8sClient, _ := k8s.NewMultiClusterClient("")
	s := newTestServer(t)
	s.k8sClient = k8sClient
	req := httptest.NewRequest(http.MethodGet, "/hpas?cluster=bad-cluster&namespace=default", nil)
	req.Host = "localhost"
	rec := serveAndRecord(s.handleHPAsHTTP, req)
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("got %d, want 503", rec.Code)
	}
}
