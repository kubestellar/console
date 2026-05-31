package reports

import (
	"fmt"
	"strings"
	"testing"

	"github.com/kubestellar/console/pkg/compliance/frameworks"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGeneratePDF_SmokeAndEscapesContent(t *testing.T) {
	t.Parallel()

	fw := newTestReportFramework(t)
	result := newTestEvaluationResult(t)
	result.Controls[0].Checks[0].Evidence = `path\\to\\file (escaped)`
	result.Controls[0].Checks[0].Message = `warn(user)`
	result.Controls[0].Remediation = `set flag(value)`

	data, err := GeneratePDF(fw, result, "auditor")
	require.NoError(t, err)
	require.NotEmpty(t, data)
	assert.True(t, strings.HasPrefix(string(data), "%PDF-1.4"))
	assert.True(t, strings.HasSuffix(string(data), "%%EOF\n"))
	assert.Contains(t, string(data), `path\\\\to\\\\file \(escaped\)`)
	assert.Contains(t, string(data), `warn\(user\)`)
	assert.Contains(t, string(data), `set flag\(value\)`)
}

func TestGeneratePDF_PaginatesLongReports(t *testing.T) {
	t.Parallel()

	fw := newTestReportFramework(t)
	result := newTestEvaluationResult(t)
	result.Controls = make([]frameworks.ControlResult, 0, 60)
	for i := 0; i < 60; i++ {
		result.Controls = append(result.Controls, frameworks.ControlResult{
			ControlID: fmt.Sprintf("C-%02d", i),
			Title:     fmt.Sprintf("Control %02d", i),
			Severity:  frameworks.SeverityMedium,
			Status:    frameworks.StatusPartial,
			Checks: []frameworks.CheckResult{{
				CheckID:  fmt.Sprintf("C-%02d.1", i),
				Name:     fmt.Sprintf("Check %02d", i),
				Status:   frameworks.StatusFail,
				Message:  strings.Repeat("evidence ", 4),
				Evidence: strings.Repeat("details ", 4),
			}},
		})
	}

	data, err := GeneratePDF(fw, result, "auditor")
	require.NoError(t, err)
	assert.Contains(t, string(data), "/Count ")
	assert.Greater(t, strings.Count(string(data), "/Type /Page "), 1)
}

func TestPaginateLines_EmptyInputReturnsNoPages(t *testing.T) {
	t.Parallel()
	assert.Empty(t, paginateLines(nil, 100, 10))
}

func TestBuildPageStream_SkipsBlankLinesAndUsesDefaults(t *testing.T) {
	t.Parallel()

	stream := buildPageStream([]reportLine{{spacer: 5}, {text: "Hello (world)", indent: 10}}, 1, 2)
	assert.Contains(t, stream, "BT\n")
	assert.Contains(t, stream, "/F1 10 Tf")
	assert.Contains(t, stream, "(Hello \\(world\\)) Tj")
	assert.NotContains(t, stream, "() Tj")
	assert.Contains(t, stream, "ET\n")
}

func TestRewritePagesObject_HandlesOnlyPlaceholder(t *testing.T) {
	t.Parallel()

	doc := &pdfDoc{}
	doc.writeHeader()
	catalogObj := doc.startObject()
	doc.buf.WriteString(fmt.Sprintf("%d 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n", catalogObj))
	pagesObj := doc.startObject()
	require.Equal(t, 2, pagesObj)

	doc.rewritePagesObject(nil)

	assert.Contains(t, doc.buf.String(), "/Kids []")
	assert.Contains(t, doc.buf.String(), "/Count 0")
}
