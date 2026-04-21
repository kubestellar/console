package providers

import (
	"testing"

	"github.com/kubestellar/console/pkg/agent/federation"
)

func TestKarmadaProviderActions(t *testing.T) {
	p := &karmadaProvider{}
	actions := p.Actions()

	// Karmada exposes exactly 3 actions in Phase 2.
	const expectedActionCount = 3
	if len(actions) != expectedActionCount {
		t.Fatalf("expected %d actions, got %d", expectedActionCount, len(actions))
	}

	// Build a lookup by ID for easier per-action assertions.
	byID := map[string]federation.ActionDescriptor{}
	for _, a := range actions {
		byID[a.ID] = a
	}

	// All actions should be owned by the Karmada provider.
	for _, a := range actions {
		if a.Provider != federation.ProviderKarmada {
			t.Errorf("action %s has provider %s, expected karmada", a.ID, a.Provider)
		}
	}

	// joinCluster: create verb, non-destructive.
	if a, ok := byID[karmadaActionJoinCluster]; !ok {
		t.Error("missing action karmada.joinCluster")
	} else {
		if a.Verb != "create" {
			t.Errorf("joinCluster verb = %s, want create", a.Verb)
		}
		if a.Destructive {
			t.Error("joinCluster should not be destructive")
		}
	}

	// unjoinCluster: delete verb, destructive.
	if a, ok := byID[karmadaActionUnjoinCluster]; !ok {
		t.Error("missing action karmada.unjoinCluster")
	} else {
		if a.Verb != "delete" {
			t.Errorf("unjoinCluster verb = %s, want delete", a.Verb)
		}
		if !a.Destructive {
			t.Error("unjoinCluster should be destructive")
		}
	}

	// taintCluster: patch verb, non-destructive.
	if a, ok := byID[karmadaActionTaintCluster]; !ok {
		t.Error("missing action karmada.taintCluster")
	} else {
		if a.Verb != "patch" {
			t.Errorf("taintCluster verb = %s, want patch", a.Verb)
		}
		if a.Destructive {
			t.Error("taintCluster should not be destructive")
		}
	}
}

func TestKarmadaActionProviderInterface(t *testing.T) {
	// Verify that karmadaProvider satisfies the ActionProvider interface at the
	// type level. The compile-time check in karmada_actions.go catches this too,
	// but this test makes the assertion explicit and test-discoverable.
	var p federation.Provider = &karmadaProvider{}
	ap, ok := p.(federation.ActionProvider)
	if !ok {
		t.Fatal("karmadaProvider does not implement ActionProvider")
	}
	if ap.Name() != federation.ProviderKarmada {
		t.Errorf("expected provider name karmada, got %s", ap.Name())
	}
}

func TestKarmadaExecuteUnknownAction(t *testing.T) {
	p := &karmadaProvider{}
	req := federation.ActionRequest{
		ActionID: "karmada.nonexistent",
		Provider: federation.ProviderKarmada,
	}
	_, err := p.Execute(nil, nil, req)
	if err == nil {
		t.Error("expected error for unknown action")
	}
}
