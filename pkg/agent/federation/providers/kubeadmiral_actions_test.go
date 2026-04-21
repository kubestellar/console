package providers

import (
	"context"
	"errors"
	"testing"

	"github.com/kubestellar/console/pkg/agent/federation"
)

func TestKubeAdmiralActionDescriptors(t *testing.T) {
	p := &kubeAdmiralProvider{}
	descs := p.Actions()

	if len(descs) != 1 {
		t.Fatalf("expected 1 action descriptor, got %d", len(descs))
	}

	d := descs[0]
	if d.ID != kubeAdmiralActionUnfederateCluster {
		t.Errorf("expected action ID %q, got %q", kubeAdmiralActionUnfederateCluster, d.ID)
	}
	if !d.Destructive {
		t.Error("unfederateCluster must be destructive")
	}
	if !d.ClusterNameRequired {
		t.Error("unfederateCluster must require a cluster name")
	}
	if d.Label == "" {
		t.Error("unfederateCluster label must not be empty")
	}
	if d.Description == "" {
		t.Error("unfederateCluster description must not be empty")
	}
}

func TestKubeAdmiralInterfaceConformance(t *testing.T) {
	// compile-time check is in kubeadmiral_actions.go; this exercises it at run-time too.
	var p federation.ActionProvider = &kubeAdmiralProvider{}
	if p.Name() != federation.ProviderKubeAdmiral {
		t.Errorf("expected provider name %q, got %q", federation.ProviderKubeAdmiral, p.Name())
	}
}

func TestKubeAdmiralExecuteUnknownAction(t *testing.T) {
	p := &kubeAdmiralProvider{}
	_, err := p.Execute(context.Background(), nil, federation.ActionRequest{
		ActionID: "kubeadmiral.doesNotExist",
	})
	if err == nil {
		t.Fatal("expected error for unknown action, got nil")
	}
	if !errors.Is(err, federation.ErrUnknownAction) {
		t.Errorf("expected ErrUnknownAction, got %v", err)
	}
}
