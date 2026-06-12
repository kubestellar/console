package providers

import (
	"context"
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

func TestExecuteCAPIScaleMachineDeployment_ValidationErrors(t *testing.T) {
	tests := []struct {
		name             string
		req              federation.ActionRequest
		wantErrSubstring string
	}{
		{
			name: "missing payload name",
			req: federation.ActionRequest{
				ActionID: capiActionScaleMachineDeployment,
				Payload: map[string]interface{}{
					"namespace": "default",
					"replicas":  float64(5),
				},
			},
			wantErrSubstring: "payload.name",
		},
		{
			name: "missing payload namespace",
			req: federation.ActionRequest{
				ActionID: capiActionScaleMachineDeployment,
				Payload: map[string]interface{}{
					"name":     "md-workers",
					"replicas": float64(5),
				},
			},
			wantErrSubstring: "payload.namespace",
		},
		{
			name: "missing payload replicas",
			req: federation.ActionRequest{
				ActionID: capiActionScaleMachineDeployment,
				Payload: map[string]interface{}{
					"name":      "md-workers",
					"namespace": "default",
				},
			},
			wantErrSubstring: "payload.replicas",
		},
		{
			name: "empty name",
			req: federation.ActionRequest{
				ActionID: capiActionScaleMachineDeployment,
				Payload: map[string]interface{}{
					"name":      "",
					"namespace": "default",
					"replicas":  float64(3),
				},
			},
			wantErrSubstring: "payload.name",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := executeCAPIScaleMachineDeployment(context.Background(), nil, tt.req)
			if err == nil {
				t.Fatalf("expected error containing %q, got nil", tt.wantErrSubstring)
			}
			if !containsString(err.Error(), tt.wantErrSubstring) {
				t.Errorf("error = %v, want substring %q", err, tt.wantErrSubstring)
			}
		})
	}
}

func TestExecuteCAPIDeleteCluster_ValidationErrors(t *testing.T) {
	tests := []struct {
		name             string
		req              federation.ActionRequest
		wantErrSubstring string
	}{
		{
			name: "missing clusterName",
			req: federation.ActionRequest{
				ActionID: capiActionDeleteCluster,
				Payload: map[string]interface{}{
					"namespace": "default",
				},
			},
			wantErrSubstring: "clusterName is required",
		},
		{
			name: "missing payload namespace",
			req: federation.ActionRequest{
				ActionID:    capiActionDeleteCluster,
				ClusterName: "cluster-1",
				Payload:     map[string]interface{}{},
			},
			wantErrSubstring: "payload.namespace is required",
		},
		{
			name: "empty clusterName",
			req: federation.ActionRequest{
				ActionID:    capiActionDeleteCluster,
				ClusterName: "",
				Payload: map[string]interface{}{
					"namespace": "default",
				},
			},
			wantErrSubstring: "clusterName is required",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := executeCAPIDeleteCluster(context.Background(), nil, tt.req)
			if err == nil {
				t.Fatalf("expected error containing %q, got nil", tt.wantErrSubstring)
			}
			if !containsString(err.Error(), tt.wantErrSubstring) {
				t.Errorf("error = %v, want substring %q", err, tt.wantErrSubstring)
			}
		})
	}
}

func TestExecuteCAPIRetryProvisioning_ValidationErrors(t *testing.T) {
	tests := []struct {
		name             string
		req              federation.ActionRequest
		wantErrSubstring string
	}{
		{
			name: "missing clusterName",
			req: federation.ActionRequest{
				ActionID: capiActionRetryProvisioning,
				Payload: map[string]interface{}{
					"namespace": "default",
				},
			},
			wantErrSubstring: "clusterName is required",
		},
		{
			name: "missing payload namespace",
			req: federation.ActionRequest{
				ActionID:    capiActionRetryProvisioning,
				ClusterName: "cluster-1",
				Payload:     map[string]interface{}{},
			},
			wantErrSubstring: "payload.namespace is required",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := executeCAPIRetryProvisioning(context.Background(), nil, tt.req)
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
