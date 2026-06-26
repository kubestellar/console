package solver

import (
	"encoding/json"
	"testing"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func TestSolverConstants(t *testing.T) {
	if ActionLimit != 5 {
		t.Fatalf("ActionLimit = %d, want 5", ActionLimit)
	}
	if ObserveWait != 15*time.Second {
		t.Fatalf("ObserveWait = %v, want %v", ObserveWait, 15*time.Second)
	}
	if MaxWallClock != 3*time.Minute {
		t.Fatalf("MaxWallClock = %v, want %v", MaxWallClock, 3*time.Minute)
	}
}

func TestAllowedActionsContents(t *testing.T) {
	expected := map[string]bool{
		"RestartDeployment": true,
		"ScaleDeployment":   true,
		"DeletePod":         true,
	}

	if len(AllowedActions) != len(expected) {
		t.Fatalf("AllowedActions has %d entries, want %d", len(AllowedActions), len(expected))
	}

	for action, want := range expected {
		if got, ok := AllowedActions[action]; !ok || got != want {
			t.Fatalf("AllowedActions[%q] = %v, %v; want %v, true", action, got, ok, want)
		}
	}
}

func TestMarshalTriggerData(t *testing.T) {
	tests := []struct {
		name       string
		solveID    string
		actionType string
	}{
		{name: "basic", solveID: "solve-123", actionType: "RestartDeployment"},
		{name: "empty values", solveID: "", actionType: ""},
		{name: "escaped characters", solveID: "solve-\"quoted\"", actionType: "Delete\nPod"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			raw := marshalTriggerData(tt.solveID, tt.actionType)

			var got map[string]string
			if err := json.Unmarshal([]byte(raw), &got); err != nil {
				t.Fatalf("marshalTriggerData returned invalid JSON %q: %v", raw, err)
			}

			if got["solveId"] != tt.solveID {
				t.Fatalf("solveId = %q, want %q", got["solveId"], tt.solveID)
			}
			if got["actionType"] != tt.actionType {
				t.Fatalf("actionType = %q, want %q", got["actionType"], tt.actionType)
			}
		})
	}
}

func TestGetOptsReturnsEmptyGetOptions(t *testing.T) {
	if got := getOpts(); got != (metav1.GetOptions{}) {
		t.Fatalf("getOpts() = %#v, want empty metav1.GetOptions", got)
	}
}
