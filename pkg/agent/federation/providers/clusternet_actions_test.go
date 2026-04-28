package providers

import (
	"context"
	"testing"

	"github.com/kubestellar/console/pkg/agent/federation"
)

func TestClusternetActionDescriptors(t *testing.T) {
	p := &clusternetProvider{}
	descs := p.Actions()

	if len(descs) != 2 {
		t.Fatalf("expected 2 action descriptors, got %d", len(descs))
	}

	byID := map[string]federation.ActionDescriptor{}
	for _, d := range descs {
		byID[d.ID] = d
	}

	t.Run("approveCluster", func(t *testing.T) {
		d, ok := byID[clusternetActionApproveCluster]
		if !ok {
			t.Fatal("approveCluster descriptor missing")
		}
		if d.Destructive {
			t.Error("approveCluster must not be destructive")
		}
		if d.Label == "" {
			t.Error("approveCluster label must not be empty")
		}
		if d.Verb == "" {
			t.Error("approveCluster verb must not be empty")
		}
		if d.Provider != "clusternet" {
			t.Errorf("expected provider clusternet, got %q", d.Provider)
		}
	})

	t.Run("unregisterCluster", func(t *testing.T) {
		d, ok := byID[clusternetActionUnregisterCluster]
		if !ok {
			t.Fatal("unregisterCluster descriptor missing")
		}
		if !d.Destructive {
			t.Error("unregisterCluster must be destructive")
		}
		if d.Label == "" {
			t.Error("unregisterCluster label must not be empty")
		}
		if d.Verb == "" {
			t.Error("unregisterCluster verb must not be empty")
		}
		if d.Provider != "clusternet" {
			t.Errorf("expected provider clusternet, got %q", d.Provider)
		}
	})
}

func TestClusternetInterfaceConformance(t *testing.T) {
	var p federation.ActionProvider = &clusternetProvider{}
	if p.Name() != federation.ProviderClusternet {
		t.Errorf("expected provider name %q, got %q", federation.ProviderClusternet, p.Name())
	}
}

func TestClusternetExecuteUnknownAction(t *testing.T) {
	p := &clusternetProvider{}
	_, err := p.Execute(context.Background(), nil, federation.ActionRequest{
		ActionID: "clusternet.doesNotExist",
	})
	if err == nil {
		t.Error("expected error for unknown action")
	}
}
