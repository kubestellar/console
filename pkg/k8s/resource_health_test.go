package k8s

import (
	"context"
	"testing"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/dynamic/fake"
	"k8s.io/client-go/tools/clientcmd/api"
)

func TestMonitorWorkload(t *testing.T) {
	scheme := runtime.NewScheme()
	gvrMap := buildTestGVRMap()

	// Add a ConfigMap reference to make sure we have dependencies
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
				"selector": map[string]interface{}{"matchLabels": map[string]interface{}{"app": "nginx"}},
				"template": map[string]interface{}{
					"metadata": map[string]interface{}{"labels": map[string]interface{}{"app": "nginx"}},
					"spec": map[string]interface{}{
						"containers": []interface{}{
							map[string]interface{}{
								"name":  "c1",
								"image": "nginx",
								"envFrom": []interface{}{
									map[string]interface{}{
										"configMapRef": map[string]interface{}{"name": "cm1"},
									},
								},
							},
						},
					},
				},
			},
			"status": map[string]interface{}{
				"replicas":          int64(1),
				"readyReplicas":     int64(1),
				"availableReplicas": int64(1),
				"updatedReplicas":   int64(1),
			},
		},
	}

	// Add the ConfigMap to the fake client
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

	// Add a Service that matches the deployment
	svcObj := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "v1",
			"kind":       "Service",
			"metadata": map[string]interface{}{
				"name":      "svc1",
				"namespace": "default",
			},
			"spec": map[string]interface{}{
				"selector": map[string]interface{}{"app": "nginx"},
			},
		},
	}

	fakeDyn := fake.NewSimpleDynamicClientWithCustomListKinds(scheme, gvrMap, deployObj, cmObj, svcObj)

	m, _ := NewMultiClusterClient("")
	m.dynamicClients["c1"] = fakeDyn
	m.rawConfig = &api.Config{Contexts: map[string]*api.Context{"c1": {Cluster: "cluster1"}}}

	// Test successful monitor
	res, err := m.MonitorWorkload(context.Background(), "c1", "default", "dep1")
	if err != nil {
		t.Fatalf("MonitorWorkload failed: %v", err)
	}

	if res.Status != "healthy" {
		t.Errorf("Expected healthy, got %s", res.Status)
	}
	if len(res.Resources) == 0 {
		t.Error("Expected resources")
	}
}

func TestMonitorWorkload_Unhealthy(t *testing.T) {
	scheme := runtime.NewScheme()
	gvrMap := buildTestGVRMap()

	// Deployment with issues (0/3 replicas)
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
				"replicas": int64(3),
				"selector": map[string]interface{}{"matchLabels": map[string]interface{}{"app": "nginx"}},
				"template": map[string]interface{}{
					"metadata": map[string]interface{}{"labels": map[string]interface{}{"app": "nginx"}},
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
				"replicas":          int64(3),
				"readyReplicas":     int64(0),
				"availableReplicas": int64(0),
			},
		},
	}

	// Create a service dependency that is also unhealthy (not found or whatever, but let's reliable trigger issue on deployment first)
	// Actually MonitorWorkload doesn't check the root object unless it adds itself to dependencies?
	// ResolveWorkloadDependencies returns dependencies.
	// If I want to trigger an issue, I need a dependency to fail check.
	// Let's add an explicit dependency that fails.
	// E.g. A Service with LoadBalancer type but no ingress IP.

	svcObj := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "v1",
			"kind":       "Service",
			"metadata": map[string]interface{}{
				"name":      "svc1",
				"namespace": "default",
			},
			"spec": map[string]interface{}{
				"type":     "LoadBalancer",
				"selector": map[string]interface{}{"app": "nginx"},
			},
			"status": map[string]interface{}{
				"loadBalancer": map[string]interface{}{},
			},
		},
	}

	fakeDyn := fake.NewSimpleDynamicClientWithCustomListKinds(scheme, gvrMap, deployObj, svcObj)

	m, _ := NewMultiClusterClient("")
	m.dynamicClients["c1"] = fakeDyn
	m.rawConfig = &api.Config{Contexts: map[string]*api.Context{"c1": {Cluster: "cluster1"}}}

	res, err := m.MonitorWorkload(context.Background(), "c1", "default", "dep1")
	if err != nil {
		t.Fatalf("MonitorWorkload failed: %v", err)
	}

	// Service should be degraded
	if res.Status == "healthy" {
		t.Error("Expected non-healthy status")
	}
	if len(res.Issues) == 0 {
		t.Error("Expected issues")
	}
}

func TestCheckResourceHealth_Variants(t *testing.T) {
	tests := []struct {
		kind string
		obj  map[string]interface{}
		want ResourceHealthStatus
	}{
		// Deployment — healthy requires updatedReplicas == replicas so a
		// mid-rollout (where old pods are still ready) is not reported
		// Healthy (#6511).
		{
			kind: "Deployment",
			obj: map[string]interface{}{
				"spec": map[string]interface{}{"replicas": int64(3)},
				"status": map[string]interface{}{
					"readyReplicas": int64(3), "availableReplicas": int64(3), "updatedReplicas": int64(3),
				},
			},
			want: "healthy",
		},
		{
			kind: "Deployment",
			obj: map[string]interface{}{
				"spec": map[string]interface{}{"replicas": int64(3)},
				"status": map[string]interface{}{
					"readyReplicas": int64(1), "availableReplicas": int64(1),
				},
			},
			want: "degraded",
		},

		// StatefulSet — fully rolled out (updatedReplicas == replicas,
		// revisions match)
		{
			kind: "StatefulSet",
			obj: map[string]interface{}{
				"spec": map[string]interface{}{"replicas": int64(3)},
				"status": map[string]interface{}{
					"readyReplicas":   int64(3),
					"updatedReplicas": int64(3),
					"currentRevision": "rev-2",
					"updateRevision":  "rev-2",
				},
			},
			want: "healthy",
		},
		// StatefulSet — healthy when updatedReplicas/revisions are absent
		// (older API servers that don't populate these fields)
		{
			kind: "StatefulSet",
			obj: map[string]interface{}{
				"spec": map[string]interface{}{"replicas": int64(3)},
				"status": map[string]interface{}{
					"readyReplicas": int64(3),
				},
			},
			want: "healthy",
		},
		// StatefulSet — rolling update: updatedReplicas < replicas (#10006)
		{
			kind: "StatefulSet",
			obj: map[string]interface{}{
				"spec": map[string]interface{}{"replicas": int64(3)},
				"status": map[string]interface{}{
					"readyReplicas":   int64(3),
					"updatedReplicas": int64(1),
					"currentRevision": "rev-1",
					"updateRevision":  "rev-2",
				},
			},
			want: "degraded",
		},
		// StatefulSet — revision mismatch even with all ready+updated
		{
			kind: "StatefulSet",
			obj: map[string]interface{}{
				"spec": map[string]interface{}{"replicas": int64(3)},
				"status": map[string]interface{}{
					"readyReplicas":   int64(3),
					"updatedReplicas": int64(3),
					"currentRevision": "rev-1",
					"updateRevision":  "rev-2",
				},
			},
			want: "degraded",
		},
		// StatefulSet — partial readiness
		{
			kind: "StatefulSet",
			obj: map[string]interface{}{
				"spec": map[string]interface{}{"replicas": int64(3)},
				"status": map[string]interface{}{
					"readyReplicas":   int64(2),
					"updatedReplicas": int64(2),
					"currentRevision": "rev-2",
					"updateRevision":  "rev-2",
				},
			},
			want: "degraded",
		},

		// DaemonSet
		{
			kind: "DaemonSet",
			obj: map[string]interface{}{
				"status": map[string]interface{}{
					"desiredNumberScheduled": int64(5), "numberReady": int64(5),
				},
			},
			want: "healthy",
		},
		{
			kind: "DaemonSet",
			obj: map[string]interface{}{
				"status": map[string]interface{}{
					"desiredNumberScheduled": int64(5), "numberReady": int64(3),
				},
			},
			want: "degraded",
		},

		// Service
		{
			kind: "Service",
			obj: map[string]interface{}{
				"spec": map[string]interface{}{"type": "ClusterIP"},
			},
			want: "healthy",
		},
		{
			kind: "Service",
			obj: map[string]interface{}{
				"spec": map[string]interface{}{"type": "LoadBalancer"},
				"status": map[string]interface{}{
					"loadBalancer": map[string]interface{}{
						"ingress": []interface{}{map[string]interface{}{"ip": "1.2.3.4"}},
					},
				},
			},
			want: "healthy",
		},
		{
			kind: "Service",
			obj: map[string]interface{}{
				"spec": map[string]interface{}{"type": "LoadBalancer"},
				"status": map[string]interface{}{
					"loadBalancer": map[string]interface{}{},
				},
			},
			want: "degraded",
		},

		// PVC
		{
			kind: "PersistentVolumeClaim",
			obj: map[string]interface{}{
				"status": map[string]interface{}{"phase": "Bound"},
			},
			want: "healthy",
		},
		{
			kind: "PersistentVolumeClaim",
			obj: map[string]interface{}{
				"status": map[string]interface{}{"phase": "Pending"},
			},
			want: "degraded",
		},
		{
			kind: "PersistentVolumeClaim",
			obj: map[string]interface{}{
				"status": map[string]interface{}{"phase": "Lost"},
			},
			want: "unhealthy",
		},

		// HPA
		{
			kind: "HorizontalPodAutoscaler",
			obj: map[string]interface{}{
				"status": map[string]interface{}{
					"currentReplicas": int64(5), "desiredReplicas": int64(5),
				},
			},
			want: "healthy",
		},
		{
			kind: "HorizontalPodAutoscaler",
			obj: map[string]interface{}{
				"status": map[string]interface{}{
					"currentReplicas": int64(3), "desiredReplicas": int64(5),
				},
			},
			want: "degraded",
		},

		// Unknown
		{
			kind: "ConfigMap",
			obj:  map[string]interface{}{},
			want: "healthy", // Default for unknown types
		},
	}

	for _, tt := range tests {
		t.Run(tt.kind, func(t *testing.T) {
			obj := &unstructured.Unstructured{Object: tt.obj}
			status, _ := CheckResourceHealth(tt.kind, obj)
			if status != tt.want {
				t.Errorf("CheckResourceHealth(%s) = %s, want %s", tt.kind, status, tt.want)
			}
		})
	}
}

func TestKindToCategory(t *testing.T) {
	tests := []struct {
		kind DependencyKind
		want ResourceCategory
	}{
		{DepService, CategoryNetworking},
		{DepIngress, CategoryNetworking},
		{DepNetworkPolicy, CategoryNetworking},
		{DepSecret, CategoryConfig},
		{DepConfigMap, CategoryConfig},
		{DepPVC, CategoryStorage},
		{DepServiceAccount, CategoryRBAC},
		{DepRole, CategoryRBAC},
		{DepRoleBinding, CategoryRBAC},
		{DepClusterRole, CategoryRBAC},
		{DepClusterRoleBinding, CategoryRBAC},
		{DepHPA, CategoryScaling},
		{DepPDB, CategoryScaling},
		{DependencyKind("Unknown"), CategoryOther},
	}

	for _, tt := range tests {
		got := kindToCategory(tt.kind)
		if got != tt.want {
			t.Errorf("kindToCategory(%s) = %s, want %s", tt.kind, got, tt.want)
		}
	}
}

func TestCalculateOverallStatus(t *testing.T) {
	tests := []struct {
		name      string
		resources []MonitoredResource
		want      ResourceHealthStatus
	}{
		{
			name:      "All healthy",
			resources: []MonitoredResource{{Status: HealthStatusHealthy}, {Status: HealthStatusHealthy}},
			want:      HealthStatusHealthy,
		},
		{
			name:      "Empty resources",
			resources: []MonitoredResource{},
			want:      HealthStatusHealthy,
		},
		{
			name:      "One degraded",
			resources: []MonitoredResource{{Status: HealthStatusHealthy}, {Status: HealthStatusDegraded}},
			want:      HealthStatusDegraded,
		},
		{
			name:      "One unhealthy (required)",
			resources: []MonitoredResource{{Status: HealthStatusHealthy}, {Status: HealthStatusUnhealthy, Optional: false}},
			want:      HealthStatusUnhealthy,
		},
		{
			name:      "Unhealthy takes precedence over degraded",
			resources: []MonitoredResource{{Status: HealthStatusDegraded}, {Status: HealthStatusUnhealthy}},
			want:      HealthStatusUnhealthy,
		},
		{
			name:      "Optional unhealthy ignored",
			resources: []MonitoredResource{{Status: HealthStatusHealthy}, {Status: HealthStatusUnhealthy, Optional: true}},
			want:      HealthStatusHealthy,
		},
		{
			name:      "Optional missing ignored",
			resources: []MonitoredResource{{Status: HealthStatusHealthy}, {Status: HealthStatusMissing, Optional: true}},
			want:      HealthStatusHealthy,
		},
		{
			name:      "Required missing = unhealthy",
			resources: []MonitoredResource{{Status: HealthStatusHealthy}, {Status: HealthStatusMissing, Optional: false}},
			want:      HealthStatusUnhealthy,
		},
		{
			name:      "Optional unhealthy + degraded = degraded",
			resources: []MonitoredResource{{Status: HealthStatusUnhealthy, Optional: true}, {Status: HealthStatusDegraded}},
			want:      HealthStatusDegraded,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := calculateOverallStatus(tt.resources)
			if got != tt.want {
				t.Errorf("calculateOverallStatus() = %s, want %s", got, tt.want)
			}
		})
	}
}
