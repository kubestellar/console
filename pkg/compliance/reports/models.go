// Package reports provides compliance report generation in PDF and JSON formats.
// It builds on the compliance frameworks evaluation engine to produce downloadable
// audit-ready reports.
package reports

import (
	"time"

	"github.com/kubestellar/console/pkg/compliance/frameworks"
)

// ReportFormat specifies the output format for a compliance report.
type ReportFormat string

const (
	FormatPDF  ReportFormat = "pdf"
	FormatJSON ReportFormat = "json"
)

// GenerateRequest is the API request body for report generation.
type GenerateRequest struct {
	Cluster string       `json:"cluster"`
	Format  ReportFormat `json:"format"`
}

// ReportEnvelope wraps an evaluation result with report metadata for JSON export.
type ReportEnvelope struct {
	SchemaVersion string                     `json:"schema_version"`
	ReportID      string                     `json:"report_id"`
	GeneratedAt   time.Time                  `json:"generated_at"`
	GeneratedBy   string                     `json:"generated_by"`
	Framework     reportFrameworkSummary     `json:"framework"`
	Evaluation    *frameworks.EvaluationResult `json:"evaluation"`
}

type reportFrameworkSummary struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Version     string `json:"version"`
	Category    string `json:"category"`
	Description string `json:"description"`
}
