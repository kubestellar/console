package providers

import (
	"testing"

	"github.com/kubestellar/console/pkg/agent/federation"
)

func TestOCMProviderActions(t *testing.T) {
	p := &ocmProvider{}
	actions := p.Actions()

	// OCM should expose exactly 4 actions in Phase 2.
	const expectedActionCount = 4
	if len(actions) != expectedActionCount {
		t.Fatalf("expected %d actions, got %d", expectedActionCount, len(actions))
	}

	// Build a lookup by ID for easier assertions.
	byID := map[string]federation.ActionDescriptor{}
	for _, a := range actions {
		byID[a.ID] = a
	}

	// All actions should belong to OCM.
	for _, a := range actions {
		if a.Provider != federation.ProviderOCM {
			t.Errorf("action %s has provider %s, expected ocm", a.ID, a.Provider)
		}
	}

	// approveCSR: update verb, non-destructive.
	if a, ok := byID[ocmActionApproveCSR]; !ok {
		t.Error("missing action ocm.approveCSR")
	} else {
		if a.Verb != "update" {
			t.Errorf("approveCSR verb = %s, want update", a.Verb)
		}
		if a.Destructive {
			t.Error("approveCSR should not be destructive")
		}
	}

	// acceptCluster: patch verb, non-destructive.
	if a, ok := byID[ocmActionAcceptCluster]; !ok {
		t.Error("missing action ocm.acceptCluster")
	} else {
		if a.Verb != "patch" {
			t.Errorf("acceptCluster verb = %s, want patch", a.Verb)
		}
		if a.Destructive {
			t.Error("acceptCluster should not be destructive")
		}
	}

	// detachCluster: delete verb, destructive.
	if a, ok := byID[ocmActionDetachCluster]; !ok {
		t.Error("missing action ocm.detachCluster")
	} else {
		if a.Verb != "delete" {
			t.Errorf("detachCluster verb = %s, want delete", a.Verb)
		}
		if !a.Destructive {
			t.Error("detachCluster should be destructive")
		}
	}

	// taintCluster: patch verb, non-destructive.
	if a, ok := byID[ocmActionTaintCluster]; !ok {
		t.Error("missing action ocm.taintCluster")
	} else {
		if a.Verb != "patch" {
			t.Errorf("taintCluster verb = %s, want patch", a.Verb)
		}
		if a.Destructive {
			t.Error("taintCluster should not be destructive")
		}
	}
}

func TestOCMActionProviderInterface(t *testing.T) {
	// Verify that ocmProvider satisfies the ActionProvider interface at the
	// type level. The compile-time check in ocm_actions.go catches this too,
	// but this test makes the assertion explicit and test-discoverable.
	var p federation.Provider = &ocmProvider{}
	ap, ok := p.(federation.ActionProvider)
	if !ok {
		t.Fatal("ocmProvider does not implement ActionProvider")
	}
	if ap.Name() != federation.ProviderOCM {
		t.Errorf("expected provider name ocm, got %s", ap.Name())
	}
}

func TestOCMExecuteUnknownAction(t *testing.T) {
	p := &ocmProvider{}
	req := federation.ActionRequest{
		ActionID: "ocm.nonexistent",
		Provider: federation.ProviderOCM,
	}
	_, err := p.Execute(nil, nil, req)
	if err == nil {
		t.Error("expected error for unknown action")
	}
}

func TestIsConflictError(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want bool
	}{
		{"nil", nil, false},
		{"conflict 409", errFromString("Operation cannot be fulfilled: 409"), true},
		{"conflict text", errFromString("the object has been modified"), true},
		{"not conflict", errFromString("connection refused"), false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isConflictError(tt.err); got != tt.want {
				t.Errorf("isConflictError(%v) = %v, want %v", tt.err, got, tt.want)
			}
		})
	}
}

func TestIsNotFoundError(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want bool
	}{
		{"nil", nil, false},
		{"not found", errFromString("managedclusters \"foo\" not found"), true},
		{"404", errFromString("the server responded with 404"), true},
		{"other", errFromString("timeout"), false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isNotFoundError(tt.err); got != tt.want {
				t.Errorf("isNotFoundError(%v) = %v, want %v", tt.err, got, tt.want)
			}
		})
	}
}

// errFromString is a minimal error type for tests.
type errString string

func errFromString(s string) error  { return errString(s) }
func (e errString) Error() string   { return string(e) }
