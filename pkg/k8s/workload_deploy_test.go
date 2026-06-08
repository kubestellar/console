package k8s

import (
	"testing"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

// ---------------------------------------------------------------------------
// normalizeImageRef — Docker Hub short-name expansion
// ---------------------------------------------------------------------------

func TestNormalizeImageRef(t *testing.T) {
	tests := []struct {
		name  string
		image string
		want  string
	}{
		// Single-name images → docker.io/library/
		{"bare nginx", "nginx", "docker.io/library/nginx"},
		{"nginx with tag", "nginx:1.27", "docker.io/library/nginx:1.27"},
		{"nginx latest", "nginx:latest", "docker.io/library/nginx:latest"},
		{"alpine", "alpine:3.19", "docker.io/library/alpine:3.19"},
		{"busybox no tag", "busybox", "docker.io/library/busybox"},

		// Two-part names without registry → docker.io/
		{"org/image", "myorg/myimage:v1", "docker.io/myorg/myimage:v1"},
		{"org/image no tag", "kubestellar/console", "docker.io/kubestellar/console"},

		// Fully qualified (contain a dot in registry) → pass through
		{"gcr.io image", "gcr.io/my-project/my-image:latest", "gcr.io/my-project/my-image:latest"},
		{"quay.io image", "quay.io/prometheus/node-exporter:v1.8", "quay.io/prometheus/node-exporter:v1.8"},
		{"ghcr.io image", "ghcr.io/kubestellar/console:latest", "ghcr.io/kubestellar/console:latest"},
		{"ecr image", "123456789.dkr.ecr.us-east-1.amazonaws.com/repo:tag", "123456789.dkr.ecr.us-east-1.amazonaws.com/repo:tag"},
		{"docker.io explicit", "docker.io/library/nginx:1.27", "docker.io/library/nginx:1.27"},
		{"registry with port", "localhost:5000/myimage:v1", "localhost:5000/myimage:v1"},
		{"k8s registry", "registry.k8s.io/kube-apiserver:v1.30.0", "registry.k8s.io/kube-apiserver:v1.30.0"},

		// Edge cases
		{"image with digest", "nginx@sha256:abc123", "docker.io/library/nginx@sha256:abc123"},
		{"empty string", "", "docker.io/library/"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := normalizeImageRef(tt.image)
			if got != tt.want {
				t.Errorf("normalizeImageRef(%q) = %q, want %q", tt.image, got, tt.want)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// normalizeImageNames — in-place mutation of container images
// ---------------------------------------------------------------------------

func TestNormalizeImageNames_Containers(t *testing.T) {
	obj := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"spec": map[string]interface{}{
				"template": map[string]interface{}{
					"spec": map[string]interface{}{
						"containers": []interface{}{
							map[string]interface{}{
								"name":  "main",
								"image": "nginx:1.27",
							},
							map[string]interface{}{
								"name":  "sidecar",
								"image": "gcr.io/my-project/sidecar:v1",
							},
						},
					},
				},
			},
		},
	}

	normalizeImageNames(obj)

	containers := obj.Object["spec"].(map[string]interface{})["template"].(map[string]interface{})["spec"].(map[string]interface{})["containers"].([]interface{})
	c0 := containers[0].(map[string]interface{})
	c1 := containers[1].(map[string]interface{})

	if c0["image"] != "docker.io/library/nginx:1.27" {
		t.Errorf("container 0 image = %q, want docker.io/library/nginx:1.27", c0["image"])
	}
	if c1["image"] != "gcr.io/my-project/sidecar:v1" {
		t.Errorf("container 1 image should be unchanged = %q", c1["image"])
	}
}

func TestNormalizeImageNames_InitContainers(t *testing.T) {
	obj := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"spec": map[string]interface{}{
				"template": map[string]interface{}{
					"spec": map[string]interface{}{
						"containers": []interface{}{
							map[string]interface{}{
								"name":  "main",
								"image": "gcr.io/app:v1",
							},
						},
						"initContainers": []interface{}{
							map[string]interface{}{
								"name":  "init",
								"image": "busybox",
							},
						},
					},
				},
			},
		},
	}

	normalizeImageNames(obj)

	initContainers := obj.Object["spec"].(map[string]interface{})["template"].(map[string]interface{})["spec"].(map[string]interface{})["initContainers"].([]interface{})
	ic0 := initContainers[0].(map[string]interface{})
	if ic0["image"] != "docker.io/library/busybox" {
		t.Errorf("init container image = %q, want docker.io/library/busybox", ic0["image"])
	}
}

func TestNormalizeImageNames_NoSpec(t *testing.T) {
	obj := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "v1",
			"kind":       "ConfigMap",
		},
	}
	// Should not panic on objects without spec.template.spec.containers
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

// ---------------------------------------------------------------------------
// cleanManifestForDeploy — manifest sanitization for cross-cluster deploy
// ---------------------------------------------------------------------------

func TestCleanManifestForDeploy_StripsClusterFields(t *testing.T) {
	obj := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "apps/v1",
			"kind":       "Deployment",
			"metadata": map[string]interface{}{
				"name":            "test-deploy",
				"namespace":       "default",
				"resourceVersion": "12345",
				"uid":             "abc-def-123",
				"selfLink":        "/apis/apps/v1/deployments/test",
				"generation":      int64(5),
			},
			"status": map[string]interface{}{
				"readyReplicas": 3,
			},
		},
	}

	opts := &DeployOptions{
		DeployedBy: "test-user",
		GroupName:  "test-group",
	}

	result := cleanManifestForDeploy(obj, "source-cluster", opts)

	// Cluster-specific fields should be cleared
	if result.GetResourceVersion() != "" {
		t.Errorf("resourceVersion should be empty, got %q", result.GetResourceVersion())
	}
	if string(result.GetUID()) != "" {
		t.Errorf("uid should be empty, got %q", result.GetUID())
	}

	// Status should be removed
	if _, ok := result.Object["status"]; ok {
		t.Error("status field should be removed")
	}

	// Labels should be set
	labels := result.GetLabels()
	if labels["kubestellar.io/managed-by"] != "kubestellar-console" {
		t.Errorf("managed-by label = %q, want kubestellar-console", labels["kubestellar.io/managed-by"])
	}
	if labels["kubestellar.io/deployed-by"] != "test-user" {
		t.Errorf("deployed-by label = %q, want test-user", labels["kubestellar.io/deployed-by"])
	}
	if labels["kubestellar.io/group"] != "test-group" {
		t.Errorf("group label = %q, want test-group", labels["kubestellar.io/group"])
	}

	// Annotations should include source cluster
	annotations := result.GetAnnotations()
	if annotations["kubestellar.io/source-cluster"] != "source-cluster" {
		t.Errorf("source-cluster annotation = %q, want source-cluster", annotations["kubestellar.io/source-cluster"])
	}
	if annotations["kubestellar.io/deploy-timestamp"] == "" {
		t.Error("deploy-timestamp annotation should be set")
	}
}

func TestCleanManifestForDeploy_PreservesName(t *testing.T) {
	obj := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "apps/v1",
			"kind":       "Deployment",
			"metadata": map[string]interface{}{
				"name":      "my-app",
				"namespace": "production",
			},
		},
	}
	result := cleanManifestForDeploy(obj, "cluster-a", &DeployOptions{})
	if result.GetName() != "my-app" {
		t.Errorf("name should be preserved, got %q", result.GetName())
	}
	if result.GetNamespace() != "production" {
		t.Errorf("namespace should be preserved, got %q", result.GetNamespace())
	}
}

func TestCleanManifestForDeploy_DoesNotMutateOriginal(t *testing.T) {
	obj := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "v1",
			"kind":       "Service",
			"metadata": map[string]interface{}{
				"name":            "svc",
				"resourceVersion": "999",
			},
			"status": map[string]interface{}{"ready": true},
		},
	}
	_ = cleanManifestForDeploy(obj, "src", &DeployOptions{})

	// Original should still have resourceVersion and status
	if obj.GetResourceVersion() != "999" {
		t.Error("original resourceVersion was mutated")
	}
	if _, ok := obj.Object["status"]; !ok {
		t.Error("original status was removed")
	}
}

func TestCleanManifestForDeploy_NilLabelsAndAnnotations(t *testing.T) {
	obj := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "v1",
			"kind":       "Pod",
			"metadata": map[string]interface{}{
				"name": "test",
			},
		},
	}
	result := cleanManifestForDeploy(obj, "src", &DeployOptions{DeployedBy: "user"})
	labels := result.GetLabels()
	if labels["kubestellar.io/managed-by"] != "kubestellar-console" {
		t.Error("should create labels map when nil")
	}
	annotations := result.GetAnnotations()
	if annotations["kubestellar.io/source-cluster"] != "src" {
		t.Error("should create annotations map when nil")
	}
}
