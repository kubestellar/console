package k8s

import (
	"context"
	"testing"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	dynamicfake "k8s.io/client-go/dynamic/fake"
)

var crdGVRListKinds = map[schema.GroupVersionResource]string{
	gvrCRDs:               "CustomResourceDefinitionList",
	gvrValidatingWebhooks: "ValidatingWebhookConfigurationList",
	gvrMutatingWebhooks:   "MutatingWebhookConfigurationList",
}

func TestFindRelatedCRDs(t *testing.T) {
	scheme := runtime.NewScheme()

	tests := []struct {
		name         string
		crds         []unstructured.Unstructured
		serviceNames []string
		namespace    string
		wantCount    int
		wantName     string
	}{
		{
			name:         "no CRDs exist",
			crds:         nil,
			serviceNames: []string{"my-svc"},
			namespace:    "default",
			wantCount:    0,
		},
		{
			name: "CRD conversion webhook references service",
			crds: []unstructured.Unstructured{
				makeCRDWithConversionWebhook("my-crd.example.com", "my-svc", "default"),
			},
			serviceNames: []string{"my-svc"},
			namespace:    "default",
			wantCount:    1,
			wantName:     "my-crd.example.com",
		},
		{
			name: "CRD webhook service in different namespace",
			crds: []unstructured.Unstructured{
				makeCRDWithConversionWebhook("my-crd.example.com", "my-svc", "other-ns"),
			},
			serviceNames: []string{"my-svc"},
			namespace:    "default",
			wantCount:    0,
		},
		{
			name: "CRD webhook references unknown service",
			crds: []unstructured.Unstructured{
				makeCRDWithConversionWebhook("my-crd.example.com", "unknown-svc", "default"),
			},
			serviceNames: []string{"my-svc"},
			namespace:    "default",
			wantCount:    0,
		},
		{
			name: "multiple CRDs - only matching returned",
			crds: []unstructured.Unstructured{
				makeCRDWithConversionWebhook("crd-a.example.com", "my-svc", "default"),
				makeCRDWithConversionWebhook("crd-b.example.com", "other-svc", "default"),
				makeCRDWithConversionWebhook("crd-c.example.com", "my-svc", "default"),
			},
			serviceNames: []string{"my-svc"},
			namespace:    "default",
			wantCount:    2,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			var objs []runtime.Object
			for i := range tc.crds {
				objs = append(objs, &tc.crds[i])
			}

			fakeDyn := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(scheme, crdGVRListKinds, objs...)
			m, _ := NewMultiClusterClient("")
			m.InjectDynamicClient("c1", fakeDyn)

			deps := m.findRelatedCRDs(context.Background(), "c1", tc.namespace, tc.serviceNames)

			if len(deps) != tc.wantCount {
				t.Fatalf("expected %d deps, got %d", tc.wantCount, len(deps))
			}
			if tc.wantCount > 0 && tc.wantName != "" {
				if deps[0].Name != tc.wantName {
					t.Errorf("expected dep name %q, got %q", tc.wantName, deps[0].Name)
				}
				if deps[0].Kind != DepCRD {
					t.Errorf("expected kind %q, got %q", DepCRD, deps[0].Kind)
				}
			}
		})
	}
}

func TestFindRelatedCRDs_NoDynamicClient(t *testing.T) {
	m, _ := NewMultiClusterClient("")

	deps := m.findRelatedCRDs(context.Background(), "nonexistent", "default", []string{"svc"})
	if len(deps) != 0 {
		t.Fatalf("expected 0 deps for missing cluster, got %d", len(deps))
	}
}

func TestFindMatchingWebhookConfigs_Validating(t *testing.T) {
	scheme := runtime.NewScheme()

	tests := []struct {
		name         string
		webhooks     []unstructured.Unstructured
		serviceNames []string
		namespace    string
		wantCount    int
		wantName     string
	}{
		{
			name:         "no webhooks exist",
			webhooks:     nil,
			serviceNames: []string{"my-svc"},
			namespace:    "default",
			wantCount:    0,
		},
		{
			name: "validating webhook references service",
			webhooks: []unstructured.Unstructured{
				makeWebhookConfig("my-vwc", "my-svc", "default", false),
			},
			serviceNames: []string{"my-svc"},
			namespace:    "default",
			wantCount:    1,
			wantName:     "my-vwc",
		},
		{
			name: "webhook service in different namespace",
			webhooks: []unstructured.Unstructured{
				makeWebhookConfig("my-vwc", "my-svc", "other-ns", false),
			},
			serviceNames: []string{"my-svc"},
			namespace:    "default",
			wantCount:    0,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			var objs []runtime.Object
			for i := range tc.webhooks {
				objs = append(objs, &tc.webhooks[i])
			}

			fakeDyn := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(scheme, crdGVRListKinds, objs...)
			m, _ := NewMultiClusterClient("")
			m.InjectDynamicClient("c1", fakeDyn)

			deps := m.findMatchingWebhookConfigs(context.Background(), "c1", tc.namespace, tc.serviceNames, false)

			if len(deps) != tc.wantCount {
				t.Fatalf("expected %d deps, got %d", tc.wantCount, len(deps))
			}
			if tc.wantCount > 0 && tc.wantName != "" {
				if deps[0].Name != tc.wantName {
					t.Errorf("expected dep name %q, got %q", tc.wantName, deps[0].Name)
				}
				if deps[0].Kind != DepValidatingWebhook {
					t.Errorf("expected kind %q, got %q", DepValidatingWebhook, deps[0].Kind)
				}
			}
		})
	}
}

func TestFindMatchingWebhookConfigs_Mutating(t *testing.T) {
	scheme := runtime.NewScheme()

	webhook := makeWebhookConfig("my-mwc", "my-svc", "default", true)
	fakeDyn := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(scheme, crdGVRListKinds, &webhook)
	m, _ := NewMultiClusterClient("")
	m.InjectDynamicClient("c1", fakeDyn)

	deps := m.findMatchingWebhookConfigs(context.Background(), "c1", "default", []string{"my-svc"}, true)

	if len(deps) != 1 {
		t.Fatalf("expected 1 dep, got %d", len(deps))
	}
	if deps[0].Kind != DepMutatingWebhook {
		t.Errorf("expected kind %q, got %q", DepMutatingWebhook, deps[0].Kind)
	}
	if deps[0].Name != "my-mwc" {
		t.Errorf("expected name %q, got %q", "my-mwc", deps[0].Name)
	}
}

func TestFindMatchingWebhookConfigs_NoDynamicClient(t *testing.T) {
	m, _ := NewMultiClusterClient("")

	deps := m.findMatchingWebhookConfigs(context.Background(), "nonexistent", "default", []string{"svc"}, false)
	if len(deps) != 0 {
		t.Fatalf("expected 0 deps for missing cluster, got %d", len(deps))
	}
}

// --- helpers ---

func makeCRDWithConversionWebhook(name, svcName, svcNamespace string) unstructured.Unstructured {
	return unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "apiextensions.k8s.io/v1",
			"kind":       "CustomResourceDefinition",
			"metadata": map[string]interface{}{
				"name": name,
			},
			"spec": map[string]interface{}{
				"conversion": map[string]interface{}{
					"webhook": map[string]interface{}{
						"clientConfig": map[string]interface{}{
							"service": map[string]interface{}{
								"name":      svcName,
								"namespace": svcNamespace,
							},
						},
					},
				},
			},
		},
	}
}

func makeWebhookConfig(name, svcName, svcNamespace string, mutating bool) unstructured.Unstructured {
	apiVersion := "admissionregistration.k8s.io/v1"
	kind := "ValidatingWebhookConfiguration"
	if mutating {
		kind = "MutatingWebhookConfiguration"
	}
	return unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": apiVersion,
			"kind":       kind,
			"metadata": map[string]interface{}{
				"name": name,
			},
			"webhooks": []interface{}{
				map[string]interface{}{
					"name": "hook1.example.com",
					"clientConfig": map[string]interface{}{
						"service": map[string]interface{}{
							"name":      svcName,
							"namespace": svcNamespace,
						},
					},
				},
			},
		},
	}
}
