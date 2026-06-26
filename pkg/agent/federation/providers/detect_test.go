package providers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"k8s.io/client-go/rest"
)

// fakeAPIServer returns a test HTTP server that responds to k8s-style
// List requests. The handler map keys are URL paths; values are the JSON
// response bodies to return.
func fakeAPIServer(t *testing.T, responses map[string]interface{}) (*httptest.Server, *rest.Config) {
	t.Helper()
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if resp, ok := responses[r.URL.Path]; ok {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(resp)
			return
		}
		// Return 404 with k8s-style error for unknown paths.
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"kind":    "Status",
			"status":  "Failure",
			"message": "the server could not find the requested resource",
			"reason":  "NotFound",
			"code":    404,
		})
	}))
	cfg := &rest.Config{Host: ts.URL}
	return ts, cfg
}

func TestCAPIDetect_Found(t *testing.T) {
	ts, cfg := fakeAPIServer(t, map[string]interface{}{
		"/apis/cluster.x-k8s.io/v1beta1/clusters": map[string]interface{}{
			"kind":       "ClusterList",
			"apiVersion": "cluster.x-k8s.io/v1beta1",
			"items":      []interface{}{},
		},
	})
	defer ts.Close()

	p := &capiProvider{}
	result, err := p.Detect(context.Background(), cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.Detected {
		t.Error("expected Detected=true")
	}
	if result.Version != "v1beta1" {
		t.Errorf("expected version v1beta1, got %s", result.Version)
	}
}

func TestCAPIDetect_NotFound(t *testing.T) {
	// No CAPI endpoint registered — all paths return 404.
	ts, cfg := fakeAPIServer(t, map[string]interface{}{})
	defer ts.Close()

	p := &capiProvider{}
	result, err := p.Detect(context.Background(), cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Detected {
		t.Error("expected Detected=false")
	}
}

func TestClusternetDetect_Found(t *testing.T) {
	ts, cfg := fakeAPIServer(t, map[string]interface{}{
		"/apis/clusters.clusternet.io/v1beta1/managedclusters": map[string]interface{}{
			"kind":       "ManagedClusterList",
			"apiVersion": "clusters.clusternet.io/v1beta1",
			"items":      []interface{}{},
		},
	})
	defer ts.Close()

	p := &clusternetProvider{}
	result, err := p.Detect(context.Background(), cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.Detected {
		t.Error("expected Detected=true")
	}
}

func TestClusternetDetect_NotFound(t *testing.T) {
	ts, cfg := fakeAPIServer(t, map[string]interface{}{})
	defer ts.Close()

	p := &clusternetProvider{}
	result, err := p.Detect(context.Background(), cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Detected {
		t.Error("expected Detected=false")
	}
}

func TestKarmadaDetect_Found(t *testing.T) {
	ts, cfg := fakeAPIServer(t, map[string]interface{}{
		"/apis/cluster.karmada.io/v1alpha1/clusters": map[string]interface{}{
			"kind":       "ClusterList",
			"apiVersion": "cluster.karmada.io/v1alpha1",
			"items":      []interface{}{},
		},
	})
	defer ts.Close()

	p := &karmadaProvider{}
	result, err := p.Detect(context.Background(), cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.Detected {
		t.Error("expected Detected=true")
	}
}

func TestKarmadaDetect_NotFound(t *testing.T) {
	ts, cfg := fakeAPIServer(t, map[string]interface{}{})
	defer ts.Close()

	p := &karmadaProvider{}
	result, err := p.Detect(context.Background(), cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Detected {
		t.Error("expected Detected=false")
	}
}

func TestOCMDetect_Found(t *testing.T) {
	ts, cfg := fakeAPIServer(t, map[string]interface{}{
		"/apis/cluster.open-cluster-management.io/v1/managedclusters": map[string]interface{}{
			"kind":       "ManagedClusterList",
			"apiVersion": "cluster.open-cluster-management.io/v1",
			"items":      []interface{}{},
		},
	})
	defer ts.Close()

	p := &ocmProvider{}
	result, err := p.Detect(context.Background(), cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.Detected {
		t.Error("expected Detected=true")
	}
}

func TestOCMDetect_NotFound(t *testing.T) {
	ts, cfg := fakeAPIServer(t, map[string]interface{}{})
	defer ts.Close()

	p := &ocmProvider{}
	result, err := p.Detect(context.Background(), cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Detected {
		t.Error("expected Detected=false")
	}
}

func TestKubeAdmiralDetect_Found(t *testing.T) {
	ts, cfg := fakeAPIServer(t, map[string]interface{}{
		"/apis/core.kubeadmiral.io/v1alpha1/federatedclusters": map[string]interface{}{
			"kind":       "FederatedClusterList",
			"apiVersion": "core.kubeadmiral.io/v1alpha1",
			"items":      []interface{}{},
		},
	})
	defer ts.Close()

	p := &kubeAdmiralProvider{}
	result, err := p.Detect(context.Background(), cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.Detected {
		t.Error("expected Detected=true")
	}
}

func TestKubeAdmiralDetect_NotFound(t *testing.T) {
	ts, cfg := fakeAPIServer(t, map[string]interface{}{})
	defer ts.Close()

	p := &kubeAdmiralProvider{}
	result, err := p.Detect(context.Background(), cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Detected {
		t.Error("expected Detected=false")
	}
}

func TestLiqoDetect_Found(t *testing.T) {
	ts, cfg := fakeAPIServer(t, map[string]interface{}{
		"/apis/discovery.liqo.io/v1alpha1/foreignclusters": map[string]interface{}{
			"kind":       "ForeignClusterList",
			"apiVersion": "discovery.liqo.io/v1alpha1",
			"items":      []interface{}{},
		},
	})
	defer ts.Close()

	p := &liqoProvider{}
	result, err := p.Detect(context.Background(), cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.Detected {
		t.Error("expected Detected=true")
	}
}

func TestLiqoDetect_NotFound(t *testing.T) {
	ts, cfg := fakeAPIServer(t, map[string]interface{}{})
	defer ts.Close()

	p := &liqoProvider{}
	result, err := p.Detect(context.Background(), cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Detected {
		t.Error("expected Detected=false")
	}
}

func TestCAPIReadClusters_ReturnsClusters(t *testing.T) {
	ts, cfg := fakeAPIServer(t, map[string]interface{}{
		"/apis/cluster.x-k8s.io/v1beta1/clusters": map[string]interface{}{
			"kind":       "ClusterList",
			"apiVersion": "cluster.x-k8s.io/v1beta1",
			"items": []interface{}{
				map[string]interface{}{
					"metadata": map[string]interface{}{
						"name": "prod-us-east",
						"labels": map[string]interface{}{
							"env": "production",
						},
					},
					"spec": map[string]interface{}{
						"controlPlaneEndpoint": map[string]interface{}{
							"host": "10.0.1.1",
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
				},
			},
		},
		"/apis/cluster.x-k8s.io/v1beta1/machinedeployments": map[string]interface{}{
			"kind":  "MachineDeploymentList",
			"items": []interface{}{},
		},
		"/apis/controlplane.cluster.x-k8s.io/v1beta1/kubeadmcontrolplanes": map[string]interface{}{
			"kind":  "KubeadmControlPlaneList",
			"items": []interface{}{},
		},
	})
	defer ts.Close()

	p := &capiProvider{}
	clusters, err := p.ReadClusters(context.Background(), cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(clusters) != 1 {
		t.Fatalf("expected 1 cluster, got %d", len(clusters))
	}
	c := clusters[0]
	if c.Name != "prod-us-east" {
		t.Errorf("expected name prod-us-east, got %s", c.Name)
	}
	if c.APIServerURL != "https://10.0.1.1:6443" {
		t.Errorf("expected API URL https://10.0.1.1:6443, got %s", c.APIServerURL)
	}
	if c.State != "provisioned" {
		t.Errorf("expected state provisioned, got %s", c.State)
	}
}

func TestCAPIReadClusters_GroupNotFound(t *testing.T) {
	// No CAPI endpoints → should return nil, nil (graceful).
	ts, cfg := fakeAPIServer(t, map[string]interface{}{})
	defer ts.Close()

	p := &capiProvider{}
	clusters, err := p.ReadClusters(context.Background(), cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if clusters != nil {
		t.Errorf("expected nil clusters, got %v", clusters)
	}
}

func TestCAPIReadGroups_ReturnGroups(t *testing.T) {
	ts, cfg := fakeAPIServer(t, map[string]interface{}{
		"/apis/cluster.x-k8s.io/v1beta1/clusters": map[string]interface{}{
			"kind":       "ClusterList",
			"apiVersion": "cluster.x-k8s.io/v1beta1",
			"items": []interface{}{
				map[string]interface{}{
					"metadata": map[string]interface{}{"name": "c1"},
					"spec": map[string]interface{}{
						"infrastructureRef": map[string]interface{}{"kind": "AWSCluster"},
					},
					"status": map[string]interface{}{"phase": "Provisioned"},
				},
				map[string]interface{}{
					"metadata": map[string]interface{}{"name": "c2"},
					"spec": map[string]interface{}{
						"infrastructureRef": map[string]interface{}{"kind": "AWSCluster"},
					},
					"status": map[string]interface{}{"phase": "Provisioning"},
				},
				map[string]interface{}{
					"metadata": map[string]interface{}{"name": "c3"},
					"spec": map[string]interface{}{
						"infrastructureRef": map[string]interface{}{"kind": "GCPCluster"},
					},
					"status": map[string]interface{}{"phase": "Provisioned"},
				},
			},
		},
	})
	defer ts.Close()

	p := &capiProvider{}
	groups, err := p.ReadGroups(context.Background(), cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Should have 2 groups: capi:aws (2 clusters) and capi:gcp (1 cluster).
	if len(groups) < 2 {
		t.Fatalf("expected at least 2 groups, got %d", len(groups))
	}
	foundAWS, foundGCP := false, false
	for _, g := range groups {
		if g.Name == "capi:awscluster" {
			foundAWS = true
			if len(g.Members) != 2 {
				t.Errorf("capi:aws expected 2 clusters, got %d", len(g.Members))
			}
		}
		if g.Name == "capi:gcpcluster" {
			foundGCP = true
			if len(g.Members) != 1 {
				t.Errorf("capi:gcp expected 1 cluster, got %d", len(g.Members))
			}
		}
	}
	if !foundAWS {
		t.Error("missing capi:aws group")
	}
	if !foundGCP {
		t.Error("missing capi:gcp group")
	}
}
