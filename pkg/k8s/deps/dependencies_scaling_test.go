package k8s

import (
	"context"
	"testing"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	dynamicfake "k8s.io/client-go/dynamic/fake"
)

var scalingGVRListKinds = map[schema.GroupVersionResource]string{
	gvrHPAs: "HorizontalPodAutoscalerList",
	gvrPDBs: "PodDisruptionBudgetList",
}

func TestFindMatchingHPAs(t *testing.T) {
	scheme := runtime.NewScheme()

	tests := []struct {
		name         string
		hpas         []unstructured.Unstructured
		workloadName string
		workloadKind string
		wantCount    int
		wantName     string
	}{
		{
			name:         "no HPAs exist",
			hpas:         nil,
			workloadName: "my-deploy",
			workloadKind: "Deployment",
			wantCount:    0,
		},
		{
			name: "HPA targets the workload",
			hpas: []unstructured.Unstructured{
				makeHPA("my-hpa", "default", "Deployment", "my-deploy"),
			},
			workloadName: "my-deploy",
			workloadKind: "Deployment",
			wantCount:    1,
			wantName:     "my-hpa",
		},
		{
			name: "HPA targets a different workload",
			hpas: []unstructured.Unstructured{
				makeHPA("other-hpa", "default", "Deployment", "other-deploy"),
			},
			workloadName: "my-deploy",
			workloadKind: "Deployment",
			wantCount:    0,
		},
		{
			name: "HPA targets same name but different kind",
			hpas: []unstructured.Unstructured{
				makeHPA("ss-hpa", "default", "StatefulSet", "my-deploy"),
			},
			workloadName: "my-deploy",
			workloadKind: "Deployment",
			wantCount:    0,
		},
		{
			name: "multiple HPAs - only matching returned",
			hpas: []unstructured.Unstructured{
				makeHPA("hpa-1", "default", "Deployment", "my-deploy"),
				makeHPA("hpa-2", "default", "Deployment", "other"),
				makeHPA("hpa-3", "default", "Deployment", "my-deploy"),
			},
			workloadName: "my-deploy",
			workloadKind: "Deployment",
			wantCount:    2,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			var objs []runtime.Object
			for i := range tc.hpas {
				objs = append(objs, &tc.hpas[i])
			}

			fakeDyn := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(scheme, scalingGVRListKinds, objs...)
			m, _ := NewMultiClusterClient("")
			m.InjectDynamicClient("c1", fakeDyn)

			workload := &unstructured.Unstructured{
				Object: map[string]interface{}{
					"apiVersion": "apps/v1",
					"kind":       tc.workloadKind,
					"metadata": map[string]interface{}{
						"name":      tc.workloadName,
						"namespace": "default",
					},
				},
			}

			deps := m.findMatchingHPAs(context.Background(), "c1", "default", workload)

			if len(deps) != tc.wantCount {
				t.Fatalf("expected %d deps, got %d", tc.wantCount, len(deps))
			}
			if tc.wantCount > 0 && tc.wantName != "" {
				if deps[0].Name != tc.wantName {
					t.Errorf("expected dep name %q, got %q", tc.wantName, deps[0].Name)
				}
				if deps[0].Kind != DepHPA {
					t.Errorf("expected kind %q, got %q", DepHPA, deps[0].Kind)
				}
			}
		})
	}
}

func TestFindMatchingHPAs_NoDynamicClient(t *testing.T) {
	m, _ := NewMultiClusterClient("")

	workload := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "apps/v1",
			"kind":       "Deployment",
			"metadata": map[string]interface{}{
				"name":      "my-deploy",
				"namespace": "default",
			},
		},
	}

	deps := m.findMatchingHPAs(context.Background(), "nonexistent", "default", workload)
	if len(deps) != 0 {
		t.Fatalf("expected 0 deps for missing cluster, got %d", len(deps))
	}
}

func TestFindMatchingPDBs(t *testing.T) {
	scheme := runtime.NewScheme()

	tests := []struct {
		name      string
		pdbs      []unstructured.Unstructured
		podLabels map[string]string
		wantCount int
		wantName  string
	}{
		{
			name:      "no PDBs exist",
			pdbs:      nil,
			podLabels: map[string]string{"app": "web"},
			wantCount: 0,
		},
		{
			name: "PDB selector matches pod labels",
			pdbs: []unstructured.Unstructured{
				makePDB("my-pdb", "default", map[string]interface{}{"app": "web"}),
			},
			podLabels: map[string]string{"app": "web", "version": "v1"},
			wantCount: 1,
			wantName:  "my-pdb",
		},
		{
			name: "PDB selector does not match",
			pdbs: []unstructured.Unstructured{
				makePDB("other-pdb", "default", map[string]interface{}{"app": "api"}),
			},
			podLabels: map[string]string{"app": "web"},
			wantCount: 0,
		},
		{
			name: "PDB with empty selector is skipped",
			pdbs: []unstructured.Unstructured{
				makePDB("empty-pdb", "default", map[string]interface{}{}),
			},
			podLabels: map[string]string{"app": "web"},
			wantCount: 0,
		},
		{
			name: "multiple PDBs - only matching returned",
			pdbs: []unstructured.Unstructured{
				makePDB("pdb-1", "default", map[string]interface{}{"app": "web"}),
				makePDB("pdb-2", "default", map[string]interface{}{"app": "api"}),
				makePDB("pdb-3", "default", map[string]interface{}{"app": "web", "tier": "frontend"}),
			},
			podLabels: map[string]string{"app": "web", "tier": "frontend"},
			wantCount: 2,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			var objs []runtime.Object
			for i := range tc.pdbs {
				objs = append(objs, &tc.pdbs[i])
			}

			fakeDyn := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(scheme, scalingGVRListKinds, objs...)
			m, _ := NewMultiClusterClient("")
			m.InjectDynamicClient("c1", fakeDyn)

			deps := m.findMatchingPDBs(context.Background(), "c1", "default", tc.podLabels)

			if len(deps) != tc.wantCount {
				t.Fatalf("expected %d deps, got %d", tc.wantCount, len(deps))
			}
			if tc.wantCount > 0 && tc.wantName != "" {
				if deps[0].Name != tc.wantName {
					t.Errorf("expected dep name %q, got %q", tc.wantName, deps[0].Name)
				}
				if deps[0].Kind != DepPDB {
					t.Errorf("expected kind %q, got %q", DepPDB, deps[0].Kind)
				}
			}
		})
	}
}

func TestFindMatchingPDBs_NoDynamicClient(t *testing.T) {
	m, _ := NewMultiClusterClient("")

	deps := m.findMatchingPDBs(context.Background(), "nonexistent", "default", map[string]string{"app": "web"})
	if len(deps) != 0 {
		t.Fatalf("expected 0 deps for missing cluster, got %d", len(deps))
	}
}

// --- helpers ---

func makeHPA(name, namespace, targetKind, targetName string) unstructured.Unstructured {
	return unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "autoscaling/v2",
			"kind":       "HorizontalPodAutoscaler",
			"metadata": map[string]interface{}{
				"name":      name,
				"namespace": namespace,
			},
			"spec": map[string]interface{}{
				"scaleTargetRef": map[string]interface{}{
					"kind": targetKind,
					"name": targetName,
				},
			},
		},
	}
}

func makePDB(name, namespace string, matchLabels map[string]interface{}) unstructured.Unstructured {
	return unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "policy/v1",
			"kind":       "PodDisruptionBudget",
			"metadata": map[string]interface{}{
				"name":      name,
				"namespace": namespace,
			},
			"spec": map[string]interface{}{
				"selector": map[string]interface{}{
					"matchLabels": matchLabels,
				},
			},
		},
	}
}
