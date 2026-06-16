package kagent

import (
	"errors"
	"testing"

	"k8s.io/apimachinery/pkg/api/meta"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

// ---------------------------------------------------------------------------
// nestedString
// ---------------------------------------------------------------------------

func TestNestedString(t *testing.T) {
	tests := []struct {
		name   string
		obj    map[string]any
		fields []string
		want   string
	}{
		{
			name:   "top-level key present",
			obj:    map[string]any{"name": "agent-1"},
			fields: []string{"name"},
			want:   "agent-1",
		},
		{
			name:   "nested key present",
			obj:    map[string]any{"spec": map[string]any{"runtime": "k8s"}},
			fields: []string{"spec", "runtime"},
			want:   "k8s",
		},
		{
			name:   "missing key returns empty",
			obj:    map[string]any{"name": "agent-1"},
			fields: []string{"missing"},
			want:   "",
		},
		{
			name:   "nil map returns empty",
			obj:    nil,
			fields: []string{"name"},
			want:   "",
		},
		{
			name:   "wrong type returns empty",
			obj:    map[string]any{"count": int64(42)},
			fields: []string{"count"},
			want:   "",
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := nestedString(tc.obj, tc.fields...)
			if got != tc.want {
				t.Errorf("nestedString() = %q, want %q", got, tc.want)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// nestedInt64
// ---------------------------------------------------------------------------

func TestNestedInt64(t *testing.T) {
	tests := []struct {
		name   string
		obj    map[string]any
		fields []string
		want   int64
	}{
		{
			name:   "present",
			obj:    map[string]any{"count": int64(5)},
			fields: []string{"count"},
			want:   5,
		},
		{
			name:   "missing returns 0",
			obj:    map[string]any{},
			fields: []string{"count"},
			want:   0,
		},
		{
			name:   "nil map returns 0",
			obj:    nil,
			fields: []string{"count"},
			want:   0,
		},
		{
			name:   "wrong type returns 0",
			obj:    map[string]any{"count": "five"},
			fields: []string{"count"},
			want:   0,
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := nestedInt64(tc.obj, tc.fields...)
			if got != tc.want {
				t.Errorf("nestedInt64() = %d, want %d", got, tc.want)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// nestedStringSlice
// ---------------------------------------------------------------------------

func TestNestedStringSlice(t *testing.T) {
	tests := []struct {
		name   string
		obj    map[string]any
		fields []string
		want   []string
	}{
		{
			name:   "present",
			obj:    map[string]any{"tags": []any{"a", "b"}},
			fields: []string{"tags"},
			want:   []string{"a", "b"},
		},
		{
			name:   "missing returns nil",
			obj:    map[string]any{},
			fields: []string{"tags"},
			want:   nil,
		},
		{
			name:   "nil map returns nil",
			obj:    nil,
			fields: []string{"tags"},
			want:   nil,
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := nestedStringSlice(tc.obj, tc.fields...)
			if len(got) != len(tc.want) {
				t.Errorf("nestedStringSlice() len = %d, want %d", len(got), len(tc.want))
				return
			}
			for i := range got {
				if got[i] != tc.want[i] {
					t.Errorf("nestedStringSlice()[%d] = %q, want %q", i, got[i], tc.want[i])
				}
			}
		})
	}
}

// ---------------------------------------------------------------------------
// extractConditionStatus
// ---------------------------------------------------------------------------

func TestExtractConditionStatus(t *testing.T) {
	tests := []struct {
		name          string
		statusMap     map[string]any
		conditionType string
		want          bool
	}{
		{
			name: "condition True",
			statusMap: map[string]any{
				"conditions": []any{
					map[string]any{"type": "Ready", "status": "True"},
				},
			},
			conditionType: "Ready",
			want:          true,
		},
		{
			name: "condition False",
			statusMap: map[string]any{
				"conditions": []any{
					map[string]any{"type": "Ready", "status": "False"},
				},
			},
			conditionType: "Ready",
			want:          false,
		},
		{
			name: "condition not found",
			statusMap: map[string]any{
				"conditions": []any{
					map[string]any{"type": "Available", "status": "True"},
				},
			},
			conditionType: "Ready",
			want:          false,
		},
		{
			name:          "no conditions field",
			statusMap:     map[string]any{},
			conditionType: "Ready",
			want:          false,
		},
		{
			name: "nil statusMap",
			statusMap: map[string]any{
				"conditions": []any{
					"not-a-map",
				},
			},
			conditionType: "Ready",
			want:          false,
		},
		{
			name: "multiple conditions picks correct one",
			statusMap: map[string]any{
				"conditions": []any{
					map[string]any{"type": "Available", "status": "False"},
					map[string]any{"type": "Ready", "status": "True"},
					map[string]any{"type": "Progressing", "status": "True"},
				},
			},
			conditionType: "Ready",
			want:          true,
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := extractConditionStatus(tc.statusMap, tc.conditionType)
			if got != tc.want {
				t.Errorf("extractConditionStatus() = %v, want %v", got, tc.want)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// isCRDNotInstalledErr
// ---------------------------------------------------------------------------

func TestIsCRDNotInstalledErr(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want bool
	}{
		{
			name: "nil error",
			err:  nil,
			want: false,
		},
		{
			name: "NoKindMatchError",
			err:  &meta.NoKindMatchError{GroupKind: schema.GroupKind{Group: "kagent.dev", Kind: "Agent"}},
			want: true,
		},
		{
			name: "resource not found message",
			err:  errors.New("the server could not find the requested resource"),
			want: true,
		},
		{
			name: "no matches for kind message",
			err:  errors.New("no matches for kind \"Agent\" in version \"v1\""),
			want: true,
		},
		{
			name: "unrelated error",
			err:  errors.New("connection refused"),
			want: false,
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := isCRDNotInstalledErr(tc.err)
			if got != tc.want {
				t.Errorf("isCRDNotInstalledErr() = %v, want %v", got, tc.want)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// extractDiscoveredTools
// ---------------------------------------------------------------------------

func TestExtractDiscoveredTools(t *testing.T) {
	tests := []struct {
		name      string
		statusMap map[string]any
		wantLen   int
		wantFirst string
	}{
		{
			name:      "no discoveredTools field",
			statusMap: map[string]any{},
			wantLen:   0,
		},
		{
			name: "empty list",
			statusMap: map[string]any{
				"discoveredTools": []any{},
			},
			wantLen: 0,
		},
		{
			name: "valid tools",
			statusMap: map[string]any{
				"discoveredTools": []any{
					map[string]any{"name": "kubectl", "description": "Kubernetes CLI"},
					map[string]any{"name": "helm", "description": "Package manager"},
				},
			},
			wantLen:   2,
			wantFirst: "kubectl",
		},
		{
			name: "skips non-map items",
			statusMap: map[string]any{
				"discoveredTools": []any{
					"not-a-map",
					map[string]any{"name": "kubectl", "description": "CLI"},
				},
			},
			wantLen:   1,
			wantFirst: "kubectl",
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := extractDiscoveredTools(tc.statusMap)
			if len(got) != tc.wantLen {
				t.Fatalf("extractDiscoveredTools() len = %d, want %d", len(got), tc.wantLen)
			}
			if tc.wantLen > 0 && got[0].Name != tc.wantFirst {
				t.Errorf("first tool name = %q, want %q", got[0].Name, tc.wantFirst)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// extractDiscoveredModels
// ---------------------------------------------------------------------------

func TestExtractDiscoveredModels(t *testing.T) {
	tests := []struct {
		name      string
		statusMap map[string]any
		wantLen   int
		wantFirst string
	}{
		{
			name:      "no discoveredModels field",
			statusMap: map[string]any{},
			wantLen:   0,
		},
		{
			name: "valid models",
			statusMap: map[string]any{
				"discoveredModels": []any{
					map[string]any{"name": "gpt-4", "description": "OpenAI model"},
					map[string]any{"name": "claude-3", "description": "Anthropic model"},
				},
			},
			wantLen:   2,
			wantFirst: "gpt-4",
		},
		{
			name: "skips non-map items",
			statusMap: map[string]any{
				"discoveredModels": []any{
					"not-a-map",
					map[string]any{"name": "gpt-4", "description": "OpenAI"},
				},
			},
			wantLen:   1,
			wantFirst: "gpt-4",
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := extractDiscoveredModels(tc.statusMap)
			if len(got) != tc.wantLen {
				t.Fatalf("extractDiscoveredModels() len = %d, want %d", len(got), tc.wantLen)
			}
			if tc.wantLen > 0 && got[0].Name != tc.wantFirst {
				t.Errorf("first model name = %q, want %q", got[0].Name, tc.wantFirst)
			}
		})
	}
}
