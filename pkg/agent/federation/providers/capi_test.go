package providers

import (
	"testing"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"

	"github.com/kubestellar/console/pkg/agent/federation"
)

func TestParseCAPICluster_Provisioned(t *testing.T) {
	obj := &unstructured.Unstructured{Object: map[string]interface{}{
		"metadata": map[string]interface{}{
			"name": "workload-prod-1",
			"labels": map[string]interface{}{
				"env": "prod",
			},
		},
		"spec": map[string]interface{}{
			"controlPlaneEndpoint": map[string]interface{}{
				"host": "10.0.0.1",
				"port": int64(6443),
			},
			"infrastructureRef": map[string]interface{}{
				"kind": "AWSCluster",
			},
		},
		"status": map[string]interface{}{
			"phase":               "Provisioned",
			"infrastructureReady": true,
			"conditions": []interface{}{
				map[string]interface{}{
					"type":   "ControlPlaneReady",
					"status": "True",
				},
			},
		},
	}}

	mdByCluster := map[string]capiMachineSummary{
		"workload-prod-1": {desired: 3, ready: 3},
	}
	kcpByCluster := map[string]bool{}

	fc := parseCAPICluster(obj, mdByCluster, kcpByCluster)

	if fc.Name != "workload-prod-1" {
		t.Errorf("expected name workload-prod-1, got %s", fc.Name)
	}
	if fc.Provider != federation.ProviderCAPI {
		t.Errorf("expected provider capi, got %s", fc.Provider)
	}
	if fc.State != federation.ClusterStateProvisioned {
		t.Errorf("expected state provisioned, got %s", fc.State)
	}
	if fc.Available != "True" {
		t.Errorf("expected available True, got %s", fc.Available)
	}
	if fc.APIServerURL != "https://10.0.0.1:6443" {
		t.Errorf("expected apiServerURL https://10.0.0.1:6443, got %s", fc.APIServerURL)
	}
	if fc.Lifecycle == nil {
		t.Fatal("expected lifecycle to be non-nil")
	}
	if fc.Lifecycle.Phase != "Provisioned" {
		t.Errorf("expected lifecycle phase Provisioned, got %s", fc.Lifecycle.Phase)
	}
	if !fc.Lifecycle.ControlPlaneReady {
		t.Error("expected controlPlaneReady true")
	}
	if !fc.Lifecycle.InfrastructureReady {
		t.Error("expected infrastructureReady true")
	}
	if fc.Lifecycle.DesiredMachines != 3 {
		t.Errorf("expected 3 desired machines, got %d", fc.Lifecycle.DesiredMachines)
	}
	if fc.Lifecycle.ReadyMachines != 3 {
		t.Errorf("expected 3 ready machines, got %d", fc.Lifecycle.ReadyMachines)
	}
}

func TestParseCAPICluster_Provisioning(t *testing.T) {
	obj := &unstructured.Unstructured{Object: map[string]interface{}{
		"metadata": map[string]interface{}{
			"name": "workload-staging",
		},
		"spec": map[string]interface{}{},
		"status": map[string]interface{}{
			"phase":               "Pending",
			"infrastructureReady": false,
		},
	}}

	fc := parseCAPICluster(obj, map[string]capiMachineSummary{}, map[string]bool{})

	if fc.State != federation.ClusterStateProvisioning {
		t.Errorf("expected state provisioning for Pending phase, got %s", fc.State)
	}
	if fc.Available != "Unknown" {
		t.Errorf("expected available Unknown, got %s", fc.Available)
	}
	if fc.Lifecycle == nil {
		t.Fatal("expected lifecycle to be non-nil")
	}
	if fc.Lifecycle.Phase != "Pending" {
		t.Errorf("expected lifecycle phase Pending, got %s", fc.Lifecycle.Phase)
	}
	if fc.Lifecycle.InfrastructureReady {
		t.Error("expected infrastructureReady false")
	}
}

func TestParseCAPICluster_Failed(t *testing.T) {
	obj := &unstructured.Unstructured{Object: map[string]interface{}{
		"metadata": map[string]interface{}{
			"name": "workload-broken",
		},
		"spec": map[string]interface{}{},
		"status": map[string]interface{}{
			"phase":               "Failed",
			"infrastructureReady": false,
		},
	}}

	fc := parseCAPICluster(obj, map[string]capiMachineSummary{}, map[string]bool{})

	if fc.State != federation.ClusterStateFailed {
		t.Errorf("expected state failed, got %s", fc.State)
	}
	if fc.Available != "False" {
		t.Errorf("expected available False, got %s", fc.Available)
	}
	if fc.Lifecycle.Phase != "Failed" {
		t.Errorf("expected lifecycle phase Failed, got %s", fc.Lifecycle.Phase)
	}
}

func TestCAPIInfraRefGrouping(t *testing.T) {
	aws := &unstructured.Unstructured{Object: map[string]interface{}{
		"metadata": map[string]interface{}{"name": "cluster-aws-1"},
		"spec": map[string]interface{}{
			"infrastructureRef": map[string]interface{}{"kind": "AWSCluster"},
		},
	}}
	docker := &unstructured.Unstructured{Object: map[string]interface{}{
		"metadata": map[string]interface{}{"name": "cluster-docker-1"},
		"spec": map[string]interface{}{
			"infrastructureRef": map[string]interface{}{"kind": "DockerCluster"},
		},
	}}

	if kind := capiInfraRefKind(aws); kind != "AWSCluster" {
		t.Errorf("expected AWSCluster, got %s", kind)
	}
	if kind := capiInfraRefKind(docker); kind != "DockerCluster" {
		t.Errorf("expected DockerCluster, got %s", kind)
	}
}

func TestCAPIProviderName(t *testing.T) {
	p := &capiProvider{}
	if p.Name() != federation.ProviderCAPI {
		t.Errorf("expected provider name 'capi', got '%s'", p.Name())
	}
}

func TestCAPIControlPlaneReady_FromKCP(t *testing.T) {
	// No conditions on the Cluster itself — should fall back to KCP index.
	obj := &unstructured.Unstructured{Object: map[string]interface{}{
		"metadata": map[string]interface{}{
			"name": "workload-kcp",
		},
		"spec":   map[string]interface{}{},
		"status": map[string]interface{}{},
	}}

	kcpByCluster := map[string]bool{"workload-kcp": true}
	ready := capiControlPlaneReady(obj, kcpByCluster)
	if !ready {
		t.Error("expected controlPlaneReady true from KCP fallback")
	}
}

func TestCAPIPhaseToState(t *testing.T) {
	cases := []struct {
		phase string
		want  federation.ClusterState
	}{
		{"Provisioning", federation.ClusterStateProvisioning},
		{"Pending", federation.ClusterStateProvisioning},
		{"Provisioned", federation.ClusterStateProvisioned},
		{"Failed", federation.ClusterStateFailed},
		{"Deleting", federation.ClusterStateDeleting},
		{"", federation.ClusterStateUnknown},
		{"SomethingNew", federation.ClusterStateUnknown},
	}
	for _, tc := range cases {
		got := capiPhaseToState(tc.phase)
		if got != tc.want {
			t.Errorf("capiPhaseToState(%q) = %q, want %q", tc.phase, got, tc.want)
		}
	}
}

func TestCAPIAPIServerURL(t *testing.T) {
	cases := []struct {
		name string
		obj  map[string]interface{}
		want string
	}{
		{
			name: "host and port",
			obj: map[string]interface{}{
				"spec": map[string]interface{}{
					"controlPlaneEndpoint": map[string]interface{}{
						"host": "10.0.0.1",
						"port": int64(6443),
					},
				},
			},
			want: "https://10.0.0.1:6443",
		},
		{
			name: "host only",
			obj: map[string]interface{}{
				"spec": map[string]interface{}{
					"controlPlaneEndpoint": map[string]interface{}{
						"host": "my-cluster.example.com",
					},
				},
			},
			want: "https://my-cluster.example.com",
		},
		{
			name: "empty",
			obj: map[string]interface{}{
				"spec": map[string]interface{}{},
			},
			want: "",
		},
	}
	for _, tc := range cases {
		u := &unstructured.Unstructured{Object: tc.obj}
		got := capiAPIServerURL(u)
		if got != tc.want {
			t.Errorf("%s: capiAPIServerURL() = %q, want %q", tc.name, got, tc.want)
		}
	}
}
