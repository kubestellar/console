package providers

import (
	"context"
	"testing"

	"github.com/kubestellar/console/pkg/agent/federation"
)

func TestLiqoActionDescriptors(t *testing.T) {
	p := &liqoProvider{}
	descs := p.Actions()

	if len(descs) != 1 {
		t.Fatalf("expected 1 action descriptor, got %d", len(descs))
	}

	d := descs[0]
	if d.ID != liqoActionUnpeerWith {
		t.Errorf("expected action ID %q, got %q", liqoActionUnpeerWith, d.ID)
	}
	if !d.Destructive {
		t.Error("unpeerWith must be destructive")
	}
	if d.Label == "" {
		t.Error("unpeerWith label must not be empty")
	}
	if d.Verb == "" {
		t.Error("unpeerWith verb must not be empty")
	}
	if d.Provider != "liqo" {
		t.Errorf("expected provider liqo, got %q", d.Provider)
	}
}

func TestLiqoInterfaceConformance(t *testing.T) {
	var p federation.ActionProvider = &liqoProvider{}
	if p.Name() != federation.ProviderLiqo {
		t.Errorf("expected provider name %q, got %q", federation.ProviderLiqo, p.Name())
	}
}

func TestLiqoExecuteUnknownAction(t *testing.T) {
	p := &liqoProvider{}
	_, err := p.Execute(context.Background(), nil, federation.ActionRequest{
		ActionID: "liqo.doesNotExist",
	})
	if err == nil {
		t.Error("expected error for unknown action")
	}
}
