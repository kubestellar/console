package reports

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGenerateDemo_ProducesWellFormedJSON(t *testing.T) {
	t.Parallel()

	data, contentType, err := GenerateDemo(newTestReportFramework(t), "demo-cluster", "demo-user", FormatJSON)
	require.NoError(t, err)
	assert.Equal(t, "application/json", contentType)
	require.NotEmpty(t, data)

	var envelope ReportEnvelope
	require.NoError(t, json.Unmarshal(data, &envelope))
	assert.Equal(t, "demo-user", envelope.GeneratedBy)
	assert.Equal(t, "demo-cluster", envelope.Evaluation.ClusterName)
	assert.Greater(t, envelope.Evaluation.TotalChecks, 0)
	require.NotEmpty(t, envelope.Evaluation.Controls)
}

func TestGenerateDemo_ProducesWellFormedPDF(t *testing.T) {
	t.Parallel()

	data, contentType, err := GenerateDemo(newTestReportFramework(t), "demo-cluster", "demo-user", FormatPDF)
	require.NoError(t, err)
	assert.Equal(t, "application/pdf", contentType)
	require.NotEmpty(t, data)
	assert.True(t, strings.HasPrefix(string(data), "%PDF-1.4"))
	assert.True(t, strings.HasSuffix(string(data), "%%EOF\n"))
	assert.Contains(t, string(data), "demo-cluster")
	assert.Contains(t, string(data), "demo-user")
}
