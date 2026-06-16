package frameworks

import (
	"encoding/json"
	"testing"
)

// ────────────────────────────────────────────────────────────────────
// builtin.go tests
// ────────────────────────────────────────────────────────────────────

func TestRegistryContainsExpectedFrameworks(t *testing.T) {
	expected := []string{"pci-dss-4.0", "soc2-type2"}
	for _, id := range expected {
		if _, ok := Registry[id]; !ok {
			t.Errorf("Registry missing framework %q", id)
		}
	}
}

func TestPCIDSS4FrameworkStructure(t *testing.T) {
	fw := PCIDSS4()
	if fw.ID != "pci-dss-4.0" {
		t.Errorf("ID = %q, want %q", fw.ID, "pci-dss-4.0")
	}
	if fw.Name != "PCI-DSS 4.0" {
		t.Errorf("Name = %q, want %q", fw.Name, "PCI-DSS 4.0")
	}
	if fw.Category != "financial" {
		t.Errorf("Category = %q, want %q", fw.Category, "financial")
	}
	if !fw.BuiltIn {
		t.Error("expected BuiltIn = true")
	}
	if len(fw.Controls) == 0 {
		t.Fatal("expected non-empty Controls")
	}
	// Every control must have ID, Title, Severity, and at least one check
	for _, ctrl := range fw.Controls {
		if ctrl.ID == "" {
			t.Error("control has empty ID")
		}
		if ctrl.Title == "" {
			t.Errorf("control %s has empty Title", ctrl.ID)
		}
		if ctrl.Severity == "" {
			t.Errorf("control %s has empty Severity", ctrl.ID)
		}
		if len(ctrl.Checks) == 0 {
			t.Errorf("control %s has no checks", ctrl.ID)
		}
		for _, chk := range ctrl.Checks {
			if chk.ID == "" || chk.Name == "" || chk.CheckType == "" {
				t.Errorf("check in control %s missing required fields: %+v", ctrl.ID, chk)
			}
		}
	}
}

func TestSOC2Type2FrameworkStructure(t *testing.T) {
	fw := SOC2Type2()
	if fw.ID != "soc2-type2" {
		t.Errorf("ID = %q, want %q", fw.ID, "soc2-type2")
	}
	if fw.Category != "operational" {
		t.Errorf("Category = %q, want %q", fw.Category, "operational")
	}
	if !fw.BuiltIn {
		t.Error("expected BuiltIn = true")
	}
	if len(fw.Controls) == 0 {
		t.Fatal("expected non-empty Controls")
	}
}

func TestPCIDSS4CheckTypes(t *testing.T) {
	fw := PCIDSS4()
	validTypes := map[string]bool{
		"network_policy":      true,
		"pod_security":        true,
		"encryption_at_rest":  true,
		"image_scanning":      true,
		"rbac_least_privilege": true,
		"auth_provider":       true,
		"audit_logging":       true,
		"runtime_security":    true,
	}
	for _, ctrl := range fw.Controls {
		for _, chk := range ctrl.Checks {
			if !validTypes[chk.CheckType] {
				t.Errorf("check %s has unknown CheckType %q", chk.ID, chk.CheckType)
			}
		}
	}
}

// ────────────────────────────────────────────────────────────────────
// models.go tests
// ────────────────────────────────────────────────────────────────────

func TestSeverityConstants(t *testing.T) {
	tests := []struct {
		name     string
		severity Severity
		want     string
	}{
		{"critical", SeverityCritical, "critical"},
		{"high", SeverityHigh, "high"},
		{"medium", SeverityMedium, "medium"},
		{"low", SeverityLow, "low"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if string(tt.severity) != tt.want {
				t.Errorf("Severity = %q, want %q", tt.severity, tt.want)
			}
		})
	}
}

func TestCheckStatusConstants(t *testing.T) {
	tests := []struct {
		name   string
		status CheckStatus
		want   string
	}{
		{"pass", StatusPass, "pass"},
		{"fail", StatusFail, "fail"},
		{"partial", StatusPartial, "partial"},
		{"skipped", StatusSkipped, "skipped"},
		{"error", StatusError, "error"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if string(tt.status) != tt.want {
				t.Errorf("CheckStatus = %q, want %q", tt.status, tt.want)
			}
		})
	}
}

func TestFrameworkJSONRoundTrip(t *testing.T) {
	fw := PCIDSS4()
	data, err := json.Marshal(fw)
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}
	var decoded Framework
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}
	if decoded.ID != fw.ID {
		t.Errorf("decoded ID = %q, want %q", decoded.ID, fw.ID)
	}
	if len(decoded.Controls) != len(fw.Controls) {
		t.Errorf("decoded controls = %d, want %d", len(decoded.Controls), len(fw.Controls))
	}
}

func TestEvaluationResultJSONRoundTrip(t *testing.T) {
	fw := PCIDSS4()
	result := DemoEvaluation(fw, "test-cluster")
	data, err := json.Marshal(result)
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}
	var decoded EvaluationResult
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}
	if decoded.FrameworkID != result.FrameworkID {
		t.Errorf("FrameworkID = %q, want %q", decoded.FrameworkID, result.FrameworkID)
	}
	if decoded.Score != result.Score {
		t.Errorf("Score = %d, want %d", decoded.Score, result.Score)
	}
}

// ────────────────────────────────────────────────────────────────────
// demo.go tests
// ────────────────────────────────────────────────────────────────────

func TestDemoEvaluationReturnsResult(t *testing.T) {
	fw := PCIDSS4()
	result := DemoEvaluation(fw, "demo-cluster")
	if result == nil {
		t.Fatal("expected non-nil result")
	}
	if result.FrameworkID != "pci-dss-4.0" {
		t.Errorf("FrameworkID = %q", result.FrameworkID)
	}
	if result.ClusterName != "demo-cluster" {
		t.Errorf("ClusterName = %q", result.ClusterName)
	}
}

func TestDemoEvaluationDeterministic(t *testing.T) {
	fw := PCIDSS4()
	r1 := DemoEvaluation(fw, "same-cluster")
	r2 := DemoEvaluation(fw, "same-cluster")
	if r1.Score != r2.Score {
		t.Errorf("scores differ: %d vs %d", r1.Score, r2.Score)
	}
	if r1.Passed != r2.Passed || r1.Failed != r2.Failed {
		t.Errorf("pass/fail counts differ: %d/%d vs %d/%d",
			r1.Passed, r1.Failed, r2.Passed, r2.Failed)
	}
}

func TestDemoEvaluationDifferentClusters(t *testing.T) {
	fw := PCIDSS4()
	r1 := DemoEvaluation(fw, "cluster-a")
	r2 := DemoEvaluation(fw, "cluster-b")
	// With different seeds, results should generally differ
	// (could theoretically be the same, but very unlikely with enough checks)
	if r1.Score == r2.Score && r1.Passed == r2.Passed && r1.Failed == r2.Failed {
		t.Log("Warning: different clusters produced identical results (unlikely but possible)")
	}
}

func TestDemoEvaluationCheckTotals(t *testing.T) {
	fw := PCIDSS4()
	result := DemoEvaluation(fw, "totals-test")
	sum := result.Passed + result.Failed + result.Partial + result.Skipped + result.Errors
	if sum != result.TotalChecks {
		t.Errorf("check totals mismatch: passed(%d)+failed(%d)+partial(%d)+skipped(%d)+errors(%d)=%d, TotalChecks=%d",
			result.Passed, result.Failed, result.Partial, result.Skipped, result.Errors, sum, result.TotalChecks)
	}
}

func TestDemoEvaluationScoreRange(t *testing.T) {
	for _, cluster := range []string{"a", "b", "c", "d", "e"} {
		fw := PCIDSS4()
		result := DemoEvaluation(fw, cluster)
		if result.Score < 0 || result.Score > 100 {
			t.Errorf("cluster %q: score %d out of range [0,100]", cluster, result.Score)
		}
	}
}

func TestDemoEvaluationControlStatus(t *testing.T) {
	fw := PCIDSS4()
	result := DemoEvaluation(fw, "ctrl-test")
	for _, ctrl := range result.Controls {
		if ctrl.ControlID == "" {
			t.Error("control result has empty ControlID")
		}
		validStatuses := map[CheckStatus]bool{
			StatusPass: true, StatusFail: true, StatusPartial: true,
			StatusSkipped: true, StatusError: true,
		}
		if !validStatuses[ctrl.Status] {
			t.Errorf("control %s has invalid status %q", ctrl.ControlID, ctrl.Status)
		}
		// Failed controls should have remediation hints
		if ctrl.Status == StatusFail && ctrl.Remediation == "" {
			t.Errorf("control %s failed but has no remediation hint", ctrl.ControlID)
		}
	}
}
