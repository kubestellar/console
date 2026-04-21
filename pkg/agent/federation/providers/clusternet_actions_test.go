package providers

import (
	"context"
	"errors"
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
		if !d.ClusterNameRequired {
			t.Error("approveCluster must require a cluster name")
		}
		if d.Label == "" {
			t.Error("approveCluster label must not be empty")
		}
		if d.Description == "" {
			t.Error("approveCluster description must not be empty")
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
		if !d.ClusterNameRequired {
			t.Error("unregisterCluster must require a cluster name")
		}
		if d.Label == "" {
			t.Error("unregisterCluster label must not be empty")
		}
		if d.Description == "" {
			t.Error("unregisterCluster description must not be empty")
		}
	})
}

func TestClusternetInterfaceConformance(t *testing.T) {
	// compile-time check is in clusternet_actions.go; this exercises it at run-time too.
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
		t.Fatal("expected error for unknown action, got nil")
	}
	if !errors.Is(err, federation.ErrUnknownAction) {
		t.Errorf("expected ErrUnknownAction, got %v", err)
	}
}
