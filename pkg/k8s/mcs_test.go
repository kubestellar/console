package k8s

import (
	"context"
	"fmt"
	"testing"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	dynamicfake "k8s.io/client-go/dynamic/fake"
	"k8s.io/client-go/kubernetes"
	typedfake "k8s.io/client-go/kubernetes/fake"
	k8stesting "k8s.io/client-go/testing"

	"github.com/kubestellar/console/pkg/api/v1alpha1"
)

func setupScheme() *runtime.Scheme {
	scheme := runtime.NewScheme()

	// Register ServiceExport types
	scheme.AddKnownTypeWithName(schema.GroupVersionKind{
		Group:   v1alpha1.ServiceExportGVR.Group,
		Version: v1alpha1.ServiceExportGVR.Version,
		Kind:    "ServiceExport",
	}, &unstructured.Unstructured{})
	scheme.AddKnownTypeWithName(schema.GroupVersionKind{
		Group:   v1alpha1.ServiceExportGVR.Group,
		Version: v1alpha1.ServiceExportGVR.Version,
		Kind:    "ServiceExportList",
	}, &unstructured.UnstructuredList{})

	// Register ServiceImport types
	scheme.AddKnownTypeWithName(schema.GroupVersionKind{
		Group:   v1alpha1.ServiceImportGVR.Group,
		Version: v1alpha1.ServiceImportGVR.Version,
		Kind:    "ServiceImport",
	}, &unstructured.Unstructured{})
	scheme.AddKnownTypeWithName(schema.GroupVersionKind{
		Group:   v1alpha1.ServiceImportGVR.Group,
		Version: v1alpha1.ServiceImportGVR.Version,
		Kind:    "ServiceImportList",
	}, &unstructured.UnstructuredList{})

	return scheme
}

func TestMCS_ListServiceExports(t *testing.T) {
	validExport := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "multicluster.x-k8s.io/v1alpha1",
			"kind":       "ServiceExport",
			"metadata": map[string]interface{}{
				"name":              "export1",
				"namespace":         "default",
				"creationTimestamp": "2024-01-01T00:00:00Z",
			},
			"status": map[string]interface{}{
				"conditions": []interface{}{
					map[string]interface{}{
						"type":   "Ready",
						"status": "True",
						"reason": "ServiceExported",
					},
				},
			},
		},
	}

	tests := []struct {
		name          string
		contextName   string
		setupClient   func(t *testing.T, client dynamic.Interface)
		expectedCount int
		validate      func(*testing.T, []v1alpha1.ServiceExport)
	}{
		{
			name:          "Empty list",
			contextName:   "c1",
			setupClient:   func(t *testing.T, c dynamic.Interface) {},
			expectedCount: 0,
		},
		{
			name:        "Valid export",
			contextName: "c1",
			setupClient: func(t *testing.T, c dynamic.Interface) {
				fakeC := c.(*dynamicfake.FakeDynamicClient)
				fakeC.PrependReactor("list", "*", func(action k8stesting.Action) (bool, runtime.Object, error) {
					if action.GetResource().Resource == "serviceexports" {
						return true, &unstructured.UnstructuredList{
							Object: map[string]interface{}{
								"apiVersion": "multicluster.x-k8s.io/v1alpha1",
								"kind":       "ServiceExportList",
							},
							Items: []unstructured.Unstructured{*validExport},
						}, nil
					}
					return false, nil, nil
				})
			},
			expectedCount: 1,
			validate: func(t *testing.T, exports []v1alpha1.ServiceExport) {
				if exports[0].Name != "export1" {
					t.Errorf("expected name export1, got %s", exports[0].Name)
				}
				if exports[0].Status != v1alpha1.ServiceExportStatusReady {
					t.Errorf("expected status Ready, got %s", exports[0].Status)
				}
			},
		},
		{
			name:        "CRD missing (List failure)",
			contextName: "c1",
			setupClient: func(t *testing.T, c dynamic.Interface) {
				fakeC := c.(*dynamicfake.FakeDynamicClient)
				fakeC.PrependReactor("list", "serviceexports", func(action k8stesting.Action) (bool, runtime.Object, error) {
					return true, nil, fmt.Errorf("the server could not find the requested resource")
				})
			},
			expectedCount: 0,
		},
		{
			name:        "Malformed object (missing name)",
			contextName: "c1",
			setupClient: func(t *testing.T, c dynamic.Interface) {
				fakeC := c.(*dynamicfake.FakeDynamicClient)
				fakeC.PrependReactor("list", "serviceexports", func(action k8stesting.Action) (bool, runtime.Object, error) {
					return true, &unstructured.UnstructuredList{
						Object: map[string]interface{}{
							"apiVersion": "multicluster.x-k8s.io/v1alpha1",
							"kind":       "ServiceExportList",
						},
						Items: []unstructured.Unstructured{
							{
								Object: map[string]interface{}{
									"apiVersion": "multicluster.x-k8s.io/v1alpha1",
									"kind":       "ServiceExport",
									// Missing metadata
								},
							},
						},
					}, nil
				})
			},
			expectedCount: 1,
			validate: func(t *testing.T, exports []v1alpha1.ServiceExport) {
				if exports[0].Name != "" {
					t.Errorf("expected empty name for malformed object, got %s", exports[0].Name)
				}
				if exports[0].Status != v1alpha1.ServiceExportStatusUnknown {
					t.Errorf("expected unknown status, got %s", exports[0].Status)
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			m, _ := NewMultiClusterClient("")

			// Setup fake clients
			scheme := setupScheme()
			fakeDyn := dynamicfake.NewSimpleDynamicClient(scheme)
			if tt.setupClient != nil {
				tt.setupClient(t, fakeDyn)
			}

			// Inject into m.dynamicClients
			m.dynamicClients = map[string]dynamic.Interface{
				tt.contextName: fakeDyn,
			}
			// Inject into m.clients to make the loop work
			m.clients = map[string]kubernetes.Interface{
				tt.contextName: typedfake.NewSimpleClientset(),
			}
			// After #6662, ListServiceExports iterates DeduplicatedClusters
			// rather than m.clients, so rawConfig must name the test cluster.
			injectTestClusters(m, tt.contextName)

			// Test ListServiceExports (global list)
			got, err := m.ListServiceExports(context.Background())
			if err != nil {
				t.Fatalf("ListServiceExports failed: %v", err)
			}
			if len(got.Items) != tt.expectedCount {
				t.Errorf("expected %d items, got %d", tt.expectedCount, len(got.Items))
			}
			if tt.validate != nil && len(got.Items) > 0 {
				tt.validate(t, got.Items)
			}

			// Test ListServiceExportsForCluster
			gotCluster, err := m.ListServiceExportsForCluster(context.Background(), tt.contextName, "")
			if err != nil {
				t.Fatalf("ListServiceExportsForCluster failed: %v", err)
			}
			if len(gotCluster) != tt.expectedCount {
				t.Errorf("cluster list expected %d items, got %d", tt.expectedCount, len(gotCluster))
			}
		})
	}
}

func TestMCS_ListServiceImports(t *testing.T) {
	validImport := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "multicluster.x-k8s.io/v1alpha1",
			"kind":       "ServiceImport",
			"metadata": map[string]interface{}{
				"name":              "import1",
				"namespace":         "default",
				"creationTimestamp": "2024-01-01T00:00:00Z",
			},
			"spec": map[string]interface{}{
				"type": "ClusterSetIP",
				"ports": []interface{}{
					map[string]interface{}{
						"name":     "http",
						"protocol": "TCP",
						"port":     int64(80),
					},
				},
			},
			"status": map[string]interface{}{
				"clusters": []interface{}{
					map[string]interface{}{
						"cluster": "source-cluster-1",
					},
				},
			},
		},
	}

	tests := []struct {
		name          string
		contextName   string
		setupClient   func(t *testing.T, client dynamic.Interface)
		expectedCount int
		validate      func(*testing.T, []v1alpha1.ServiceImport)
	}{
		{
			name:          "Empty list",
			contextName:   "c1",
			setupClient:   func(t *testing.T, c dynamic.Interface) {},
			expectedCount: 0,
		},
		{
			name:        "Valid import",
			contextName: "c1",
			setupClient: func(t *testing.T, c dynamic.Interface) {
				fakeC := c.(*dynamicfake.FakeDynamicClient)
				fakeC.PrependReactor("list", "serviceimports", func(action k8stesting.Action) (bool, runtime.Object, error) {
					return true, &unstructured.UnstructuredList{
						Object: map[string]interface{}{
							"apiVersion": "multicluster.x-k8s.io/v1alpha1",
							"kind":       "ServiceImportList",
						},
						Items: []unstructured.Unstructured{*validImport},
					}, nil
				})
			},
			expectedCount: 1,
			validate: func(t *testing.T, imports []v1alpha1.ServiceImport) {
				if imports[0].Name != "import1" {
					t.Errorf("expected name import1, got %s", imports[0].Name)
				}
				if imports[0].Type != v1alpha1.ServiceImportTypeClusterSetIP {
					t.Errorf("expected type ClusterSetIP, got %s", imports[0].Type)
				}
				if imports[0].SourceCluster != "source-cluster-1" {
					t.Errorf("expected source cluster 'source-cluster-1', got %s", imports[0].SourceCluster)
				}
				if len(imports[0].Ports) != 1 || imports[0].Ports[0].Port != 80 {
					t.Errorf("expected port 80, got %v", imports[0].Ports)
				}
			},
		},
		{
			name:        "CRD missing (List failure)",
			contextName: "c1",
			setupClient: func(t *testing.T, c dynamic.Interface) {
				fakeC := c.(*dynamicfake.FakeDynamicClient)
				fakeC.PrependReactor("list", "serviceimports", func(action k8stesting.Action) (bool, runtime.Object, error) {
					return true, nil, fmt.Errorf("the server could not find the requested resource")
				})
			},
			expectedCount: 0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			m, _ := NewMultiClusterClient("")

			scheme := setupScheme()
			fakeDyn := dynamicfake.NewSimpleDynamicClient(scheme)
			if tt.setupClient != nil {
				tt.setupClient(t, fakeDyn)
			}

			m.dynamicClients = map[string]dynamic.Interface{tt.contextName: fakeDyn}
			m.clients = map[string]kubernetes.Interface{tt.contextName: typedfake.NewSimpleClientset()}
			// After #6662, ListServiceImports iterates DeduplicatedClusters.
			injectTestClusters(m, tt.contextName)

			// Test ListServiceImports (global)
			got, err := m.ListServiceImports(context.Background())
			if err != nil {
				t.Fatalf("ListServiceImports failed: %v", err)
			}
			if len(got.Items) != tt.expectedCount {
				t.Errorf("expected %d items, got %d", tt.expectedCount, len(got.Items))
			}
			if tt.validate != nil && len(got.Items) > 0 {
				tt.validate(t, got.Items)
			}

			// Test ListServiceImportsForCluster
			gotCluster, err := m.ListServiceImportsForCluster(context.Background(), tt.contextName, "")
			if err != nil {
				t.Fatalf("ListServiceImportsForCluster failed: %v", err)
			}
			if len(gotCluster) != tt.expectedCount {
				t.Errorf("cluster list expected %d items, got %d", tt.expectedCount, len(gotCluster))
			}
		})
	}
}

func TestMCS_CreateServiceExport(t *testing.T) {
	scheme := setupScheme()
	fakeDyn := dynamicfake.NewSimpleDynamicClient(scheme)

	m, _ := NewMultiClusterClient("")
	m.dynamicClients = map[string]dynamic.Interface{"c1": fakeDyn}

	err := m.CreateServiceExport(context.Background(), "c1", "default", "svc1")
	if err != nil {
		t.Fatalf("CreateServiceExport failed: %v", err)
	}

	// Verify creation
	gvr := v1alpha1.ServiceExportGVR
	obj, err := fakeDyn.Resource(gvr).Namespace("default").Get(context.Background(), "svc1", metav1.GetOptions{})
	if err != nil {
		t.Fatalf("failed to get created ServiceExport: %v", err)
	}
	if obj.GetName() != "svc1" {
		t.Errorf("expected name svc1, got %s", obj.GetName())
	}
}

func TestMCS_DeleteServiceExport(t *testing.T) {
	scheme := setupScheme()
	fakeDyn := dynamicfake.NewSimpleDynamicClient(scheme)

	// Pre-create object
	export := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "multicluster.x-k8s.io/v1alpha1",
			"kind":       "ServiceExport",
			"metadata": map[string]interface{}{
				"name":      "svc1",
				"namespace": "default",
			},
		},
	}
	fakeDyn.Tracker().Add(export)

	m, _ := NewMultiClusterClient("")
	m.dynamicClients = map[string]dynamic.Interface{"c1": fakeDyn}

	err := m.DeleteServiceExport(context.Background(), "c1", "default", "svc1")
	if err != nil {
		t.Fatalf("DeleteServiceExport failed: %v", err)
	}

	// Verify deletion
	gvr := v1alpha1.ServiceExportGVR
	_, err = fakeDyn.Resource(gvr).Namespace("default").Get(context.Background(), "svc1", metav1.GetOptions{})
	if err == nil {
		t.Error("expected error getting deleted ServiceExport, got nil")
	}
}

func TestMCS_IsMCSAvailable(t *testing.T) {
	tests := []struct {
		name     string
		setup    func(*dynamicfake.FakeDynamicClient)
		expected bool
	}{
		{
			name: "Available (List works)",
			setup: func(c *dynamicfake.FakeDynamicClient) {
				// No reactor needed, list returns empty list by default (success)
			},
			expected: true,
		},
		{
			name: "Unavailable (List fails)",
			setup: func(c *dynamicfake.FakeDynamicClient) {
				c.PrependReactor("list", "serviceexports", func(action k8stesting.Action) (bool, runtime.Object, error) {
					return true, nil, fmt.Errorf("not found")
				})
			},
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			scheme := setupScheme()
			fakeDyn := dynamicfake.NewSimpleDynamicClient(scheme)
			if tt.setup != nil {
				tt.setup(fakeDyn)
			}

			m, _ := NewMultiClusterClient("")
			m.dynamicClients = map[string]dynamic.Interface{"c1": fakeDyn}

			if got := m.IsMCSAvailable(context.Background(), "c1"); got != tt.expected {
				t.Errorf("expected %v, got %v", tt.expected, got)
			}
		})
	}
}

func TestMCS_ParsePorts(t *testing.T) {
	// Directly test parsePorts via reflection or just via a detailed ListServiceImports test cases
	// Since parsePorts is unexported, we test it via ListServiceImports

	validImport := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "multicluster.x-k8s.io/v1alpha1",
			"kind":       "ServiceImport",
			"metadata": map[string]interface{}{
				"name":      "import1",
				"namespace": "default",
			},
			"spec": map[string]interface{}{
				"ports": []interface{}{
					map[string]interface{}{"port": int64(80), "protocol": "TCP"},
					map[string]interface{}{"port": float64(443), "protocol": "TCP"}, // Test float64 path
				},
			},
		},
	}

	scheme := setupScheme()
	fakeDyn := dynamicfake.NewSimpleDynamicClient(scheme)
	fakeDyn.PrependReactor("list", "serviceimports", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, &unstructured.UnstructuredList{
			Object: map[string]interface{}{
				"apiVersion": "multicluster.x-k8s.io/v1alpha1",
				"kind":       "ServiceImportList",
			},
			Items: []unstructured.Unstructured{*validImport},
		}, nil
	})

	m, _ := NewMultiClusterClient("")
	m.dynamicClients = map[string]dynamic.Interface{"c1": fakeDyn}
	m.clients = map[string]kubernetes.Interface{"c1": typedfake.NewSimpleClientset()}

	imports, err := m.ListServiceImportsForCluster(context.Background(), "c1", "default")
	if err != nil {
		t.Fatalf("ListServiceImportsForCluster failed: %v", err)
	}

	if len(imports) != 1 {
		t.Fatalf("expected 1 import")
	}
	if len(imports[0].Ports) != 2 {
		t.Errorf("expected 2 ports, got %d", len(imports[0].Ports))
	}
	if imports[0].Ports[0].Port != 80 {
		t.Errorf("expected port 80, got %d", imports[0].Ports[0].Port)
	}
	if imports[0].Ports[1].Port != 443 {
		t.Errorf("expected port 443, got %d", imports[0].Ports[1].Port)
	}
}

func TestMCS_ParseConditions(t *testing.T) {
	// Test condition parsing via ListServiceExports logic
	now := time.Now().Format(time.RFC3339)
	validExport := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "multicluster.x-k8s.io/v1alpha1",
			"kind":       "ServiceExport",
			"metadata": map[string]interface{}{
				"name":      "export1",
				"namespace": "default",
			},
			"status": map[string]interface{}{
				"conditions": []interface{}{
					map[string]interface{}{
						"type":               "Valid",
						"status":             "False",
						"lastTransitionTime": now,
					},
					map[string]interface{}{
						"type":   "Ready",
						"status": "False", // Should result in Failed status
					},
				},
			},
		},
	}

	scheme := setupScheme()
	fakeDyn := dynamicfake.NewSimpleDynamicClient(scheme)
	fakeDyn.PrependReactor("list", "serviceexports", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, &unstructured.UnstructuredList{
			Object: map[string]interface{}{
				"apiVersion": "multicluster.x-k8s.io/v1alpha1",
				"kind":       "ServiceExportList",
			},
			Items: []unstructured.Unstructured{*validExport},
		}, nil
	})

	m, _ := NewMultiClusterClient("")
	m.dynamicClients = map[string]dynamic.Interface{"c1": fakeDyn}
	m.clients = map[string]kubernetes.Interface{"c1": typedfake.NewSimpleClientset()}

	exports, err := m.ListServiceExportsForCluster(context.Background(), "c1", "default")
	if err != nil {
		t.Fatalf("ListServiceExportsForCluster failed: %v", err)
	}

	if len(exports) != 1 {
		t.Fatalf("expected 1 export")
	}
	if exports[0].Status != v1alpha1.ServiceExportStatusFailed {
		t.Errorf("expected Failed status (Ready=False), got %s", exports[0].Status)
	}
	if len(exports[0].Conditions) != 2 {
		t.Errorf("expected 2 conditions, got %d", len(exports[0].Conditions))
	}
}

func TestParsePorts_EdgeCases(t *testing.T) {
	tests := []struct {
		name      string
		ports     []interface{}
		wantCount int
		wantPort  int32
	}{
		{
			name: "int64 port",
			ports: []interface{}{
				map[string]interface{}{"port": int64(8080), "name": "http"},
			},
			wantCount: 1,
			wantPort:  8080,
		},
		{
			name: "float64 port",
			ports: []interface{}{
				map[string]interface{}{"port": float64(443), "name": "https"},
			},
			wantCount: 1,
			wantPort:  443,
		},
		{
			name: "unexpected port type (string) - skipped",
			ports: []interface{}{
				map[string]interface{}{"port": "not-a-number", "name": "broken"},
			},
			wantCount: 1,
			wantPort:  0, // port stays at zero default
		},
		{
			name: "non-map item - skipped",
			ports: []interface{}{
				"not-a-map",
				int64(42),
			},
			wantCount: 0,
		},
		{
			name:      "empty ports",
			ports:     []interface{}{},
			wantCount: 0,
		},
		{
			name: "port with appProtocol",
			ports: []interface{}{
				map[string]interface{}{
					"port":        int64(9090),
					"protocol":    "UDP",
					"appProtocol": "grpc",
					"name":        "metrics",
				},
			},
			wantCount: 1,
			wantPort:  9090,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := parsePorts(tt.ports)
			if len(result) != tt.wantCount {
				t.Errorf("expected %d ports, got %d", tt.wantCount, len(result))
			}
			if tt.wantCount > 0 && len(result) > 0 {
				if result[0].Port != tt.wantPort {
					t.Errorf("expected port %d, got %d", tt.wantPort, result[0].Port)
				}
			}
		})
	}
}

func TestDetermineServiceExportStatus_EdgeCases(t *testing.T) {
	tests := []struct {
		name       string
		conditions []v1alpha1.Condition
		want       v1alpha1.ServiceExportStatus
	}{
		{
			name:       "No conditions = Pending",
			conditions: []v1alpha1.Condition{},
			want:       v1alpha1.ServiceExportStatusPending,
		},
		{
			name: "Valid=True = Ready",
			conditions: []v1alpha1.Condition{
				{Type: "Valid", Status: "True"},
			},
			want: v1alpha1.ServiceExportStatusReady,
		},
		{
			name: "Ready=False = Failed",
			conditions: []v1alpha1.Condition{
				{Type: "Ready", Status: "False"},
			},
			want: v1alpha1.ServiceExportStatusFailed,
		},
		{
			name: "Non-matching condition types = Unknown",
			conditions: []v1alpha1.Condition{
				{Type: "Synced", Status: "True"},
				{Type: "Available", Status: "True"},
			},
			want: v1alpha1.ServiceExportStatusUnknown,
		},
		{
			name: "Valid with unknown status = Unknown",
			conditions: []v1alpha1.Condition{
				{Type: "Valid", Status: "Unknown"},
			},
			want: v1alpha1.ServiceExportStatusUnknown,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := determineServiceExportStatus(tt.conditions)
			if got != tt.want {
				t.Errorf("determineServiceExportStatus() = %s, want %s", got, tt.want)
			}
		})
	}
}

func TestParseServiceExportsFromList_NonUnstructuredList(t *testing.T) {
	// Test the fallback branch when input is not *unstructured.UnstructuredList
	m, _ := NewMultiClusterClient("")

	// Pass nil — should return empty and no error
	result, err := m.parseServiceExportsFromList(nil, "c1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result) != 0 {
		t.Errorf("expected 0 exports for nil input, got %d", len(result))
	}

	// Pass a string — should return empty and no error
	result, err = m.parseServiceExportsFromList("not-a-list", "c1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result) != 0 {
		t.Errorf("expected 0 exports for string input, got %d", len(result))
	}
}

func TestParseServiceImportsFromList_NonUnstructuredList(t *testing.T) {
	// Test the fallback branch when input is not *unstructured.UnstructuredList
	m, _ := NewMultiClusterClient("")

	result, err := m.parseServiceImportsFromList(nil, "c1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result) != 0 {
		t.Errorf("expected 0 imports for nil input, got %d", len(result))
	}

	result, err = m.parseServiceImportsFromList("not-a-list", "c1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result) != 0 {
		t.Errorf("expected 0 imports for string input, got %d", len(result))
	}
}
