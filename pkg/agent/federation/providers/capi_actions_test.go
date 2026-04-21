package providers

import (
	"testing"

	"github.com/kubestellar/console/pkg/agent/federation"
)

func TestCAPIProviderActions(t *testing.T) {
	p := &capiProvider{}
	actions := p.Actions()

	// CAPI should expose exactly 3 actions in Phase 2.
	const expectedActionCount = 3
	if len(actions) != expectedActionCount {
		t.Fatalf("expected %d actions, got %d", expectedActionCount, len(actions))
	}

	// Build a lookup by ID for easier assertions.
	byID := map[string]federation.ActionDescriptor{}
	for _, a := range actions {
		byID[a.ID] = a
	}

	// All actions should belong to CAPI.
	for _, a := range actions {
		if a.Provider != federation.ProviderCAPI {
			t.Errorf("action %s has provider %s, expected capi", a.ID, a.Provider)
		}
	}

	// scaleMachineDeployment: patch verb, non-destructive.
	if a, ok := byID[capiActionScaleMachineDeployment]; !ok {
		t.Error("missing action capi.scaleMachineDeployment")
	} else {
		if a.Verb != "patch" {
			t.Errorf("scaleMachineDeployment verb = %s, want patch", a.Verb)
		}
		if a.Destructive {
			t.Error("scaleMachineDeployment should not be destructive")
		}
	}

	// deleteCluster: delete verb, destructive.
	if a, ok := byID[capiActionDeleteCluster]; !ok {
		t.Error("missing action capi.deleteCluster")
	} else {
		if a.Verb != "delete" {
			t.Errorf("deleteCluster verb = %s, want delete", a.Verb)
		}
		if !a.Destructive {
			t.Error("deleteCluster should be destructive")
		}
	}

	// retryProvisioning: patch verb, non-destructive.
	if a, ok := byID[capiActionRetryProvisioning]; !ok {
		t.Error("missing action capi.retryProvisioning")
	} else {
		if a.Verb != "patch" {
			t.Errorf("retryProvisioning verb = %s, want patch", a.Verb)
		}
		if a.Destructive {
			t.Error("retryProvisioning should not be destructive")
		}
	}
}

func TestCAPIActionProviderInterface(t *testing.T) {
	// Verify that capiProvider satisfies the ActionProvider interface at the
	// type level. The compile-time check in capi_actions.go catches this too,
	// but this test makes the assertion explicit and test-discoverable.
	var p federation.Provider = &capiProvider{}
	ap, ok := p.(federation.ActionProvider)
	if !ok {
		t.Fatal("capiProvider does not implement ActionProvider")
	}
	if ap.Name() != federation.ProviderCAPI {
		t.Errorf("expected provider name capi, got %s", ap.Name())
	}
}

func TestCAPIExecuteUnknownAction(t *testing.T) {
	p := &capiProvider{}
	req := federation.ActionRequest{
		ActionID: "capi.nonexistent",
		Provider: federation.ProviderCAPI,
	}
	_, err := p.Execute(nil, nil, req)
	if err == nil {
		t.Error("expected error for unknown action")
	}
}
