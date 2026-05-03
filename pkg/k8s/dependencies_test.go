package k8s

import (
	"context"
	"testing"

	corev1 "k8s.io/api/core/v1"
	rbacv1 "k8s.io/api/rbac/v1"
	apiextensionsv1 "k8s.io/apiextensions-apiserver/pkg/apis/apiextensions/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/dynamic/fake"
	k8sscheme "k8s.io/client-go/kubernetes/scheme"
)

func TestResolveDependencies(t *testing.T) {
	// 1. Setup Mock MultiClusterClient
	m, _ := NewMultiClusterClient("")

	// 2. Setup Fake Dynamic Client with resources
	// Create a local scheme and register necessary types
	myScheme := runtime.NewScheme()
	_ = k8sscheme.AddToScheme(myScheme)
	_ = apiextensionsv1.AddToScheme(myScheme)

	// Dependency 1: ConfigMap
	cm := &corev1.ConfigMap{
		TypeMeta: metav1.TypeMeta{Kind: "ConfigMap", APIVersion: "v1"},
		ObjectMeta: metav1.ObjectMeta{
			Name:      "my-config",
			Namespace: "default",
		},
		Data: map[string]string{"foo": "bar"},
	}

	// Dependency 2: Service
	svc := &corev1.Service{
		TypeMeta: metav1.TypeMeta{Kind: "Service", APIVersion: "v1"},
		ObjectMeta: metav1.ObjectMeta{
			Name:      "my-service",
			Namespace: "default",
		},
		Spec: corev1.ServiceSpec{
			Selector: map[string]string{"app": "myapp"},
		},
	}

	/* Unused pod definition removed */

	// Convert typed objects to unstructured for fake dynamic client
	toUnstructured := func(obj runtime.Object) *unstructured.Unstructured {
		u, err := runtime.DefaultUnstructuredConverter.ToUnstructured(obj)
		if err != nil {
			t.Fatalf("ToUnstructured failed: %v", err)
		}
		return &unstructured.Unstructured{Object: u}
	}

	fakeDyn := fake.NewSimpleDynamicClient(myScheme, toUnstructured(cm), toUnstructured(svc))
	m.dynamicClients["cluster-1"] = fakeDyn

	// 3. Run ResolveDependencies
	// Note: We need to pass a workload object that mimics what the function expects.
	// The function expects a workload (Deployment/StatefulSet/etc) that HAS a pod template.
	// A Pod itself doesn't have spec.template. It has spec directly.
	// ResolveDependencies calls `extractPodTemplateSpec`.

	deployment := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "apps/v1",
			"kind":       "Deployment",
			"metadata": map[string]interface{}{
				"name":      "my-dep",
				"namespace": "default",
			},
			"spec": map[string]interface{}{
				"template": map[string]interface{}{
					"metadata": map[string]interface{}{
						"labels": map[string]interface{}{
							"app": "myapp",
						},
					},
					"spec": map[string]interface{}{
						"containers": []interface{}{
							map[string]interface{}{
								"name": "c1",
								"envFrom": []interface{}{
									map[string]interface{}{
										"configMapRef": map[string]interface{}{
											"name": "my-config",
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

	bundle, err := m.ResolveDependencies(context.Background(), "cluster-1", "default", deployment, &DeployOptions{DeployedBy: "test"})
	if err != nil {
		t.Fatalf("ResolveDependencies failed: %v", err)
	}

	// 4. Verification
	// Should find ConfigMap (from envFrom) and Service (from label match)

	foundCM := false
	foundSvc := false

	for _, dep := range bundle.Dependencies {
		if dep.Kind == DepConfigMap && dep.Name == "my-config" {
			foundCM = true
		}
		if dep.Kind == DepService && dep.Name == "my-service" {
			foundSvc = true
		}
	}

	if !foundCM {
		t.Error("Did not resolve ConfigMap dependency")
	}
	if !foundSvc {
		t.Error("Did not resolve Service dependency")
	}
}

func TestWalkContainerRefs(t *testing.T) {
	containers := []interface{}{
		map[string]interface{}{
			"name": "c1",
			"env": []interface{}{
				map[string]interface{}{
					"valueFrom": map[string]interface{}{
						"configMapKeyRef": map[string]interface{}{
							"name": "cm1",
						},
					},
				},
				map[string]interface{}{
					"valueFrom": map[string]interface{}{
						"secretKeyRef": map[string]interface{}{
							"name": "sec1",
						},
					},
				},
			},
			"envFrom": []interface{}{
				map[string]interface{}{
					"configMapRef": map[string]interface{}{
						"name": "cm2",
					},
				},
			},
		},
	}

	cms, secrets := walkContainerRefs(containers)

	if len(cms) != 2 { // cm1, cm2
		t.Errorf("Expected 2 ConfigMaps, got %d", len(cms))
	}
	if len(secrets) != 1 { // sec1
		t.Errorf("Expected 1 Secret, got %d", len(secrets))
	}
}

func TestWalkContainerRefs_EphemeralContainers(t *testing.T) {
	// Ephemeral containers should have their refs detected just like regular containers
	allContainers := []interface{}{
		// Regular container
		map[string]interface{}{
			"name": "app",
			"env": []interface{}{
				map[string]interface{}{
					"valueFrom": map[string]interface{}{
						"configMapKeyRef": map[string]interface{}{
							"name": "app-config",
						},
					},
				},
			},
		},
		// Ephemeral debug container referencing a secret
		map[string]interface{}{
			"name": "debugger",
			"env": []interface{}{
				map[string]interface{}{
					"valueFrom": map[string]interface{}{
						"secretKeyRef": map[string]interface{}{
							"name": "debug-secret",
						},
					},
				},
			},
			"envFrom": []interface{}{
				map[string]interface{}{
					"configMapRef": map[string]interface{}{
						"name": "debug-config",
					},
				},
			},
		},
	}

	cms, secrets := walkContainerRefs(allContainers)

	if len(cms) != 2 { // app-config, debug-config
		t.Errorf("Expected 2 ConfigMaps, got %d: %v", len(cms), cms)
	}
	if len(secrets) != 1 { // debug-secret
		t.Errorf("Expected 1 Secret, got %d: %v", len(secrets), secrets)
	}
}

func TestWalkVolumeRefs(t *testing.T) {
	volumes := []interface{}{
		map[string]interface{}{
			"name": "v1",
			"configMap": map[string]interface{}{
				"name": "cm1",
			},
		},
		map[string]interface{}{
			"name": "v2",
			"secret": map[string]interface{}{
				"secretName": "sec1",
			},
		},
		map[string]interface{}{
			"name": "v3",
			"persistentVolumeClaim": map[string]interface{}{
				"claimName": "pvc1",
			},
		},
	}

	cms, secrets, pvcs := walkVolumeRefs(volumes)

	if len(cms) != 1 || cms[0] != "cm1" {
		t.Errorf("Expected [cm1], got %v", cms)
	}
	if len(secrets) != 1 || secrets[0] != "sec1" {
		t.Errorf("Expected [sec1], got %v", secrets)
	}
	if len(pvcs) != 1 || pvcs[0] != "pvc1" {
		t.Errorf("Expected [pvc1], got %v", pvcs)
	}
}

func TestResolveRBACForSA(t *testing.T) {
	m, _ := NewMultiClusterClient("")

	// Convert typed objects to unstructured
	toUnstructured := func(obj interface{}) *unstructured.Unstructured {
		u, err := runtime.DefaultUnstructuredConverter.ToUnstructured(obj)
		if err != nil {
			t.Fatalf("ToUnstructured failed: %v", err)
		}
		return &unstructured.Unstructured{Object: u}
	}

	// Role and Binding
	role := &rbacv1.Role{
		TypeMeta:   metav1.TypeMeta{Kind: "Role", APIVersion: "rbac.authorization.k8s.io/v1"},
		ObjectMeta: metav1.ObjectMeta{Name: "r1", Namespace: "default"},
	}
	rb := &rbacv1.RoleBinding{
		TypeMeta:   metav1.TypeMeta{Kind: "RoleBinding", APIVersion: "rbac.authorization.k8s.io/v1"},
		ObjectMeta: metav1.ObjectMeta{Name: "rb1", Namespace: "default"},
		Subjects: []rbacv1.Subject{
			{Kind: "ServiceAccount", Name: "sa1", Namespace: "default"},
		},
		RoleRef: rbacv1.RoleRef{Kind: "Role", Name: "r1"},
	}

	scheme := runtime.NewScheme()
	_ = rbacv1.AddToScheme(scheme)

	fakeDyn := fake.NewSimpleDynamicClient(scheme, toUnstructured(role), toUnstructured(rb))
	m.dynamicClients["c1"] = fakeDyn

	deps, warnings := m.resolveRBACForSA(context.Background(), "c1", "default", "sa1")

	if len(warnings) > 0 {
		t.Errorf("Unexpected warnings: %v", warnings)
	}

	foundRole := false
	foundBinding := false
	for _, d := range deps {
		if d.Kind == DepRole && d.Name == "r1" {
			foundRole = true
		}
		if d.Kind == DepRoleBinding && d.Name == "rb1" {
			foundBinding = true
		}
	}

	if !foundRole || !foundBinding {
		t.Errorf("Did not find role or binding: foundRole=%v, foundBinding=%v", foundRole, foundBinding)
	}
}
