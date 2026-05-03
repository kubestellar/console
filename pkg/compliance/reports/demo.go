package reports

import (
	"github.com/kubestellar/console/pkg/compliance/frameworks"
)

// GenerateDemo produces a report from synthetic evaluation data.
// Used when no live cluster prober is configured (demo mode).
func GenerateDemo(fw *frameworks.Framework, cluster, userName string, format ReportFormat) ([]byte, string, error) {
	result := frameworks.DemoEvaluation(*fw, cluster)

	switch format {
	case FormatPDF:
		data, err := GeneratePDF(fw, result, userName)
		return data, "application/pdf", err
	default:
		data, err := GenerateJSON(fw, result, userName)
		return data, "application/json", err
	}
}
