package providers

import (
	"context"
	"testing"

	"github.com/kubestellar/console/pkg/agent/federation"
)

// ---------------------------------------------------------------------------
// executeKarmadaJoinCluster
// ---------------------------------------------------------------------------

func TestKarmadaJoinCluster_Success(t *testing.T) {
	const clusterPath = "/apis/cluster.karmada.io/v1alpha1/clusters/new-cluster"
	ts := newActionTestServer(t, map[string]actionResponse{
		// GET returns 404 (cluster doesn't exist yet) — handled by default 404.
		"POST /apis/cluster.karmada.io/v1alpha1/clusters": created201(map[string]interface{}{
			"apiVersion": "cluster.karmada.io/v1alpha1",
			"kind":       "Cluster",
			"metadata":   map[string]interface{}{"name": "new-cluster"},
		}),
	})
	defer ts.Close()

	req := federation.ActionRequest{
		ActionID:    karmadaActionJoinCluster,
		Provider:    federation.ProviderKarmada,
		ClusterName: "new-cluster",
		Payload:     map[string]interface{}{"apiEndpoint": "https://api.new-cluster.example.com:6443"},
	}

	result, err := executeKarmadaJoinCluster(context.Background(), ts.cfg, req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.OK {
		t.Error("expected OK=true")
	}
	if result.Already {
		t.Error("expected Already=false for new join")
	}
}

func TestKarmadaJoinCluster_AlreadyExists(t *testing.T) {
	const clusterPath = "/apis/cluster.karmada.io/v1alpha1/clusters/existing"
	ts := newActionTestServer(t, map[string]actionResponse{
		"GET " + clusterPath: ok200(map[string]interface{}{
			"apiVersion": "cluster.karmada.io/v1alpha1",
			"kind":       "Cluster",
			"metadata":   map[string]interface{}{"name": "existing"},
		}),
	})
	defer ts.Close()

	req := federation.ActionRequest{
		ActionID:    karmadaActionJoinCluster,
		Provider:    federation.ProviderKarmada,
		ClusterName: "existing",
		Payload:     map[string]interface{}{"apiEndpoint": "https://api.existing.example.com"},
	}

	result, err := executeKarmadaJoinCluster(context.Background(), ts.cfg, req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.OK || !result.Already {
		t.Error("expected OK=true, Already=true for existing cluster")
	}
}

func TestKarmadaJoinCluster_MissingClusterName(t *testing.T) {
	ts := newActionTestServer(t, map[string]actionResponse{})
	defer ts.Close()

	req := federation.ActionRequest{
		ActionID: karmadaActionJoinCluster,
		Payload:  map[string]interface{}{"apiEndpoint": "https://api.example.com"},
	}

	_, err := executeKarmadaJoinCluster(context.Background(), ts.cfg, req)
	if err == nil {
		t.Error("expected error for missing clusterName")
	}
}

func TestKarmadaJoinCluster_MissingAPIEndpoint(t *testing.T) {
	ts := newActionTestServer(t, map[string]actionResponse{})
	defer ts.Close()

	req := federation.ActionRequest{
		ActionID:    karmadaActionJoinCluster,
		ClusterName: "c1",
		Payload:     map[string]interface{}{},
	}

	_, err := executeKarmadaJoinCluster(context.Background(), ts.cfg, req)
	if err == nil {
		t.Error("expected error for missing apiEndpoint")
	}
}

// ---------------------------------------------------------------------------
// executeKarmadaUnjoinCluster
// ---------------------------------------------------------------------------

func TestKarmadaUnjoinCluster_Success(t *testing.T) {
	const clusterPath = "/apis/cluster.karmada.io/v1alpha1/clusters/old-cluster"
	ts := newActionTestServer(t, map[string]actionResponse{
		"DELETE " + clusterPath: ok200(map[string]interface{}{
			"kind":   "Status",
			"status": "Success",
		}),
	})
	defer ts.Close()

	req := federation.ActionRequest{
		ActionID:    karmadaActionUnjoinCluster,
		Provider:    federation.ProviderKarmada,
		ClusterName: "old-cluster",
	}

	result, err := executeKarmadaUnjoinCluster(context.Background(), ts.cfg, req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.OK {
		t.Error("expected OK=true")
	}
	if result.Already {
		t.Error("expected Already=false for real delete")
	}
}

func TestKarmadaUnjoinCluster_AlreadyDeleted(t *testing.T) {
	ts := newActionTestServer(t, map[string]actionResponse{})
	defer ts.Close()

	req := federation.ActionRequest{
		ActionID:    karmadaActionUnjoinCluster,
		Provider:    federation.ProviderKarmada,
		ClusterName: "gone-cluster",
	}

	result, err := executeKarmadaUnjoinCluster(context.Background(), ts.cfg, req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.OK || !result.Already {
		t.Error("expected OK=true, Already=true for already-deleted cluster")
	}
}

func TestKarmadaUnjoinCluster_MissingClusterName(t *testing.T) {
	ts := newActionTestServer(t, map[string]actionResponse{})
	defer ts.Close()

	req := federation.ActionRequest{
		ActionID: karmadaActionUnjoinCluster,
	}

	_, err := executeKarmadaUnjoinCluster(context.Background(), ts.cfg, req)
	if err == nil {
		t.Error("expected error for missing clusterName")
	}
}

// ---------------------------------------------------------------------------
// executeKarmadaTaintCluster
// ---------------------------------------------------------------------------

func TestKarmadaTaintCluster_Success(t *testing.T) {
	const clusterPath = "/apis/cluster.karmada.io/v1alpha1/clusters/prod-eu"
	ts := newActionTestServer(t, map[string]actionResponse{
		"GET " + clusterPath: ok200(map[string]interface{}{
			"apiVersion": "cluster.karmada.io/v1alpha1",
			"kind":       "Cluster",
			"metadata":   map[string]interface{}{"name": "prod-eu"},
			"spec":       map[string]interface{}{},
		}),
		"PATCH " + clusterPath: ok200(map[string]interface{}{
			"apiVersion": "cluster.karmada.io/v1alpha1",
			"kind":       "Cluster",
			"metadata":   map[string]interface{}{"name": "prod-eu"},
		}),
	})
	defer ts.Close()

	req := federation.ActionRequest{
		ActionID:    karmadaActionTaintCluster,
		Provider:    federation.ProviderKarmada,
		ClusterName: "prod-eu",
		Payload: map[string]interface{}{
			"key":    "dedicated",
			"value":  "gpu-workloads",
			"effect": "NoSchedule",
		},
	}

	result, err := executeKarmadaTaintCluster(context.Background(), ts.cfg, req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.OK {
		t.Error("expected OK=true")
	}
	if result.Already {
		t.Error("expected Already=false for new taint")
	}
	if !ts.hasRequest("PATCH", "clusters/prod-eu") {
		t.Error("expected PATCH request to add taint")
	}
}

func TestKarmadaTaintCluster_AlreadyTainted(t *testing.T) {
	const clusterPath = "/apis/cluster.karmada.io/v1alpha1/clusters/prod-eu"
	ts := newActionTestServer(t, map[string]actionResponse{
		"GET " + clusterPath: ok200(map[string]interface{}{
			"apiVersion": "cluster.karmada.io/v1alpha1",
			"kind":       "Cluster",
			"metadata":   map[string]interface{}{"name": "prod-eu"},
			"spec": map[string]interface{}{
				"taints": []interface{}{
					map[string]interface{}{
						"key":    "dedicated",
						"value":  "gpu-workloads",
						"effect": "NoSchedule",
					},
				},
			},
		}),
	})
	defer ts.Close()

	req := federation.ActionRequest{
		ActionID:    karmadaActionTaintCluster,
		Provider:    federation.ProviderKarmada,
		ClusterName: "prod-eu",
		Payload: map[string]interface{}{
			"key":    "dedicated",
			"value":  "gpu-workloads",
			"effect": "NoSchedule",
		},
	}

	result, err := executeKarmadaTaintCluster(context.Background(), ts.cfg, req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.OK || !result.Already {
		t.Error("expected OK=true, Already=true for duplicate taint")
	}
	if ts.hasRequest("PATCH", "clusters") {
		t.Error("no PATCH expected when taint already exists")
	}
}

func TestKarmadaTaintCluster_MissingFields(t *testing.T) {
	ts := newActionTestServer(t, map[string]actionResponse{})
	defer ts.Close()

	tests := []struct {
		name    string
		payload map[string]interface{}
	}{
		{"missing key", map[string]interface{}{"value": "v", "effect": "NoSchedule"}},
		{"missing effect", map[string]interface{}{"key": "k", "value": "v"}},
		{"missing clusterName", map[string]interface{}{"key": "k", "effect": "NoSchedule"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			clusterName := "c1"
			if tt.name == "missing clusterName" {
				clusterName = ""
			}
			req := federation.ActionRequest{
				ActionID:    karmadaActionTaintCluster,
				ClusterName: clusterName,
				Payload:     tt.payload,
			}
			_, err := executeKarmadaTaintCluster(context.Background(), ts.cfg, req)
			if err == nil {
				t.Error("expected error for missing required field")
			}
		})
	}
}

func TestKarmadaTaintCluster_PatchConflict(t *testing.T) {
	const clusterPath = "/apis/cluster.karmada.io/v1alpha1/clusters/prod-eu"
	ts := newActionTestServer(t, map[string]actionResponse{
		"GET " + clusterPath: ok200(map[string]interface{}{
			"apiVersion": "cluster.karmada.io/v1alpha1",
			"kind":       "Cluster",
			"metadata":   map[string]interface{}{"name": "prod-eu"},
			"spec":       map[string]interface{}{},
		}),
		"PATCH " + clusterPath: conflict409(),
	})
	defer ts.Close()

	req := federation.ActionRequest{
		ActionID:    karmadaActionTaintCluster,
		Provider:    federation.ProviderKarmada,
		ClusterName: "prod-eu",
		Payload: map[string]interface{}{
			"key":    "maintenance",
			"value":  "true",
			"effect": "NoSchedule",
		},
	}

	result, err := executeKarmadaTaintCluster(context.Background(), ts.cfg, req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.OK || !result.Already {
		t.Error("expected OK=true, Already=true on conflict")
	}
}

// ---------------------------------------------------------------------------
// Karmada Execute dispatch
// ---------------------------------------------------------------------------

func TestKarmadaExecute_UnknownAction(t *testing.T) {
	p := &karmadaProvider{}
	_, err := p.Execute(context.Background(), nil, federation.ActionRequest{
		ActionID: "karmada.bogus",
	})
	if err == nil {
		t.Error("expected error for unknown action")
	}
}
