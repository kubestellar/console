package reports

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/kubestellar/console/pkg/compliance/frameworks"
)

func testFramework() *frameworks.Framework {
	return &frameworks.Framework{
		ID:          "test-fw",
		Name:        "Test Framework",
		Version:     "1.0",
		Description: "Test compliance framework",
		Category:    "testing",
		Controls: []frameworks.Control{
			{
				ID:       "TC-1",
				Title:    "Test Control",
				Severity: frameworks.SeverityHigh,
				Category: "access",
				Checks: []frameworks.Check{
					{ID: "TC-1.1", Name: "Check A", CheckType: "pod_security"},
					{ID: "TC-1.2", Name: "Check B", CheckType: "rbac_least_privilege"},
				},
			},
		},
		BuiltIn: true,
	}
}

func testResult() *frameworks.EvaluationResult {
	return &frameworks.EvaluationResult{
		FrameworkID:   "test-fw",
		FrameworkName: "Test Framework",
		ClusterName:   "test-cluster",
		Score:         75,
		TotalChecks:   2,
		Passed:        1,
		Failed:        1,
		Controls: []frameworks.ControlResult{
			{
				ControlID: "TC-1",
				Title:     "Test Control",
				Severity:  frameworks.SeverityHigh,
				Status:    frameworks.StatusPartial,
				Checks: []frameworks.CheckResult{
					{CheckID: "TC-1.1", Name: "Check A", Status: frameworks.StatusPass, Evidence: "All pods secured"},
					{CheckID: "TC-1.2", Name: "Check B", Status: frameworks.StatusFail, Message: "Excessive RBAC permissions"},
				},
				Remediation: "Review RBAC bindings and remove wildcard rules",
			},
		},
	}
}

func TestGenerateJSON(t *testing.T) {
	fw := testFramework()
	result := testResult()

	data, err := GenerateJSON(fw, result, "test-user")
	if err != nil {
		t.Fatalf("GenerateJSON failed: %v", err)
	}

	var envelope ReportEnvelope
	if err := json.Unmarshal(data, &envelope); err != nil {
		t.Fatalf("failed to unmarshal JSON report: %v", err)
	}

	if envelope.SchemaVersion != "kc-compliance-report-v1" {
		t.Errorf("expected schema version kc-compliance-report-v1, got %s", envelope.SchemaVersion)
	}
	if envelope.GeneratedBy != "test-user" {
		t.Errorf("expected generated_by test-user, got %s", envelope.GeneratedBy)
	}
	if envelope.Framework.ID != "test-fw" {
		t.Errorf("expected framework ID test-fw, got %s", envelope.Framework.ID)
	}
	if envelope.Evaluation.Score != 75 {
		t.Errorf("expected score 75, got %d", envelope.Evaluation.Score)
	}
	if envelope.ReportID == "" {
		t.Error("expected non-empty report ID")
	}
}

func TestGeneratePDF(t *testing.T) {
	fw := testFramework()
	result := testResult()

	data, err := GeneratePDF(fw, result, "test-user")
	if err != nil {
		t.Fatalf("GeneratePDF failed: %v", err)
	}

	// Verify PDF signature
	if !strings.HasPrefix(string(data), "%PDF-1.4") {
		t.Error("PDF output does not start with %PDF-1.4 header")
	}

	// Verify PDF trailer
	if !strings.HasSuffix(string(data), "%%EOF\n") {
		t.Error("PDF output does not end with EOF marker")
	}

	// Verify minimum size (a valid PDF is at least a few hundred bytes)
	const minPDFSize = 200
	if len(data) < minPDFSize {
		t.Errorf("PDF too small (%d bytes), expected at least %d", len(data), minPDFSize)
	}
}

func TestGeneratePDFContainsContent(t *testing.T) {
	fw := testFramework()
	result := testResult()

	data, err := GeneratePDF(fw, result, "auditor")
	if err != nil {
		t.Fatalf("GeneratePDF failed: %v", err)
	}

	content := string(data)
	checks := []string{
		"COMPLIANCE REPORT",
		"Test Framework",
		"test-cluster",
		"75%",
	}
	for _, want := range checks {
		if !strings.Contains(content, want) {
			t.Errorf("PDF should contain %q", want)
		}
	}
}

func TestGenerateDemo(t *testing.T) {
	fw := testFramework()

	t.Run("json format", func(t *testing.T) {
		data, contentType, err := GenerateDemo(fw, "demo-cluster", "demo-user", FormatJSON)
		if err != nil {
			t.Fatalf("GenerateDemo JSON failed: %v", err)
		}
		if contentType != "application/json" {
			t.Errorf("expected application/json, got %s", contentType)
		}
		if len(data) == 0 {
			t.Error("expected non-empty JSON data")
		}
	})

	t.Run("pdf format", func(t *testing.T) {
		data, contentType, err := GenerateDemo(fw, "demo-cluster", "demo-user", FormatPDF)
		if err != nil {
			t.Fatalf("GenerateDemo PDF failed: %v", err)
		}
		if contentType != "application/pdf" {
			t.Errorf("expected application/pdf, got %s", contentType)
		}
		if !strings.HasPrefix(string(data), "%PDF-") {
			t.Error("expected PDF signature")
		}
	})
}

func TestGenerateJSONMultipleControls(t *testing.T) {
	fw := &frameworks.Framework{
		ID: "multi-fw", Name: "Multi", Version: "1.0", Category: "test",
		Controls: []frameworks.Control{
			{ID: "C1", Title: "Control 1", Severity: frameworks.SeverityHigh,
				Checks: []frameworks.Check{{ID: "C1.1", Name: "Check 1"}}},
			{ID: "C2", Title: "Control 2", Severity: frameworks.SeverityLow,
				Checks: []frameworks.Check{{ID: "C2.1", Name: "Check 2"}}},
		},
	}
	result := &frameworks.EvaluationResult{
		FrameworkID: "multi-fw", FrameworkName: "Multi",
		ClusterName: "cluster", Score: 50, TotalChecks: 2, Passed: 1, Failed: 1,
		Controls: []frameworks.ControlResult{
			{ControlID: "C1", Title: "Control 1", Status: frameworks.StatusPass,
				Checks: []frameworks.CheckResult{{CheckID: "C1.1", Name: "Check 1", Status: frameworks.StatusPass}}},
			{ControlID: "C2", Title: "Control 2", Status: frameworks.StatusFail,
				Checks: []frameworks.CheckResult{{CheckID: "C2.1", Name: "Check 2", Status: frameworks.StatusFail}},
				Remediation: "Fix this"},
		},
	}

	data, err := GenerateJSON(fw, result, "admin")
	if err != nil {
		t.Fatalf("GenerateJSON failed: %v", err)
	}

	var envelope ReportEnvelope
	if err := json.Unmarshal(data, &envelope); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}
	if len(envelope.Evaluation.Controls) != 2 {
		t.Errorf("expected 2 controls, got %d", len(envelope.Evaluation.Controls))
	}
}
