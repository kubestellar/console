package agent

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/kubestellar/console/pkg/agent/protocol"
)

// ---------------------------------------------------------------------------
// createNamespaceHTTP — POST /namespaces
// ---------------------------------------------------------------------------

func TestCreateNamespaceHTTP_BadJSON(t *testing.T) {
	srv := newTestServer(t, withToken("tok"))
	req := httptest.NewRequest(http.MethodPost, "/namespaces", bytes.NewBufferString("{bad"))
	authRequest(req, "tok")
	rec := httptest.NewRecorder()
	srv.createNamespaceHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
	var body map[string]interface{}
	json.NewDecoder(rec.Body).Decode(&body)
	if body["success"] != false {
		t.Errorf("expected success=false, got %v", body["success"])
	}
}

func TestCreateNamespaceHTTP_InvalidCluster(t *testing.T) {
	srv := newTestServer(t, withToken("tok"))
	payload := map[string]string{"cluster": "../escape", "name": "valid-ns"}
	data, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPost, "/namespaces", bytes.NewReader(data))
	authRequest(req, "tok")
	rec := httptest.NewRecorder()
	srv.createNamespaceHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestCreateNamespaceHTTP_InvalidName(t *testing.T) {
	srv := newTestServer(t, withToken("tok"))
	payload := map[string]string{"cluster": "prod", "name": "INVALID_CAPS"}
	data, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPost, "/namespaces", bytes.NewReader(data))
	authRequest(req, "tok")
	rec := httptest.NewRecorder()
	srv.createNamespaceHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestCreateNamespaceHTTP_NilK8sClient(t *testing.T) {
	// When k8sClient is nil, the POST /namespaces handler routes via
	// handleNamespacesHTTP which checks nil client before dispatching.
	// But createNamespaceHTTP itself would NPE — test that the parent
	// gate prevents reaching it.
	srv := newTestServer(t, withToken("tok"))
	req := httptest.NewRequest(http.MethodPost, "/namespaces", nil)
	authRequest(req, "tok")
	rec := httptest.NewRecorder()
	srv.handleNamespacesHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 (with error in body), got %d", rec.Code)
	}
	var body map[string]interface{}
	json.NewDecoder(rec.Body).Decode(&body)
	if _, ok := body["error"]; !ok {
		t.Error("expected error field in response body")
	}
}

// ---------------------------------------------------------------------------
// deleteNamespaceHTTP — DELETE /namespaces?cluster=...&name=...
// ---------------------------------------------------------------------------

func TestDeleteNamespaceHTTP_MissingParams(t *testing.T) {
	srv := newTestServer(t, withToken("tok"))

	tests := []struct {
		name  string
		query string
	}{
		{"missing both", ""},
		{"missing name", "?cluster=prod"},
		{"missing cluster", "?name=ns1"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodDelete, "/namespaces"+tt.query, nil)
			authRequest(req, "tok")
			rec := httptest.NewRecorder()
			srv.deleteNamespaceHTTP(rec, req)
			if rec.Code != http.StatusBadRequest {
				t.Fatalf("expected 400, got %d", rec.Code)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// handleNamespacesHTTP — routing + auth
// ---------------------------------------------------------------------------

func TestHandleNamespacesHTTP_Unauthorized(t *testing.T) {
	srv := newTestServer(t, withToken("secret"))
	req := httptest.NewRequest(http.MethodGet, "/namespaces?cluster=prod", nil)
	// No auth header
	rec := httptest.NewRecorder()
	srv.handleNamespacesHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestHandleNamespacesHTTP_OPTIONS(t *testing.T) {
	srv := newTestServer(t)
	req := httptest.NewRequest(http.MethodOptions, "/namespaces", nil)
	rec := httptest.NewRecorder()
	srv.handleNamespacesHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", rec.Code)
	}
}

func TestHandleNamespacesHTTP_GET_MissingCluster(t *testing.T) {
	srv := newTestServer(t, withContexts("prod"))
	req := httptest.NewRequest(http.MethodGet, "/namespaces", nil)
	rec := httptest.NewRecorder()
	srv.handleNamespacesHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var body map[string]interface{}
	json.NewDecoder(rec.Body).Decode(&body)
	if body["error"] == nil || body["error"] == "" {
		t.Error("expected error about missing cluster parameter")
	}
}

// ---------------------------------------------------------------------------
// createServiceAccountHTTP — POST /serviceaccounts
// ---------------------------------------------------------------------------

func TestCreateServiceAccountHTTP_BadJSON(t *testing.T) {
	srv := newTestServer(t, withToken("tok"))
	req := httptest.NewRequest(http.MethodPost, "/serviceaccounts", bytes.NewBufferString("not json"))
	authRequest(req, "tok")
	rec := httptest.NewRecorder()
	srv.createServiceAccountHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestCreateServiceAccountHTTP_MissingFields(t *testing.T) {
	srv := newTestServer(t, withToken("tok"))

	tests := []struct {
		name    string
		payload map[string]string
	}{
		{"missing cluster", map[string]string{"namespace": "default", "name": "sa1"}},
		{"missing namespace", map[string]string{"cluster": "prod", "name": "sa1"}},
		{"missing name", map[string]string{"cluster": "prod", "namespace": "default"}},
		{"all empty", map[string]string{}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			data, _ := json.Marshal(tt.payload)
			req := httptest.NewRequest(http.MethodPost, "/serviceaccounts", bytes.NewReader(data))
			authRequest(req, "tok")
			rec := httptest.NewRecorder()
			srv.createServiceAccountHTTP(rec, req)
			if rec.Code != http.StatusBadRequest {
				t.Fatalf("expected 400, got %d", rec.Code)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// deleteServiceAccountHTTP — DELETE /serviceaccounts?cluster=...&namespace=...&name=...
// ---------------------------------------------------------------------------

func TestDeleteServiceAccountHTTP_MissingParams(t *testing.T) {
	srv := newTestServer(t, withToken("tok"))

	tests := []struct {
		name  string
		query string
	}{
		{"missing all", ""},
		{"missing namespace and name", "?cluster=prod"},
		{"missing name", "?cluster=prod&namespace=default"},
		{"missing cluster", "?namespace=default&name=sa1"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodDelete, "/serviceaccounts"+tt.query, nil)
			authRequest(req, "tok")
			rec := httptest.NewRecorder()
			srv.deleteServiceAccountHTTP(rec, req)
			if rec.Code != http.StatusBadRequest {
				t.Fatalf("expected 400, got %d", rec.Code)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// handleServiceExportsHTTP — routing
// ---------------------------------------------------------------------------

func TestHandleServiceExportsHTTP_Unauthorized(t *testing.T) {
	srv := newTestServer(t, withToken("secret"))
	req := httptest.NewRequest(http.MethodPost, "/serviceexports", nil)
	// No auth header
	rec := httptest.NewRecorder()
	srv.handleServiceExportsHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestHandleServiceExportsHTTP_OPTIONS(t *testing.T) {
	srv := newTestServer(t)
	req := httptest.NewRequest(http.MethodOptions, "/serviceexports", nil)
	rec := httptest.NewRecorder()
	srv.handleServiceExportsHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", rec.Code)
	}
}

func TestHandleServiceExportsHTTP_NilK8sClient(t *testing.T) {
	srv := newTestServer(t)
	req := httptest.NewRequest(http.MethodPost, "/serviceexports", nil)
	rec := httptest.NewRecorder()
	srv.handleServiceExportsHTTP(rec, req)
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d", rec.Code)
	}
}

func TestHandleServiceExportsHTTP_MethodNotAllowed(t *testing.T) {
	srv := newTestServer(t, withContexts("prod"))
	req := httptest.NewRequest(http.MethodGet, "/serviceexports", nil)
	rec := httptest.NewRecorder()
	srv.handleServiceExportsHTTP(rec, req)
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405, got %d", rec.Code)
	}
}

// ---------------------------------------------------------------------------
// createServiceExportHTTP — POST /serviceexports
// ---------------------------------------------------------------------------

func TestCreateServiceExportHTTP_BadJSON(t *testing.T) {
	srv := newTestServer(t, withContexts("prod"))
	req := httptest.NewRequest(http.MethodPost, "/serviceexports", bytes.NewBufferString("{nope"))
	rec := httptest.NewRecorder()
	srv.createServiceExportHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestCreateServiceExportHTTP_MissingFields(t *testing.T) {
	srv := newTestServer(t, withContexts("prod"))

	tests := []struct {
		name    string
		payload map[string]string
	}{
		{"missing cluster", map[string]string{"namespace": "default", "serviceName": "svc"}},
		{"missing namespace", map[string]string{"cluster": "prod", "serviceName": "svc"}},
		{"missing serviceName", map[string]string{"cluster": "prod", "namespace": "default"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			data, _ := json.Marshal(tt.payload)
			req := httptest.NewRequest(http.MethodPost, "/serviceexports", bytes.NewReader(data))
			rec := httptest.NewRecorder()
			srv.createServiceExportHTTP(rec, req)
			if rec.Code != http.StatusBadRequest {
				t.Fatalf("expected 400, got %d", rec.Code)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// deleteServiceExportHTTP — DELETE /serviceexports?cluster=...&namespace=...&name=...
// ---------------------------------------------------------------------------

func TestDeleteServiceExportHTTP_MissingParams(t *testing.T) {
	srv := newTestServer(t, withContexts("prod"))

	tests := []struct {
		name  string
		query string
	}{
		{"missing all", ""},
		{"missing namespace and name", "?cluster=prod"},
		{"missing name", "?cluster=prod&namespace=default"},
		{"missing cluster", "?namespace=default&name=svc"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodDelete, "/serviceexports"+tt.query, nil)
			rec := httptest.NewRecorder()
			srv.deleteServiceExportHTTP(rec, req)
			if rec.Code != http.StatusBadRequest {
				t.Fatalf("expected 400, got %d", rec.Code)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// filterStreamClusters — pure helper
// ---------------------------------------------------------------------------

func TestFilterStreamClusters_NoFilter(t *testing.T) {
	clusters := []protocol.ClusterInfo{
		{Name: "a"}, {Name: "b"}, {Name: "c"},
	}
	result := filterStreamClusters(clusters, "")
	if len(result) != 3 {
		t.Fatalf("expected 3 clusters, got %d", len(result))
	}
}

func TestFilterStreamClusters_MatchOne(t *testing.T) {
	clusters := []protocol.ClusterInfo{
		{Name: "a"}, {Name: "b"}, {Name: "c"},
	}
	result := filterStreamClusters(clusters, "b")
	if len(result) != 1 {
		t.Fatalf("expected 1 cluster, got %d", len(result))
	}
	if result[0].Name != "b" {
		t.Errorf("expected cluster 'b', got %q", result[0].Name)
	}
}

func TestFilterStreamClusters_NoMatch(t *testing.T) {
	clusters := []protocol.ClusterInfo{
		{Name: "a"}, {Name: "b"},
	}
	result := filterStreamClusters(clusters, "nonexistent")
	if len(result) != 0 {
		t.Fatalf("expected 0 clusters, got %d", len(result))
	}
}

func TestFilterStreamClusters_EmptyInput(t *testing.T) {
	result := filterStreamClusters(nil, "x")
	if len(result) != 0 {
		t.Fatalf("expected 0, got %d", len(result))
	}
}
