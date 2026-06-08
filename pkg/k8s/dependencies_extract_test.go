package k8s

import (
	"sort"
	"testing"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

func TestExtractPodTemplateSpec(t *testing.T) {
	t.Run("valid deployment structure", func(t *testing.T) {
		obj := &unstructured.Unstructured{Object: map[string]interface{}{
			"spec": map[string]interface{}{
				"template": map[string]interface{}{
					"spec": map[string]interface{}{
						"containers": []interface{}{
							map[string]interface{}{"name": "app", "image": "nginx"},
						},
					},
				},
			},
		}}
		podSpec, err := extractPodTemplateSpec(obj)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		containers, ok := podSpec["containers"].([]interface{})
		if !ok || len(containers) != 1 {
			t.Errorf("expected 1 container, got %v", podSpec["containers"])
		}
	})

	t.Run("missing spec", func(t *testing.T) {
		obj := &unstructured.Unstructured{Object: map[string]interface{}{}}
		_, err := extractPodTemplateSpec(obj)
		if err == nil {
			t.Fatal("expected error for missing spec")
		}
	})

	t.Run("missing template", func(t *testing.T) {
		obj := &unstructured.Unstructured{Object: map[string]interface{}{
			"spec": map[string]interface{}{},
		}}
		_, err := extractPodTemplateSpec(obj)
		if err == nil {
			t.Fatal("expected error for missing template")
		}
	})

	t.Run("missing template.spec", func(t *testing.T) {
		obj := &unstructured.Unstructured{Object: map[string]interface{}{
			"spec": map[string]interface{}{
				"template": map[string]interface{}{},
			},
		}}
		_, err := extractPodTemplateSpec(obj)
		if err == nil {
			t.Fatal("expected error for missing template.spec")
		}
	})
}

func TestExtractPodTemplateLabels(t *testing.T) {
	t.Run("labels present", func(t *testing.T) {
		obj := &unstructured.Unstructured{Object: map[string]interface{}{
			"spec": map[string]interface{}{
				"template": map[string]interface{}{
					"metadata": map[string]interface{}{
						"labels": map[string]interface{}{
							"app":     "nginx",
							"version": "v1",
						},
					},
				},
			},
		}}
		labels := extractPodTemplateLabels(obj)
		if labels["app"] != "nginx" || labels["version"] != "v1" {
			t.Errorf("unexpected labels: %v", labels)
		}
	})

	t.Run("no labels returns nil", func(t *testing.T) {
		obj := &unstructured.Unstructured{Object: map[string]interface{}{
			"spec": map[string]interface{}{},
		}}
		labels := extractPodTemplateLabels(obj)
		if labels != nil {
			t.Errorf("expected nil, got %v", labels)
		}
	})
}

func TestWalkContainerRefs(t *testing.T) {
	t.Run("env configMapKeyRef and secretKeyRef", func(t *testing.T) {
		containers := []interface{}{
			map[string]interface{}{
				"name": "app",
				"env": []interface{}{
					map[string]interface{}{
						"name": "DB_HOST",
						"valueFrom": map[string]interface{}{
							"configMapKeyRef": map[string]interface{}{
								"name": "db-config",
								"key":  "host",
							},
						},
					},
					map[string]interface{}{
						"name": "DB_PASSWORD",
						"valueFrom": map[string]interface{}{
							"secretKeyRef": map[string]interface{}{
								"name": "db-secret",
								"key":  "password",
							},
						},
					},
				},
			},
		}
		cms, secs := walkContainerRefs(containers)
		if !sliceContains(cms, "db-config") {
			t.Errorf("configMaps = %v, want to contain 'db-config'", cms)
		}
		if !sliceContains(secs, "db-secret") {
			t.Errorf("secrets = %v, want to contain 'db-secret'", secs)
		}
	})

	t.Run("envFrom configMapRef and secretRef", func(t *testing.T) {
		containers := []interface{}{
			map[string]interface{}{
				"name": "sidecar",
				"envFrom": []interface{}{
					map[string]interface{}{
						"configMapRef": map[string]interface{}{
							"name": "app-config",
						},
					},
					map[string]interface{}{
						"secretRef": map[string]interface{}{
							"name": "app-secrets",
						},
					},
				},
			},
		}
		cms, secs := walkContainerRefs(containers)
		if !sliceContains(cms, "app-config") {
			t.Errorf("configMaps = %v, want to contain 'app-config'", cms)
		}
		if !sliceContains(secs, "app-secrets") {
			t.Errorf("secrets = %v, want to contain 'app-secrets'", secs)
		}
	})

	t.Run("deduplicates references", func(t *testing.T) {
		containers := []interface{}{
			map[string]interface{}{
				"name": "app",
				"env": []interface{}{
					map[string]interface{}{
						"name":      "VAR1",
						"valueFrom": map[string]interface{}{"configMapKeyRef": map[string]interface{}{"name": "shared-cm", "key": "k1"}},
					},
					map[string]interface{}{
						"name":      "VAR2",
						"valueFrom": map[string]interface{}{"configMapKeyRef": map[string]interface{}{"name": "shared-cm", "key": "k2"}},
					},
				},
			},
		}
		cms, _ := walkContainerRefs(containers)
		if len(cms) != 1 {
			t.Errorf("expected 1 deduplicated configMap ref, got %d: %v", len(cms), cms)
		}
	})

	t.Run("empty containers", func(t *testing.T) {
		cms, secs := walkContainerRefs(nil)
		if len(cms) != 0 || len(secs) != 0 {
			t.Errorf("expected empty results, got cms=%v, secs=%v", cms, secs)
		}
	})

	t.Run("malformed container entries skipped", func(t *testing.T) {
		containers := []interface{}{
			"not-a-map",
			42,
			nil,
			map[string]interface{}{"name": "valid", "env": []interface{}{
				map[string]interface{}{
					"name":      "X",
					"valueFrom": map[string]interface{}{"configMapKeyRef": map[string]interface{}{"name": "found-it", "key": "k"}},
				},
			}},
		}
		cms, _ := walkContainerRefs(containers)
		if !sliceContains(cms, "found-it") {
			t.Errorf("expected to find 'found-it' despite malformed entries, got %v", cms)
		}
	})
}

func TestWalkVolumeRefs(t *testing.T) {
	t.Run("configMap volume", func(t *testing.T) {
		volumes := []interface{}{
			map[string]interface{}{
				"name":      "config-vol",
				"configMap": map[string]interface{}{"name": "app-config"},
			},
		}
		cms, _, _ := walkVolumeRefs(volumes)
		if !sliceContains(cms, "app-config") {
			t.Errorf("configMaps = %v, want 'app-config'", cms)
		}
	})

	t.Run("secret volume", func(t *testing.T) {
		volumes := []interface{}{
			map[string]interface{}{
				"name":   "tls-vol",
				"secret": map[string]interface{}{"secretName": "tls-cert"},
			},
		}
		_, secs, _ := walkVolumeRefs(volumes)
		if !sliceContains(secs, "tls-cert") {
			t.Errorf("secrets = %v, want 'tls-cert'", secs)
		}
	})

	t.Run("PVC volume", func(t *testing.T) {
		volumes := []interface{}{
			map[string]interface{}{
				"name":                  "data-vol",
				"persistentVolumeClaim": map[string]interface{}{"claimName": "data-pvc"},
			},
		}
		_, _, pvcs := walkVolumeRefs(volumes)
		if !sliceContains(pvcs, "data-pvc") {
			t.Errorf("pvcs = %v, want 'data-pvc'", pvcs)
		}
	})

	t.Run("projected volume with configMap and secret sources", func(t *testing.T) {
		volumes := []interface{}{
			map[string]interface{}{
				"name": "projected-vol",
				"projected": map[string]interface{}{
					"sources": []interface{}{
						map[string]interface{}{"configMap": map[string]interface{}{"name": "proj-cm"}},
						map[string]interface{}{"secret": map[string]interface{}{"name": "proj-sec"}},
					},
				},
			},
		}
		cms, secs, _ := walkVolumeRefs(volumes)
		if !sliceContains(cms, "proj-cm") {
			t.Errorf("configMaps = %v, want 'proj-cm'", cms)
		}
		if !sliceContains(secs, "proj-sec") {
			t.Errorf("secrets = %v, want 'proj-sec'", secs)
		}
	})

	t.Run("mixed volumes all types", func(t *testing.T) {
		volumes := []interface{}{
			map[string]interface{}{"name": "cm", "configMap": map[string]interface{}{"name": "my-cm"}},
			map[string]interface{}{"name": "sec", "secret": map[string]interface{}{"secretName": "my-sec"}},
			map[string]interface{}{"name": "pvc", "persistentVolumeClaim": map[string]interface{}{"claimName": "my-pvc"}},
			map[string]interface{}{"name": "empty", "emptyDir": map[string]interface{}{}},
		}
		cms, secs, pvcs := walkVolumeRefs(volumes)
		if !sliceContains(cms, "my-cm") {
			t.Errorf("missing my-cm in %v", cms)
		}
		if !sliceContains(secs, "my-sec") {
			t.Errorf("missing my-sec in %v", secs)
		}
		if !sliceContains(pvcs, "my-pvc") {
			t.Errorf("missing my-pvc in %v", pvcs)
		}
	})

	t.Run("empty volumes", func(t *testing.T) {
		cms, secs, pvcs := walkVolumeRefs(nil)
		if len(cms) != 0 || len(secs) != 0 || len(pvcs) != 0 {
			t.Errorf("expected empty, got cms=%v secs=%v pvcs=%v", cms, secs, pvcs)
		}
	})
}

func TestCollectServiceNames(t *testing.T) {
	t.Run("filters only services", func(t *testing.T) {
		deps := []Dependency{
			{Kind: DepService, Name: "frontend-svc"},
			{Kind: DepConfigMap, Name: "app-config"},
			{Kind: DepService, Name: "backend-svc"},
			{Kind: DepSecret, Name: "tls-cert"},
		}
		names := collectServiceNames(deps)
		sort.Strings(names)
		if len(names) != 2 || names[0] != "backend-svc" || names[1] != "frontend-svc" {
			t.Errorf("expected [backend-svc frontend-svc], got %v", names)
		}
	})

	t.Run("no services", func(t *testing.T) {
		deps := []Dependency{
			{Kind: DepConfigMap, Name: "cm"},
		}
		names := collectServiceNames(deps)
		if len(names) != 0 {
			t.Errorf("expected empty, got %v", names)
		}
	})

	t.Run("empty deps", func(t *testing.T) {
		names := collectServiceNames(nil)
		if names != nil {
			t.Errorf("expected nil, got %v", names)
		}
	})
}

func TestGetSlice(t *testing.T) {
	t.Run("key exists with slice value", func(t *testing.T) {
		m := map[string]interface{}{"items": []interface{}{"a", "b"}}
		got := getSlice(m, "items")
		if len(got) != 2 {
			t.Errorf("expected 2 items, got %d", len(got))
		}
	})

	t.Run("key missing returns nil", func(t *testing.T) {
		m := map[string]interface{}{"other": "value"}
		got := getSlice(m, "items")
		if got != nil {
			t.Errorf("expected nil, got %v", got)
		}
	})

	t.Run("key exists but not a slice", func(t *testing.T) {
		m := map[string]interface{}{"items": "not-a-slice"}
		got := getSlice(m, "items")
		if got != nil {
			t.Errorf("expected nil for non-slice value, got %v", got)
		}
	})
}

func sliceContains(s []string, target string) bool {
	for _, v := range s {
		if v == target {
			return true
		}
	}
	return false
}
