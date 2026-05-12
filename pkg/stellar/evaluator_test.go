package stellar

import "testing"

func TestFallbackEvaluate_CriticalReasons(t *testing.T) {
	e := NewStellarEvaluator(nil)
	criticals := []string{"CrashLoopBackOff", "OOMKilling", "OOMKilled", "Evicted", "FailedScheduling", "NodeNotReady", "FailedMount"}
	for _, reason := range criticals {
		result := e.FallbackEvaluate(RawK8sEvent{Reason: reason, Type: "Warning"})
		if !result.ShouldShow {
			t.Errorf("expected ShouldShow=true for %s", reason)
		}
		if result.Severity != "critical" {
			t.Errorf("expected severity=critical for %s, got %s", reason, result.Severity)
		}
	}
}

func TestFallbackEvaluate_WarningReasons(t *testing.T) {
	e := NewStellarEvaluator(nil)
	warnings := []string{"BackOff", "Failed", "Unhealthy"}
	for _, reason := range warnings {
		result := e.FallbackEvaluate(RawK8sEvent{Reason: reason, Type: "Warning"})
		if !result.ShouldShow {
			t.Errorf("expected ShouldShow=true for %s", reason)
		}
		if result.Severity != "warning" {
			t.Errorf("expected severity=warning for %s, got %s", reason, result.Severity)
		}
	}
}

func TestFallbackEvaluate_NoiseReasons(t *testing.T) {
	e := NewStellarEvaluator(nil)
	noise := []string{"Pulling", "Pulled", "Created", "Started", "Scheduled", "SuccessfulCreate", "ScalingReplicaSet", "SuccessfulDelete", "NoPods", "SuccessfulRescale"}
	for _, reason := range noise {
		result := e.FallbackEvaluate(RawK8sEvent{Reason: reason, Type: "Normal"})
		if result.ShouldShow {
			t.Errorf("expected ShouldShow=false for %s", reason)
		}
		if result.Severity != "ignore" {
			t.Errorf("expected severity=ignore for %s, got %s", reason, result.Severity)
		}
	}
}

func TestFallbackEvaluate_UnknownWarning(t *testing.T) {
	e := NewStellarEvaluator(nil)
	result := e.FallbackEvaluate(RawK8sEvent{Reason: "SomeNewReason", Type: "Warning"})
	if !result.ShouldShow {
		t.Error("expected ShouldShow=true for unknown Warning event")
	}
	if result.Severity != "warning" {
		t.Errorf("expected severity=warning, got %s", result.Severity)
	}
}

func TestFallbackEvaluate_NormalUnknown(t *testing.T) {
	e := NewStellarEvaluator(nil)
	result := e.FallbackEvaluate(RawK8sEvent{Reason: "SomeNewReason", Type: "Normal"})
	if result.ShouldShow {
		t.Error("expected ShouldShow=false for unknown Normal event")
	}
}

func TestFallbackEvaluate_SyntheticStateChange(t *testing.T) {
	e := NewStellarEvaluator(nil)

	// StateChange_Deployment with Warning type — should show as warning (unknown reason, Warning type)
	result := e.FallbackEvaluate(RawK8sEvent{
		Reason:  "StateChange_Deployment",
		Type:    "Warning",
		Message: "Replicas changed from 3/3 to 2/3",
	})
	if !result.ShouldShow {
		t.Error("expected ShouldShow=true for Warning StateChange_Deployment")
	}
	if result.Severity != "warning" {
		t.Errorf("expected severity=warning, got %s", result.Severity)
	}
}
