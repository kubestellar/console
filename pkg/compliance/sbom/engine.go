package sbom

import "time"

// Engine provides SBOM data for the supply chain dashboard.
//
// TODO (#9644): Replace stub with live Syft/Grype integration.
type Engine struct{}

// NewEngine creates an SBOM engine. Currently returns demo data.
func NewEngine() *Engine { return &Engine{} }

// Summary returns fleet-wide SBOM coverage and vulnerability metrics.
func (e *Engine) Summary() Summary {
	return Summary{
		TotalWorkloads:       42,
		SBOMCoverage:         88,
		TotalComponents:      3847,
		VulnerableComponents: 12,
		CriticalCount:        2,
		HighCount:            5,
		GeneratedAt:          time.Now(),
	}
}

// Documents returns available SBOM documents across the fleet.
func (e *Engine) Documents() []Document {
	// TODO (#9644): Query OCI registry annotations and Kubernetes API for
	// running workloads, generate SBOMs via Syft, scan with Grype.
	return []Document{}
}
