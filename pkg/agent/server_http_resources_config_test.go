package agent

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/kubestellar/console/pkg/k8s"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	fakek8s "k8s.io/client-go/kubernetes/fake"
)

// --- handleConfigMapsHTTP tests ---

func TestHandleConfigMapsHTTP_OPTIONS(t *testing.T) {
	s := &Server{allowedOrigins: []string{"*"}, agentToken: "tok"}
	req := httptest.NewRequest(http.MethodOptions, "/configmaps", nil)
	w := httptest.NewRecorder()
	s.handleConfigMapsHTTP(w, req)
	if w.Code != http.StatusNoContent {
		t.Fatalf("expected 204 for OPTIONS, got %d", w.Code)
	}
}

func TestHandleConfigMapsHTTP_Unauthorized(t *testing.T) {
	s := &Server{allowedOrigins: []string{"*"}, agentToken: "tok"}
	req := httptest.NewRequest(http.MethodGet, "/configmaps?cluster=c1", nil)
	w := httptest.NewRecorder()
	s.handleConfigMapsHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}

func TestHandleConfigMapsHTTP_NilK8sClient(t *testing.T) {
	s := &Server{allowedOrigins: []string{"*"}, agentToken: "tok"}
	req := httptest.NewRequest(http.MethodGet, "/configmaps?cluster=c1", nil)
	req.Header.Set("Authorization", "Bearer tok")
	w := httptest.NewRecorder()
	s.handleConfigMapsHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 (with error in body), got %d", w.Code)
	}
	var resp map[string]interface{}
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["error"] == nil || resp["error"] == "" {
		t.Fatal("expected error key in response when k8sClient is nil")
	}
}

func TestHandleConfigMapsHTTP_MissingCluster(t *testing.T) {
	k8sClient, _ := k8s.NewMultiClusterClient("")
	s := &Server{allowedOrigins: []string{"*"}, agentToken: "tok", k8sClient: k8sClient}
	req := httptest.NewRequest(http.MethodGet, "/configmaps", nil)
	req.Header.Set("Authorization", "Bearer tok")
	w := httptest.NewRecorder()
	s.handleConfigMapsHTTP(w, req)
	var resp map[string]interface{}
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["error"] == nil || resp["error"] == "" {
		t.Fatal("expected error about missing cluster parameter")
	}
}

func TestHandleConfigMapsHTTP_Success(t *testing.T) {
	k8sClient, _ := k8s.NewMultiClusterClient("")
	fakeCS := fakek8s.NewSimpleClientset(
		&corev1.ConfigMap{
			ObjectMeta: metav1.ObjectMeta{Name: "cm1", Namespace: "default"},
			Data:       map[string]string{"key": "val"},
		},
	)
	k8sClient.InjectClient("cluster1", fakeCS)
	s := &Server{allowedOrigins: []string{"*"}, agentToken: "tok", k8sClient: k8sClient}

	req := httptest.NewRequest(http.MethodGet, "/configmaps?cluster=cluster1&namespace=default", nil)
	req.Header.Set("Authorization", "Bearer tok")
	w := httptest.NewRecorder()
	s.handleConfigMapsHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var resp map[string]interface{}
	json.NewDecoder(w.Body).Decode(&resp)
	cms, ok := resp["configmaps"].([]interface{})
	if !ok {
		t.Fatal("expected configmaps array in response")
	}
	if len(cms) != 1 {
		t.Fatalf("expected 1 configmap, got %d", len(cms))
	}
	if resp["source"] != "agent" {
		t.Fatalf("expected source=agent, got %v", resp["source"])
	}
}

func TestHandleConfigMapsHTTP_ClusterNotFound(t *testing.T) {
	k8sClient, _ := k8s.NewMultiClusterClient("")
	s := &Server{allowedOrigins: []string{"*"}, agentToken: "tok", k8sClient: k8sClient}
	req := httptest.NewRequest(http.MethodGet, "/configmaps?cluster=nonexistent&namespace=default", nil)
	req.Header.Set("Authorization", "Bearer tok")
	w := httptest.NewRecorder()
	s.handleConfigMapsHTTP(w, req)
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503 for unknown cluster, got %d", w.Code)
	}
}

// --- handleSecretsHTTP tests ---

func TestHandleSecretsHTTP_OPTIONS(t *testing.T) {
	s := &Server{allowedOrigins: []string{"*"}, agentToken: "tok"}
	req := httptest.NewRequest(http.MethodOptions, "/secrets", nil)
	w := httptest.NewRecorder()
	s.handleSecretsHTTP(w, req)
	if w.Code != http.StatusNoContent {
		t.Fatalf("expected 204 for OPTIONS, got %d", w.Code)
	}
}

func TestHandleSecretsHTTP_Unauthorized(t *testing.T) {
	s := &Server{allowedOrigins: []string{"*"}, agentToken: "tok"}
	req := httptest.NewRequest(http.MethodGet, "/secrets?cluster=c1", nil)
	w := httptest.NewRecorder()
	s.handleSecretsHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}

func TestHandleSecretsHTTP_NilK8sClient(t *testing.T) {
	s := &Server{allowedOrigins: []string{"*"}, agentToken: "tok"}
	req := httptest.NewRequest(http.MethodGet, "/secrets?cluster=c1", nil)
	req.Header.Set("Authorization", "Bearer tok")
	w := httptest.NewRecorder()
	s.handleSecretsHTTP(w, req)
	var resp map[string]interface{}
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["error"] == nil {
		t.Fatal("expected error key in response when k8sClient is nil")
	}
}

func TestHandleSecretsHTTP_MissingCluster(t *testing.T) {
	k8sClient, _ := k8s.NewMultiClusterClient("")
	s := &Server{allowedOrigins: []string{"*"}, agentToken: "tok", k8sClient: k8sClient}
	req := httptest.NewRequest(http.MethodGet, "/secrets", nil)
	req.Header.Set("Authorization", "Bearer tok")
	w := httptest.NewRecorder()
	s.handleSecretsHTTP(w, req)
	var resp map[string]interface{}
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["error"] == nil {
		t.Fatal("expected error about missing cluster parameter")
	}
}

func TestHandleSecretsHTTP_Success(t *testing.T) {
	k8sClient, _ := k8s.NewMultiClusterClient("")
	fakeCS := fakek8s.NewSimpleClientset(
		&corev1.Secret{
			ObjectMeta: metav1.ObjectMeta{Name: "sec1", Namespace: "ns1"},
			Type:       corev1.SecretTypeOpaque,
			Data:       map[string][]byte{"pw": []byte("secret")},
		},
	)
	k8sClient.InjectClient("cluster1", fakeCS)
	s := &Server{allowedOrigins: []string{"*"}, agentToken: "tok", k8sClient: k8sClient}

	req := httptest.NewRequest(http.MethodGet, "/secrets?cluster=cluster1&namespace=ns1", nil)
	req.Header.Set("Authorization", "Bearer tok")
	w := httptest.NewRecorder()
	s.handleSecretsHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var resp map[string]interface{}
	json.NewDecoder(w.Body).Decode(&resp)
	secrets, ok := resp["secrets"].([]interface{})
	if !ok {
		t.Fatal("expected secrets array in response")
	}
	if len(secrets) != 1 {
		t.Fatalf("expected 1 secret, got %d", len(secrets))
	}
	if resp["source"] != "agent" {
		t.Fatalf("expected source=agent, got %v", resp["source"])
	}
}

func TestHandleSecretsHTTP_ClusterNotFound(t *testing.T) {
	k8sClient, _ := k8s.NewMultiClusterClient("")
	s := &Server{allowedOrigins: []string{"*"}, agentToken: "tok", k8sClient: k8sClient}
	req := httptest.NewRequest(http.MethodGet, "/secrets?cluster=nonexistent", nil)
	req.Header.Set("Authorization", "Bearer tok")
	w := httptest.NewRecorder()
	s.handleSecretsHTTP(w, req)
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503 for unknown cluster, got %d", w.Code)
	}
}

// --- handleServiceAccountsHTTP tests ---

func TestHandleServiceAccountsHTTP_OPTIONS(t *testing.T) {
	s := &Server{allowedOrigins: []string{"*"}, agentToken: "tok"}
	req := httptest.NewRequest(http.MethodOptions, "/serviceaccounts", nil)
	w := httptest.NewRecorder()
	s.handleServiceAccountsHTTP(w, req)
	if w.Code != http.StatusNoContent {
		t.Fatalf("expected 204 for OPTIONS, got %d", w.Code)
	}
}

func TestHandleServiceAccountsHTTP_Unauthorized(t *testing.T) {
	s := &Server{allowedOrigins: []string{"*"}, agentToken: "tok"}
	req := httptest.NewRequest(http.MethodGet, "/serviceaccounts?cluster=c1", nil)
	w := httptest.NewRecorder()
	s.handleServiceAccountsHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}

func TestHandleServiceAccountsHTTP_NilK8sClient(t *testing.T) {
	s := &Server{allowedOrigins: []string{"*"}, agentToken: "tok"}
	req := httptest.NewRequest(http.MethodGet, "/serviceaccounts?cluster=c1", nil)
	req.Header.Set("Authorization", "Bearer tok")
	w := httptest.NewRecorder()
	s.handleServiceAccountsHTTP(w, req)
	var resp map[string]interface{}
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["error"] == nil {
		t.Fatal("expected error key in response when k8sClient is nil")
	}
}

func TestHandleServiceAccountsHTTP_MissingCluster(t *testing.T) {
	k8sClient, _ := k8s.NewMultiClusterClient("")
	s := &Server{allowedOrigins: []string{"*"}, agentToken: "tok", k8sClient: k8sClient}
	req := httptest.NewRequest(http.MethodGet, "/serviceaccounts", nil)
	req.Header.Set("Authorization", "Bearer tok")
	w := httptest.NewRecorder()
	s.handleServiceAccountsHTTP(w, req)
	var resp map[string]interface{}
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["error"] == nil {
		t.Fatal("expected error about missing cluster parameter")
	}
}

func TestHandleServiceAccountsHTTP_GETSuccess(t *testing.T) {
	k8sClient, _ := k8s.NewMultiClusterClient("")
	fakeCS := fakek8s.NewSimpleClientset(
		&corev1.ServiceAccount{
			ObjectMeta: metav1.ObjectMeta{Name: "sa1", Namespace: "default"},
		},
	)
	k8sClient.InjectClient("cluster1", fakeCS)
	s := &Server{allowedOrigins: []string{"*"}, agentToken: "tok", k8sClient: k8sClient}

	req := httptest.NewRequest(http.MethodGet, "/serviceaccounts?cluster=cluster1&namespace=default", nil)
	req.Header.Set("Authorization", "Bearer tok")
	w := httptest.NewRecorder()
	s.handleServiceAccountsHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var resp map[string]interface{}
	json.NewDecoder(w.Body).Decode(&resp)
	sas, ok := resp["serviceaccounts"].([]interface{})
	if !ok {
		t.Fatal("expected serviceaccounts array in response")
	}
	if len(sas) != 1 {
		t.Fatalf("expected 1 serviceaccount, got %d", len(sas))
	}
}

func TestHandleServiceAccountsHTTP_POSTMissingFields(t *testing.T) {
	k8sClient, _ := k8s.NewMultiClusterClient("")
	s := &Server{allowedOrigins: []string{"*"}, agentToken: "tok", k8sClient: k8sClient}

	body, _ := json.Marshal(map[string]string{"cluster": "c1"})
	req := httptest.NewRequest(http.MethodPost, "/serviceaccounts", bytes.NewBuffer(body))
	req.Header.Set("Authorization", "Bearer tok")
	w := httptest.NewRecorder()
	s.handleServiceAccountsHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for missing fields, got %d", w.Code)
	}
}

func TestHandleServiceAccountsHTTP_POSTInvalidBody(t *testing.T) {
	k8sClient, _ := k8s.NewMultiClusterClient("")
	s := &Server{allowedOrigins: []string{"*"}, agentToken: "tok", k8sClient: k8sClient}

	req := httptest.NewRequest(http.MethodPost, "/serviceaccounts", bytes.NewBufferString("not json"))
	req.Header.Set("Authorization", "Bearer tok")
	w := httptest.NewRecorder()
	s.handleServiceAccountsHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for invalid body, got %d", w.Code)
	}
}

func TestHandleServiceAccountsHTTP_POSTSuccess(t *testing.T) {
	k8sClient, _ := k8s.NewMultiClusterClient("")
	fakeCS := fakek8s.NewSimpleClientset()
	k8sClient.InjectClient("cluster1", fakeCS)
	s := &Server{allowedOrigins: []string{"*"}, agentToken: "tok", k8sClient: k8sClient}

	body, _ := json.Marshal(map[string]string{
		"cluster":   "cluster1",
		"namespace": "default",
		"name":      "my-sa",
	})
	req := httptest.NewRequest(http.MethodPost, "/serviceaccounts", bytes.NewBuffer(body))
	req.Header.Set("Authorization", "Bearer tok")
	w := httptest.NewRecorder()
	s.handleServiceAccountsHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 for successful create, got %d; body: %s", w.Code, w.Body.String())
	}
}

func TestHandleServiceAccountsHTTP_DELETEMissingParams(t *testing.T) {
	k8sClient, _ := k8s.NewMultiClusterClient("")
	s := &Server{allowedOrigins: []string{"*"}, agentToken: "tok", k8sClient: k8sClient}

	req := httptest.NewRequest(http.MethodDelete, "/serviceaccounts?cluster=c1", nil)
	req.Header.Set("Authorization", "Bearer tok")
	w := httptest.NewRecorder()
	s.handleServiceAccountsHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for missing params, got %d", w.Code)
	}
}

func TestHandleServiceAccountsHTTP_DELETESuccess(t *testing.T) {
	k8sClient, _ := k8s.NewMultiClusterClient("")
	fakeCS := fakek8s.NewSimpleClientset(
		&corev1.ServiceAccount{
			ObjectMeta: metav1.ObjectMeta{Name: "my-sa", Namespace: "default"},
		},
	)
	k8sClient.InjectClient("cluster1", fakeCS)
	s := &Server{allowedOrigins: []string{"*"}, agentToken: "tok", k8sClient: k8sClient}

	req := httptest.NewRequest(http.MethodDelete, "/serviceaccounts?cluster=cluster1&namespace=default&name=my-sa", nil)
	req.Header.Set("Authorization", "Bearer tok")
	w := httptest.NewRecorder()
	s.handleServiceAccountsHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 for successful delete, got %d; body: %s", w.Code, w.Body.String())
	}
	var resp map[string]interface{}
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["success"] != true {
		t.Fatalf("expected success=true, got %v", resp["success"])
	}
}
