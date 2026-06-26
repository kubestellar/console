package providers

import (
	"context"
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

func TestExecuteOCMApproveCSR_ValidationErrors(t *testing.T) {
	tests := []struct {
		name             string
		req              federation.ActionRequest
		wantErrSubstring string
	}{
		{
			name: "missing csrName",
			req: federation.ActionRequest{
				ActionID: ocmActionApproveCSR,
				Payload:  map[string]interface{}{},
			},
			wantErrSubstring: "payload.csrName is required",
		},
		{
			name: "empty csrName",
			req: federation.ActionRequest{
				ActionID: ocmActionApproveCSR,
				Payload: map[string]interface{}{
					"csrName": "",
				},
			},
			wantErrSubstring: "payload.csrName is required",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := executeOCMApproveCSR(context.Background(), nil, tt.req)
			if err == nil {
				t.Fatalf("expected error containing %q, got nil", tt.wantErrSubstring)
			}
			if !containsString(err.Error(), tt.wantErrSubstring) {
				t.Errorf("error = %v, want substring %q", err, tt.wantErrSubstring)
			}
		})
	}
}

func TestExecuteOCMAcceptCluster_ValidationErrors(t *testing.T) {
	tests := []struct {
		name             string
		req              federation.ActionRequest
		wantErrSubstring string
	}{
		{
			name: "missing clusterName",
			req: federation.ActionRequest{
				ActionID: ocmActionAcceptCluster,
			},
			wantErrSubstring: "clusterName is required",
		},
		{
			name: "empty clusterName",
			req: federation.ActionRequest{
				ActionID:    ocmActionAcceptCluster,
				ClusterName: "",
			},
			wantErrSubstring: "clusterName is required",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := executeOCMAcceptCluster(context.Background(), nil, tt.req)
			if err == nil {
				t.Fatalf("expected error containing %q, got nil", tt.wantErrSubstring)
			}
			if !containsString(err.Error(), tt.wantErrSubstring) {
				t.Errorf("error = %v, want substring %q", err, tt.wantErrSubstring)
			}
		})
	}
}

func TestExecuteOCMDetachCluster_ValidationErrors(t *testing.T) {
	tests := []struct {
		name             string
		req              federation.ActionRequest
		wantErrSubstring string
	}{
		{
			name: "missing clusterName",
			req: federation.ActionRequest{
				ActionID: ocmActionDetachCluster,
			},
			wantErrSubstring: "clusterName is required",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := executeOCMDetachCluster(context.Background(), nil, tt.req)
			if err == nil {
				t.Fatalf("expected error containing %q, got nil", tt.wantErrSubstring)
			}
			if !containsString(err.Error(), tt.wantErrSubstring) {
				t.Errorf("error = %v, want substring %q", err, tt.wantErrSubstring)
			}
		})
	}
}

func TestExecuteOCMTaintCluster_ValidationErrors(t *testing.T) {
	tests := []struct {
		name             string
		req              federation.ActionRequest
		wantErrSubstring string
	}{
		{
			name: "missing clusterName",
			req: federation.ActionRequest{
				ActionID: ocmActionTaintCluster,
				Payload: map[string]interface{}{
					"key":    "node-role.kubernetes.io/control-plane",
					"effect": "NoSchedule",
				},
			},
			wantErrSubstring: "clusterName is required",
		},
		{
			name: "missing taint key",
			req: federation.ActionRequest{
				ActionID:    ocmActionTaintCluster,
				ClusterName: "cluster-1",
				Payload: map[string]interface{}{
					"effect": "NoSchedule",
				},
			},
			wantErrSubstring: "payload.key and payload.effect are required",
		},
		{
			name: "missing taint effect",
			req: federation.ActionRequest{
				ActionID:    ocmActionTaintCluster,
				ClusterName: "cluster-1",
				Payload: map[string]interface{}{
					"key": "node-role.kubernetes.io/control-plane",
				},
			},
			wantErrSubstring: "payload.key and payload.effect are required",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := executeOCMTaintCluster(context.Background(), nil, tt.req)
			if err == nil {
				t.Fatalf("expected error containing %q, got nil", tt.wantErrSubstring)
			}
			if !containsString(err.Error(), tt.wantErrSubstring) {
				t.Errorf("error = %v, want substring %q", err, tt.wantErrSubstring)
			}
		})
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
