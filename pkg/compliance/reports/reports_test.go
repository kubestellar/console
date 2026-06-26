package reports

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/kubestellar/console/pkg/compliance/frameworks"
)

const (
	testUserName    = "test-user"
	testClusterName = "test-cluster"
	minPDFSize      = 200
)

func testFramework(t *testing.T) *frameworks.Framework {
	t.Helper()

	return &frameworks.Framework{
		ID:          "test-fw",
		Name:        "Test Framework",
		Version:     "1.0",
		Description: "Test compliance framework",
		Category:    "testing",
		Controls: []frameworks.Control{
			{
				ID:          "TC-1",
				Title:       "Test Control",
				Description: "Validates test coverage",
				Severity:    frameworks.SeverityHigh,
				Category:    "access",
				Checks: []frameworks.Check{
					{ID: "TC-1.1", Name: "Check A", CheckType: "pod_security"},
					{ID: "TC-1.2", Name: "Check B", CheckType: "rbac_least_privilege"},
				},
			},
		},
		BuiltIn: true,
	}
}

func testEvaluationResult(t *testing.T) *frameworks.EvaluationResult {
	t.Helper()

	return &frameworks.EvaluationResult{
		FrameworkID:   "test-fw",
		FrameworkName: "Test Framework",
		ClusterName:   testClusterName,
		EvaluatedAt:   time.Date(2025, time.January, 2, 3, 4, 5, 0, time.UTC),
		Score:         75,
		TotalChecks:   2,
		Passed:        1,
		Failed:        1,
		Controls: []frameworks.ControlResult{
			{
				ControlID: "TC-1",
				Title:     "Test Control",
				Severity:  frameworks.SeverityHigh,
				Category:  "access",
				Status:    frameworks.StatusPartial,
				Checks: []frameworks.CheckResult{
					{CheckID: "TC-1.1", Name: "Check A", CheckType: "pod_security", Status: frameworks.StatusPass, Evidence: "All pods secured"},
					{CheckID: "TC-1.2", Name: "Check B", CheckType: "rbac_least_privilege", Status: frameworks.StatusFail, Message: "Excessive RBAC permissions"},
				},
				Remediation: "Review RBAC bindings and remove wildcard rules",
			},
		},
	}
}

func testMinimalEvaluationResult(t *testing.T) *frameworks.EvaluationResult {
	t.Helper()

	return &frameworks.EvaluationResult{
		FrameworkID:   "test-fw",
		FrameworkName: "Test Framework",
		ClusterName:   "edge-cluster",
		EvaluatedAt:   time.Date(2025, time.February, 3, 4, 5, 6, 0, time.UTC),
		Score:         0,
		TotalChecks:   0,
		Controls:      make([]frameworks.ControlResult, 0),
	}
}

func TestGenerateJSON(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name          string
		result        *frameworks.EvaluationResult
		assertionFunc func(t *testing.T, envelope ReportEnvelope)
	}{
		{
			name:   "populated report retains framework and evaluation data",
			result: testEvaluationResult(t),
			assertionFunc: func(t *testing.T, envelope ReportEnvelope) {
				t.Helper()

				if envelope.SchemaVersion != "kc-compliance-report-v1" {
					t.Fatalf("expected schema version kc-compliance-report-v1, got %s", envelope.SchemaVersion)
				}
				if envelope.GeneratedBy != testUserName {
					t.Fatalf("expected generated_by %q, got %q", testUserName, envelope.GeneratedBy)
				}
				if envelope.Framework.ID != "test-fw" || envelope.Framework.Name != "Test Framework" {
					t.Fatalf("unexpected framework summary: %+v", envelope.Framework)
				}
				if envelope.Evaluation == nil {
					t.Fatal("expected evaluation to be present")
				}
				if envelope.Evaluation.Score != 75 || envelope.Evaluation.ClusterName != testClusterName {
					t.Fatalf("unexpected evaluation: %+v", envelope.Evaluation)
				}
				if got := len(envelope.Evaluation.Controls); got != 1 {
					t.Fatalf("expected 1 control, got %d", got)
				}
				if envelope.ReportID == "" {
					t.Fatal("expected non-empty report ID")
				}
			},
		},
		{
			name:   "minimal report round trips empty control list",
			result: testMinimalEvaluationResult(t),
			assertionFunc: func(t *testing.T, envelope ReportEnvelope) {
				t.Helper()

				if envelope.Evaluation == nil {
					t.Fatal("expected evaluation to be present")
				}
				if envelope.Evaluation.Score != 0 || envelope.Evaluation.TotalChecks != 0 {
					t.Fatalf("expected zero score summary, got %+v", envelope.Evaluation)
				}
				if envelope.Evaluation.Controls == nil {
					t.Fatal("expected controls slice to survive round trip")
				}
				if len(envelope.Evaluation.Controls) != 0 {
					t.Fatalf("expected no controls, got %d", len(envelope.Evaluation.Controls))
				}
			},
		},
	}

	fw := testFramework(t)
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			data, err := GenerateJSON(fw, tt.result, testUserName)
			if err != nil {
				t.Fatalf("GenerateJSON failed: %v", err)
			}

			var envelope ReportEnvelope
			if err := json.Unmarshal(data, &envelope); err != nil {
				t.Fatalf("failed to unmarshal JSON report: %v", err)
			}

			tt.assertionFunc(t, envelope)
		})
	}
}

func TestGeneratePDF(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		result   *frameworks.EvaluationResult
		contains []string
	}{
		{
			name:     "populated report contains headings and findings",
			result:   testEvaluationResult(t),
			contains: []string{"COMPLIANCE REPORT", "Test Framework", testClusterName, "75%", "Remediation:"},
		},
		{
			name:     "minimal report handles zero scores without panic",
			result:   testMinimalEvaluationResult(t),
			contains: []string{"COMPLIANCE REPORT", "edge-cluster", "Overall Score: 0%", "Total Checks: 0  |  Passed: 0  |  Failed: 0  |  Partial: 0  |  Errors: 0"},
		},
	}

	fw := testFramework(t)
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			data, err := GeneratePDF(fw, tt.result, testUserName)
			if err != nil {
				t.Fatalf("GeneratePDF failed: %v", err)
			}
			if !strings.HasPrefix(string(data), "%PDF-1.4") {
				t.Fatal("PDF output does not start with %PDF-1.4 header")
			}
			if !strings.HasSuffix(string(data), "%%EOF\n") {
				t.Fatal("PDF output does not end with EOF marker")
			}
			if len(data) < minPDFSize {
				t.Fatalf("PDF too small (%d bytes), expected at least %d", len(data), minPDFSize)
			}

			content := string(data)
			for _, want := range tt.contains {
				if !strings.Contains(content, want) {
					t.Fatalf("PDF should contain %q", want)
				}
			}
		})
	}
}

func TestGenerateDemo(t *testing.T) {
	t.Parallel()

	fw := testFramework(t)
	tests := []struct {
		name            string
		format          ReportFormat
		expectedType    string
		expectedPrefix  string
		validatePayload func(t *testing.T, data []byte)
	}{
		{
			name:           "json format",
			format:         FormatJSON,
			expectedType:   "application/json",
			expectedPrefix: "{",
			validatePayload: func(t *testing.T, data []byte) {
				t.Helper()
				var envelope ReportEnvelope
				if err := json.Unmarshal(data, &envelope); err != nil {
					t.Fatalf("failed to unmarshal demo JSON: %v", err)
				}
				if envelope.Evaluation == nil {
					t.Fatal("expected evaluation in demo JSON")
				}
				if envelope.Evaluation.Score <= 0 {
					t.Fatalf("expected positive demo score, got %d", envelope.Evaluation.Score)
				}
			},
		},
		{
			name:           "pdf format",
			format:         FormatPDF,
			expectedType:   "application/pdf",
			expectedPrefix: "%PDF-",
		},
		{
			name:           "unknown format defaults to json",
			format:         ReportFormat("yaml"),
			expectedType:   "application/json",
			expectedPrefix: "{",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			data, contentType, err := GenerateDemo(fw, "demo-cluster", "demo-user", tt.format)
			if err != nil {
				t.Fatalf("GenerateDemo failed: %v", err)
			}
			if contentType != tt.expectedType {
				t.Fatalf("expected %s, got %s", tt.expectedType, contentType)
			}
			if len(data) == 0 {
				t.Fatal("expected non-empty output")
			}
			if !strings.HasPrefix(string(data), tt.expectedPrefix) {
				t.Fatalf("expected output prefix %q", tt.expectedPrefix)
			}
			if tt.validatePayload != nil {
				tt.validatePayload(t, data)
			}
		})
	}
}

func TestBuildReportLinesIncludesOptionalSections(t *testing.T) {
	t.Parallel()

	fw := testFramework(t)
	result := testEvaluationResult(t)
	lines := buildReportLines(fw, result, testUserName)

	joined := make([]string, 0, len(lines))
	for _, line := range lines {
		joined = append(joined, line.text)
	}
	content := strings.Join(joined, "\n")

	for _, want := range []string{
		"COMPLIANCE REPORT",
		"EXECUTIVE SUMMARY",
		"DETAILED FINDINGS",
		"[PARTIAL] TC-1 — Test Control (Severity: high)",
		"[PASS] Check A — All pods secured",
		"[FAIL] Check B — Excessive RBAC permissions",
		"Remediation: Review RBAC bindings and remove wildcard rules",
	} {
		if !strings.Contains(content, want) {
			t.Fatalf("report lines should contain %q", want)
		}
	}
}

func TestPaginateLines(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name      string
		lines     []reportLine
		wantPages int
	}{
		{
			name:      "single page stays together",
			lines:     []reportLine{{text: "line 1", size: pdfFontSize}, {text: "line 2", size: pdfFontSize}},
			wantPages: 1,
		},
		{
			name: "overflow creates second page",
			lines: []reportLine{
				{text: "line 1", size: pdfFontSize},
				{text: "line 2", size: pdfFontSize},
				{text: "line 3", size: pdfFontSize},
			},
			wantPages: 2,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			pages := paginateLines(tt.lines, pdfLineHeight*2, pdfLineHeight)
			if got := len(pages); got != tt.wantPages {
				t.Fatalf("expected %d pages, got %d", tt.wantPages, got)
			}
		})
	}
}

func TestBuildPageStreamAppliesDefaultsAndEscaping(t *testing.T) {
	t.Parallel()

	text := `value (x) \\ sample`
	stream := buildPageStream([]reportLine{{text: text, bold: true}}, 1, 2)
	if !strings.Contains(stream, "/F2 10 Tf") {
		t.Fatalf("expected default bold font size, got %q", stream)
	}

	expectedEscapedText := "(" + escapePDF(text) + ") Tj"
	if !strings.Contains(stream, expectedEscapedText) {
		t.Fatalf("expected escaped PDF text %q, got %q", expectedEscapedText, stream)
	}
}

func TestRewritePagesObjectHandlesTwoObjectDocument(t *testing.T) {
	t.Parallel()

	doc := &pdfDoc{}
	doc.writeHeader()
	doc.startObject()
	doc.buf.WriteString("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n")
	doc.startObject()

	doc.rewritePagesObject([]int{3})

	content := doc.buf.String()
	if !strings.Contains(content, "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n") {
		t.Fatalf("expected rewritten pages object, got %q", content)
	}
}
