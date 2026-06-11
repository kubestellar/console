package agent

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/kubestellar/console/pkg/agent/protocol"
)

// --- handleKubeconfigPreviewHTTP ---

func TestHandleKubeconfigPreviewHTTP_Unauthorized(t *testing.T) {
	s := newTestServer(t, withToken("secret"), withContexts("cluster-a"))
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/kubeconfig/preview", strings.NewReader(`{"kubeconfig":"x"}`))
	// No Authorization header
	s.handleKubeconfigPreviewHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}

func TestHandleKubeconfigPreviewHTTP_MethodNotAllowed(t *testing.T) {
	s := newTestServer(t, withToken("secret"), withContexts("cluster-a"))
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/kubeconfig/preview", nil)
	req.Header.Set("Authorization", "Bearer secret")
	s.handleKubeconfigPreviewHTTP(w, req)
	if w.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405, got %d", w.Code)
	}
}

func TestHandleKubeconfigPreviewHTTP_InvalidJSON(t *testing.T) {
	s := newTestServer(t, withToken("secret"), withContexts("cluster-a"))
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/kubeconfig/preview", strings.NewReader(`not json`))
	req.Header.Set("Authorization", "Bearer secret")
	s.handleKubeconfigPreviewHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestHandleKubeconfigPreviewHTTP_EmptyKubeconfig(t *testing.T) {
	s := newTestServer(t, withToken("secret"), withContexts("cluster-a"))
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/kubeconfig/preview", strings.NewReader(`{"kubeconfig":""}`))
	req.Header.Set("Authorization", "Bearer secret")
	s.handleKubeconfigPreviewHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestHandleKubeconfigPreviewHTTP_InvalidYAML(t *testing.T) {
	s := newTestServer(t, withToken("secret"), withContexts("cluster-a"))
	w := httptest.NewRecorder()
	body := `{"kubeconfig":"not: valid: kubeconfig: yaml: [["}`
	req := httptest.NewRequest(http.MethodPost, "/kubeconfig/preview", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer secret")
	s.handleKubeconfigPreviewHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestHandleKubeconfigPreviewHTTP_ValidKubeconfig(t *testing.T) {
	s := newTestServer(t, withToken("secret"), withContexts("existing-cluster"))
	w := httptest.NewRecorder()
	kc := "apiVersion: v1\nkind: Config\nclusters:\n- cluster:\n    server: https://new.example.com\n  name: new-cluster\ncontexts:\n- context:\n    cluster: new-cluster\n    user: new-user\n  name: new-context\nusers:\n- name: new-user\n  user:\n    token: fake-token\ncurrent-context: new-context"
	body, _ := json.Marshal(kubeconfigImportRequest{Kubeconfig: kc})
	req := httptest.NewRequest(http.MethodPost, "/kubeconfig/preview", strings.NewReader(string(body)))
	req.Header.Set("Authorization", "Bearer secret")
	s.handleKubeconfigPreviewHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp kubeconfigPreviewResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}
	if len(resp.Contexts) == 0 {
		t.Fatal("expected at least one context in preview response")
	}
}

func TestHandleKubeconfigPreviewHTTP_Options(t *testing.T) {
	s := newTestServer(t, withToken("secret"), withContexts("cluster-a"))
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodOptions, "/kubeconfig/preview", nil)
	s.handleKubeconfigPreviewHTTP(w, req)
	if w.Code != http.StatusNoContent {
		t.Fatalf("expected 204 for OPTIONS, got %d", w.Code)
	}
}

// --- handleKubeconfigRemoveHTTP ---

func TestHandleKubeconfigRemoveHTTP_Unauthorized(t *testing.T) {
	s := newTestServer(t, withToken("secret"), withContexts("cluster-a"))
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/kubeconfig/remove", strings.NewReader(`{"context":"cluster-a"}`))
	s.handleKubeconfigRemoveHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}

func TestHandleKubeconfigRemoveHTTP_MethodNotAllowed(t *testing.T) {
	s := newTestServer(t, withToken("secret"), withContexts("cluster-a"))
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/kubeconfig/remove", nil)
	req.Header.Set("Authorization", "Bearer secret")
	s.handleKubeconfigRemoveHTTP(w, req)
	if w.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405, got %d", w.Code)
	}
}

func TestHandleKubeconfigRemoveHTTP_MissingContext(t *testing.T) {
	s := newTestServer(t, withToken("secret"), withContexts("cluster-a"))
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/kubeconfig/remove", strings.NewReader(`{"context":""}`))
	req.Header.Set("Authorization", "Bearer secret")
	s.handleKubeconfigRemoveHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestHandleKubeconfigRemoveHTTP_InvalidJSON(t *testing.T) {
	s := newTestServer(t, withToken("secret"), withContexts("cluster-a"))
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/kubeconfig/remove", strings.NewReader(`{bad json`))
	req.Header.Set("Authorization", "Bearer secret")
	s.handleKubeconfigRemoveHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestHandleKubeconfigRemoveHTTP_NilK8sClient(t *testing.T) {
	s := newTestServer(t, withToken("secret"))
	// Don't use withContexts so k8sClient is nil
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/kubeconfig/remove", strings.NewReader(`{"context":"test"}`))
	req.Header.Set("Authorization", "Bearer secret")
	s.handleKubeconfigRemoveHTTP(w, req)
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d", w.Code)
	}
}

func TestHandleKubeconfigRemoveHTTP_Success(t *testing.T) {
	s := newTestServer(t, withToken("secret"), withContexts("remove-me", "keep-me"))
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/kubeconfig/remove", strings.NewReader(`{"context":"remove-me"}`))
	req.Header.Set("Authorization", "Bearer secret")
	s.handleKubeconfigRemoveHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if resp["ok"] != true {
		t.Fatalf("expected ok=true, got %v", resp)
	}
}

func TestHandleKubeconfigRemoveHTTP_NonexistentContext(t *testing.T) {
	s := newTestServer(t, withToken("secret"), withContexts("cluster-a"))
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/kubeconfig/remove", strings.NewReader(`{"context":"does-not-exist"}`))
	req.Header.Set("Authorization", "Bearer secret")
	s.handleKubeconfigRemoveHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for nonexistent context, got %d: %s", w.Code, w.Body.String())
	}
}

func TestHandleKubeconfigRemoveHTTP_Options(t *testing.T) {
	s := newTestServer(t, withToken("secret"), withContexts("cluster-a"))
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodOptions, "/kubeconfig/remove", nil)
	s.handleKubeconfigRemoveHTTP(w, req)
	if w.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", w.Code)
	}
}

// --- handleKubeconfigAddHTTP ---

func TestHandleKubeconfigAddHTTP_Unauthorized(t *testing.T) {
	s := newTestServer(t, withToken("secret"), withContexts("cluster-a"))
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/kubeconfig/add", strings.NewReader(`{}`))
	s.handleKubeconfigAddHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}

func TestHandleKubeconfigAddHTTP_MethodNotAllowed(t *testing.T) {
	s := newTestServer(t, withToken("secret"), withContexts("cluster-a"))
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/kubeconfig/add", nil)
	req.Header.Set("Authorization", "Bearer secret")
	s.handleKubeconfigAddHTTP(w, req)
	if w.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405, got %d", w.Code)
	}
}

func TestHandleKubeconfigAddHTTP_InvalidJSON(t *testing.T) {
	s := newTestServer(t, withToken("secret"), withContexts("cluster-a"))
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/kubeconfig/add", strings.NewReader(`not json`))
	req.Header.Set("Authorization", "Bearer secret")
	s.handleKubeconfigAddHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestHandleKubeconfigAddHTTP_ValidRequest(t *testing.T) {
	s := newTestServer(t, withToken("secret"), withContexts("existing"))
	body := `{"contextName":"new-ctx","clusterName":"new-cluster","serverUrl":"https://new.example.com","authType":"token","token":"fake-token"}`
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/kubeconfig/add", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer secret")
	s.handleKubeconfigAddHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp kubeconfigAddResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if !resp.Success {
		t.Fatalf("expected success=true, got error: %s", resp.Error)
	}
}

func TestHandleKubeconfigAddHTTP_Options(t *testing.T) {
	s := newTestServer(t, withToken("secret"), withContexts("cluster-a"))
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodOptions, "/kubeconfig/add", nil)
	s.handleKubeconfigAddHTTP(w, req)
	if w.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", w.Code)
	}
}

// --- handleKubeconfigTestHTTP ---

func TestHandleKubeconfigTestHTTP_Unauthorized(t *testing.T) {
	s := newTestServer(t, withToken("secret"), withContexts("cluster-a"))
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/kubeconfig/test", strings.NewReader(`{}`))
	s.handleKubeconfigTestHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}

func TestHandleKubeconfigTestHTTP_MethodNotAllowed(t *testing.T) {
	s := newTestServer(t, withToken("secret"), withContexts("cluster-a"))
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/kubeconfig/test", nil)
	req.Header.Set("Authorization", "Bearer secret")
	s.handleKubeconfigTestHTTP(w, req)
	if w.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405, got %d", w.Code)
	}
}

func TestHandleKubeconfigTestHTTP_InvalidJSON(t *testing.T) {
	s := newTestServer(t, withToken("secret"), withContexts("cluster-a"))
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/kubeconfig/test", strings.NewReader(`bad json`))
	req.Header.Set("Authorization", "Bearer secret")
	s.handleKubeconfigTestHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestHandleKubeconfigTestHTTP_InvalidCertData(t *testing.T) {
	s := newTestServer(t, withToken("secret"), withContexts("cluster-a"))
	body := `{"serverUrl":"https://test.example.com","authType":"certificate","certData":"not-base64!!!","keyData":"not-base64!!!"}`
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/kubeconfig/test", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer secret")
	s.handleKubeconfigTestHTTP(w, req)
	// Should return 200 with reachable=false (connection test failed gracefully)
	// or 400 if validation happens before connect attempt
	if w.Code != http.StatusOK && w.Code != http.StatusBadRequest {
		t.Fatalf("expected 200 or 400, got %d: %s", w.Code, w.Body.String())
	}
	var resp TestConnectionResult
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err == nil {
		if resp.Reachable {
			t.Fatal("expected reachable=false for invalid cert data")
		}
	}
}

func TestHandleKubeconfigTestHTTP_UnreachableServer(t *testing.T) {
	s := newTestServer(t, withToken("secret"), withContexts("cluster-a"))
	body := `{"serverUrl":"https://192.0.2.1:6443","authType":"token","token":"fake","skipTlsVerify":true}`
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/kubeconfig/test", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer secret")
	s.handleKubeconfigTestHTTP(w, req)
	// Connection to a non-routable IP should fail gracefully
	if w.Code != http.StatusOK && w.Code != http.StatusBadRequest {
		t.Fatalf("expected 200 or 400 for unreachable server, got %d: %s", w.Code, w.Body.String())
	}
}

func TestHandleKubeconfigTestHTTP_Options(t *testing.T) {
	s := newTestServer(t, withToken("secret"), withContexts("cluster-a"))
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodOptions, "/kubeconfig/test", nil)
	s.handleKubeconfigTestHTTP(w, req)
	if w.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", w.Code)
	}
}

// --- handleKubeconfigImportHTTP ---

func TestHandleKubeconfigImportHTTP_Unauthorized(t *testing.T) {
	s := newTestServer(t, withToken("secret"), withContexts("cluster-a"))
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/kubeconfig/import", strings.NewReader(`{"kubeconfig":"x"}`))
	s.handleKubeconfigImportHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}

func TestHandleKubeconfigImportHTTP_MethodNotAllowed(t *testing.T) {
	s := newTestServer(t, withToken("secret"), withContexts("cluster-a"))
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/kubeconfig/import", nil)
	req.Header.Set("Authorization", "Bearer secret")
	s.handleKubeconfigImportHTTP(w, req)
	if w.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405, got %d", w.Code)
	}
}

func TestHandleKubeconfigImportHTTP_InvalidJSON(t *testing.T) {
	s := newTestServer(t, withToken("secret"), withContexts("cluster-a"))
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/kubeconfig/import", strings.NewReader(`bad`))
	req.Header.Set("Authorization", "Bearer secret")
	s.handleKubeconfigImportHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestHandleKubeconfigImportHTTP_EmptyKubeconfig(t *testing.T) {
	s := newTestServer(t, withToken("secret"), withContexts("cluster-a"))
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/kubeconfig/import", strings.NewReader(`{"kubeconfig":""}`))
	req.Header.Set("Authorization", "Bearer secret")
	s.handleKubeconfigImportHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestHandleKubeconfigImportHTTP_ValidImport(t *testing.T) {
	s := newTestServer(t, withToken("secret"), withContexts("existing"))
	kc := "apiVersion: v1\nkind: Config\nclusters:\n- cluster:\n    server: https://imported.example.com\n  name: imported-cluster\ncontexts:\n- context:\n    cluster: imported-cluster\n    user: imported-user\n  name: imported-context\nusers:\n- name: imported-user\n  user:\n    token: fake-token\ncurrent-context: imported-context"
	body, _ := json.Marshal(kubeconfigImportRequest{Kubeconfig: kc})
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/kubeconfig/import", strings.NewReader(string(body)))
	req.Header.Set("Authorization", "Bearer secret")
	s.handleKubeconfigImportHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp kubeconfigImportResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if !resp.Success {
		t.Fatalf("expected success=true, got error: %s", resp.Error)
	}
}

func TestHandleKubeconfigImportHTTP_Options(t *testing.T) {
	s := newTestServer(t, withToken("secret"), withContexts("cluster-a"))
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodOptions, "/kubeconfig/import", nil)
	s.handleKubeconfigImportHTTP(w, req)
	if w.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", w.Code)
	}
}

// Verify protocol.ErrorPayload is correctly returned for method_not_allowed
func TestHandleKubeconfigAddHTTP_ErrorPayloadFormat(t *testing.T) {
	s := newTestServer(t, withToken("secret"), withContexts("cluster-a"))
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPut, "/kubeconfig/add", nil)
	req.Header.Set("Authorization", "Bearer secret")
	s.handleKubeconfigAddHTTP(w, req)
	if w.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405, got %d", w.Code)
	}
	var ep protocol.ErrorPayload
	if err := json.Unmarshal(w.Body.Bytes(), &ep); err != nil {
		t.Fatalf("failed to unmarshal ErrorPayload: %v", err)
	}
	if ep.Code != "method_not_allowed" {
		t.Fatalf("expected code=method_not_allowed, got %q", ep.Code)
	}
}
