package k8s

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// --- bindingReferencesSA tests ---

func TestBindingReferencesSA_ExactMatch(t *testing.T) {
	obj := map[string]interface{}{
		"subjects": []interface{}{
			map[string]interface{}{
				"kind":      "ServiceAccount",
				"name":      "my-sa",
				"namespace": "default",
			},
		},
	}
	assert.True(t, bindingReferencesSA(obj, "my-sa", "default"))
}

func TestBindingReferencesSA_EmptyNamespaceInBinding(t *testing.T) {
	// When namespace is empty in the binding, it should still match
	obj := map[string]interface{}{
		"subjects": []interface{}{
			map[string]interface{}{
				"kind": "ServiceAccount",
				"name": "my-sa",
			},
		},
	}
	assert.True(t, bindingReferencesSA(obj, "my-sa", "kube-system"))
}

func TestBindingReferencesSA_WrongName(t *testing.T) {
	obj := map[string]interface{}{
		"subjects": []interface{}{
			map[string]interface{}{
				"kind":      "ServiceAccount",
				"name":      "other-sa",
				"namespace": "default",
			},
		},
	}
	assert.False(t, bindingReferencesSA(obj, "my-sa", "default"))
}

func TestBindingReferencesSA_WrongNamespace(t *testing.T) {
	obj := map[string]interface{}{
		"subjects": []interface{}{
			map[string]interface{}{
				"kind":      "ServiceAccount",
				"name":      "my-sa",
				"namespace": "other-ns",
			},
		},
	}
	assert.False(t, bindingReferencesSA(obj, "my-sa", "default"))
}

func TestBindingReferencesSA_WrongKind(t *testing.T) {
	obj := map[string]interface{}{
		"subjects": []interface{}{
			map[string]interface{}{
				"kind":      "User",
				"name":      "my-sa",
				"namespace": "default",
			},
		},
	}
	assert.False(t, bindingReferencesSA(obj, "my-sa", "default"))
}

func TestBindingReferencesSA_MultipleSubjects(t *testing.T) {
	obj := map[string]interface{}{
		"subjects": []interface{}{
			map[string]interface{}{"kind": "User", "name": "admin"},
			map[string]interface{}{"kind": "Group", "name": "devs"},
			map[string]interface{}{"kind": "ServiceAccount", "name": "target-sa", "namespace": "prod"},
		},
	}
	assert.True(t, bindingReferencesSA(obj, "target-sa", "prod"))
}

func TestBindingReferencesSA_NoSubjects(t *testing.T) {
	obj := map[string]interface{}{}
	assert.False(t, bindingReferencesSA(obj, "my-sa", "default"))
}

func TestBindingReferencesSA_MalformedSubjects(t *testing.T) {
	obj := map[string]interface{}{
		"subjects": []interface{}{"not-a-map", 42},
	}
	assert.False(t, bindingReferencesSA(obj, "my-sa", "default"))
}

// --- getRoleRefName tests ---

func TestGetRoleRefName_Valid(t *testing.T) {
	obj := map[string]interface{}{
		"roleRef": map[string]interface{}{
			"apiGroup": "rbac.authorization.k8s.io",
			"kind":     "ClusterRole",
			"name":     "my-role",
		},
	}
	assert.Equal(t, "my-role", getRoleRefName(obj))
}

func TestGetRoleRefName_MissingRoleRef(t *testing.T) {
	obj := map[string]interface{}{}
	assert.Equal(t, "", getRoleRefName(obj))
}

func TestGetRoleRefName_MissingName(t *testing.T) {
	obj := map[string]interface{}{
		"roleRef": map[string]interface{}{"kind": "ClusterRole"},
	}
	assert.Equal(t, "", getRoleRefName(obj))
}

// --- getRoleRefKind tests ---

func TestGetRoleRefKind_Valid(t *testing.T) {
	obj := map[string]interface{}{
		"roleRef": map[string]interface{}{
			"kind": "ClusterRole",
			"name": "admin",
		},
	}
	assert.Equal(t, "ClusterRole", getRoleRefKind(obj))
}

func TestGetRoleRefKind_MissingRoleRef(t *testing.T) {
	obj := map[string]interface{}{}
	assert.Equal(t, "", getRoleRefKind(obj))
}

// --- isSystemClusterRole tests ---

func TestIsSystemClusterRole_SystemPrefixes(t *testing.T) {
	tests := []struct {
		name   string
		input  string
		expect bool
	}{
		{"system: prefix", "system:controller:deployment-controller", true},
		{"admin exact", "admin", true},
		{"cluster-admin exact", "cluster-admin", true},
		{"edit exact", "edit", true},
		{"view exact", "view", true},
		{"kubeadm: prefix", "kubeadm:bootstrap-signer", true},
		{"calico prefix", "calico-node", true},
		{"flannel prefix", "flannel-runner", true},
		{"kindnet prefix", "kindnet-cni", true},
		{"custom role", "my-app-role", false},
		{"empty string", "", false},
		{"partial match not prefix", "not-system:role", false},
		{"viewer (not view)", "viewer", false},
		{"administrator", "administrator", false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.expect, isSystemClusterRole(tc.input), "isSystemClusterRole(%q)", tc.input)
		})
	}
}
