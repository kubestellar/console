package providers

import (
	"context"
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
	if d.Label == "" {
		t.Error("unfederateCluster label must not be empty")
	}
	if d.Verb == "" {
		t.Error("unfederateCluster verb must not be empty")
	}
	if d.Provider != "kubeadmiral" {
		t.Errorf("expected provider kubeadmiral, got %q", d.Provider)
	}
}

func TestKubeAdmiralInterfaceConformance(t *testing.T) {
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
		t.Error("expected error for unknown action")
	}
}
