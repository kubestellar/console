package k8s

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/types"
)

// --- normalizeImageRef tests ---

func TestNormalizeImageRef_SingleName(t *testing.T) {
	// Single-name images get docker.io/library prefix
	assert.Equal(t, "docker.io/library/nginx:1.27", normalizeImageRef("nginx:1.27"))
}

func TestNormalizeImageRef_SingleNameNoTag(t *testing.T) {
	assert.Equal(t, "docker.io/library/nginx", normalizeImageRef("nginx"))
}

func TestNormalizeImageRef_OrgImage(t *testing.T) {
	// Two-part names without registry get docker.io prefix
	assert.Equal(t, "docker.io/myorg/myimage:v1", normalizeImageRef("myorg/myimage:v1"))
}

func TestNormalizeImageRef_OrgImageNoTag(t *testing.T) {
	assert.Equal(t, "docker.io/myorg/myimage", normalizeImageRef("myorg/myimage"))
}

func TestNormalizeImageRef_FullyQualified(t *testing.T) {
	// Already qualified — returned as-is
	assert.Equal(t, "ghcr.io/org/image:latest", normalizeImageRef("ghcr.io/org/image:latest"))
}

func TestNormalizeImageRef_RegistryWithPort(t *testing.T) {
	// Registry with port should be left alone
	assert.Equal(t, "registry.example.com:5000/app:v2", normalizeImageRef("registry.example.com:5000/app:v2"))
}

func TestNormalizeImageRef_GCR(t *testing.T) {
	assert.Equal(t, "gcr.io/google-containers/pause:3.1", normalizeImageRef("gcr.io/google-containers/pause:3.1"))
}

func TestNormalizeImageRef_EmptyString(t *testing.T) {
	// Documents current behavior: empty string is treated as single-name.
	// The function does not validate inputs — callers should skip empty images.
	assert.Equal(t, "docker.io/library/", normalizeImageRef(""))
}

func TestNormalizeImageRef_DigestRef(t *testing.T) {
	// Use a realistic 64-char hex digest
	result := normalizeImageRef("nginx@sha256:e4429a43042d2681656771c3adde72f7b26c8f0db0eb05e4a0b2b2d4a2b97395")
	assert.Equal(t, "docker.io/library/nginx@sha256:e4429a43042d2681656771c3adde72f7b26c8f0db0eb05e4a0b2b2d4a2b97395", result)
}

func TestNormalizeImageRef_NestedPath(t *testing.T) {
	// registry.io/org/sub/image:tag — already qualified
	assert.Equal(t, "quay.io/org/sub/image:tag", normalizeImageRef("quay.io/org/sub/image:tag"))
}

// --- normalizeImageNames tests ---

func TestNormalizeImageNames_Containers(t *testing.T) {
	obj := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"spec": map[string]interface{}{
				"template": map[string]interface{}{
					"spec": map[string]interface{}{
						"containers": []interface{}{
							map[string]interface{}{"name": "web", "image": "nginx:1.27"},
							map[string]interface{}{"name": "sidecar", "image": "envoyproxy/envoy:v1.28"},
						},
					},
				},
			},
		},
	}

	normalizeImageNames(obj)

	containers := obj.Object["spec"].(map[string]interface{})["template"].(map[string]interface{})["spec"].(map[string]interface{})["containers"].([]interface{})
	assert.Equal(t, "docker.io/library/nginx:1.27", containers[0].(map[string]interface{})["image"])
	assert.Equal(t, "docker.io/envoyproxy/envoy:v1.28", containers[1].(map[string]interface{})["image"])
}

func TestNormalizeImageNames_InitContainers(t *testing.T) {
	obj := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"spec": map[string]interface{}{
				"template": map[string]interface{}{
					"spec": map[string]interface{}{
						"containers": []interface{}{
							map[string]interface{}{"name": "app", "image": "gcr.io/proj/app:v1"},
						},
						"initContainers": []interface{}{
							map[string]interface{}{"name": "init", "image": "busybox:latest"},
						},
					},
				},
			},
		},
	}

	normalizeImageNames(obj)

	templateSpec := obj.Object["spec"].(map[string]interface{})["template"].(map[string]interface{})["spec"].(map[string]interface{})
	// Main container already qualified — unchanged
	containers := templateSpec["containers"].([]interface{})
	assert.Equal(t, "gcr.io/proj/app:v1", containers[0].(map[string]interface{})["image"])
	// Init container normalized
	initContainers := templateSpec["initContainers"].([]interface{})
	assert.Equal(t, "docker.io/library/busybox:latest", initContainers[0].(map[string]interface{})["image"])
}

func TestNormalizeImageNames_NoSpec(t *testing.T) {
	obj := &unstructured.Unstructured{Object: map[string]interface{}{}}
	// Should not panic
	normalizeImageNames(obj)
}

func TestNormalizeImageNames_NoTemplate(t *testing.T) {
	obj := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"spec": map[string]interface{}{},
		},
	}
	normalizeImageNames(obj)
}

func TestNormalizeImageNames_NoContainers(t *testing.T) {
	obj := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"spec": map[string]interface{}{
				"template": map[string]interface{}{
					"spec": map[string]interface{}{},
				},
			},
		},
	}
	normalizeImageNames(obj)
}

// --- cleanManifestForDeploy tests ---

func TestCleanManifestForDeploy_StripsClusterFields(t *testing.T) {
	obj := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "apps/v1",
			"kind":       "Deployment",
			"metadata": map[string]interface{}{
				"name":            "myapp",
				"namespace":       "default",
				"resourceVersion": "12345",
				"uid":             "abc-def",
				"generation":      int64(3),
				"selfLink":        "/apis/apps/v1/deployments/myapp",
			},
			"status": map[string]interface{}{"replicas": int64(3)},
		},
	}
	obj.SetOwnerReferences([]metav1.OwnerReference{
		{Name: "parent", UID: types.UID("xyz")},
	})

	opts := &DeployOptions{DeployedBy: "testuser", GroupName: "mygroup"}
	result := cleanManifestForDeploy(obj, "source-cluster", opts)

	// Cluster-specific fields cleared
	assert.Equal(t, "", result.GetResourceVersion())
	assert.Equal(t, types.UID(""), result.GetUID())
	assert.Equal(t, int64(0), result.GetGeneration())
	assert.Nil(t, result.GetOwnerReferences())
	assert.Nil(t, result.GetManagedFields())

	// Status removed
	_, hasStatus := result.Object["status"]
	assert.False(t, hasStatus)

	// Labels applied
	labels := result.GetLabels()
	assert.Equal(t, "kubestellar-console", labels["kubestellar.io/managed-by"])
	assert.Equal(t, "testuser", labels["kubestellar.io/deployed-by"])
	assert.Equal(t, "mygroup", labels["kubestellar.io/group"])

	// Annotations applied
	annotations := result.GetAnnotations()
	assert.Equal(t, "source-cluster", annotations["kubestellar.io/source-cluster"])
	assert.NotEmpty(t, annotations["kubestellar.io/deploy-timestamp"])
}

func TestCleanManifestForDeploy_DeepCopy(t *testing.T) {
	// Verify original object is not mutated
	obj := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "v1",
			"kind":       "ConfigMap",
			"metadata": map[string]interface{}{
				"name":            "test",
				"resourceVersion": "999",
			},
			"status": map[string]interface{}{"phase": "Active"},
		},
	}

	opts := &DeployOptions{}
	_ = cleanManifestForDeploy(obj, "cluster-a", opts)

	// Original should be untouched
	assert.Equal(t, "999", obj.GetResourceVersion())
	_, hasStatus := obj.Object["status"]
	assert.True(t, hasStatus)
}

func TestCleanManifestForDeploy_MinimalOptions(t *testing.T) {
	obj := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "v1",
			"kind":       "Service",
			"metadata": map[string]interface{}{"name": "svc"},
		},
	}

	opts := &DeployOptions{} // No DeployedBy, no GroupName
	result := cleanManifestForDeploy(obj, "src", opts)

	labels := result.GetLabels()
	require.NotNil(t, labels)
	assert.Equal(t, "kubestellar-console", labels["kubestellar.io/managed-by"])
	// Optional labels not set
	_, hasDeployedBy := labels["kubestellar.io/deployed-by"]
	assert.False(t, hasDeployedBy)
	_, hasGroup := labels["kubestellar.io/group"]
	assert.False(t, hasGroup)
}

func TestCleanManifestForDeploy_PreservesExistingLabels(t *testing.T) {
	obj := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "v1",
			"kind":       "ConfigMap",
			"metadata": map[string]interface{}{
				"name":   "cm",
				"labels": map[string]interface{}{"app": "frontend", "env": "prod"},
			},
		},
	}

	opts := &DeployOptions{DeployedBy: "admin"}
	result := cleanManifestForDeploy(obj, "cluster-b", opts)

	labels := result.GetLabels()
	// Existing labels preserved
	assert.Equal(t, "frontend", labels["app"])
	assert.Equal(t, "prod", labels["env"])
	// Console labels added
	assert.Equal(t, "kubestellar-console", labels["kubestellar.io/managed-by"])
	assert.Equal(t, "admin", labels["kubestellar.io/deployed-by"])
}
