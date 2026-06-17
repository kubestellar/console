package providers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/client-go/rest"

	"github.com/kubestellar/console/pkg/agent/federation"
)

func TestKubeAdmiralActionDescriptors(t *testing.T) {
	p := &kubeAdmiralProvider{}
	descs := p.Actions()

	if len(descs) != 1 {
		t.Fatalf("expected 1 action descriptor, got %d", len(descs))
	}

	d := descs[0]
	if d.ID != kubeAdmiralActionUnfederateCluster {
		t.Errorf("expected action ID %q, got %q", kubeAdmiralActionUnfederateCluster, d.ID)
	}
	if !d.Destructive {
		t.Error("unfederateCluster must be destructive")
	}
	if d.Label == "" {
		t.Error("unfederateCluster label must not be empty")
	}
	if d.Verb == "" {
		t.Error("unfederateCluster verb must not be empty")
	}
	if d.Provider != "kubeadmiral" {
		t.Errorf("expected provider kubeadmiral, got %q", d.Provider)
	}
}

func TestKubeAdmiralInterfaceConformance(t *testing.T) {
	var p federation.ActionProvider = &kubeAdmiralProvider{}
	if p.Name() != federation.ProviderKubeAdmiral {
		t.Errorf("expected provider name %q, got %q", federation.ProviderKubeAdmiral, p.Name())
	}
}

func TestKubeAdmiralExecuteUnknownAction(t *testing.T) {
	p := &kubeAdmiralProvider{}
	_, err := p.Execute(context.Background(), nil, federation.ActionRequest{
		ActionID: "kubeadmiral.doesNotExist",
	})
	if err == nil {
		t.Error("expected error for unknown action")
	}
}

// ────────────────────────────────────────────────────────────────────────────
// kubeAdmiralUnfederateCluster — integration tests with fake API server
// ────────────────────────────────────────────────────────────────────────────

func TestKubeAdmiralUnfederateCluster_DeletesSuccessfully(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method == http.MethodDelete {
			json.NewEncoder(w).Encode(map[string]interface{}{
				"apiVersion": "v1",
				"kind":       "Status",
				"status":     "Success",
				"code":       200,
			})
			return
		}
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"kind": "Status", "status": "Failure", "reason": "NotFound", "code": 404,
			"message": "not found",
		})
	}))
	defer ts.Close()

	cfg := &rest.Config{Host: ts.URL}
	result, err := kubeAdmiralUnfederateCluster(context.Background(), cfg, "member-1")
	require.NoError(t, err)
	assert.True(t, result.OK)
	assert.False(t, result.Already)
	assert.Contains(t, result.Message, "member-1")
}

func TestKubeAdmiralUnfederateCluster_AlreadyAbsent(t *testing.T) {
	// Server returns 404 for DELETE → idempotent, OK=true, Already=true.
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"kind":    "Status",
			"status":  "Failure",
			"reason":  "NotFound",
			"message": `federatedclusters "missing-cluster" not found`,
			"code":    404,
		})
	}))
	defer ts.Close()

	cfg := &rest.Config{Host: ts.URL}
	result, err := kubeAdmiralUnfederateCluster(context.Background(), cfg, "missing-cluster")
	require.NoError(t, err, "already-absent should not return an error")
	assert.True(t, result.OK)
	assert.True(t, result.Already)
	assert.Contains(t, result.Message, "missing-cluster")
}

func TestKubeAdmiralUnfederateCluster_ServerError(t *testing.T) {
	// Server returns 500 → operation fails with an error.
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"kind":    "Status",
			"status":  "Failure",
			"reason":  "InternalError",
			"message": "etcd is unavailable",
			"code":    500,
		})
	}))
	defer ts.Close()

	cfg := &rest.Config{Host: ts.URL}
	_, err := kubeAdmiralUnfederateCluster(context.Background(), cfg, "member-1")
	require.Error(t, err, "server error should propagate")
}

func TestKubeAdmiralExecute_UnfederateViaProvider(t *testing.T) {
	tests := []struct {
		name          string
		serverStatus  int
		clusterName   string
		wantOK        bool
		wantAlready   bool
		wantErrNil    bool
		wantMsgSubstr string
	}{
		{
			name:          "success",
			serverStatus:  http.StatusOK,
			clusterName:   "worker-1",
			wantOK:        true,
			wantAlready:   false,
			wantErrNil:    true,
			wantMsgSubstr: "worker-1",
		},
		{
			name:          "already removed",
			serverStatus:  http.StatusNotFound,
			clusterName:   "gone-cluster",
			wantOK:        true,
			wantAlready:   true,
			wantErrNil:    true,
			wantMsgSubstr: "gone-cluster",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			status := tt.serverStatus
			ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				if status == http.StatusOK {
					json.NewEncoder(w).Encode(map[string]interface{}{
						"apiVersion": "v1", "kind": "Status", "status": "Success", "code": 200,
					})
					return
				}
				w.WriteHeader(status)
				json.NewEncoder(w).Encode(map[string]interface{}{
					"kind": "Status", "status": "Failure", "reason": "NotFound",
					"message": `federatedclusters "` + tt.clusterName + `" not found`, "code": 404,
				})
			}))
			defer ts.Close()

			p := &kubeAdmiralProvider{}
			cfg := &rest.Config{Host: ts.URL}
			req := federation.ActionRequest{
				ActionID:    kubeAdmiralActionUnfederateCluster,
				ClusterName: tt.clusterName,
			}

			result, err := p.Execute(context.Background(), cfg, req)
			if tt.wantErrNil {
				require.NoError(t, err)
			} else {
				require.Error(t, err)
			}
			assert.Equal(t, tt.wantOK, result.OK)
			assert.Equal(t, tt.wantAlready, result.Already)
			if tt.wantMsgSubstr != "" {
				assert.Contains(t, result.Message, tt.wantMsgSubstr)
			}
		})
	}
}
