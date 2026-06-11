package agent

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/kubestellar/console/pkg/agent/protocol"
	"github.com/kubestellar/console/pkg/k8s"
)

// --- handleRenameContextHTTP ---

func TestHandleRenameContextHTTP_OPTIONSPreflight(t *testing.T) {
	s := newTestServer(t)
	req := httptest.NewRequest(http.MethodOptions, "/rename-context", nil)
	rec := serveAndRecord(s.handleRenameContextHTTP, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("OPTIONS: got %d, want 204", rec.Code)
	}
}

func TestHandleRenameContextHTTP_Unauthorized(t *testing.T) {
	s := newTestServer(t, withToken("secret"))
	req := httptest.NewRequest(http.MethodPost, "/rename-context", strings.NewReader(`{}`))
	rec := serveAndRecord(s.handleRenameContextHTTP, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got %d, want 401", rec.Code)
	}
}

func TestHandleRenameContextHTTP_MethodNotAllowed(t *testing.T) {
	s := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/rename-context", nil)
	rec := serveAndRecord(s.handleRenameContextHTTP, req)
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("got %d, want 405", rec.Code)
	}
}

func TestHandleRenameContextHTTP_InvalidJSON(t *testing.T) {
	s := newTestServer(t)
	req := httptest.NewRequest(http.MethodPost, "/rename-context", strings.NewReader("not json"))
	rec := serveAndRecord(s.handleRenameContextHTTP, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want 400", rec.Code)
	}
	var resp protocol.ErrorPayload
	json.NewDecoder(rec.Body).Decode(&resp)
	if resp.Code != "invalid_request" {
		t.Fatalf("expected code=invalid_request, got %s", resp.Code)
	}
}

func TestHandleRenameContextHTTP_EmptyNames(t *testing.T) {
	s := newTestServer(t)
	req := httptest.NewRequest(http.MethodPost, "/rename-context", strings.NewReader(`{"oldName":"","newName":""}`))
	rec := serveAndRecord(s.handleRenameContextHTTP, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want 400", rec.Code)
	}
	var resp protocol.ErrorPayload
	json.NewDecoder(rec.Body).Decode(&resp)
	if resp.Code != "invalid_names" {
		t.Fatalf("expected code=invalid_names, got %s", resp.Code)
	}
}

func TestHandleRenameContextHTTP_InvalidOldContext(t *testing.T) {
	s := newTestServer(t)
	// Use a name with shell metacharacters that validateKubeContext rejects
	req := httptest.NewRequest(http.MethodPost, "/rename-context", strings.NewReader(`{"oldName":"ctx;whoami","newName":"valid-name"}`))
	rec := serveAndRecord(s.handleRenameContextHTTP, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want 400", rec.Code)
	}
}

func TestHandleRenameContextHTTP_InvalidNewContext(t *testing.T) {
	s := newTestServer(t)
	req := httptest.NewRequest(http.MethodPost, "/rename-context", strings.NewReader(`{"oldName":"valid-old","newName":"bad$(cmd)"}`))
	rec := serveAndRecord(s.handleRenameContextHTTP, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want 400", rec.Code)
	}
}

func TestHandleRenameContextHTTP_RenameError(t *testing.T) {
	// When kubectl binary isn't available or rename fails, the handler
	// should return 500 with a rename_failed error payload.
	s := newTestServer(t, withContexts("old-ctx"))
	req := httptest.NewRequest(http.MethodPost, "/rename-context", strings.NewReader(`{"oldName":"old-ctx","newName":"new-ctx"}`))
	rec := serveAndRecord(s.handleRenameContextHTTP, req)
	// Either 200 (if kubectl is available) or 500 (if kubectl is missing)
	if rec.Code != http.StatusOK && rec.Code != http.StatusInternalServerError {
		t.Fatalf("got %d, want 200 or 500", rec.Code)
	}
	if rec.Code == http.StatusInternalServerError {
		var resp protocol.ErrorPayload
		json.NewDecoder(rec.Body).Decode(&resp)
		if resp.Code != "rename_failed" {
			t.Fatalf("expected code=rename_failed, got %s", resp.Code)
		}
	}
}

// --- handleKubeconfigPreviewHTTP ---

func TestHandleKubeconfigPreviewHTTP_OPTIONSPreflight(t *testing.T) {
	s := newTestServer(t)
	req := httptest.NewRequest(http.MethodOptions, "/kubeconfig/preview", nil)
	rec := serveAndRecord(s.handleKubeconfigPreviewHTTP, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("OPTIONS: got %d, want 204", rec.Code)
	}
}

func TestHandleKubeconfigPreviewHTTP_Unauthorized(t *testing.T) {
	s := newTestServer(t, withToken("secret"))
	req := httptest.NewRequest(http.MethodPost, "/kubeconfig/preview", strings.NewReader(`{}`))
	rec := serveAndRecord(s.handleKubeconfigPreviewHTTP, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got %d, want 401", rec.Code)
	}
}

func TestHandleKubeconfigPreviewHTTP_MethodNotAllowed(t *testing.T) {
	s := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/kubeconfig/preview", nil)
	rec := serveAndRecord(s.handleKubeconfigPreviewHTTP, req)
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("got %d, want 405", rec.Code)
	}
}

func TestHandleKubeconfigPreviewHTTP_EmptyKubeconfig(t *testing.T) {
	s := newTestServer(t, withContexts("ctx1"))
	req := httptest.NewRequest(http.MethodPost, "/kubeconfig/preview", strings.NewReader(`{"kubeconfig":""}`))
	rec := serveAndRecord(s.handleKubeconfigPreviewHTTP, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want 400", rec.Code)
	}
}

func TestHandleKubeconfigPreviewHTTP_InvalidKubeconfig(t *testing.T) {
	s := newTestServer(t, withContexts("ctx1"))
	req := httptest.NewRequest(http.MethodPost, "/kubeconfig/preview", strings.NewReader(`{"kubeconfig":"not yaml at all {"}`))
	rec := serveAndRecord(s.handleKubeconfigPreviewHTTP, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want 400", rec.Code)
	}
}

func TestHandleKubeconfigPreviewHTTP_ValidKubeconfig(t *testing.T) {
	s := newTestServer(t, withContexts("existing"))
	kc := `apiVersion: v1
kind: Config
clusters:
- name: new-cluster
  cluster:
    server: https://new.example.com
contexts:
- name: new-ctx
  context:
    cluster: new-cluster
    user: new-user
users:
- name: new-user
  user:
    token: fake-token
`
	req := httptest.NewRequest(http.MethodPost, "/kubeconfig/preview", strings.NewReader(`{"kubeconfig":"`+strings.ReplaceAll(kc, "\n", "\\n")+`"}`))
	rec := serveAndRecord(s.handleKubeconfigPreviewHTTP, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("got %d, want 200; body: %s", rec.Code, rec.Body.String())
	}
	var resp kubeconfigPreviewResponse
	json.NewDecoder(rec.Body).Decode(&resp)
	if len(resp.Contexts) == 0 {
		t.Fatal("expected at least one context in preview")
	}
}

// --- handleKubeconfigImportHTTP ---

func TestHandleKubeconfigImportHTTP_OPTIONSPreflight(t *testing.T) {
	s := newTestServer(t)
	req := httptest.NewRequest(http.MethodOptions, "/kubeconfig/import", nil)
	rec := serveAndRecord(s.handleKubeconfigImportHTTP, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("OPTIONS: got %d, want 204", rec.Code)
	}
}

func TestHandleKubeconfigImportHTTP_Unauthorized(t *testing.T) {
	s := newTestServer(t, withToken("secret"))
	req := httptest.NewRequest(http.MethodPost, "/kubeconfig/import", strings.NewReader(`{}`))
	rec := serveAndRecord(s.handleKubeconfigImportHTTP, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got %d, want 401", rec.Code)
	}
}

func TestHandleKubeconfigImportHTTP_EmptyKubeconfig(t *testing.T) {
	s := newTestServer(t, withContexts("ctx1"))
	req := httptest.NewRequest(http.MethodPost, "/kubeconfig/import", strings.NewReader(`{"kubeconfig":""}`))
	rec := serveAndRecord(s.handleKubeconfigImportHTTP, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want 400", rec.Code)
	}
}

// --- handleKubeconfigRemoveHTTP ---

func TestHandleKubeconfigRemoveHTTP_OPTIONSPreflight(t *testing.T) {
	s := newTestServer(t)
	req := httptest.NewRequest(http.MethodOptions, "/kubeconfig/remove", nil)
	rec := serveAndRecord(s.handleKubeconfigRemoveHTTP, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("OPTIONS: got %d, want 204", rec.Code)
	}
}

func TestHandleKubeconfigRemoveHTTP_Unauthorized(t *testing.T) {
	s := newTestServer(t, withToken("secret"))
	req := httptest.NewRequest(http.MethodPost, "/kubeconfig/remove", strings.NewReader(`{}`))
	rec := serveAndRecord(s.handleKubeconfigRemoveHTTP, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got %d, want 401", rec.Code)
	}
}

func TestHandleKubeconfigRemoveHTTP_MethodNotAllowed(t *testing.T) {
	s := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/kubeconfig/remove", nil)
	rec := serveAndRecord(s.handleKubeconfigRemoveHTTP, req)
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("got %d, want 405", rec.Code)
	}
}

func TestHandleKubeconfigRemoveHTTP_MissingContext(t *testing.T) {
	s := newTestServer(t, withContexts("ctx1"))
	req := httptest.NewRequest(http.MethodPost, "/kubeconfig/remove", strings.NewReader(`{}`))
	rec := serveAndRecord(s.handleKubeconfigRemoveHTTP, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want 400", rec.Code)
	}
}

func TestHandleKubeconfigRemoveHTTP_NilK8sClient(t *testing.T) {
	s := newTestServer(t)
	s.k8sClient = nil
	req := httptest.NewRequest(http.MethodPost, "/kubeconfig/remove", strings.NewReader(`{"context":"ctx1"}`))
	rec := serveAndRecord(s.handleKubeconfigRemoveHTTP, req)
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("got %d, want 503", rec.Code)
	}
}

func TestHandleKubeconfigRemoveHTTP_Success(t *testing.T) {
	k8sClient, _ := k8s.NewMultiClusterClient("")
	s := newTestServer(t, withContexts("remove-me"))
	s.k8sClient = k8sClient
	// RemoveContext on a MultiClusterClient with no loaded config file will
	// return an error — this tests that we handle that error path correctly.
	req := httptest.NewRequest(http.MethodPost, "/kubeconfig/remove", strings.NewReader(`{"context":"remove-me"}`))
	rec := serveAndRecord(s.handleKubeconfigRemoveHTTP, req)
	// Either 200 (success) or 400 (error from remove) — we just ensure no panic
	if rec.Code != http.StatusOK && rec.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want 200 or 400", rec.Code)
	}
}

// --- handleKubeconfigAddHTTP ---

func TestHandleKubeconfigAddHTTP_OPTIONSPreflight(t *testing.T) {
	s := newTestServer(t)
	req := httptest.NewRequest(http.MethodOptions, "/kubeconfig/add", nil)
	rec := serveAndRecord(s.handleKubeconfigAddHTTP, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("OPTIONS: got %d, want 204", rec.Code)
	}
}

func TestHandleKubeconfigAddHTTP_Unauthorized(t *testing.T) {
	s := newTestServer(t, withToken("secret"))
	req := httptest.NewRequest(http.MethodPost, "/kubeconfig/add", strings.NewReader(`{}`))
	rec := serveAndRecord(s.handleKubeconfigAddHTTP, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got %d, want 401", rec.Code)
	}
}

func TestHandleKubeconfigAddHTTP_MethodNotAllowed(t *testing.T) {
	s := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/kubeconfig/add", nil)
	rec := serveAndRecord(s.handleKubeconfigAddHTTP, req)
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("got %d, want 405", rec.Code)
	}
}

func TestHandleKubeconfigAddHTTP_InvalidJSON(t *testing.T) {
	s := newTestServer(t)
	req := httptest.NewRequest(http.MethodPost, "/kubeconfig/add", strings.NewReader("not json"))
	rec := serveAndRecord(s.handleKubeconfigAddHTTP, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want 400", rec.Code)
	}
}

func TestHandleKubeconfigAddHTTP_MissingFields(t *testing.T) {
	s := newTestServer(t, withContexts("ctx1"))
	// Missing required fields should fail at kubectl.AddCluster
	req := httptest.NewRequest(http.MethodPost, "/kubeconfig/add", strings.NewReader(`{"contextName":"","clusterName":"","serverUrl":"","authType":""}`))
	rec := serveAndRecord(s.handleKubeconfigAddHTTP, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want 400", rec.Code)
	}
}

// --- handleKubeconfigTestHTTP ---

func TestHandleKubeconfigTestHTTP_OPTIONSPreflight(t *testing.T) {
	s := newTestServer(t)
	req := httptest.NewRequest(http.MethodOptions, "/kubeconfig/test", nil)
	rec := serveAndRecord(s.handleKubeconfigTestHTTP, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("OPTIONS: got %d, want 204", rec.Code)
	}
}

func TestHandleKubeconfigTestHTTP_Unauthorized(t *testing.T) {
	s := newTestServer(t, withToken("secret"))
	req := httptest.NewRequest(http.MethodPost, "/kubeconfig/test", strings.NewReader(`{}`))
	rec := serveAndRecord(s.handleKubeconfigTestHTTP, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got %d, want 401", rec.Code)
	}
}

func TestHandleKubeconfigTestHTTP_MethodNotAllowed(t *testing.T) {
	s := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/kubeconfig/test", nil)
	rec := serveAndRecord(s.handleKubeconfigTestHTTP, req)
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("got %d, want 405", rec.Code)
	}
}

func TestHandleKubeconfigTestHTTP_InvalidJSON(t *testing.T) {
	s := newTestServer(t)
	req := httptest.NewRequest(http.MethodPost, "/kubeconfig/test", strings.NewReader("bad"))
	rec := serveAndRecord(s.handleKubeconfigTestHTTP, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want 400", rec.Code)
	}
}

func TestHandleKubeconfigTestHTTP_InvalidRequest(t *testing.T) {
	s := newTestServer(t, withContexts("ctx1"))
	// Missing serverUrl and authType — should trigger validation error
	body := `{"serverUrl":"","authType":""}`
	req := httptest.NewRequest(http.MethodPost, "/kubeconfig/test", strings.NewReader(body))
	rec := serveAndRecord(s.handleKubeconfigTestHTTP, req)
	// Handler returns 400 for invalid input or 200 with reachable=false
	if rec.Code != http.StatusOK && rec.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want 200 or 400", rec.Code)
	}
}
