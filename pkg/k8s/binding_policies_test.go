package k8s

import (
	"context"
	"testing"
)

func TestListBindingPolicies(t *testing.T) {
	m, _ := NewMultiClusterClient("")
	bp, err := m.ListBindingPolicies(context.Background())
	if err != nil {
		t.Fatalf("ListBindingPolicies failed: %v", err)
	}
	if bp == nil {
		t.Fatal("Expected binding policies")
	}
	if len(bp.Items) != 0 {
		t.Error("Expected empty items")
	}
}
