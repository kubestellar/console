package providers

import (
	"context"
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

func TestExecuteKarmadaJoinCluster_ValidationErrors(t *testing.T) {
	tests := []struct {
		name             string
		req              federation.ActionRequest
		wantErrSubstring string
	}{
		{
			name: "missing clusterName",
			req: federation.ActionRequest{
				ActionID: karmadaActionJoinCluster,
				Payload: map[string]interface{}{
					"apiEndpoint": "https://api.cluster.local:6443",
				},
			},
			wantErrSubstring: "clusterName is required",
		},
		{
			name: "missing apiEndpoint",
			req: federation.ActionRequest{
				ActionID:    karmadaActionJoinCluster,
				ClusterName: "cluster-1",
				Payload:     map[string]interface{}{},
			},
			wantErrSubstring: "payload.apiEndpoint is required",
		},
		{
			name: "empty clusterName",
			req: federation.ActionRequest{
				ActionID:    karmadaActionJoinCluster,
				ClusterName: "",
				Payload: map[string]interface{}{
					"apiEndpoint": "https://api.cluster.local:6443",
				},
			},
			wantErrSubstring: "clusterName is required",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := executeKarmadaJoinCluster(context.Background(), nil, tt.req)
			if err == nil {
				t.Fatalf("expected error containing %q, got nil", tt.wantErrSubstring)
			}
			if !containsString(err.Error(), tt.wantErrSubstring) {
				t.Errorf("error = %v, want substring %q", err, tt.wantErrSubstring)
			}
		})
	}
}

func TestExecuteKarmadaUnjoinCluster_ValidationErrors(t *testing.T) {
	tests := []struct {
		name             string
		req              federation.ActionRequest
		wantErrSubstring string
	}{
		{
			name: "missing clusterName",
			req: federation.ActionRequest{
				ActionID: karmadaActionUnjoinCluster,
			},
			wantErrSubstring: "clusterName is required",
		},
		{
			name: "empty clusterName",
			req: federation.ActionRequest{
				ActionID:    karmadaActionUnjoinCluster,
				ClusterName: "",
			},
			wantErrSubstring: "clusterName is required",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := executeKarmadaUnjoinCluster(context.Background(), nil, tt.req)
			if err == nil {
				t.Fatalf("expected error containing %q, got nil", tt.wantErrSubstring)
			}
			if !containsString(err.Error(), tt.wantErrSubstring) {
				t.Errorf("error = %v, want substring %q", err, tt.wantErrSubstring)
			}
		})
	}
}

func TestExecuteKarmadaTaintCluster_ValidationErrors(t *testing.T) {
	tests := []struct {
		name             string
		req              federation.ActionRequest
		wantErrSubstring string
	}{
		{
			name: "missing clusterName",
			req: federation.ActionRequest{
				ActionID: karmadaActionTaintCluster,
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
				ActionID:    karmadaActionTaintCluster,
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
				ActionID:    karmadaActionTaintCluster,
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
			_, err := executeKarmadaTaintCluster(context.Background(), nil, tt.req)
			if err == nil {
				t.Fatalf("expected error containing %q, got nil", tt.wantErrSubstring)
			}
			if !containsString(err.Error(), tt.wantErrSubstring) {
				t.Errorf("error = %v, want substring %q", err, tt.wantErrSubstring)
			}
		})
	}
}

// containsString checks if s contains substring.
func containsString(s, substring string) bool {
	if len(substring) == 0 {
		return true
	}
	if len(s) < len(substring) {
		return false
	}
	for i := 0; i <= len(s)-len(substring); i++ {
		if s[i:i+len(substring)] == substring {
			return true
		}
	}
	return false
}
