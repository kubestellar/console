package providers

import (
	"context"
	"testing"

	"github.com/kubestellar/console/pkg/agent/federation"
)

// ---------------------------------------------------------------------------
// clusternetApproveCluster
// ---------------------------------------------------------------------------

func TestClusternetApproveCluster_Success(t *testing.T) {
	const mcPath = "/apis/clusters.clusternet.io/v1beta1/managedclusters/edge-1"
	ts := newActionTestServer(t, map[string]actionResponse{
		"GET " + mcPath: ok200(map[string]interface{}{
			"apiVersion": "clusters.clusternet.io/v1beta1",
			"kind":       "ManagedCluster",
			"metadata":   map[string]interface{}{"name": "edge-1"},
			"spec":       map[string]interface{}{"approved": false},
		}),
		"PATCH " + mcPath: ok200(map[string]interface{}{
			"apiVersion": "clusters.clusternet.io/v1beta1",
			"kind":       "ManagedCluster",
			"metadata":   map[string]interface{}{"name": "edge-1"},
			"spec":       map[string]interface{}{"approved": true},
		}),
	})
	defer ts.Close()

	result, err := clusternetApproveCluster(context.Background(), ts.cfg, "edge-1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.OK {
		t.Error("expected OK=true")
	}
	if result.Already {
		t.Error("expected Already=false for new approval")
	}
	if !ts.hasRequest("PATCH", "managedclusters/edge-1") {
		t.Error("expected PATCH request to approve cluster")
	}
}

func TestClusternetApproveCluster_AlreadyApproved(t *testing.T) {
	const mcPath = "/apis/clusters.clusternet.io/v1beta1/managedclusters/edge-1"
	ts := newActionTestServer(t, map[string]actionResponse{
		"GET " + mcPath: ok200(map[string]interface{}{
			"apiVersion": "clusters.clusternet.io/v1beta1",
			"kind":       "ManagedCluster",
			"metadata":   map[string]interface{}{"name": "edge-1"},
			"spec":       map[string]interface{}{"approved": true},
		}),
	})
	defer ts.Close()

	result, err := clusternetApproveCluster(context.Background(), ts.cfg, "edge-1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.OK || !result.Already {
		t.Error("expected OK=true, Already=true for already-approved cluster")
	}
	if ts.hasRequest("PATCH", "managedclusters") {
		t.Error("no PATCH expected when already approved")
	}
}

func TestClusternetApproveCluster_NotFound(t *testing.T) {
	ts := newActionTestServer(t, map[string]actionResponse{})
	defer ts.Close()

	result, err := clusternetApproveCluster(context.Background(), ts.cfg, "missing")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Clusternet treats not-found as Already=true (graceful).
	if !result.OK || !result.Already {
		t.Error("expected OK=true, Already=true for not-found cluster")
	}
}

func TestClusternetApproveCluster_PatchConflict(t *testing.T) {
	const mcPath = "/apis/clusters.clusternet.io/v1beta1/managedclusters/edge-1"
	ts := newActionTestServer(t, map[string]actionResponse{
		"GET " + mcPath: ok200(map[string]interface{}{
			"apiVersion": "clusters.clusternet.io/v1beta1",
			"kind":       "ManagedCluster",
			"metadata":   map[string]interface{}{"name": "edge-1"},
			"spec":       map[string]interface{}{"approved": false},
		}),
		"PATCH " + mcPath: conflict409(),
	})
	defer ts.Close()

	result, err := clusternetApproveCluster(context.Background(), ts.cfg, "edge-1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.OK || !result.Already {
		t.Error("expected OK=true, Already=true on conflict")
	}
}

// ---------------------------------------------------------------------------
// clusternetUnregisterCluster
// ---------------------------------------------------------------------------

func TestClusternetUnregisterCluster_Success(t *testing.T) {
	const mcPath = "/apis/clusters.clusternet.io/v1beta1/managedclusters/edge-1"
	ts := newActionTestServer(t, map[string]actionResponse{
		"DELETE " + mcPath: ok200(map[string]interface{}{
			"kind":   "Status",
			"status": "Success",
		}),
	})
	defer ts.Close()

	result, err := clusternetUnregisterCluster(context.Background(), ts.cfg, "edge-1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.OK {
		t.Error("expected OK=true")
	}
	if result.Already {
		t.Error("expected Already=false for real unregister")
	}
}

func TestClusternetUnregisterCluster_AlreadyGone(t *testing.T) {
	ts := newActionTestServer(t, map[string]actionResponse{})
	defer ts.Close()

	result, err := clusternetUnregisterCluster(context.Background(), ts.cfg, "gone")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.OK || !result.Already {
		t.Error("expected OK=true, Already=true for already-deleted cluster")
	}
}

func TestClusternetUnregisterCluster_ServerError(t *testing.T) {
	const mcPath = "/apis/clusters.clusternet.io/v1beta1/managedclusters/edge-1"
	ts := newActionTestServer(t, map[string]actionResponse{
		"DELETE " + mcPath: serverError500(),
	})
	defer ts.Close()

	_, err := clusternetUnregisterCluster(context.Background(), ts.cfg, "edge-1")
	if err == nil {
		t.Error("expected error for server error")
	}
}

// ---------------------------------------------------------------------------
// unstructuredNestedBool
// ---------------------------------------------------------------------------

func TestUnstructuredNestedBool(t *testing.T) {
	tests := []struct {
		name     string
		obj      map[string]interface{}
		fields   []string
		wantVal  bool
		wantOK   bool
	}{
		{
			name:    "true value",
			obj:     map[string]interface{}{"spec": map[string]interface{}{"approved": true}},
			fields:  []string{"spec", "approved"},
			wantVal: true,
			wantOK:  true,
		},
		{
			name:    "false value",
			obj:     map[string]interface{}{"spec": map[string]interface{}{"approved": false}},
			fields:  []string{"spec", "approved"},
			wantVal: false,
			wantOK:  true,
		},
		{
			name:    "missing field",
			obj:     map[string]interface{}{"spec": map[string]interface{}{}},
			fields:  []string{"spec", "approved"},
			wantVal: false,
			wantOK:  false,
		},
		{
			name:    "missing parent",
			obj:     map[string]interface{}{},
			fields:  []string{"spec", "approved"},
			wantVal: false,
			wantOK:  false,
		},
		{
			name:    "non-bool value",
			obj:     map[string]interface{}{"spec": map[string]interface{}{"approved": "yes"}},
			fields:  []string{"spec", "approved"},
			wantVal: false,
			wantOK:  false,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			val, ok, err := unstructuredNestedBool(tt.obj, tt.fields...)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if val != tt.wantVal {
				t.Errorf("value = %v, want %v", val, tt.wantVal)
			}
			if ok != tt.wantOK {
				t.Errorf("ok = %v, want %v", ok, tt.wantOK)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// Clusternet Execute dispatch
// ---------------------------------------------------------------------------

func TestClusternetExecute_UnknownAction(t *testing.T) {
	p := &clusternetProvider{}
	_, err := p.Execute(context.Background(), nil, federation.ActionRequest{
		ActionID: "clusternet.bogus",
	})
	if err == nil {
		t.Error("expected error for unknown action")
	}
}
