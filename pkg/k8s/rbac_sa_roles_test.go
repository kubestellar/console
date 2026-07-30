package k8s

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestIsSystemRole(t *testing.T) {
	tests := []struct {
		name   string
		input  string
		expect bool
	}{
		{"system: prefix", "system:controller:deployment-controller", true},
		{"system:node", "system:node", true},
		{"kubeadm: prefix", "kubeadm:bootstrap-signer", true},
		{"calico- prefix", "calico-node", true},
		{"calico- typha", "calico-typha", true},
		{"cilium- prefix", "cilium-operator", true},
		{"cilium- agent", "cilium-agent", true},
		{"custom role", "my-app-role", false},
		{"admin (not system)", "admin", false},
		{"cluster-admin (not system)", "cluster-admin", false},
		{"empty string", "", false},
		{"partial match", "not-system:something", false},
		{"prefix as substring", "mysystem:role", false},
		{"view role", "view", false},
		{"edit role", "edit", false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.expect, isSystemRole(tc.input), "isSystemRole(%q)", tc.input)
		})
	}
}
