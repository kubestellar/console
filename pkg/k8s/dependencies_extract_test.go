package k8s

import (
	"sort"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

// --- extractPodTemplateSpec tests ---

func TestExtractPodTemplateSpec_ValidDeployment(t *testing.T) {
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
	require.NoError(t, err)
	require.NotNil(t, podSpec)

	containers, ok := podSpec["containers"].([]interface{})
	assert.True(t, ok)
	assert.Len(t, containers, 1)
}

func TestExtractPodTemplateSpec_MissingSpec(t *testing.T) {
	obj := &unstructured.Unstructured{Object: map[string]interface{}{}}
	_, err := extractPodTemplateSpec(obj)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "no spec found")
}

func TestExtractPodTemplateSpec_MissingTemplate(t *testing.T) {
	obj := &unstructured.Unstructured{Object: map[string]interface{}{
		"spec": map[string]interface{}{},
	}}
	_, err := extractPodTemplateSpec(obj)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "no spec.template found")
}

func TestExtractPodTemplateSpec_MissingPodSpec(t *testing.T) {
	obj := &unstructured.Unstructured{Object: map[string]interface{}{
		"spec": map[string]interface{}{
			"template": map[string]interface{}{},
		},
	}}
	_, err := extractPodTemplateSpec(obj)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "no spec.template.spec found")
}

// --- extractPodTemplateLabels tests ---

func TestExtractPodTemplateLabels_Present(t *testing.T) {
	obj := &unstructured.Unstructured{Object: map[string]interface{}{
		"spec": map[string]interface{}{
			"template": map[string]interface{}{
				"metadata": map[string]interface{}{
					"labels": map[string]interface{}{
						"app": "web",
						"env": "prod",
					},
				},
			},
		},
	}}

	labels := extractPodTemplateLabels(obj)
	assert.Equal(t, "web", labels["app"])
	assert.Equal(t, "prod", labels["env"])
}

func TestExtractPodTemplateLabels_Missing(t *testing.T) {
	obj := &unstructured.Unstructured{Object: map[string]interface{}{}}
	labels := extractPodTemplateLabels(obj)
	assert.Nil(t, labels)
}

// --- walkContainerRefs tests ---

func TestWalkContainerRefs_EnvValueFrom(t *testing.T) {
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
					"name": "DB_PASS",
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
	assert.Contains(t, cms, "db-config")
	assert.Contains(t, secs, "db-secret")
}

func TestWalkContainerRefs_EnvFrom(t *testing.T) {
	containers := []interface{}{
		map[string]interface{}{
			"name": "app",
			"envFrom": []interface{}{
				map[string]interface{}{
					"configMapRef": map[string]interface{}{"name": "app-config"},
				},
				map[string]interface{}{
					"secretRef": map[string]interface{}{"name": "app-secrets"},
				},
			},
		},
	}

	cms, secs := walkContainerRefs(containers)
	assert.Contains(t, cms, "app-config")
	assert.Contains(t, secs, "app-secrets")
}

func TestWalkContainerRefs_Deduplication(t *testing.T) {
	// Same configMap referenced in two containers
	containers := []interface{}{
		map[string]interface{}{
			"name": "init",
			"env": []interface{}{
				map[string]interface{}{
					"name":      "CFG",
					"valueFrom": map[string]interface{}{"configMapKeyRef": map[string]interface{}{"name": "shared-cm"}},
				},
			},
		},
		map[string]interface{}{
			"name": "main",
			"env": []interface{}{
				map[string]interface{}{
					"name":      "CFG",
					"valueFrom": map[string]interface{}{"configMapKeyRef": map[string]interface{}{"name": "shared-cm"}},
				},
			},
		},
	}

	cms, _ := walkContainerRefs(containers)
	assert.Equal(t, 1, len(cms), "duplicate configMap refs should be deduplicated")
}

func TestWalkContainerRefs_EmptyContainers(t *testing.T) {
	cms, secs := walkContainerRefs(nil)
	assert.Nil(t, cms)
	assert.Nil(t, secs)
}

func TestWalkContainerRefs_InvalidContainerType(t *testing.T) {
	containers := []interface{}{"not-a-map", 42}
	cms, secs := walkContainerRefs(containers)
	assert.Nil(t, cms)
	assert.Nil(t, secs)
}

// --- walkVolumeRefs tests ---

func TestWalkVolumeRefs_ConfigMapVolume(t *testing.T) {
	volumes := []interface{}{
		map[string]interface{}{
			"name":      "config-vol",
			"configMap": map[string]interface{}{"name": "my-config"},
		},
	}

	cms, secs, pvcs := walkVolumeRefs(volumes)
	assert.Contains(t, cms, "my-config")
	assert.Empty(t, secs)
	assert.Empty(t, pvcs)
}

func TestWalkVolumeRefs_SecretVolume(t *testing.T) {
	volumes := []interface{}{
		map[string]interface{}{
			"name":   "secret-vol",
			"secret": map[string]interface{}{"secretName": "tls-cert"},
		},
	}

	cms, secs, pvcs := walkVolumeRefs(volumes)
	assert.Empty(t, cms)
	assert.Contains(t, secs, "tls-cert")
	assert.Empty(t, pvcs)
}

func TestWalkVolumeRefs_PVCVolume(t *testing.T) {
	volumes := []interface{}{
		map[string]interface{}{
			"name":                  "data-vol",
			"persistentVolumeClaim": map[string]interface{}{"claimName": "data-pvc"},
		},
	}

	cms, secs, pvcs := walkVolumeRefs(volumes)
	assert.Empty(t, cms)
	assert.Empty(t, secs)
	assert.Contains(t, pvcs, "data-pvc")
}

func TestWalkVolumeRefs_ProjectedVolume(t *testing.T) {
	volumes := []interface{}{
		map[string]interface{}{
			"name": "projected-vol",
			"projected": map[string]interface{}{
				"sources": []interface{}{
					map[string]interface{}{
						"configMap": map[string]interface{}{"name": "proj-cm"},
					},
					map[string]interface{}{
						"secret": map[string]interface{}{"name": "proj-secret"},
					},
				},
			},
		},
	}

	cms, secs, pvcs := walkVolumeRefs(volumes)
	assert.Contains(t, cms, "proj-cm")
	assert.Contains(t, secs, "proj-secret")
	assert.Empty(t, pvcs)
}

func TestWalkVolumeRefs_MixedVolumes(t *testing.T) {
	volumes := []interface{}{
		map[string]interface{}{"name": "v1", "configMap": map[string]interface{}{"name": "cm1"}},
		map[string]interface{}{"name": "v2", "secret": map[string]interface{}{"secretName": "sec1"}},
		map[string]interface{}{"name": "v3", "persistentVolumeClaim": map[string]interface{}{"claimName": "pvc1"}},
		map[string]interface{}{"name": "v4", "configMap": map[string]interface{}{"name": "cm2"}},
	}

	cms, secs, pvcs := walkVolumeRefs(volumes)
	sort.Strings(cms)
	assert.Equal(t, []string{"cm1", "cm2"}, cms)
	assert.Equal(t, []string{"sec1"}, secs)
	assert.Equal(t, []string{"pvc1"}, pvcs)
}

func TestWalkVolumeRefs_EmptyVolumes(t *testing.T) {
	cms, secs, pvcs := walkVolumeRefs(nil)
	assert.Nil(t, cms)
	assert.Nil(t, secs)
	assert.Nil(t, pvcs)
}

func TestWalkVolumeRefs_Deduplication(t *testing.T) {
	volumes := []interface{}{
		map[string]interface{}{"name": "v1", "configMap": map[string]interface{}{"name": "same-cm"}},
		map[string]interface{}{"name": "v2", "configMap": map[string]interface{}{"name": "same-cm"}},
	}

	cms, _, _ := walkVolumeRefs(volumes)
	assert.Equal(t, 1, len(cms), "duplicate volume refs should be deduplicated")
}

// --- collectServiceNames tests ---

func TestCollectServiceNames_FiltersServices(t *testing.T) {
	deps := []Dependency{
		{Kind: DepService, Name: "frontend-svc"},
		{Kind: DepConfigMap, Name: "app-config"},
		{Kind: DepService, Name: "backend-svc"},
		{Kind: DepSecret, Name: "tls-secret"},
	}

	names := collectServiceNames(deps)
	sort.Strings(names)
	assert.Equal(t, []string{"backend-svc", "frontend-svc"}, names)
}

func TestCollectServiceNames_NoServices(t *testing.T) {
	deps := []Dependency{
		{Kind: DepConfigMap, Name: "cm1"},
		{Kind: DepSecret, Name: "sec1"},
	}

	names := collectServiceNames(deps)
	assert.Nil(t, names)
}

func TestCollectServiceNames_EmptyDeps(t *testing.T) {
	names := collectServiceNames(nil)
	assert.Nil(t, names)
}

// --- getSlice tests ---

func TestGetSlice_ValidKey(t *testing.T) {
	m := map[string]interface{}{
		"items": []interface{}{"a", "b", "c"},
	}
	result := getSlice(m, "items")
	assert.Len(t, result, 3)
}

func TestGetSlice_MissingKey(t *testing.T) {
	m := map[string]interface{}{"other": "value"}
	result := getSlice(m, "items")
	assert.Nil(t, result)
}

func TestGetSlice_WrongType(t *testing.T) {
	m := map[string]interface{}{"items": "not-a-slice"}
	result := getSlice(m, "items")
	assert.Nil(t, result)
}
