package solver_test

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/kubestellar/console/pkg/stellar/solver"
)

// ─── Constants ───────────────────────────────────────────────────────────────

func TestActionLimit_IsPositive(t *testing.T) {
	if solver.ActionLimit <= 0 {
		t.Errorf("ActionLimit must be positive, got %d", solver.ActionLimit)
	}
}

func TestMaxWallClock_IsAtLeastOneMinute(t *testing.T) {
	if solver.MaxWallClock < time.Minute {
		t.Errorf("MaxWallClock must be >= 1 minute, got %v", solver.MaxWallClock)
	}
}

func TestObserveWait_IsAtLeastOneSecond(t *testing.T) {
	if solver.ObserveWait < time.Second {
		t.Errorf("ObserveWait must be >= 1 second, got %v", solver.ObserveWait)
	}
}

// ─── AllowedActions ──────────────────────────────────────────────────────────

func TestAllowedActions_ContainsRestartDeployment(t *testing.T) {
	if !solver.AllowedActions["RestartDeployment"] {
		t.Error("AllowedActions must include 'RestartDeployment'")
	}
}

func TestAllowedActions_ContainsScaleDeployment(t *testing.T) {
	if !solver.AllowedActions["ScaleDeployment"] {
		t.Error("AllowedActions must include 'ScaleDeployment'")
	}
}

func TestAllowedActions_ContainsDeletePod(t *testing.T) {
	if !solver.AllowedActions["DeletePod"] {
		t.Error("AllowedActions must include 'DeletePod'")
	}
}

func TestAllowedActions_DoesNotAllowArbitraryCommands(t *testing.T) {
	dangerous := []string{"ExecShell", "DeleteNamespace", "DeleteCluster", "ApplyManifest"}
	for _, cmd := range dangerous {
		if solver.AllowedActions[cmd] {
			t.Errorf("AllowedActions must NOT include %q — this would be a dangerous escalation", cmd)
		}
	}
}

func TestAllowedActions_HasExactlyThreeEntries(t *testing.T) {
	// Regression guard: if a new action is added without review this fails.
	// Update this count intentionally after security review.
	if len(solver.AllowedActions) != 3 {
		t.Errorf("AllowedActions should have exactly 3 entries, got %d — update this test after security review", len(solver.AllowedActions))
	}
}

// ─── marshalling SSEEvent ──

func TestSSEEvent_MarshalJSON(t *testing.T) {
	evt := solver.SSEEvent{Type: "progress", Data: map[string]string{"step": "observing"}}
	b, err := json.Marshal(evt)
	if err != nil {
		t.Fatalf("json.Marshal(SSEEvent): %v", err)
	}
	var out map[string]interface{}
	if err := json.Unmarshal(b, &out); err != nil {
		t.Fatalf("json.Unmarshal round-trip: %v", err)
	}
	if out["type"] != "progress" {
		t.Errorf("expected type=progress, got %v", out["type"])
	}
}
