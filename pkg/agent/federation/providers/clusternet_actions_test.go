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

func TestUnstructuredNestedBool(t *testing.T) {
	tests := []struct {
		name       string
		obj        map[string]interface{}
		fields     []string
		wantValue  bool
		wantFound  bool
		wantErr    bool
	}{
		{
			name: "simple bool field exists and is true",
			obj: map[string]interface{}{
				"approved": true,
			},
			fields:    []string{"approved"},
			wantValue: true,
			wantFound: true,
			wantErr:   false,
		},
		{
			name: "simple bool field exists and is false",
			obj: map[string]interface{}{
				"approved": false,
			},
			fields:    []string{"approved"},
			wantValue: false,
			wantFound: true,
			wantErr:   false,
		},
		{
			name: "nested bool field exists",
			obj: map[string]interface{}{
				"spec": map[string]interface{}{
					"approved": true,
				},
			},
			fields:    []string{"spec", "approved"},
			wantValue: true,
			wantFound: true,
			wantErr:   false,
		},
		{
			name: "deeply nested bool field exists",
			obj: map[string]interface{}{
				"spec": map[string]interface{}{
					"template": map[string]interface{}{
						"enabled": false,
					},
				},
			},
			fields:    []string{"spec", "template", "enabled"},
			wantValue: false,
			wantFound: true,
			wantErr:   false,
		},
		{
			name:      "field does not exist",
			obj:       map[string]interface{}{},
			fields:    []string{"missing"},
			wantValue: false,
			wantFound: false,
			wantErr:   false,
		},
		{
			name: "nested field does not exist",
			obj: map[string]interface{}{
				"spec": map[string]interface{}{},
			},
			fields:    []string{"spec", "missing"},
			wantValue: false,
			wantFound: false,
			wantErr:   false,
		},
		{
			name: "field is not bool",
			obj: map[string]interface{}{
				"value": "string",
			},
			fields:    []string{"value"},
			wantValue: false,
			wantFound: false,
			wantErr:   false,
		},
		{
			name: "intermediate field is not map",
			obj: map[string]interface{}{
				"spec": "not-a-map",
			},
			fields:    []string{"spec", "approved"},
			wantValue: false,
			wantFound: false,
			wantErr:   false,
		},
		{
			name: "nested field value is not bool",
			obj: map[string]interface{}{
				"spec": map[string]interface{}{
					"approved": 123,
				},
			},
			fields:    []string{"spec", "approved"},
			wantValue: false,
			wantFound: false,
			wantErr:   false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotValue, gotFound, gotErr := unstructuredNestedBool(tt.obj, tt.fields...)

			if (gotErr != nil) != tt.wantErr {
				t.Errorf("unstructuredNestedBool() error = %v, wantErr %v", gotErr, tt.wantErr)
				return
			}

			if gotValue != tt.wantValue {
				t.Errorf("unstructuredNestedBool() gotValue = %v, want %v", gotValue, tt.wantValue)
			}

			if gotFound != tt.wantFound {
				t.Errorf("unstructuredNestedBool() gotFound = %v, want %v", gotFound, tt.wantFound)
			}
		})
	}
}

func TestClusternetApproveCluster_ValidationErrors(t *testing.T) {
	tests := []struct {
		name             string
		clusterName      string
		wantErrSubstring string
	}{
		{
			name:             "empty cluster name",
			clusterName:      "",
			wantErrSubstring: "cluster  not found",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := clusternetApproveCluster(context.Background(), nil, tt.clusterName)
			if err == nil {
				t.Fatalf("expected error containing %q, got nil", tt.wantErrSubstring)
			}
		})
	}
}

func TestClusternetUnregisterCluster_ValidationErrors(t *testing.T) {
	tests := []struct {
		name             string
		clusterName      string
		wantErrSubstring string
	}{
		{
			name:             "empty cluster name",
			clusterName:      "",
			wantErrSubstring: "cluster  already removed",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := clusternetUnregisterCluster(context.Background(), nil, tt.clusterName)
			if err == nil {
				t.Fatalf("expected error, got nil")
			}
		})
	}
}
