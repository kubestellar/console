package k8s

import (
	"testing"
)

func TestLabelsMatch(t *testing.T) {
	tests := []struct {
		name     string
		selector map[string]string
		target   map[string]string
		want     bool
	}{
		{
			name:     "exact match",
			selector: map[string]string{"app": "nginx"},
			target:   map[string]string{"app": "nginx", "version": "v1"},
			want:     true,
		},
		{
			name:     "subset match",
			selector: map[string]string{"app": "nginx", "env": "prod"},
			target:   map[string]string{"app": "nginx", "env": "prod", "tier": "frontend"},
			want:     true,
		},
		{
			name:     "mismatch value",
			selector: map[string]string{"app": "nginx"},
			target:   map[string]string{"app": "redis"},
			want:     false,
		},
		{
			name:     "missing key in target",
			selector: map[string]string{"app": "nginx", "missing": "key"},
			target:   map[string]string{"app": "nginx"},
			want:     false,
		},
		{
			name:     "empty selector matches anything",
			selector: map[string]string{},
			target:   map[string]string{"app": "anything"},
			want:     true,
		},
		{
			name:     "nil selector matches anything",
			selector: nil,
			target:   map[string]string{"app": "anything"},
			want:     true,
		},
		{
			name:     "empty target fails non-empty selector",
			selector: map[string]string{"app": "nginx"},
			target:   map[string]string{},
			want:     false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := labelsMatch(tt.selector, tt.target)
			if got != tt.want {
				t.Errorf("labelsMatch(%v, %v) = %v, want %v", tt.selector, tt.target, got, tt.want)
			}
		})
	}
}

func TestIngressReferencesServices(t *testing.T) {
	t.Run("default backend references service", func(t *testing.T) {
		obj := map[string]interface{}{
			"spec": map[string]interface{}{
				"defaultBackend": map[string]interface{}{
					"service": map[string]interface{}{"name": "backend-svc"},
				},
			},
		}
		svcSet := map[string]bool{"backend-svc": true}
		if !ingressReferencesServices(obj, svcSet) {
			t.Error("expected true for defaultBackend match")
		}
	})

	t.Run("rule path references service", func(t *testing.T) {
		obj := map[string]interface{}{
			"spec": map[string]interface{}{
				"rules": []interface{}{
					map[string]interface{}{
						"http": map[string]interface{}{
							"paths": []interface{}{
								map[string]interface{}{
									"backend": map[string]interface{}{
										"service": map[string]interface{}{"name": "api-svc"},
									},
								},
							},
						},
					},
				},
			},
		}
		svcSet := map[string]bool{"api-svc": true}
		if !ingressReferencesServices(obj, svcSet) {
			t.Error("expected true for rule path match")
		}
	})

	t.Run("no matching service", func(t *testing.T) {
		obj := map[string]interface{}{
			"spec": map[string]interface{}{
				"rules": []interface{}{
					map[string]interface{}{
						"http": map[string]interface{}{
							"paths": []interface{}{
								map[string]interface{}{
									"backend": map[string]interface{}{
										"service": map[string]interface{}{"name": "other-svc"},
									},
								},
							},
						},
					},
				},
			},
		}
		svcSet := map[string]bool{"my-svc": true}
		if ingressReferencesServices(obj, svcSet) {
			t.Error("expected false when service not in set")
		}
	})

	t.Run("missing spec", func(t *testing.T) {
		obj := map[string]interface{}{}
		if ingressReferencesServices(obj, map[string]bool{"svc": true}) {
			t.Error("expected false for missing spec")
		}
	})
}

func TestBindingReferencesSA(t *testing.T) {
	t.Run("matches service account", func(t *testing.T) {
		obj := map[string]interface{}{
			"subjects": []interface{}{
				map[string]interface{}{
					"kind":      "ServiceAccount",
					"name":      "my-sa",
					"namespace": "default",
				},
			},
		}
		if !bindingReferencesSA(obj, "my-sa", "default") {
			t.Error("expected true")
		}
	})

	t.Run("empty namespace in binding matches any", func(t *testing.T) {
		obj := map[string]interface{}{
			"subjects": []interface{}{
				map[string]interface{}{
					"kind": "ServiceAccount",
					"name": "cluster-sa",
				},
			},
		}
		if !bindingReferencesSA(obj, "cluster-sa", "kube-system") {
			t.Error("expected true when binding namespace is empty")
		}
	})

	t.Run("wrong SA name", func(t *testing.T) {
		obj := map[string]interface{}{
			"subjects": []interface{}{
				map[string]interface{}{
					"kind":      "ServiceAccount",
					"name":      "other-sa",
					"namespace": "default",
				},
			},
		}
		if bindingReferencesSA(obj, "my-sa", "default") {
			t.Error("expected false for wrong SA name")
		}
	})

	t.Run("wrong namespace", func(t *testing.T) {
		obj := map[string]interface{}{
			"subjects": []interface{}{
				map[string]interface{}{
					"kind":      "ServiceAccount",
					"name":      "my-sa",
					"namespace": "other-ns",
				},
			},
		}
		if bindingReferencesSA(obj, "my-sa", "default") {
			t.Error("expected false for wrong namespace")
		}
	})

	t.Run("user subject ignored", func(t *testing.T) {
		obj := map[string]interface{}{
			"subjects": []interface{}{
				map[string]interface{}{
					"kind": "User",
					"name": "my-sa",
				},
			},
		}
		if bindingReferencesSA(obj, "my-sa", "default") {
			t.Error("expected false for User kind")
		}
	})

	t.Run("no subjects", func(t *testing.T) {
		obj := map[string]interface{}{}
		if bindingReferencesSA(obj, "my-sa", "default") {
			t.Error("expected false when no subjects")
		}
	})
}

func TestGetRoleRefName(t *testing.T) {
	t.Run("present", func(t *testing.T) {
		obj := map[string]interface{}{
			"roleRef": map[string]interface{}{
				"name": "cluster-admin",
				"kind": "ClusterRole",
			},
		}
		if got := getRoleRefName(obj); got != "cluster-admin" {
			t.Errorf("got %q, want %q", got, "cluster-admin")
		}
	})

	t.Run("missing roleRef", func(t *testing.T) {
		if got := getRoleRefName(map[string]interface{}{}); got != "" {
			t.Errorf("got %q, want empty", got)
		}
	})
}

func TestGetRoleRefKind(t *testing.T) {
	t.Run("ClusterRole", func(t *testing.T) {
		obj := map[string]interface{}{
			"roleRef": map[string]interface{}{
				"kind": "ClusterRole",
				"name": "admin",
			},
		}
		if got := getRoleRefKind(obj); got != "ClusterRole" {
			t.Errorf("got %q, want %q", got, "ClusterRole")
		}
	})

	t.Run("missing", func(t *testing.T) {
		if got := getRoleRefKind(map[string]interface{}{}); got != "" {
			t.Errorf("got %q, want empty", got)
		}
	})
}

func TestIsSystemClusterRole(t *testing.T) {
	tests := []struct {
		name string
		role string
		want bool
	}{
		{"system prefix", "system:controller:deployment-controller", true},
		{"admin exact", "admin", true},
		{"cluster-admin", "cluster-admin", true},
		{"edit", "edit", true},
		{"view", "view", true},
		{"kubeadm prefix", "kubeadm:get-nodes", true},
		{"calico prefix", "calico-node", true},
		{"custom role", "my-custom-role", false},
		{"app role", "app-reader", false},
		{"empty string", "", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := isSystemClusterRole(tt.role)
			if got != tt.want {
				t.Errorf("isSystemClusterRole(%q) = %v, want %v", tt.role, got, tt.want)
			}
		})
	}
}
