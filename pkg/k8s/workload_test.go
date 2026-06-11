package k8s

import (
	"context"
	"fmt"
	"strings"
	"testing"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic/fake"
	k8sfake "k8s.io/client-go/kubernetes/fake"
	k8stesting "k8s.io/client-go/testing"
	"k8s.io/client-go/tools/clientcmd/api"
)

func TestResolveWorkloadDependencies(t *testing.T) {
	// Setup fake dynamic client with a Deployment
	deployObj := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "apps/v1",
			"kind":       "Deployment",
			"metadata": map[string]interface{}{
				"name":      "dep1",
				"namespace": "default",
			},
			"spec": map[string]interface{}{
				"replicas": int64(3),
				"template": map[string]interface{}{
					"spec": map[string]interface{}{
						"containers": []interface{}{
							map[string]interface{}{
								"name":  "c1",
								"image": "nginx",
								"env": []interface{}{
									map[string]interface{}{
										"name": "MY_ENV",
										"valueFrom": map[string]interface{}{
											"configMapKeyRef": map[string]interface{}{
												"name": "cm1",
												"key":  "foo",
											},
										},
									},
								},
							},
						},
					},
				},
			},
		},
	}

	cmObj := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "v1",
			"kind":       "ConfigMap",
			"metadata": map[string]interface{}{
				"name":      "cm1",
				"namespace": "default",
			},
		},
	}

	scheme := runtime.NewScheme()
	gvrMap := buildTestGVRMap()

	fakeDyn := fake.NewSimpleDynamicClientWithCustomListKinds(scheme, gvrMap, deployObj, cmObj)

	// Reactor to return empty lists for everything
	fakeDyn.PrependReactor("list", "*", func(action k8stesting.Action) (bool, runtime.Object, error) {
		gvr := action.GetResource()
		kind, ok := gvrMap[gvr]
		if !ok {
			kind = "List" // Fallback
		}
		return true, &unstructured.UnstructuredList{
			Object: map[string]interface{}{"kind": kind, "apiVersion": gvr.GroupVersion().String()},
			Items:  []unstructured.Unstructured{},
		}, nil
	})

	m, _ := NewMultiClusterClient("")
	m.rawConfig = &api.Config{Contexts: map[string]*api.Context{"c1": {Cluster: "cluster1"}}}
	m.dynamicClients["c1"] = fakeDyn

	kind, bundle, err := m.ResolveWorkloadDependencies(context.Background(), "c1", "default", "dep1")
	if err != nil {
		t.Fatalf("ResolveWorkloadDependencies failed: %v", err)
	}
	if kind != "Deployment" {
		t.Errorf("Expected Deployment, got %s", kind)
	}
	if bundle.Workload.GetName() != "dep1" {
		t.Errorf("Expected workload name dep1")
	}

	// cm1 should be in dependencies
	found := false
	for _, d := range bundle.Dependencies {
		if d.Kind == DepConfigMap && d.Name == "cm1" {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("Expected ConfigMap cm1 in dependencies")
	}

	// Test NotFound
	_, _, err = m.ResolveWorkloadDependencies(context.Background(), "c1", "default", "missing")
	if err == nil {
		t.Error("Expected error for missing workload")
	}
}

func TestListWorkloads(t *testing.T) {
	deployObj := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "apps/v1",
			"kind":       "Deployment",
			"metadata": map[string]interface{}{
				"name":              "dep1",
				"namespace":         "default",
				"creationTimestamp": time.Now().UTC().Format(time.RFC3339),
				"labels":            map[string]interface{}{"app": "nginx"},
			},
			"spec": map[string]interface{}{
				"replicas": int64(3),
				"template": map[string]interface{}{
					"spec": map[string]interface{}{
						"containers": []interface{}{
							map[string]interface{}{
								"name":  "c1",
								"image": "nginx",
							},
						},
					},
				},
			},
			"status": map[string]interface{}{
				"readyReplicas":     int64(3),
				"availableReplicas": int64(3),
			},
		},
	}

	stsObj := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "apps/v1",
			"kind":       "StatefulSet",
			"metadata": map[string]interface{}{
				"name":              "sts1",
				"namespace":         "default",
				"creationTimestamp": time.Now().UTC().Format(time.RFC3339),
				"labels":            map[string]interface{}{"app": "db"},
			},
			"spec": map[string]interface{}{
				"replicas": int64(2),
			},
			"status": map[string]interface{}{
				"readyReplicas": int64(2),
			},
		},
	}

	dsObj := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "apps/v1",
			"kind":       "DaemonSet",
			"metadata": map[string]interface{}{
				"name":              "ds1",
				"namespace":         "default",
				"creationTimestamp": time.Now().UTC().Format(time.RFC3339),
				"labels":            map[string]interface{}{"app": "monitor"},
			},
			"status": map[string]interface{}{
				"desiredNumberScheduled": int64(5),
				"numberReady":            int64(5),
			},
		},
	}

	// Also add a deployment in a different namespace for filtering
	deployKube := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "apps/v1",
			"kind":       "Deployment",
			"metadata": map[string]interface{}{
				"name":              "coredns",
				"namespace":         "kube-system",
				"creationTimestamp": time.Now().UTC().Format(time.RFC3339),
			},
			"spec": map[string]interface{}{
				"replicas": int64(1),
				"template": map[string]interface{}{
					"spec": map[string]interface{}{
						"containers": []interface{}{map[string]interface{}{"name": "c1", "image": "coredns"}},
					},
				},
			},
			"status": map[string]interface{}{
				"readyReplicas":     int64(1),
				"availableReplicas": int64(1),
			},
		},
	}

	scheme := runtime.NewScheme()
	gvrMap := map[schema.GroupVersionResource]string{
		{Group: "apps", Version: "v1", Resource: "deployments"}:  "DeploymentList",
		{Group: "apps", Version: "v1", Resource: "statefulsets"}: "StatefulSetList",
		{Group: "apps", Version: "v1", Resource: "daemonsets"}:   "DaemonSetList",
	}

	// We need a reactor that returns the object for LIST operations
	fakeDyn := fake.NewSimpleDynamicClientWithCustomListKinds(scheme, gvrMap, deployObj, stsObj, dsObj, deployKube)
	fakeDyn.PrependReactor("list", "*", func(action k8stesting.Action) (bool, runtime.Object, error) {
		gvr := action.GetResource()
		la := action.(k8stesting.ListAction)
		ns := la.GetNamespace()

		if gvr.Resource == "deployments" {
			items := []unstructured.Unstructured{}
			if ns == "" || ns == "default" {
				items = append(items, *deployObj)
			}
			if ns == "" || ns == "kube-system" {
				items = append(items, *deployKube)
			}
			return true, &unstructured.UnstructuredList{
				Object: map[string]interface{}{"kind": "DeploymentList", "apiVersion": "apps/v1"},
				Items:  items,
			}, nil
		}
		if gvr.Resource == "statefulsets" {
			items := []unstructured.Unstructured{}
			if ns == "" || ns == "default" {
				items = append(items, *stsObj)
			}
			return true, &unstructured.UnstructuredList{
				Object: map[string]interface{}{"kind": "StatefulSetList", "apiVersion": "apps/v1"},
				Items:  items,
			}, nil
		}
		if gvr.Resource == "daemonsets" {
			items := []unstructured.Unstructured{}
			if ns == "" || ns == "default" {
				items = append(items, *dsObj)
			}
			return true, &unstructured.UnstructuredList{
				Object: map[string]interface{}{"kind": "DaemonSetList", "apiVersion": "apps/v1"},
				Items:  items,
			}, nil
		}
		return true, &unstructured.UnstructuredList{Items: []unstructured.Unstructured{}}, nil
	})

	m, _ := NewMultiClusterClient("")
	m.rawConfig = &api.Config{Contexts: map[string]*api.Context{"c1": {Cluster: "cluster1"}}}
	m.dynamicClients["c1"] = fakeDyn
	m.clients["c1"] = k8sfake.NewSimpleClientset() // safe inject, not nil

	// Test List all in default namespace
	wls, err := m.ListWorkloads(context.Background(), "", "default", "")
	if err != nil {
		t.Fatalf("ListWorkloads failed: %v", err)
	}
	if wls.TotalCount != 3 {
		t.Errorf("Expected 3 workloads, got %d", wls.TotalCount)
	}

	// Sort logic validation (order might vary, so we check for existence)
	foundSts := false
	foundDs := false
	for _, w := range wls.Items {
		if w.Name == "sts1" && w.Type == "StatefulSet" {
			foundSts = true
		}
		if w.Name == "ds1" && w.Type == "DaemonSet" {
			foundDs = true
		}
	}
	if !foundSts {
		t.Error("Expected sts1 StatefulSet")
	}
	if !foundDs {
		t.Error("Expected ds1 DaemonSet")
	}

	// Test GetWorkload
	wl, err := m.GetWorkload(context.Background(), "c1", "default", "sts1")
	if err != nil {
		t.Fatalf("GetWorkload failed: %v", err)
	}
	if wl == nil {
		t.Fatal("Expected sts1 workload, got nil")
	}
	if wl.Name != "sts1" {
		t.Errorf("Expected sts1, got %s", wl.Name)
	}

	// Test filtering by cluster
	wls, err = m.ListWorkloads(context.Background(), "c1", "default", "")
	if err != nil {
		t.Fatalf("ListWorkloads specific cluster failed: %v", err)
	}
	if wls.TotalCount != 3 {
		t.Errorf("Expected 3 workloads, got %d", wls.TotalCount)
	}
}

func TestListWorkloadsForCluster(t *testing.T) {
	scheme := runtime.NewScheme()
	gvrMap := map[schema.GroupVersionResource]string{
		{Group: "apps", Version: "v1", Resource: "deployments"}:  "DeploymentList",
		{Group: "apps", Version: "v1", Resource: "statefulsets"}: "StatefulSetList",
		{Group: "apps", Version: "v1", Resource: "daemonsets"}:   "DaemonSetList",
	}

	deployDefault := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "apps/v1", "kind": "Deployment",
			"metadata": map[string]interface{}{
				"name": "dep1", "namespace": "default",
				"creationTimestamp": time.Now().UTC().Format(time.RFC3339),
			},
			"spec": map[string]interface{}{
				"replicas": int64(1),
				"template": map[string]interface{}{
					"spec": map[string]interface{}{
						"containers": []interface{}{map[string]interface{}{"name": "c", "image": "nginx"}},
					},
				},
			},
			"status": map[string]interface{}{"readyReplicas": int64(1), "availableReplicas": int64(1)},
		},
	}

	stsDefault := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "apps/v1", "kind": "StatefulSet",
			"metadata": map[string]interface{}{
				"name": "sts1", "namespace": "default",
				"creationTimestamp": time.Now().UTC().Format(time.RFC3339),
			},
			"spec":   map[string]interface{}{"replicas": int64(1)},
			"status": map[string]interface{}{"readyReplicas": int64(1)},
		},
	}

	tests := []struct {
		name         string
		namespace    string
		workloadType string
		wantCount    int
	}{
		{"All types, default ns", "default", "", 2},
		{"Deployment only", "default", "Deployment", 1},
		{"StatefulSet only", "default", "StatefulSet", 1},
		{"DaemonSet only (none)", "default", "DaemonSet", 0},
		{"Non-existent namespace", "nonexistent", "", 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fakeDyn := fake.NewSimpleDynamicClientWithCustomListKinds(scheme, gvrMap, deployDefault, stsDefault)
			fakeDyn.PrependReactor("list", "*", func(action k8stesting.Action) (bool, runtime.Object, error) {
				gvr := action.GetResource()
				la := action.(k8stesting.ListAction)
				ns := la.GetNamespace()

				// Return objects only for "default" namespace
				if ns != "default" {
					kind := gvrMap[gvr]
					if kind == "" {
						kind = "List"
					}
					return true, &unstructured.UnstructuredList{
						Object: map[string]interface{}{"kind": kind, "apiVersion": gvr.GroupVersion().String()},
						Items:  []unstructured.Unstructured{},
					}, nil
				}

				switch gvr.Resource {
				case "deployments":
					return true, &unstructured.UnstructuredList{
						Object: map[string]interface{}{"kind": "DeploymentList", "apiVersion": "apps/v1"},
						Items:  []unstructured.Unstructured{*deployDefault},
					}, nil
				case "statefulsets":
					return true, &unstructured.UnstructuredList{
						Object: map[string]interface{}{"kind": "StatefulSetList", "apiVersion": "apps/v1"},
						Items:  []unstructured.Unstructured{*stsDefault},
					}, nil
				default:
					return true, &unstructured.UnstructuredList{
						Object: map[string]interface{}{"kind": gvrMap[gvr], "apiVersion": gvr.GroupVersion().String()},
						Items:  []unstructured.Unstructured{},
					}, nil
				}
			})

			m, _ := NewMultiClusterClient("")
			m.rawConfig = &api.Config{Contexts: map[string]*api.Context{"c1": {Cluster: "cluster1"}}}
			m.dynamicClients["c1"] = fakeDyn

			wls, err := m.ListWorkloadsForCluster(context.Background(), "c1", tt.namespace, tt.workloadType)
			if err != nil {
				t.Fatalf("ListWorkloadsForCluster failed: %v", err)
			}
			if len(wls) != tt.wantCount {
				t.Errorf("Expected %d workloads, got %d", tt.wantCount, len(wls))
			}
		})
	}
}

func TestDeployWorkload(t *testing.T) {
	deployObj := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "apps/v1",
			"kind":       "Deployment",
			"metadata": map[string]interface{}{
				"name":      "dep1",
				"namespace": "default",
				"labels":    map[string]interface{}{"app": "nginx"},
			},
			"spec": map[string]interface{}{
				"replicas": int64(1),
				"template": map[string]interface{}{
					"spec": map[string]interface{}{
						"containers": []interface{}{
							map[string]interface{}{
								"name":  "c1",
								"image": "nginx",
							},
						},
					},
				},
			},
		},
	}

	scheme := runtime.NewScheme()
	gvrMap := buildTestGVRMap()

	// Separate source and target clients
	sourceClient := fake.NewSimpleDynamicClientWithCustomListKinds(scheme, gvrMap, deployObj)
	sourceClient.PrependReactor("list", "*", func(action k8stesting.Action) (bool, runtime.Object, error) {
		gvr := action.GetResource()
		if gvr.Resource == "deployments" {
			return true, &unstructured.UnstructuredList{
				Object: map[string]interface{}{"kind": "DeploymentList", "apiVersion": "apps/v1"},
				Items:  []unstructured.Unstructured{*deployObj},
			}, nil
		}
		return true, &unstructured.UnstructuredList{Items: []unstructured.Unstructured{}}, nil
	})

	targetClient := fake.NewSimpleDynamicClientWithCustomListKinds(scheme, gvrMap)
	targetClient.PrependReactor("list", "*", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, &unstructured.UnstructuredList{Items: []unstructured.Unstructured{}}, nil
	})

	var createdObj *unstructured.Unstructured
	targetClient.PrependReactor("create", "*", func(action k8stesting.Action) (bool, runtime.Object, error) {
		createAction := action.(k8stesting.CreateAction)
		createdObj = createAction.GetObject().(*unstructured.Unstructured)
		return true, createdObj, nil
	})

	m, _ := NewMultiClusterClient("")
	m.rawConfig = &api.Config{Contexts: map[string]*api.Context{
		"src": {Cluster: "source"},
		"tgt": {Cluster: "target"},
	}}
	m.dynamicClients["src"] = sourceClient
	m.dynamicClients["tgt"] = targetClient

	opts := &DeployOptions{DeployedBy: "test-user"}
	resp, err := m.DeployWorkload(context.Background(), "src", "default", "dep1", []string{"tgt"}, 5, opts)
	if err != nil {
		t.Fatalf("DeployWorkload failed: %v", err)
	}
	if !resp.Success {
		t.Errorf("Expected success, fail msg: %v", resp.Message)
	}
	if len(resp.DeployedTo) != 1 || resp.DeployedTo[0] != "tgt" {
		t.Errorf("Expected deployed to tgt, got %v", resp.DeployedTo)
	}

	// Verify the object was created on the target
	if createdObj == nil {
		t.Fatal("Expected object to be created on target, got nil")
	}

	// Verify replicas override
	spec, ok := createdObj.Object["spec"].(map[string]interface{})
	if !ok {
		t.Fatal("Expected spec in created object")
	}
	if replicas, ok := spec["replicas"].(int64); !ok || replicas != 5 {
		t.Errorf("Expected replicas=5, got %v", spec["replicas"])
	}

	// Verify kubestellar.io/deployed-by label
	labels := createdObj.GetLabels()
	if labels == nil {
		t.Fatal("Expected labels on created object")
	}
	if labels["kubestellar.io/deployed-by"] != "test-user" {
		t.Errorf("Expected deployed-by=test-user, got %s", labels["kubestellar.io/deployed-by"])
	}
	if labels["kubestellar.io/managed-by"] != "kubestellar-console" {
		t.Errorf("Expected managed-by=kubestellar-console, got %s", labels["kubestellar.io/managed-by"])
	}

	// Verify source object was NOT mutated
	srcLabels := deployObj.GetLabels()
	if _, exists := srcLabels["kubestellar.io/deployed-by"]; exists {
		t.Error("Source object should not have been mutated with deployed-by label")
	}

	// Verify deployment exists only on target (source should still have original)
	gvr := schema.GroupVersionResource{Group: "apps", Version: "v1", Resource: "deployments"}
	_, srcErr := sourceClient.Resource(gvr).Namespace("default").Get(context.Background(), "dep1", metav1.GetOptions{})
	if srcErr != nil {
		t.Errorf("Source should still have dep1: %v", srcErr)
	}
}

func TestDeployWorkloadWithFailingDependency(t *testing.T) {
	deployObj := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "apps/v1",
			"kind":       "Deployment",
			"metadata": map[string]interface{}{
				"name":      "dep1",
				"namespace": "default",
				"labels":    map[string]interface{}{"app": "nginx"},
			},
			"spec": map[string]interface{}{
				"replicas": int64(1),
				"template": map[string]interface{}{
					"spec": map[string]interface{}{
						"containers": []interface{}{
							map[string]interface{}{
								"name":  "c1",
								"image": "nginx",
							},
						},
						"volumes": []interface{}{
							map[string]interface{}{
								"name": "vol1",
								"secret": map[string]interface{}{
									"secretName": "sec1",
								},
							},
						},
					},
				},
			},
		},
	}

	secObj := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "v1",
			"kind":       "Secret",
			"metadata": map[string]interface{}{
				"name":      "sec1",
				"namespace": "default",
			},
			"data": map[string]interface{}{},
		},
	}

	scheme := runtime.NewScheme()
	gvrMap := buildTestGVRMap()

	sourceClient := fake.NewSimpleDynamicClientWithCustomListKinds(scheme, gvrMap, deployObj, secObj)
	sourceClient.PrependReactor("list", "deployments", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, &unstructured.UnstructuredList{
			Object: map[string]interface{}{"kind": "DeploymentList", "apiVersion": "apps/v1"},
			Items:  []unstructured.Unstructured{*deployObj},
		}, nil
	})

	sourceClient.PrependReactor("get", "secrets", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, secObj, nil
	})

	targetClient := fake.NewSimpleDynamicClientWithCustomListKinds(scheme, gvrMap)

	// Make sure target client fails when creating the secret
	targetClient.PrependReactor("create", "secrets", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, fmt.Errorf("simulated admission webhook failure for secret")
	})

	m, _ := NewMultiClusterClient("")
	m.rawConfig = &api.Config{Contexts: map[string]*api.Context{
		"src": {Cluster: "source"},
		"tgt": {Cluster: "target"},
	}}
	m.dynamicClients["src"] = sourceClient
	m.dynamicClients["tgt"] = targetClient

	opts := &DeployOptions{DeployedBy: "test-user"}
	resp, err := m.DeployWorkload(context.Background(), "src", "default", "dep1", []string{"tgt"}, 5, opts)
	if err != nil {
		t.Fatalf("DeployWorkload returned an error instead of handling partial failure: %v", err)
	}

	if resp.Success {
		t.Errorf("Expected failure because the dependency failed to deploy, got Success=true")
	}

	if len(resp.DeployedTo) > 0 {
		t.Errorf("Expected no successful deployment to target cluster, got %v", resp.DeployedTo)
	}

	if len(resp.FailedClusters) != 1 || resp.FailedClusters[0] != "tgt" {
		t.Errorf("Expected target cluster to be in FailedClusters, got %v", resp.FailedClusters)
	}

	if !strings.Contains(resp.Message, "simulated admission webhook failure for secret") {
		t.Errorf("Expected error message to contain %q, got: %s", "simulated admission webhook failure for secret", resp.Message)
	}
}
