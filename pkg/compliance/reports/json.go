package reports

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/compliance/frameworks"
)

// GenerateJSON produces a structured JSON compliance report.
func GenerateJSON(fw *frameworks.Framework, result *frameworks.EvaluationResult, userName string) ([]byte, error) {
	envelope := ReportEnvelope{
		SchemaVersion: "kc-compliance-report-v1",
		ReportID:      uuid.New().String(),
		GeneratedAt:   time.Now().UTC(),
		GeneratedBy:   userName,
		Framework: reportFrameworkSummary{
			ID:          fw.ID,
			Name:        fw.Name,
			Version:     fw.Version,
			Category:    fw.Category,
			Description: fw.Description,
		},
		Evaluation: result,
	}
	return json.MarshalIndent(envelope, "", "  ")
}
