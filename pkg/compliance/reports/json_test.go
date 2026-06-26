package reports

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/compliance/frameworks"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newTestReportFramework(t *testing.T) *frameworks.Framework {
	t.Helper()

	return &frameworks.Framework{
		ID:          "cis-k8s",
		Name:        "CIS Kubernetes Benchmark",
		Version:     "1.0",
		Description: "Cluster hardening controls",
		Category:    "security",
		Controls: []frameworks.Control{{
			ID:       "1.1",
			Title:    "API server flags",
			Severity: frameworks.SeverityHigh,
			Category: "configuration",
			Checks:   []frameworks.Check{{ID: "1.1.1", Name: "Anonymous auth disabled", CheckType: "config"}},
		}},
	}
}

func newTestEvaluationResult(t *testing.T) *frameworks.EvaluationResult {
	t.Helper()

	return &frameworks.EvaluationResult{
		FrameworkID:   "cis-k8s",
		FrameworkName: "CIS Kubernetes Benchmark",
		ClusterName:   "prod-cluster",
		Score:         92,
		TotalChecks:   1,
		Passed:        1,
		Failed:        0,
		Partial:       0,
		Errors:        0,
		Controls: []frameworks.ControlResult{{
			ControlID: "1.1",
			Title:     "API server flags",
			Severity:  frameworks.SeverityHigh,
			Status:    frameworks.StatusPass,
			Checks: []frameworks.CheckResult{{
				CheckID:  "1.1.1",
				Name:     "Anonymous auth disabled",
				Status:   frameworks.StatusPass,
				Evidence: "--anonymous-auth=false",
			}},
		}},
	}
}

func TestGenerateJSON_RoundTrip(t *testing.T) {
	t.Parallel()

	fw := newTestReportFramework(t)
	result := newTestEvaluationResult(t)
	before := time.Now().UTC().Add(-time.Minute)

	data, err := GenerateJSON(fw, result, "auditor@example.com")
	require.NoError(t, err)
	assert.Contains(t, string(data), "\n  \"schema_version\"")

	var envelope ReportEnvelope
	require.NoError(t, json.Unmarshal(data, &envelope))
	require.NotZero(t, envelope.GeneratedAt)
	assert.WithinDuration(t, time.Now().UTC(), envelope.GeneratedAt, time.Minute)
	assert.True(t, envelope.GeneratedAt.After(before))
	_, err = uuid.Parse(envelope.ReportID)
	require.NoError(t, err)
	assert.Equal(t, "kc-compliance-report-v1", envelope.SchemaVersion)
	assert.Equal(t, "auditor@example.com", envelope.GeneratedBy)
	assert.Equal(t, fw.ID, envelope.Framework.ID)
	assert.Equal(t, fw.Name, envelope.Framework.Name)
	assert.Equal(t, result.ClusterName, envelope.Evaluation.ClusterName)
	assert.Equal(t, result.Score, envelope.Evaluation.Score)
	require.Len(t, envelope.Evaluation.Controls, 1)
	assert.Equal(t, result.Controls[0].Checks[0].Evidence, envelope.Evaluation.Controls[0].Checks[0].Evidence)
}
